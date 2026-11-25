/*
 * Alerts for one wallet, derived from the deal room's own events and deal views (pure, unit tested). Free for everyone: any browser
 * could read the same chain data. Kinds:
 *   revision  the other side (or its agent) proposed a new revision on your deal
 *   approved  the other side approved a revision
 *   settled   a deal of yours settled (proof = the tx)
 *   cancelled the other side cancelled
 *   expiring  an open deal or its current offer ends within EXPIRING_SEC
 */

export const EXPIRING_SEC = 2 * 3600;

export type RoomLog = { name: string; block: number; tx: string; logIndex: number; args: Record<string, unknown> };
export type DealLite = { id: number; seller: string; buyer: string; status: string; validUntil: number; offerValidUntil: number; revision: number };
export type Alert = { key: string; kind: "revision" | "approved" | "settled" | "cancelled" | "expiring"; dealId: number; block: number | null; tx: string | null; text: string };

const lc = (v: unknown) => String(v ?? "").toLowerCase();

export function deriveAlerts(me: string, deals: DealLite[], logs: RoomLog[], now: number): Alert[] {
  const w = me.toLowerCase();
  const mine = new Map(deals.filter((d) => d.seller === w || d.buyer === w).map((d) => [d.id, d]));
  const out: Alert[] = [];
  for (const l of logs) {
    const id = Number(l.args.id ?? -1);
    const d = mine.get(id);
    if (!d) continue;
    const key = `${l.tx}:${l.logIndex}`;
    if (l.name === "RevisionProposed") {
      const by = lc(l.args.proposer);
      if (by === w) continue;
      const mySellerSide = d.seller === w;
      // The other side, or an agent speaking for the other side.
      if (Boolean(l.args.sellerSide) === mySellerSide) continue;
      out.push({ key, kind: "revision", dealId: id, block: l.block, tx: l.tx, text: `Deal #${id}: the ${mySellerSide ? "buyer" : "seller"} side proposed revision ${l.args.revision}. Review it before it expires.` });
    } else if (l.name === "Approved") {
      if (lc(l.args.party) === w) continue;
      out.push({ key, kind: "approved", dealId: id, block: l.block, tx: l.tx, text: `Deal #${id}: the other side approved revision ${l.args.revision}.` });
    } else if (l.name === "Settled") {
      out.push({ key, kind: "settled", dealId: id, block: l.block, tx: l.tx, text: `Deal #${id} settled (revision ${l.args.revision}).` });
    } else if (l.name === "Cancelled") {
      if (lc(l.args.by) === w) continue;
      out.push({ key, kind: "cancelled", dealId: id, block: l.block, tx: l.tx, text: `Deal #${id} was cancelled by the other side.` });
    }
  }
  for (const d of mine.values()) {
    if (d.status !== "Open") continue;
    const end = Math.min(d.validUntil, d.offerValidUntil);
    if (end > now && end - now <= EXPIRING_SEC) {
      const mins = Math.max(1, Math.round((end - now) / 60));
      out.push({ key: `exp:${d.id}:${d.revision}:${end}`, kind: "expiring", dealId: d.id, block: null, tx: null, text: `Deal #${d.id}: ${end === d.validUntil ? "the deal" : `revision ${d.revision}'s offer`} ends in ${mins} min.` });
    }
  }
  return out.sort((a, b) => (b.block ?? Number.MAX_SAFE_INTEGER) - (a.block ?? Number.MAX_SAFE_INTEGER));
}
