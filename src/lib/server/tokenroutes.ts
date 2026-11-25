import "server-only";
import { NextResponse } from "next/server";
import { allowPublic } from "@/lib/guard";
import { getStore } from "@/lib/server/store";
import { readTier, sessionOf, type TierInfo } from "@/lib/server/holder";

/* Shared plumbing for the token-feature routes: JSON without caching, session + live tier, a rate limit per IP. */

export const j = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function limited(request: Request, bucket: string, perMin = 40) {
  return !(await allowPublic(getStore(), request, bucket, perMin, 2000));
}

/** Session + tier, or a ready refusal. */
export async function who(request: Request): Promise<{ wallet: string; tier: TierInfo } | { res: NextResponse }> {
  const s = await sessionOf(request);
  if (!s.ok) return { res: j({ error: s.reason }, 401) };
  try {
    return { wallet: s.wallet, tier: await readTier(s.wallet) };
  } catch {
    return { res: j({ error: "The token could not be read on chain right now. Try again shortly." }, 503) };
  }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function body<T>(request: Request): Promise<T | null> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > 4000) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
