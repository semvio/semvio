import { netOf } from "@/config/networks";
import { readDoc, updateDoc } from "@/lib/server/docs";
import { readDeals } from "@/lib/server/deals";
import { body, j, limited, who } from "@/lib/server/tokenroutes";
import { validateTeam, type Team } from "@/lib/holder/board";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * Team workspace (holder feature): an owner names up to 10 member wallets; every member sees one shared deal list (each wallet's deals
 * read from the room). GET ?owner=&net= with a session: allowed for the owner and the members. POST (holder session): set the team.
 */
export async function GET(request: Request) {
  if (await limited(request, "team")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const q = new URL(request.url).searchParams;
  const owner = (q.get("owner") ?? w.wallet).toLowerCase();
  const team = await readDoc<Team | null>(`team:${owner}`, null);
  if (!team) return j({ team: null, deals: [] });
  if (owner !== w.wallet && !team.members.includes(w.wallet)) return j({ error: "You are not a member of this team." }, 403);
  const net = netOf(q.get("net"));
  const lists = await Promise.all([team.owner, ...team.members].map((m) => readDeals(net, m).then((r) => r.deals.map((d) => ({ ...d, member: m }))).catch(() => [])));
  const seen = new Set<number>();
  const deals = lists.flat().filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true))).sort((a, b) => b.id - a.id);
  return j({ team, deals });
}

export async function POST(request: Request) {
  if (await limited(request, "team")) return j({ error: "Too many requests." }, 429);
  const w = await who(request);
  if ("res" in w) return w.res;
  const max = w.tier.quota.teamMembers;
  if (max === 0) {
    const why = w.tier.launched ? `The team workspace is a holder feature: your balance ${w.tier.balance} is under the threshold ${w.tier.threshold} (0.1 % of supply, block ${w.tier.block}).` : "The team workspace unlocks at launch, when the token exists.";
    return j({ error: why, tier: w.tier }, 403);
  }
  const b = await body<{ name?: unknown; members?: unknown }>(request);
  if (!b) return j({ error: "Send a JSON body." }, 400);
  const v = validateTeam(w.wallet, b.name, b.members, max);
  if (!v.ok) return j({ error: v.error }, 400);
  await updateDoc<Team | null, null>(`team:${w.wallet}`, null, () => ({ value: v.value, result: null }));
  return j({ team: v.value });
}
