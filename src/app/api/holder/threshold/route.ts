import { holderToken } from "@/config/contracts";
import { readTier } from "@/lib/server/holder";
import { j, limited } from "@/lib/server/tokenroutes";

export const dynamic = "force-dynamic";

/* GET /api/holder/threshold → the live holder threshold (0.1 % of totalSupply) with block and time, or launched: false. */
export async function GET(request: Request) {
  if (await limited(request, "threshold", 60)) return j({ error: "Too many requests." }, 429);
  if (!holderToken()) return j({ launched: false });
  try {
    const t = await readTier("0x0000000000000000000000000000000000000000");
    return j({ launched: true, token: t.token, supply: t.supply, threshold: t.threshold, block: t.block, checkedAt: t.checkedAt });
  } catch {
    return j({ error: "The token could not be read on chain right now." }, 503);
  }
}
