import { NextResponse } from "next/server";
import { netOf, type NetKey } from "@/config/networks";
import { allowPublic, tooMany } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { readSnapshot, type ChainSnapshot } from "@/lib/server/snapshot";

export const dynamic = "force-dynamic";

/* GET /api/chain?net=mainnet|testnet → live facts for the network. Cached a few seconds and refreshed by one request at a time;
   a failed read never replaces a good one (it is served until it is two minutes old). The CDN may serve it for 10 s. */

const cache: Partial<Record<NetKey, { at: number; value: ChainSnapshot }>> = {};
const inflight: Partial<Record<NetKey, Promise<void> | null>> = {};
const lastTry: Partial<Record<NetKey, number>> = {};
const TTL = 8_000;

export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "chain", 60, 1200))) return tooMany();
  const net = netOf(new URL(request.url).searchParams.get("net"));
  const c = cache[net];
  if ((!c || Date.now() - c.at > TTL) && Date.now() - (lastTry[net] ?? 0) > TTL) {
    lastTry[net] = Date.now();
    inflight[net] ??= readSnapshot(net)
      .then((value) => {
        const old = cache[net];
        if (value.block !== null || !old || Date.now() - old.at > 120_000) cache[net] = { at: Date.now(), value };
      })
      .catch(() => {})
      .finally(() => {
        inflight[net] = null;
      });
  }
  if (inflight[net]) await inflight[net];
  const hit = cache[net];
  if (!hit) return NextResponse.json({ error: "Chain data is not available yet." }, { status: 503, headers: { "cache-control": "no-store" } });
  return NextResponse.json(hit.value, { headers: { "cache-control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30" } });
}
