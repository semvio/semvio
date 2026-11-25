import { isAddress } from "@/config/brand";
import { netOf } from "@/config/networks";
import { allowPublic, tooMany } from "@/lib/guard";
import { readDeals } from "@/lib/server/deals";
import { bad, fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/deals?net=mainnet|testnet&addr=0x… → the last 30 deals where the address is seller or buyer (views, no log scan). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const addr = q.get("addr") ?? "";
  if (!isAddress(addr)) return bad("Give ?addr=0x… (a wallet address).");
  if (!(await allowPublic(getStore(), request, "deals", 30, 1200))) return tooMany();
  try {
    return ok(await readDeals(netOf(q.get("net")), addr), 5);
  } catch (e) {
    return fail(e);
  }
}
