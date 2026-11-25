import { persistent, readDoc, updateDoc } from "@/lib/server/docs";
import { body, j, limited, newId, who } from "@/lib/server/tokenroutes";
import { boardOrder, canPost, live, MAX_HOURS, validateRequest, type BoardRequest, type NewRequest } from "@/lib/holder/board";
import { trustsProxyHeaders } from "@/lib/netkey";
import { clientIp } from "@/lib/netkey";
import { spend } from "@/lib/ratelimit";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/*
 * Matching board. GET (public): live requests, holders first. POST (holder session, free or holder tier): post one request within the
 * tier's quota; the tier is read on chain at that moment and stored with its block. DELETE ?id= (session): remove your own request.
 */
const now = () => Math.floor(Date.now() / 1000);

export async function GET(request: Request) {
  if (await limited(request, "board-read", 120)) return j({ error: "Too many requests." }, 429);
  const asset = new URL(request.url).searchParams.get("asset")?.toLowerCase() ?? null;
  const all = boardOrder(live(await readDoc<BoardRequest[]>("board", []), now()));
  return j({ requests: asset ? all.filter((r) => r.asset.address === asset) : all, persistent: persistent(), at: now() });
}

export async function POST(request: Request) {
  if (await limited(request, "board-write", 20)) return j({ error: "Too many requests." }, 429);
  // Posting limits: per client network key (IPv6 per /64, the relay's key) and per wallet; a site-wide ceiling only when the
  // client address cannot be trusted (self-hosted without a proxy), where one caller could otherwise look like many.
  const store = getStore();
  if (!(await spend(store, "board-post", clientIp(request), 1, 12, 600, { aggregate: true }))) return j({ error: "Too many posts from your network. Try again in a few minutes." }, 429);
  if (!trustsProxyHeaders() && !(await spend(store, "board-post-site", "all", 1, 300, 600))) return j({ error: "The board is busy. Try again shortly." }, 503);
  const w = await who(request);
  if ("res" in w) return w.res;
  if (!(await spend(store, "board-post-wallet", w.wallet, 1, 10, 600))) return j({ error: "Too many posts from this wallet. Try again in a few minutes." }, 429);
  const b = await body<NewRequest>(request);
  if (!b) return j({ error: "Send a JSON body." }, 400);
  const v = validateRequest(b);
  if (!v.ok) return j({ error: v.error }, 400);
  if (v.value.validHours > MAX_HOURS[w.tier.tier]) return j({ error: `validHours: at most ${MAX_HOURS[w.tier.tier]} on the ${w.tier.tier} tier.` }, 400);
  const t = now();
  const res = await updateDoc<BoardRequest[], { ok: true; request: BoardRequest } | { ok: false; error: string; full?: true }>("board", [], (cur) => {
    const kept = live(cur, t);
    const can = canPost(kept, w.wallet, w.tier.tier, t);
    if (!can.ok) return { value: kept, result: can };
    const { validHours, ...rest } = v.value;
    const r: BoardRequest = { ...rest, id: newId(), wallet: w.wallet, createdAt: t, validUntil: t + Math.round(validHours * 3600), tier: w.tier.tier, tierBlock: w.tier.block };
    return { value: [r, ...kept], result: { ok: true, request: r } };
  });
  return res.ok ? j({ request: res.request, tier: w.tier }) : j({ error: res.error, tier: w.tier }, "full" in res && res.full ? 503 : 403);
}

export async function DELETE(request: Request) {
  if (await limited(request, "board-write", 20)) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const removed = await updateDoc<BoardRequest[], boolean>("board", [], (cur) => {
    const next = cur.filter((r) => !(r.id === id && r.wallet === w.wallet));
    return { value: next, result: next.length !== cur.length };
  });
  return removed ? j({ removed: id }) : j({ error: "No such request of yours." }, 404);
}
