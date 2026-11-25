import { isAddress } from "@/config/brand";
import { netOf } from "@/config/networks";
import { j, limited } from "@/lib/server/tokenroutes";
import { readAlerts } from "@/lib/server/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/alerts?net=&addr=&from=<block> → alerts for a wallet from the room's events since `from` (free for everyone). */
export async function GET(request: Request) {
  if (await limited(request, "alerts", 30)) return j({ error: "Too many requests." }, 429);
  const q = new URL(request.url).searchParams;
  const addr = q.get("addr") ?? "";
  if (!isAddress(addr)) return j({ error: "Give ?addr=0x…" }, 400);
  const from = Number(q.get("from") ?? 0);
  try {
    return j(await readAlerts(netOf(q.get("net")), addr, Number.isFinite(from) && from > 0 ? Math.floor(from) : 0));
  } catch {
    return j({ error: "The chain could not be reached." }, 503);
  }
}
