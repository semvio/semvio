import { keccak256, toBytes } from "viem";
import { negotiate, bounds, type Side } from "@/lib/deal/agent";
import { bit } from "@/lib/deal/bits";
import type { Desk } from "@/lib/deal/book";
import { dealHash, feeOf, fromUnits, limitBits, netOf, noteHashOf, revisionHash, termsBits, ZERO_ADDR, type Terms } from "@/lib/deal/math";

/*
 * A practice deal: the same objects, rules and hashes as the deal room, kept in the browser with SAMPLE counterparties. Nothing
 * is sent anywhere. Practice hashes use chain id 0 and the zero address as the "room", so they can never be mistaken for (or
 * replayed as) a real deal's hashes.
 */

export const YOU = "0x5e00000000000000000000000000000000000001" as const;
export const DESK = "0x5e000000000000000000000000000000000000d1" as const;

export type Asset = { symbol: string; name: string; address: `0x${string}`; decimals: number };
export type Who = "You" | "Your agent" | "Their agent" | "Counterparty";

export type Revision = {
  n: number;
  by: Who;
  sellerSide: boolean;
  terms: Terms;
  note: string;
  changes: string[];
  hash: `0x${string}`;
  prevHash: `0x${string}`;
  at: number;
};

export type Event = { at: number; text: string; kind: "open" | "revision" | "approve" | "withdraw" | "settle" | "cancel" | "refuse" };

export type PracticeDeal = {
  id: number;
  createdAt: number;
  side: Side;
  asset: Asset;
  quote: Asset;
  amount: string; // bigint as decimal string (JSON-safe)
  yourLimit: string;
  desk: { label: string; limitPerUnit: string; side: Side };
  validUntil: number;
  dealHash: `0x${string}`;
  revisions: (Omit<Revision, "terms"> & { terms: Omit<Terms, "quoteAmount"> & { quoteAmount: string } })[];
  sellerApproved: number;
  buyerApproved: number;
  status: "open" | "settled" | "cancelled";
  events: Event[];
  agentSummary: string;
};

const big = (s: string) => BigInt(s);
export const termsOf = (r: PracticeDeal["revisions"][number]): Terms => ({ ...r.terms, quoteAmount: big(r.terms.quoteAmount) });
export const current = (d: PracticeDeal) => d.revisions[d.revisions.length - 1];
export const seller = (d: PracticeDeal) => (d.side === "sell" ? YOU : DESK);
export const buyer = (d: PracticeDeal) => (d.side === "buy" ? YOU : DESK);

/** The two limits in gross terms for the current fee. */
export function limitsOf(d: PracticeDeal, feeBps: number) {
  const buyerLimit = d.side === "buy" ? big(d.yourLimit) : big(d.desk.limitPerUnit);
  const sellerLimit = d.side === "sell" ? big(d.yourLimit) : big(d.desk.limitPerUnit);
  return bounds(buyerLimit, sellerLimit, big(d.amount), d.asset.decimals, feeBps);
}

function record(d: PracticeDeal, by: Who, sellerSide: boolean, t: Terms, note: string, now: number): PracticeDeal {
  const prev = d.revisions.length ? current(d) : null;
  const prevHash = prev ? prev.hash : d.dealHash;
  const n = d.revisions.length + 1;
  const proposer = by === "You" || by === "Your agent" ? YOU : DESK;
  const changes: string[] = [];
  const q = (v: bigint) => `${fromUnits(v, d.quote.decimals, 2)} ${d.quote.symbol}`;
  if (!prev) changes.push(`Opening price ${q(t.quoteAmount)}`);
  else {
    const pt = termsOf(prev);
    if (pt.quoteAmount !== t.quoteAmount) changes.push(`Price ${q(pt.quoteAmount)} → ${q(t.quoteAmount)}`);
    if (pt.feeBps !== t.feeBps) changes.push(`Fee ${pt.feeBps / 100}% → ${t.feeBps / 100}%`);
    if (pt.offerValidUntil !== t.offerValidUntil) changes.push(`Offer valid until ${new Date(t.offerValidUntil * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`);
    if (!changes.length) changes.push("Same terms, re-proposed");
  }
  // The room hashes the proposer's address; agents propose from their own key, here a fixed practice address per side.
  const hash = revisionHash(prevHash, BigInt(d.id), n, proposer, sellerSide, t);
  const rev = { n, by, sellerSide, terms: { ...t, quoteAmount: t.quoteAmount.toString() }, note, changes, hash, prevHash, at: now };
  return { ...d, revisions: [...d.revisions, rev], events: [...d.events, { at: now, kind: "revision", text: `Revision ${n} by ${by}: ${changes.join("; ")}` }] };
}

