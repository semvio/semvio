import { bitNames, BIT_WORDS } from "@/lib/deal/bits";
import { fromUnits, grossAt, limitBits, minGrossForNet, netOf } from "@/lib/deal/math";

/*
 * Semvio's agent: deterministic code, not a language model. It knows ONE side's private limit and proposes prices inside it.
 * It never approves and never signs; a person approves a revision.
 *
 * Limits are written per whole unit of the asset in the quote token:
 *   buyer  -> highest gross price per unit it will pay (budget = price x amount)
 *   seller -> lowest NET price per unit it will receive after the agreed fee (minimum net = price x amount)
 *
 * Schedule: each agent opens `OPEN_MARGIN_BPS` away from its own limit (better for its side) and concedes a third of the
 * remaining distance each turn. The buyer's agent proposes first. The negotiation stops when an offer clears the other side's
 * limit (the other side's agent accepts it as it stands), or after MAX_TURNS without agreement.
 */

export const OPEN_MARGIN_BPS = 300n; // 3 %
export const MAX_TURNS = 6;

export type Side = "buy" | "sell";
export type Party = { label: string; side: Side; limitPerUnit: bigint };

export type Step = {
  turn: number;
  by: "buyer" | "seller";
  gross: bigint;
  /** Why this number: the schedule, in words, with the numbers. */
  why: string;
  /** Whether the other side's limit accepts this gross. */
  acceptable: boolean;
};

export type Outcome = { agreed: boolean; steps: Step[]; finalGross: bigint | null; summary: string };

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Gross bounds: the buyer pays at most `maxGross`; the seller needs at least `minGross` (its min net grossed up for the fee). */
export function bounds(buyerLimit: bigint, sellerLimit: bigint, amount: bigint, baseDecimals: number, feeBps: number) {
  const maxGross = grossAt(buyerLimit, amount, baseDecimals);
  const minNet = ceilDiv(sellerLimit * amount, 10n ** BigInt(baseDecimals));
  const minGross = minGrossForNet(minNet, feeBps);
  return { maxGross, minNet, minGross, overlap: maxGross >= minGross };
}

/** Plain explanation of a price check, each condition with its numbers. */
export function explainCheck(gross: bigint, feeBps: number, maxGross: bigint, minNet: bigint, qd: number, sym: string) {
  const net = netOf(gross, feeBps);
  const bits = limitBits(gross, feeBps, maxGross, minNet);
  const lines = [
    `Buyer budget: pays ${fromUnits(gross, qd, 2)} ${sym} ${gross <= maxGross ? "≤" : ">"} budget ${fromUnits(maxGross, qd, 2)} ${sym} → ${gross <= maxGross ? "passes" : "fails"}`,
    `Seller minimum net: receives ${fromUnits(net, qd, 2)} ${sym} after a ${feeBps / 100}% fee ${net >= minNet ? "≥" : "<"} minimum ${fromUnits(minNet, qd, 2)} ${sym} → ${net >= minNet ? "passes" : "fails"}`,
  ];
  return { ok: bits === 0n, bits, reasons: bitNames(bits).map((n) => BIT_WORDS[n].label), lines };
}

/** Runs both agents against each other. Pure and deterministic: the same inputs give the same revisions. */
export function negotiate(o: { buyerLimit: bigint; sellerLimit: bigint; amount: bigint; baseDecimals: number; feeBps: number; quoteDecimals: number; quoteSymbol: string }): Outcome {
  const { maxGross, minGross } = bounds(o.buyerLimit, o.sellerLimit, o.amount, o.baseDecimals, o.feeBps);
  const q = (v: bigint) => `${fromUnits(v, o.quoteDecimals, 2)} ${o.quoteSymbol}`;
  // Proposals are whole cents of the quote token: bids round down, asks round up (each stays on its own side of its limit).
  const cent = o.quoteDecimals > 2 ? 10n ** BigInt(o.quoteDecimals - 2) : 1n;
  const down = (v: bigint) => (v / cent) * cent;
  const up = (v: bigint) => ((v + cent - 1n) / cent) * cent;
  let bid = maxGross - (maxGross * OPEN_MARGIN_BPS) / 10_000n; // buyer opens below its budget
  let ask = minGross + (minGross * OPEN_MARGIN_BPS) / 10_000n; // seller opens above its floor
  const steps: Step[] = [];
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const buyerTurn = turn % 2 === 1;
    if (buyerTurn) {
      if (turn >= MAX_TURNS - 1) bid = maxGross;
      else if (turn > 1) bid = bid + (maxGross - bid) / 3n;
      // If the seller's last ask is inside the budget, the buyer's agent accepts it rather than bidding.
      const lastAsk = steps.length ? steps[steps.length - 1].gross : null;
      if (lastAsk !== null && lastAsk <= maxGross) {
        return done(steps, lastAsk, `The buyer's agent accepts the seller's ${q(lastAsk)}: it is inside the budget of ${q(maxGross)}.`);
      }
      const gross = bid >= maxGross ? maxGross : down(bid);
      const acceptable = gross >= minGross;
      steps.push({ turn, by: "buyer", gross, acceptable, why: turn === 1 ? `Opens 3% under the budget (${q(maxGross)}).` : gross === maxGross ? `Last turn: offers the full budget (${q(maxGross)}).` : `Moves a third of the way toward the budget (${q(maxGross)}).` });
      if (acceptable) return done(steps, gross, `The seller's agent accepts ${q(gross)}: after the fee it clears the seller's minimum.`);
    } else {
      if (turn >= MAX_TURNS) ask = minGross;
      else if (turn > 2) ask = ask - (ask - minGross) / 3n;
      const lastBid = steps[steps.length - 1].gross;
      if (lastBid >= minGross) return done(steps, lastBid, `The seller's agent accepts ${q(lastBid)}.`);
      const gross = ask <= minGross ? minGross : up(ask);
      const acceptable = gross <= maxGross;
      steps.push({ turn, by: "seller", gross, acceptable, why: turn === 2 ? `Asks 3% above the seller's floor (${q(minGross)} gross).` : gross === minGross ? `Last turn: asks the seller's floor (${q(minGross)} gross).` : `Moves a third of the way toward the seller's floor (${q(minGross)} gross).` });
      if (acceptable) return done(steps, gross, `The buyer's agent accepts ${q(gross)}: it is inside the budget.`);
    }
  }
  const gap = minGross > maxGross ? minGross - maxGross : 0n;
  return {
    agreed: false,
    steps,
    finalGross: null,
    summary: gap > 0n ? `No agreement: the seller needs at least ${q(minGross)} gross and the buyer's budget is ${q(maxGross)} (gap ${q(gap)}). Neither agent may cross its own limit.` : `No agreement within ${MAX_TURNS} turns. Propose a price yourself or widen the window.`,
  };
}

function done(steps: Step[], gross: bigint, summary: string): Outcome {
  return { agreed: true, steps, finalGross: gross, summary };
}
