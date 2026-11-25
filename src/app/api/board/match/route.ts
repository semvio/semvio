import { readDoc } from "@/lib/server/docs";
import { j, limited } from "@/lib/server/tokenroutes";
import { matchesFor, type BoardRequest } from "@/lib/holder/board";

export const dynamic = "force-dynamic";

/* GET /api/board/match?id= → counterparties for one board request: opposite side, same asset, prices cross; holders first. */
export async function GET(request: Request) {
  if (await limited(request, "board-read", 120)) return j({ error: "Too many requests." }, 429);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const all = await readDoc<BoardRequest[]>("board", []);
  const mine = all.find((r) => r.id === id);
  if (!mine) return j({ error: "No such request." }, 404);
  return j({ request: mine, matches: matchesFor(mine, all, Math.floor(Date.now() / 1000)) });
}
