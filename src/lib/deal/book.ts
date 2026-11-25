import { bounds, type Side } from "@/lib/deal/agent";
import { fromUnits } from "@/lib/deal/math";

/*
 * Practice counterparties. SAMPLE DATA: these desks do not exist. Their limits are set around the asset's reference price (the
 * live Chainlink price when the site could read it, else a labelled sample price), so practice numbers look like real ones.
 * Every desk is the opposite side of a full-size order; a desk only takes the whole amount (no partial fills).
 */

export type Desk = { id: string; label: string; side: Side; /** limit per whole unit, quote units */ limitPerUnit: bigint; /** largest size, base units */ size: bigint; validHours: number };

/** Basis-point offsets from the reference price: buyers bid under it, sellers ask over it, one desk on each side crosses. */
const BUYERS = [{ bps: 40n, size: 1n }, { bps: -60n, size: 4n }, { bps: -180n, size: 25n }];
const SELLERS = [{ bps: -30n, size: 2n }, { bps: 70n, size: 10n }, { bps: 200n, size: 40n }];

/** `unit` = one whole base unit in base units (10^decimals); sizes scale by `sizeUnit` whole units (e.g. 1 for WETH, 10 for a stock token). */
export function deskBook(ref: bigint, unit: bigint, sizeUnit: bigint): Desk[] {
  const at = (bps: bigint) => ref + (ref * bps) / 10_000n;
  return [
    ...BUYERS.map((b, i) => ({ id: `b${i + 1}`, label: `Sample buy desk ${String.fromCharCode(65 + i)}`, side: "buy" as Side, limitPerUnit: at(b.bps), size: b.size * sizeUnit * unit, validHours: 24 * (i + 1) })),
    ...SELLERS.map((s, i) => ({ id: `s${i + 1}`, label: `Sample sell desk ${String.fromCharCode(65 + i)}`, side: "sell" as Side, limitPerUnit: at(s.bps), size: s.size * sizeUnit * unit, validHours: 12 * (i + 2) })),
  ];
}

export type Candidate = { desk: Desk; ok: boolean; reasons: string[]; overlap: bigint };

/** Every opposite-side desk, with why it fits or not (size, window, price overlap after the fee). Best overlap first. */
export function matchDesks(o: { side: Side; amount: bigint; limitPerUnit: bigint; validHours: number; feeBps: number; decimals: number; quoteDecimals: number; quoteSymbol: string; desks: Desk[] }): Candidate[] {
  const q = (v: bigint) => `${fromUnits(v, o.quoteDecimals, 2)} ${o.quoteSymbol}`;
  const out = o.desks
    .filter((d) => d.side !== o.side)
    .map((desk) => {
      const reasons: string[] = [];
      const buyerLimit = o.side === "buy" ? o.limitPerUnit : desk.limitPerUnit;
      const sellerLimit = o.side === "sell" ? o.limitPerUnit : desk.limitPerUnit;
      const b = bounds(buyerLimit, sellerLimit, o.amount, o.decimals, o.feeBps);
      if (desk.size < o.amount) reasons.push(`Takes at most ${fromUnits(desk.size, o.decimals)} units; your order is ${fromUnits(o.amount, o.decimals)}.`);
      if (!b.overlap) reasons.push(`No price overlap: the seller needs ${q(b.minGross)} gross, the buyer's budget is ${q(b.maxGross)}.`);
      else reasons.push(`Room to agree: ${q(b.maxGross - b.minGross)} between the seller's floor and the buyer's budget.`);
      const ok = desk.size >= o.amount && b.overlap;
      return { desk, ok, reasons, overlap: b.overlap ? b.maxGross - b.minGross : -1n };
    });
  return out.sort((a, b) => Number(b.ok) - Number(a.ok) || (b.overlap > a.overlap ? 1 : b.overlap < a.overlap ? -1 : 0));
}
