/*
 * Reason bits of SemvioDealRoom (contracts/src/SemvioFeeMath.sol R_*). Same numbers, same order; bits.test.ts reads the
 * Solidity file and fails when the two lists drift apart.
 */

export const BITS = {
  NOT_FOUND: 0,
  CLOSED: 1,
  DEAL_EXPIRED: 2,
  OFFER_EXPIRED: 3,
  SELLER_NOT_APPROVED: 4,
  BUYER_NOT_APPROVED: 5,
  SELLER_BALANCE: 6,
  SELLER_ALLOWANCE: 7,
  BUYER_BALANCE: 8,
  BUYER_ALLOWANCE: 9,
  OVER_BUDGET: 10,
  UNDER_MIN_NET: 11,
  TOKEN_NO_CODE: 12,
  FEE_OVER_CAP: 13,
  BAD_FEE_RECIPIENT: 14,
  ZERO_AMOUNT: 15,
  OFFER_WINDOW: 16,
  STALE_REVISION: 17,
  NOT_PARTY: 18,
  REVISION_LIMIT: 19,
} as const;

export type BitName = keyof typeof BITS;

export const bit = (n: BitName) => 1n << BigInt(BITS[n]);

export const BIT_WORDS: Record<BitName, { label: string; why: string }> = {
  NOT_FOUND: { label: "No such deal", why: "The deal number does not exist in this room." },
  CLOSED: { label: "Deal closed", why: "The deal was already settled or cancelled." },
  DEAL_EXPIRED: { label: "Deal expired", why: "The deal's validity window has ended." },
  OFFER_EXPIRED: { label: "Offer expired", why: "The current revision's own expiry has passed: propose a new revision." },
  SELLER_NOT_APPROVED: { label: "Seller has not approved", why: "The seller has not approved this exact revision." },
  BUYER_NOT_APPROVED: { label: "Buyer has not approved", why: "The buyer has not approved this exact revision." },
  SELLER_BALANCE: { label: "Seller balance too low", why: "The seller's wallet holds less of the asset than the deal amount." },
  SELLER_ALLOWANCE: { label: "Seller allowance too low", why: "The seller has not allowed the room to move the asset amount yet." },
  BUYER_BALANCE: { label: "Buyer balance too low", why: "The buyer's wallet holds less of the quote token than the gross price." },
  BUYER_ALLOWANCE: { label: "Buyer allowance too low", why: "The buyer has not allowed the room to move the gross price yet." },
  OVER_BUDGET: { label: "Over the buyer's budget", why: "The gross price is above the buyer's maximum." },
  UNDER_MIN_NET: { label: "Under the seller's minimum net", why: "After the agreed fee, the seller would receive less than their minimum." },
  TOKEN_NO_CODE: { label: "Token has no code", why: "One of the token addresses is not a contract on this network." },
  FEE_OVER_CAP: { label: "Fee above 1 %", why: "The agreed fee may be at most 100 basis points." },
  BAD_FEE_RECIPIENT: { label: "Fee recipient not valid", why: "A fee needs a third-party recipient (not the buyer or the seller); no fee means no recipient." },
  ZERO_AMOUNT: { label: "Zero amount", why: "Amounts must be above zero." },
  OFFER_WINDOW: { label: "Offer window not valid", why: "An offer must expire in the future and no later than the deal itself." },
  STALE_REVISION: { label: "Not the current revision", why: "Someone proposed a newer revision; review that one instead." },
  NOT_PARTY: { label: "Not a party", why: "Only the seller, the buyer or (for proposals only) their appointed agent may do this." },
  REVISION_LIMIT: { label: "Revision limit reached", why: "A deal may collect at most 64 revisions." },
};

/** Names of the bits set in a mask, lowest first. */
export function bitNames(mask: bigint): BitName[] {
  return (Object.keys(BITS) as BitName[]).filter((n) => (mask & bit(n)) !== 0n);
}

export const maskOf = (...names: BitName[]) => names.reduce((m, n) => m | bit(n), 0n);
