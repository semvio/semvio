/*
 * Holder tier (owner decision 25 Nov): a wallet is a holder when balanceOf(wallet) >= totalSupply / 1000 (0.1 % of supply), both read
 * live from the token contract. Integer math, no rounding: balance * 1000 >= supply. A zero supply has no holders.
 */
export const HOLDER_DIVISOR = 1000n;

export type Tier = "holder" | "free";

export function tierOf(balance: bigint, supply: bigint): Tier {
  if (supply <= 0n) return "free";
  return balance * HOLDER_DIVISOR >= supply ? "holder" : "free";
}

/** Smallest balance that counts as a holder (ceil(supply / 1000)). */
export const thresholdOf = (supply: bigint) => (supply <= 0n ? 0n : (supply + HOLDER_DIVISOR - 1n) / HOLDER_DIVISOR);

/** Share of supply in basis points with two decimals (for display only). */
export const shareText = (balance: bigint, supply: bigint) => (supply <= 0n ? "0 %" : `${(Number((balance * 1_000_000n) / supply) / 10_000).toFixed(4)} %`);

/*
 * Quotas, one constant for the whole site. Free = everyone with a signed session (no token needed). Holder = 0.1 % of supply.
 * Enforced by the server routes, never only in the page.
 */
export const QUOTA = {
  free: { liveRequests: 3, templates: 0, teamMembers: 0 },
  holder: { liveRequests: 20, templates: 20, teamMembers: 10 },
} as const;

export const quotaOf = (t: Tier) => QUOTA[t];
