import "server-only";
import { keccak256 } from "viem";
import { BEACON_SLOT, ETH_USD_FEED, STOCK_BEACON, STOCK_PROXY_CODEHASH } from "@/config/chain";
import { rpcBatchAnswers } from "@/lib/feeds/rpc";
import { headBlock, multicall } from "@/lib/server/chainread";
import TOKENS from "@/lib/fixtures/stock-tokens.json";
import FEEDS from "@/lib/fixtures/stock-feeds.json";

/*
 * The stock-token universe Vardex offers, read live from Robinhood Chain. The fixtures only say where to look. On every refresh:
 *   - each candidate's proof is checked (proxy code hash + beacon slot once per process: a beacon proxy cannot change either; minted
 *     supply on every read),
 *   - every matched Chainlink feed answers latestRoundData(),
 *   - every token answers uiMultiplier() (dividends grow it; balances are multiplied by it to count shares).
 * A failed read leaves a field null and the page says so. A token whose proof fails is never listed. Nothing here is cached when
 * the read failed (memory: cache-papan-gagal-meracuni-build).
 */

export type Feed = {
  proxy: string;
  name: string;
  kind: "standard" | "24/7";
  hours: string | null;
  heartbeat: number;
  decimals: number;
  /** Answer as a decimal string in the feed's own decimals. */
  answer: string | null;
  updatedAt: number | null;
  roundId: string | null;
  /** Older than heartbeat + 10 minutes when read. */
  stale: boolean | null;
};

export type Stock = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** 1e18-scaled; null when unreadable. */
  uiMultiplier: string | null;
  feeds: Feed[];
};

export type Board = {
  stocks: Stock[];
  head: number | null;
  readAt: number;
  candidates: number;
  /** Candidates whose proof could not be read on this refresh (not listed). */
  unknown: number;
  scannedTo: number;
  ethUsd: { answer: string | null; updatedAt: number | null };
  complete: boolean;
};

type Cand = { a: string; s: string; n: string; d: number | null; proven: boolean };
type FeedInfo = { symbol: string; proxy: string; name: string; heartbeat: number; hours: string | null; kind: string; decimals: number };
const FEED_LIST = FEEDS.feeds as FeedInfo[];
const CANDIDATES = (TOKENS.tokens as Cand[]).filter((t) => t.proven);
export const GRACE = 600;

const SEL = { totalSupply: "0x18160ddd", latestRoundData: "0xfeaf968c", uiMultiplier: "0xa60bf13d" } as const;
const proofs = new Map<string, boolean>();

async function proveCode(list: Cand[]) {
  const todo = list.filter((c) => !proofs.has(c.a));
  for (let i = 0; i < todo.length; i += 25) {
    const part = todo.slice(i, i + 25);
    const ans = await rpcBatchAnswers(
      part.flatMap((c) => [
        { method: "eth_getCode", params: [c.a, "latest"] },
        { method: "eth_getStorageAt", params: [c.a, BEACON_SLOT, "latest"] },
      ]),
    ).catch(() => null);
    if (!ans) continue;
    part.forEach((c, k) => {
      const code = ans[2 * k];
      const slot = ans[2 * k + 1];
      if (code.kind !== "ok" || slot.kind !== "ok") return;
      const codeOk = typeof code.result === "string" && code.result.length > 2 && keccak256(code.result as `0x${string}`) === STOCK_PROXY_CODEHASH;
      const slotOk = typeof slot.result === "string" && /^0x[0-9a-f]+$/i.test(slot.result) && BigInt(slot.result) === BigInt(STOCK_BEACON);
      proofs.set(c.a, codeOk && slotOk);
    });
  }
}