export type NewRequest = { side: Side; asset: Asset; quote: Asset; amount: bigint; limitPerUnit: bigint; validHours: number; feeBps: number; feeRecipient: `0x${string}` };

/** Opens a practice deal with a desk and lets both agents negotiate; each proposal becomes a revision. */
export function openPractice(id: number, req: NewRequest, desk: Desk, now: number): PracticeDeal {
  const validUntil = now + Math.min(req.validHours, desk.validHours) * 3600;
  const ref = keccak256(toBytes(`practice:${id}:${now}`));
  const s = req.side === "sell" ? YOU : DESK;
  const b = req.side === "buy" ? YOU : DESK;
  const dh = dealHash({ chainId: 0, room: ZERO_ADDR, id: BigInt(id), seller: s, buyer: b, baseToken: req.asset.address, quoteToken: req.quote.address, baseAmount: req.amount, validUntil, ref });
  let d: PracticeDeal = {
    id,
    createdAt: now,
    side: req.side,
    asset: req.asset,
    quote: req.quote,
    amount: req.amount.toString(),
    yourLimit: req.limitPerUnit.toString(),
    desk: { label: desk.label, limitPerUnit: desk.limitPerUnit.toString(), side: desk.side },
    validUntil,
    dealHash: dh,
    revisions: [],
    sellerApproved: 0,
    buyerApproved: 0,
    status: "open",
    events: [{ at: now, kind: "open", text: `Deal opened with ${desk.label} (sample counterparty)` }],
    agentSummary: "",
  };
  const out = negotiate({
    buyerLimit: req.side === "buy" ? req.limitPerUnit : desk.limitPerUnit,
    sellerLimit: req.side === "sell" ? req.limitPerUnit : desk.limitPerUnit,
    amount: req.amount,
    baseDecimals: req.asset.decimals,
    feeBps: req.feeBps,
    quoteDecimals: req.quote.decimals,
    quoteSymbol: req.quote.symbol,
  });
  const offerUntil = Math.min(validUntil, now + 6 * 3600);
  out.steps.forEach((st, i) => {
    const mine = (st.by === "buyer") === (req.side === "buy");
    const t: Terms = { quoteAmount: st.gross, feeBps: req.feeBps, feeRecipient: req.feeRecipient, offerValidUntil: offerUntil, noteHash: noteHashOf(st.why) };
    d = record(d, mine ? "Your agent" : "Their agent", st.by === "seller", t, st.why, now + i);
  });
  d.agentSummary = out.summary;
  // The counterparty approves the revision its own agent accepted (sample behaviour: a desk approves anything inside its limit).
  if (out.agreed) d = deskReacts(d, now + out.steps.length);
  return d;
}

/** The desk approves the current revision when it is inside its limit; otherwise its agent counters at its own limit. */
function deskReacts(d: PracticeDeal, now: number): PracticeDeal {
  const r = current(d);
  const t = termsOf(r);
  const lim = limitsOf(d, t.feeBps);
  const deskSells = d.desk.side === "sell";
  const inside = deskSells ? netOf(t.quoteAmount, t.feeBps) >= lim.minNet : t.quoteAmount <= lim.maxGross;
  if (inside) return approve(d, deskSells, "Counterparty", now);
  const limitGross = deskSells ? lim.minGross : lim.maxGross;
  const why = `Outside the counterparty's limit; their agent counters at the best price it may offer.`;
  return record(d, "Their agent", deskSells, { ...t, quoteAmount: limitGross, noteHash: noteHashOf(why) }, why, now);
}

