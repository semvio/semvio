import { isRevoked, revocationsNearFull, revokeNonce } from "@/lib/server/docs";
import { sessionOf } from "@/lib/server/holder";
import { j, limited } from "@/lib/server/tokenroutes";
import { spend } from "@/lib/ratelimit";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/* POST /api/holder/signout (session header) → the session's nonce is refused from now until it would have expired. */
export async function POST(request: Request) {
  if (await limited(request, "holder", 20)) return j({ error: "Too many requests." }, 429);
  const s = await sessionOf(request);
  // Not a live session (expired, already signed out, invalid): nothing to revoke.
  if (!s.ok) return j({ signedOut: true, note: s.reason });
  const until = new Date(s.expiresAt * 1000).toISOString();
  if (await isRevoked(s.nonce)) return j({ signedOut: true });
  // A live session's sign-out is never refused by a wallet budget, except when a new record would land in a nearly full store.
  if (revocationsNearFull() && !(await spend(getStore(), "signout-wallet", s.wallet, 1, 10, 600))) return j({ signedOut: false, error: `Sign-outs are limited right now. This session still expires at ${until}.` }, 429);
  if (!(await revokeNonce(s.nonce, s.expiresAt))) return j({ signedOut: false, error: `The sign-out could not be stored. This tab forgets the session, but a copy of it would still work until ${until}.` }, 503);
  return j({ signedOut: true });
}
