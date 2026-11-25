import "server-only";
import { decodeEventLog, getAddress, pad, toHex } from "viem";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { NETWORKS, type NetKey } from "@/config/networks";
import { ERC20_ABI, ROOM_ABI } from "@/lib/abi";
import { dealHash, revisionHash, type Terms } from "@/lib/deal/math";
import { headBlock, logReader, reads, withNet, type RawLog, type Read } from "@/lib/server/chainread";
import { scanBack } from "@/lib/logscan";

/*
 * Deals of the room on one network, read from chain: the deal and its current terms (views), and its whole history from the
 * room's logs (every revision with its terms, approvals, withdrawals, agent changes, settlement or cancellation). The revision
 * chain is re-hashed here with the site's copy of SemvioFeeMath and compared with what the room stores: "chain intact" means
 * every logged revision hashes to the stored value and links to the one before.
 */

const STATUS = ["None", "Open", "Settled", "Cancelled"] as const;
const str = (v: unknown): string => (typeof v === "bigint" ? v.toString() : typeof v === "string" ? v : String(v));
const room = (net: NetKey) => CONTRACTS[net].room as `0x${string}`;
const r = (net: NetKey, fn: string, args: readonly unknown[] = []): Read => ({ to: room(net), abi: ROOM_ABI, fn, args });

export type TokenMeta = { address: string; symbol: string | null; decimals: number | null };

export type DealView = {
  id: number;
  seller: string;
  buyer: string;
  maker: string;
  baseToken: TokenMeta;
  quoteToken: TokenMeta;
  baseAmount: string;
  openedAt: number;
  validUntil: number;
  revision: number;
  sellerApproved: number;
  buyerApproved: number;
  status: (typeof STATUS)[number];
  sellerAgent: string;
  buyerAgent: string;
  ref: string;
  lastHash: string;
  terms: { quoteAmount: string; feeBps: number; feeRecipient: string; offerValidUntil: number; noteHash: string };
};

export type RoomEvent = { name: string; block: number; tx: string; logIndex: number; args: Record<string, unknown> };

export type DealHistory = {
  net: NetKey;
  room: string;
  head: number;
  deal: DealView;
  events: RoomEvent[];
  revisions: { n: number; proposer: string; sellerSide: boolean; hash: string; prevHash: string; terms: DealView["terms"]; block: number; tx: string; hashOk: boolean }[];
  chainIntact: boolean;
  scanned: { fromBlock: number; toBlock: number; gaps: [number, number][]; complete: boolean };
};

async function tokenMeta(addrs: string[]): Promise<Record<string, TokenMeta>> {
  const uniq = [...new Set(addrs.map((a) => a.toLowerCase()))];
  const res = await reads(uniq.flatMap((a) => [{ to: a, abi: ERC20_ABI, fn: "symbol" }, { to: a, abi: ERC20_ABI, fn: "decimals" }]));
  const out: Record<string, TokenMeta> = {};
  uniq.forEach((a, i) => {
    const s = res[2 * i];
    const d = res[2 * i + 1];
    out[a] = { address: a, symbol: s.kind === "ok" ? String(s.value).slice(0, 24) : null, decimals: d.kind === "ok" ? Number(d.value) : null };
  });
  return out;
}

function toView(id: number, raw: unknown, meta: Record<string, TokenMeta>): DealView {
  const [d, t] = raw as [Record<string, unknown>, Record<string, unknown>];
  const lc = (v: unknown) => str(v).toLowerCase();
  return {
    id,
    seller: lc(d.seller),
    buyer: lc(d.buyer),
    maker: lc(d.maker),
    baseToken: meta[lc(d.baseToken)] ?? { address: lc(d.baseToken), symbol: null, decimals: null },
    quoteToken: meta[lc(d.quoteToken)] ?? { address: lc(d.quoteToken), symbol: null, decimals: null },
    baseAmount: str(d.baseAmount),
    openedAt: Number(d.openedAt),
    validUntil: Number(d.validUntil),
    revision: Number(d.revision),
    sellerApproved: Number(d.sellerApproved),
    buyerApproved: Number(d.buyerApproved),
    status: STATUS[Number(d.status)] ?? "None",
    sellerAgent: lc(d.sellerAgent),
    buyerAgent: lc(d.buyerAgent),
    ref: str(d.ref),
    lastHash: str(d.lastHash),
    terms: { quoteAmount: str(t.quoteAmount), feeBps: Number(t.feeBps), feeRecipient: lc(t.feeRecipient), offerValidUntil: Number(t.offerValidUntil), noteHash: str(t.noteHash) },
  };
}

