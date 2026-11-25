import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { bit } from "@/lib/deal/bits";

/*
 * The site's copy of contracts/src/SemvioFeeMath.sol. Same rounding, same checks, same hashes: math.test.ts holds vectors, and the
 * end-to-end test proves on a chain that a hash computed here is the one the contract stores.
 *
 * Money: the buyer pays `gross`. An optional agreed fee (at most 1 %, rounded down) goes to a third party named in the revision.
 * The seller receives net = gross - fee. Semvio takes nothing.
 */

export const BPS = 10_000n;
export const MAX_FEE_BPS = 100;
export const MAX_REVISIONS = 64;
export const MAX_WINDOW_SEC = 30 * 24 * 3600;

export type Terms = {
  quoteAmount: bigint;
  feeBps: number;
  feeRecipient: `0x${string}`;
  offerValidUntil: number;
  noteHash: `0x${string}`;
};

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_HASH = `0x${"0".repeat(64)}` as const;

export const feeOf = (gross: bigint, feeBps: number) => (gross * BigInt(feeBps)) / BPS;
export const netOf = (gross: bigint, feeBps: number) => gross - feeOf(gross, feeBps);

/** Smallest gross whose net is at least `net`. */
export function minGrossForNet(net: bigint, feeBps: number): bigint {
  if (net === 0n) return 0n;
  const keep = BPS - BigInt(feeBps);
  let g = (net * BPS + keep - 1n) / keep;
  while (g > 0n && netOf(g - 1n, feeBps) >= net) g--;
  return g;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Reasons the terms are refused on their own (SemvioFeeMath.termsBits). */
export function termsBits(t: Terms, seller: string, buyer: string, dealValidUntil: number, now: number): bigint {
  let bits = 0n;
  if (t.quoteAmount === 0n) bits |= bit("ZERO_AMOUNT");
  if (t.feeBps > MAX_FEE_BPS) bits |= bit("FEE_OVER_CAP");
  if (t.feeBps === 0) {
    if (!same(t.feeRecipient, ZERO_ADDR)) bits |= bit("BAD_FEE_RECIPIENT");
  } else if (same(t.feeRecipient, ZERO_ADDR) || same(t.feeRecipient, seller) || same(t.feeRecipient, buyer)) bits |= bit("BAD_FEE_RECIPIENT");
  if (t.offerValidUntil <= now || t.offerValidUntil > dealValidUntil) bits |= bit("OFFER_WINDOW");
  return bits;
}

/** Buyer budget (max gross) and seller minimum net; 0 = not given (SemvioFeeMath.limitBits). */
export function limitBits(gross: bigint, feeBps: number, buyerMaxGross: bigint, sellerMinNet: bigint): bigint {
  let bits = 0n;
  if (buyerMaxGross !== 0n && gross > buyerMaxGross) bits |= bit("OVER_BUDGET");
  if (sellerMinNet !== 0n && netOf(gross, feeBps) < sellerMinNet) bits |= bit("UNDER_MIN_NET");
  return bits;
}

const DEAL_TAG = keccak256(toBytes("Semvio.Deal.v1"));
const REVISION_TAG = keccak256(toBytes("Semvio.Revision.v1"));

export type DealFacts = {
  chainId: number;
  room: `0x${string}`;
  id: bigint;
  seller: `0x${string}`;
  buyer: `0x${string}`;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  baseAmount: bigint;
  validUntil: number;
  ref: `0x${string}`;
};

export function dealHash(d: DealFacts): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32" }],
      [DEAL_TAG, BigInt(d.chainId), d.room, d.id, d.seller, d.buyer, d.baseToken, d.quoteToken, d.baseAmount, BigInt(d.validUntil), d.ref],
    ),
  );
}

export function revisionHash(prevHash: `0x${string}`, id: bigint, revision: number, proposer: `0x${string}`, sellerSide: boolean, t: Terms): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint32" }, { type: "address" }, { type: "bool" }, { type: "uint128" }, { type: "uint16" }, { type: "address" }, { type: "uint64" }, { type: "bytes32" }],
      [REVISION_TAG, prevHash, id, revision, proposer, sellerSide, t.quoteAmount, t.feeBps, t.feeRecipient, BigInt(t.offerValidUntil), t.noteHash],
    ),
  );
}

/** keccak256 of a note's text: what the chain stores in place of the note. Empty note = zero hash. */
export const noteHashOf = (note: string): `0x${string}` => (note.trim() ? keccak256(toBytes(note.trim())) : ZERO_HASH);

/** Decimal text <-> base units, exact (no floats). */
export function toUnits(text: string, decimals: number): bigint | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  if (f.length > decimals) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function fromUnits(v: bigint, decimals: number, maxFrac = 6): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = (a / base).toLocaleString("en-US");
  let frac = (a % base).toString().padStart(decimals, "0").slice(0, Math.min(maxFrac, decimals)).replace(/0+$/, "");
  if (decimals === 0) frac = "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Gross for `baseAmount` units at a unit price given in quote units per 1 whole base unit. */
export const grossAt = (unitPrice: bigint, baseAmount: bigint, baseDecimals: number) => (unitPrice * baseAmount) / 10n ** BigInt(baseDecimals);
/** Unit price (quote units per whole base unit) implied by a gross. */
export const unitPriceOf = (gross: bigint, baseAmount: bigint, baseDecimals: number) => (baseAmount === 0n ? 0n : (gross * 10n ** BigInt(baseDecimals)) / baseAmount);
