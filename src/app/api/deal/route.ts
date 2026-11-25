import { NextResponse } from "next/server";
import { netOf, type NetKey } from "@/config/networks";
import { allowPublic, tooMany } from "@/lib/guard";
import { readDeal, type DealHistory } from "@/lib/server/deals";
import { bad, fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/deal?net=…&id=N → one deal with its full history from the room's logs and the re-hashed revision chain.
 * A complete answer is kept 6 s per deal (?fresh=1 skips it after the visitor's own transaction); an incomplete scan or a
 * failure is never cached.
 */
const cache = new Map<string, { at: number; value: DealHistory }>();

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const id = Number(q.get("id"));
  if (!Number.isInteger(id) || id < 1 || id > 1e12) return bad("Give ?id=<deal number>.");
  const net: NetKey = netOf(q.get("net"));
  const key = `${net}:${id}`;
  const hit = q.get("fresh") ? null : cache.get(key);
  if (hit && Date.now() - hit.at < 6_000) return ok(hit.value, 5);
  if (!(await allowPublic(getStore(), request, "deal", 30, 1200))) return tooMany();
  try {
    const value = await readDeal(net, id);
    if (!value) return NextResponse.json({ error: "No such deal in this room (or the room is not deployed on this network yet)." }, { status: 404, headers: { "cache-control": "no-store" } });
    if (value.scanned.complete) {
      if (cache.size > 300) cache.clear();
      cache.set(key, { at: Date.now(), value });
    }
    return ok(value, 5);
  } catch (e) {
    return fail(e);
  }
}