export async function readDeals(net: NetKey, who: string): Promise<{ deployed: boolean; room: string; deals: DealView[]; total: number }> {
  if (!roomLive(net)) return { deployed: false, room: room(net), deals: [], total: 0 };
  return withNet(net, async () => {
    const [ids, count] = await reads([r(net, "dealsOfPage", [getAddress(who), 0n, 30n]), r(net, "dealsOfCount", [getAddress(who)])]);
    if (ids.kind !== "ok" || count.kind !== "ok") throw new Error("The room did not answer.");
    const list = (ids.value as bigint[]).map(Number);
    const all = { length: Number(count.value) };
    const raws = await reads(list.map((id) => r(net, "getDeal", [BigInt(id)])));
    if (raws.some((a) => a.kind !== "ok")) throw new Error("A deal read failed.");
    const meta = await tokenMeta(raws.flatMap((a) => {
      const [d] = (a as { value: [Record<string, unknown>] }).value;
      return [str(d.baseToken), str(d.quoteToken)];
    }));
    return { deployed: true, room: room(net), deals: list.map((id, i) => toView(id, (raws[i] as { value: unknown }).value, meta)), total: all.length };
  });
}

export async function readDeal(net: NetKey, id: number): Promise<DealHistory | null> {
  if (!roomLive(net)) return null;
  return withNet(net, async () => {
    const head = await headBlock();
    const [raw, dh] = await reads([r(net, "getDeal", [BigInt(id)]), r(net, "dealHashOf", [BigInt(id)])]);
    if (raw.kind !== "ok" || dh.kind !== "ok") throw new Error("The room did not answer.");
    const [d0] = raw.value as [Record<string, unknown>];
    if (Number(d0.status) === 0) return null;
    const meta = await tokenMeta([str(d0.baseToken), str(d0.quoteToken)]);
    const deal = toView(id, raw.value, meta);
    const from = Math.max(0, CONTRACTS[net].block);
    const scan = await scanBack<RawLog>(logReader({ address: room(net), topics: [null, pad(toHex(id), { size: 32 })] }), from, head, { maxCalls: 24 });
    const events: RoomEvent[] = [];
    for (const l of scan.logs) {
      if ((l as RawLog & { removed?: boolean }).removed) continue;
      try {
        const e = decodeEventLog({ abi: ROOM_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
        const args = JSON.parse(JSON.stringify(e.args ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
        events.push({ name: String(e.eventName), block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args });
      } catch {
        // not a room event
      }
    }
    events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    // Re-hash the chain from the logs.
    let prev = dealHash({
      chainId: NETWORKS[net].id,
      room: room(net),
      id: BigInt(id),
      seller: deal.seller as `0x${string}`,
      buyer: deal.buyer as `0x${string}`,
      baseToken: deal.baseToken.address as `0x${string}`,
      quoteToken: deal.quoteToken.address as `0x${string}`,
      baseAmount: BigInt(deal.baseAmount),
      validUntil: deal.validUntil,
      ref: deal.ref as `0x${string}`,
    });
    let intact = prev.toLowerCase() === str(dh.value).toLowerCase();
    const revisions: DealHistory["revisions"] = [];
    for (const e of events.filter((x) => x.name === "RevisionProposed")) {
      const a = e.args as { revision: string | number; proposer: string; sellerSide: boolean; hash: string; prevHash: string; terms: { quoteAmount: string; feeBps: number | string; feeRecipient: string; offerValidUntil: string | number; noteHash: string } };
      const terms: Terms = { quoteAmount: BigInt(a.terms.quoteAmount), feeBps: Number(a.terms.feeBps), feeRecipient: a.terms.feeRecipient as `0x${string}`, offerValidUntil: Number(a.terms.offerValidUntil), noteHash: a.terms.noteHash as `0x${string}` };
      const n = Number(a.revision);
      const h = revisionHash(prev, BigInt(id), n, a.proposer as `0x${string}`, a.sellerSide, terms);
      const hashOk = h.toLowerCase() === a.hash.toLowerCase() && a.prevHash.toLowerCase() === prev.toLowerCase();
      if (!hashOk) intact = false;
      prev = a.hash as `0x${string}`;
      revisions.push({ n, proposer: a.proposer.toLowerCase(), sellerSide: a.sellerSide, hash: a.hash, prevHash: a.prevHash, terms: { quoteAmount: a.terms.quoteAmount, feeBps: Number(a.terms.feeBps), feeRecipient: a.terms.feeRecipient.toLowerCase(), offerValidUntil: Number(a.terms.offerValidUntil), noteHash: a.terms.noteHash }, block: e.block, tx: e.tx, hashOk });
    }
    const complete = scan.gaps.length === 0;
    if (complete && (revisions.length !== deal.revision || prev.toLowerCase() !== deal.lastHash.toLowerCase())) intact = false;
    return { net, room: room(net), head, deal, events, revisions, chainIntact: complete && intact, scanned: { fromBlock: from, toBlock: head, gaps: scan.gaps, complete } };
  });
}
