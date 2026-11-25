import { readDoc, updateDoc } from "@/lib/server/docs";
import { body, j, limited, newId, who } from "@/lib/server/tokenroutes";
import { validateRequest, type NewRequest, type Template } from "@/lib/holder/board";

export const dynamic = "force-dynamic";

/* Saved deal templates per wallet (holder feature). GET/DELETE with a session; POST needs the holder tier, checked on chain now. */
export async function GET(request: Request) {
  if (await limited(request, "tpl")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  return j({ templates: await readDoc<Template[]>(`tpl:${w.wallet}`, []), tier: w.tier });
}

export async function POST(request: Request) {
  if (await limited(request, "tpl")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const max = w.tier.quota.templates;
  if (max === 0) {
    const why = w.tier.launched ? `Templates are a holder feature: your balance ${w.tier.balance} is under the threshold ${w.tier.threshold} (0.1 % of supply ${w.tier.supply}, block ${w.tier.block}).` : "Templates unlock at launch, when the token exists.";
    return j({ error: why, tier: w.tier }, 403);
  }
  const b = await body<NewRequest & { name?: unknown; feeBps?: unknown }>(request);
  if (!b) return j({ error: "Send a JSON body." }, 400);
  const v = validateRequest(b);
  if (!v.ok) return j({ error: v.error }, 400);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const feeBps = Number(b.feeBps ?? 0);
  if (!name || name.length > 40) return j({ error: "name: 1 to 40 characters." }, 400);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 100) return j({ error: "feeBps: 0 to 100." }, 400);
  const res = await updateDoc<Template[], Template | string>(`tpl:${w.wallet}`, [], (cur) => {
    if (cur.length >= max) return { value: cur, result: `Quota reached: ${cur.length} templates, the holder tier allows ${max}.` };
    const t: Template = { id: newId(), name, side: v.value.side, asset: v.value.asset, amount: v.value.amount, price: v.value.price, feeBps, validHours: v.value.validHours, createdAt: Date.now() };
    return { value: [t, ...cur], result: t };
  });
  return typeof res === "string" ? j({ error: res }, 403) : j({ template: res });
}

export async function DELETE(request: Request) {
  if (await limited(request, "tpl")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await updateDoc<Template[], null>(`tpl:${w.wallet}`, [], (cur) => ({ value: cur.filter((t) => t.id !== id), result: null }));
  return j({ removed: id });
}
