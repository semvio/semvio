import { persistent, readDoc } from "@/lib/server/docs";
import { j, limited, who } from "@/lib/server/tokenroutes";
import { live, type BoardRequest, type Team, type Template } from "@/lib/holder/board";

export const dynamic = "force-dynamic";

/* GET /api/holder (holder session header) → the wallet's live tier (balance, supply, threshold, share, block), quota and usage. */
export async function GET(request: Request) {
  if (await limited(request, "holder")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const now = Math.floor(Date.now() / 1000);
  const board = await readDoc<BoardRequest[]>("board", []);
  const templates = await readDoc<Template[]>(`tpl:${w.wallet}`, []);
  const team = await readDoc<Team | null>(`team:${w.wallet}`, null);
  return j({
    wallet: w.wallet,
    ...w.tier,
    usage: { liveRequests: live(board, now).filter((r) => r.wallet === w.wallet).length, templates: templates.length, teamMembers: team?.members.length ?? 0 },
    persistent: persistent(),
  });
}
