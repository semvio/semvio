import type { Tier } from "@/lib/holder/tier";
import { QUOTA } from "@/lib/holder/tier";

/*
 * Matching board rules (pure; the API routes call these and the tests run them). A request is a public, full-size buy or sell of one
 * asset for USDG at an indicative unit price, valid until a time. Anyone with a signed session may post (free quota); holders
 * (0.1 % of $SEMVIO supply) may keep more live requests, and their requests are offered to counterparties first.
 * Prices on the board are public by design; a private limit stays in the workspace.
 */

export type BoardAsset = { symbol: string; address: string; decimals: number };
export type BoardRequest = {
  id: string;
  wallet: string;
  side: "buy" | "sell";
  asset: BoardAsset;
  amount: string; // base units
  price: string; // USDG units (6 decimals) per whole asset unit
  note: string;
  createdAt: number;
  validUntil: number;
  tier: Tier;
  tierBlock: number | null;
};

export type NewRequest = { side?: unknown; asset?: unknown; amount?: unknown; price?: unknown; note?: unknown; validHours?: unknown };

const uint = (v: unknown) => typeof v === "string" && /^[1-9]\d{0,40}$/.test(v);

export function validateRequest(b: NewRequest): { ok: true; value: Omit<BoardRequest, "id" | "wallet" | "createdAt" | "validUntil" | "tier" | "tierBlock"> & { validHours: number } } | { ok: false; error: string } {
  if (b.side !== "buy" && b.side !== "sell") return { ok: false, error: "side must be buy or sell." };
  const a = b.asset as Partial<BoardAsset> | undefined;
  if (!a || typeof a.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a.address) || typeof a.symbol !== "string" || !/^[A-Za-z0-9.]{1,12}$/.test(a.symbol) || typeof a.decimals !== "number" || !Number.isInteger(a.decimals) || a.decimals < 0 || a.decimals > 36)
    return { ok: false, error: "asset needs an address, a symbol (1-12 letters or digits) and decimals." };
  if (!uint(b.amount)) return { ok: false, error: "amount must be a positive whole number of base units." };
  if (!uint(b.price)) return { ok: false, error: "price must be a positive whole number of USDG units (6 decimals) per unit." };
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > 140) return { ok: false, error: "note: at most 140 characters." };
  const h = Number(b.validHours);
  if (!Number.isFinite(h) || h < 1 || h > 720) return { ok: false, error: "validHours: 1 to 720." };
  return { ok: true, value: { side: b.side, asset: { symbol: a.symbol, address: a.address.toLowerCase(), decimals: a.decimals }, amount: b.amount as string, price: b.price as string, note, validHours: h } };
}

export const live = (all: BoardRequest[], now: number) => all.filter((r) => r.validUntil > now);

/** Global cap on live requests. A full board refuses new posts; it never drops anyone's live request to make room. */
export const BOARD_CAP = 600;
/** Slots only holder-tier requests may use: free-tier posts stop at BOARD_CAP - HOLDER_RESERVE live requests. */
export const HOLDER_RESERVE = 150;
/** Longest validity per tier, in hours. */
export const MAX_HOURS = { free: 72, holder: 720 } as const;

/** Whether `wallet` may post one more live request at `tier`; refusals carry the numbers. */
export function canPost(all: BoardRequest[], wallet: string, tier: Tier, now: number, cap = BOARD_CAP): { ok: true } | { ok: false; error: string; full?: true } {
  const liveAll = live(all, now);
  if (liveAll.length >= cap) return { ok: false, full: true, error: `The board is full (${liveAll.length} live requests, cap ${cap}). Try again when some expire.` };
  const reserve = Math.min(HOLDER_RESERVE, Math.floor(cap / 4));
  if (tier === "free" && liveAll.length >= cap - reserve) return { ok: false, full: true, error: `The free part of the board is full (${liveAll.length} live requests; the last ${reserve} of ${cap} slots are kept for holders). Try again when some expire.` };
  const mine = liveAll.filter((r) => r.wallet === wallet.toLowerCase()).length;
  const max = QUOTA[tier].liveRequests;
  if (mine >= max) return { ok: false, error: `Quota reached: ${mine} live requests, the ${tier === "holder" ? "holder" : "free"} tier allows ${max}.${tier === "free" ? ` Holders (0.1 % of supply) may keep ${QUOTA.holder.liveRequests}.` : ""}` };
  return { ok: true };
}

/** Board order: holders first (priority), then newest. */
export const boardOrder = (rs: BoardRequest[]) => [...rs].sort((a, b) => Number(b.tier === "holder") - Number(a.tier === "holder") || b.createdAt - a.createdAt);

export type Match = { request: BoardRequest; reasons: string[] };

/**
 * Counterparties for `mine`: same asset, opposite side, prices cross (buyer's price >= seller's price). Ordered holder first
 * (priority), then the closest size, then the better price for `mine`.
 */
export function matchesFor(mine: BoardRequest, all: BoardRequest[], now: number): Match[] {
  const out = live(all, now)
    .filter((r) => r.id !== mine.id && r.wallet !== mine.wallet && r.side !== mine.side && r.asset.address === mine.asset.address)
    .filter((r) => {
      const buy = mine.side === "buy" ? BigInt(mine.price) : BigInt(r.price);
      const sell = mine.side === "sell" ? BigInt(mine.price) : BigInt(r.price);
      return buy >= sell;
    })
    .map((r) => {
      const reasons = [r.tier === "holder" ? "Holder request: offered first." : "Free-tier request."];
      reasons.push(BigInt(r.amount) === BigInt(mine.amount) ? "Same size." : BigInt(r.amount) > BigInt(mine.amount) ? "Larger size: a deal would be for your amount if they accept." : "Smaller size: a deal would be for their amount.");
      return { request: r, reasons };
    });
  const diff = (r: BoardRequest) => {
    const d = BigInt(r.amount) - BigInt(mine.amount);
    return d < 0n ? -d : d;
  };
  return out.sort((a, b) => {
    const h = Number(b.request.tier === "holder") - Number(a.request.tier === "holder");
    if (h) return h;
    const da = diff(a.request);
    const db = diff(b.request);
    if (da !== db) return da < db ? -1 : 1;
    const pa = BigInt(a.request.price);
    const pb = BigInt(b.request.price);
    // better for me: a buyer wants the lowest ask, a seller the highest bid
    return mine.side === "buy" ? (pa < pb ? -1 : pa > pb ? 1 : 0) : pa > pb ? -1 : pa < pb ? 1 : 0;
  });
}

export type Template = { id: string; name: string; side: "buy" | "sell"; asset: BoardAsset; amount: string; price: string; feeBps: number; validHours: number; createdAt: number };
export type Team = { owner: string; name: string; members: string[]; updatedAt: number };

export function validateTeam(owner: string, name: unknown, members: unknown, max: number): { ok: true; value: Team } | { ok: false; error: string } {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) return { ok: false, error: "Team name: 1 to 40 characters." };
  if (!Array.isArray(members) || members.some((m) => typeof m !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(m))) return { ok: false, error: "members must be wallet addresses." };
  const set = [...new Set((members as string[]).map((m) => m.toLowerCase()).filter((m) => m !== owner))];
  if (set.length > max) return { ok: false, error: `A team may have at most ${max} members besides the owner.` };
  return { ok: true, value: { owner, name: name.trim(), members: set, updatedAt: Date.now() } };
}