/** latestRoundData() → roundId, answer (signed), updatedAt. Null when malformed. */
export function parseRound(hex: string | null): { roundId: bigint; answer: bigint; updatedAt: number } | null {
  if (!hex || hex.length < 2 + 64 * 5) return null;
  const w = (i: number) => BigInt(`0x${hex.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
  const raw = w(1);
  return { roundId: w(0), answer: raw >= 1n << 255n ? raw - (1n << 256n) : raw, updatedAt: Number(w(3)) };
}

const word = (hex: string | null) => (hex && hex.length >= 66 ? BigInt(hex.slice(0, 66)) : null);

async function readNow(): Promise<Board> {
  const head = await headBlock().catch(() => null);
  await proveCode(CANDIDATES);
  const calls = [
    ...CANDIDATES.map((c) => ({ to: c.a, data: SEL.totalSupply })),
    ...CANDIDATES.map((c) => ({ to: c.a, data: SEL.uiMultiplier })),
    ...FEED_LIST.map((f) => ({ to: f.proxy, data: SEL.latestRoundData })),
    { to: ETH_USD_FEED, data: SEL.latestRoundData },
  ];
  const r = await multicall(calls);
  const n = CANDIDATES.length;
  const now = Math.floor(Date.now() / 1000);
  const bySymbol = new Map<string, Feed[]>();
  let feedOk = 0;
  FEED_LIST.forEach((f, i) => {
    const round = parseRound(r[2 * n + i]);
    const good = round !== null && round.answer > 0n;
    if (good) feedOk++;
    const feed: Feed = {
      proxy: f.proxy,
      name: f.name,
      kind: f.kind === "24/7" ? "24/7" : "standard",
      hours: f.hours,
      heartbeat: f.heartbeat,
      decimals: f.decimals,
      answer: good ? round.answer.toString() : null,
      updatedAt: good ? round.updatedAt : null,
      roundId: good ? round.roundId.toString() : null,
      stale: good ? now - round.updatedAt > f.heartbeat + GRACE : null,
    };
    const list = [...(bySymbol.get(f.symbol) ?? []), feed];
    list.sort((a, b) => (a.kind === "standard" ? 0 : 1) - (b.kind === "standard" ? 0 : 1));
    bySymbol.set(f.symbol, list);
  });
  let unknown = 0;
  const stocks: Stock[] = [];
  CANDIDATES.forEach((c, i) => {
    const proof = proofs.get(c.a);
    const supply = word(r[i]);
    if (proof === undefined || supply === null) {
      unknown++;
      return;
    }
    if (!proof || supply === 0n) return;
    const mult = word(r[n + i]);
    stocks.push({ address: c.a, symbol: c.s, name: c.n, decimals: c.d ?? 18, uiMultiplier: mult !== null ? mult.toString() : null, feeds: bySymbol.get(c.s) ?? [] });
  });
  stocks.sort((a, b) => (b.feeds.length ? 1 : 0) - (a.feeds.length ? 1 : 0) || a.symbol.localeCompare(b.symbol));
  const eth = parseRound(r[r.length - 1]);
  return {
    stocks,
    head,
    readAt: Date.now(),
    candidates: n,
    unknown,
    scannedTo: TOKENS.scannedTo,
    ethUsd: { answer: eth && eth.answer > 0n ? eth.answer.toString() : null, updatedAt: eth?.updatedAt ?? null },
    complete: unknown === 0 && feedOk === FEED_LIST.length && head !== null,
  };
}

/** A board is worth keeping when tokens were proven and at least one feed answered. */
export const usable = (b: Board) => b.stocks.length > 0 && b.stocks.some((s) => s.feeds.some((f) => f.answer !== null));

let cache: { at: number; value: Board } | null = null;
let inflight: Promise<Board> | null = null;
let lastFail = 0;
const TTL = 45_000;
const FAIL_GAP = 10_000;

/** One refresh at a time for everyone; the last usable board is served while a failed refresh waits FAIL_GAP. */
export async function readBoard(): Promise<Board> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  if (cache && Date.now() - lastFail < FAIL_GAP) return cache.value;
  inflight ??= readNow()
    .then((value) => {
      if (usable(value)) {
        cache = { at: Date.now(), value };
        return value;
      }
      lastFail = Date.now();
      return cache ? cache.value : value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// ------------------------------------------------------------------ one wallet's stock tokens

export type Holding = { address: string; symbol: string; raw: string; shares: string };

/** Balances of every listed stock token for one address; shares = raw × uiMultiplier / 1e18. */
export async function readHoldings(owner: string): Promise<{ holdings: Holding[]; complete: boolean; readAt: number; head: number | null }> {
  const board = await readBoard();
  const data = `0x70a08231${owner.slice(2).toLowerCase().padStart(64, "0")}`;
  const res = await multicall(board.stocks.map((s) => ({ to: s.address, data })));
  const holdings: Holding[] = [];
  let complete = true;
  res.forEach((r, i) => {
    const v = word(r);
    if (v === null) {
      complete = false;
      return;
    }
    if (v === 0n) return;
    const s = board.stocks[i];
    const m = s.uiMultiplier ? BigInt(s.uiMultiplier) : 10n ** 18n;
    holdings.push({ address: s.address, symbol: s.symbol, raw: v.toString(), shares: ((v * m) / 10n ** 18n).toString() });
  });
  return { holdings, complete, readAt: Date.now(), head: board.head };
}