/** Bits that block settlement right now (same meaning as the room's checkDeal). */
export function practiceBits(d: PracticeDeal, now: number): bigint {
  let bits = 0n;
  if (d.status !== "open") bits |= bit("CLOSED");
  if (d.validUntil < now) bits |= bit("DEAL_EXPIRED");
  const r = current(d);
  if (!r) return bits;
  const t = termsOf(r);
  if (t.offerValidUntil < now) bits |= bit("OFFER_EXPIRED");
  if (d.sellerApproved !== r.n) bits |= bit("SELLER_NOT_APPROVED");
  if (d.buyerApproved !== r.n) bits |= bit("BUYER_NOT_APPROVED");
  const lim = limitsOf(d, t.feeBps);
  bits |= limitBits(t.quoteAmount, t.feeBps, lim.maxGross, lim.minNet);
  return bits;
}

export function approve(d: PracticeDeal, sellerSide: boolean, who: "You" | "Counterparty", now: number): PracticeDeal {
  const r = current(d);
  if (d.status !== "open" || termsOf(r).offerValidUntil < now) return d;
  return {
    ...d,
    sellerApproved: sellerSide ? r.n : d.sellerApproved,
    buyerApproved: sellerSide ? d.buyerApproved : r.n,
    events: [...d.events, { at: now, kind: "approve", text: `${who} approved revision ${r.n} (${r.hash.slice(0, 10)}…)` }],
  };
}

export function withdraw(d: PracticeDeal, now: number): PracticeDeal {
  const yourSellerSide = d.side === "sell";
  return { ...d, sellerApproved: yourSellerSide ? 0 : d.sellerApproved, buyerApproved: yourSellerSide ? d.buyerApproved : 0, events: [...d.events, { at: now, kind: "withdraw", text: "You withdrew your approval" }] };
}

/** You propose new terms (a counter); the counterparty then reacts. Refused terms come back with their bits. */
export function counter(d: PracticeDeal, gross: bigint, feeBps: number, feeRecipient: `0x${string}`, offerHours: number, note: string, now: number): { deal: PracticeDeal; refused: bigint } {
  const t: Terms = { quoteAmount: gross, feeBps, feeRecipient, offerValidUntil: Math.min(d.validUntil, now + offerHours * 3600), noteHash: noteHashOf(note) };
  let refused = termsBits(t, seller(d), buyer(d), d.validUntil, now);
  if (d.status !== "open") refused |= bit("CLOSED");
  if (d.revisions.length >= 64) refused |= bit("REVISION_LIMIT");
  if (refused) return { deal: { ...d, events: [...d.events, { at: now, kind: "refuse", text: "Counter refused before it was recorded" }] }, refused };
  let next = record(d, "You", d.side === "sell", t, note || "Counter by you", now);
  next = deskReacts(next, now + 1);
  return { deal: next, refused: 0n };
}

export type Settlement = { gross: bigint; fee: bigint; net: bigint; feeRecipient: string };

export function settle(d: PracticeDeal, now: number): { deal: PracticeDeal; bits: bigint; result: Settlement | null } {
  const bits = practiceBits(d, now) & (bit("CLOSED") | bit("DEAL_EXPIRED") | bit("OFFER_EXPIRED") | bit("SELLER_NOT_APPROVED") | bit("BUYER_NOT_APPROVED"));
  if (bits) return { deal: d, bits, result: null };
  const t = termsOf(current(d));
  const fee = feeOf(t.quoteAmount, t.feeBps);
  const result = { gross: t.quoteAmount, fee, net: t.quoteAmount - fee, feeRecipient: t.feeRecipient };
  return { deal: { ...d, status: "settled", events: [...d.events, { at: now, kind: "settle", text: `Settled revision ${current(d).n} in one simulated swap` }] }, bits: 0n, result };
}

export function cancel(d: PracticeDeal, now: number): PracticeDeal {
  if (d.status !== "open") return d;
  return { ...d, status: "cancelled", sellerApproved: 0, buyerApproved: 0, events: [...d.events, { at: now, kind: "cancel", text: "You cancelled the deal" }] };
}

/** Re-checks the stored hash chain (what the dashboard calls "chain intact"). */
export function chainIntact(d: PracticeDeal): boolean {
  let prev = d.dealHash;
  for (const r of d.revisions) {
    const proposer = r.by === "You" || r.by === "Your agent" ? YOU : DESK;
    if (r.prevHash !== prev || revisionHash(prev, BigInt(d.id), r.n, proposer, r.sellerSide, termsOf(r)) !== r.hash) return false;
    prev = r.hash;
  }
  return true;
}
