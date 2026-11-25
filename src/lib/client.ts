import { decodeErrorResult, decodeFunctionResult, encodeFunctionData, type Abi } from "viem";
import { NETWORKS, type NetKey } from "@/config/networks";
import { PRACTICE_ABI, ROOM_ABI } from "@/lib/abi";
import { BIT_WORDS, bitNames } from "@/lib/deal/bits";

const ALL_ERRORS = [...ROOM_ABI, ...PRACTICE_ABI].filter((x) => x.type === "error");

/** Plain words for each refusal of SemvioDealRoom (SemvioRefused is explained from its reason bits). */
export const ERROR_WORDS: Record<string, string> = {
  SemvioBadDeal: "That deal shape cannot be opened: the counterparty must be another non-zero address, the two tokens must differ, the window must end within 30 days, and an agent cannot be either party.",
  SemvioReentrant: "A token tried to call back into the room; the call was stopped.",
  SemvioTokenCallFailed: "A token refused the transfer (a balance or allowance too low, a blocked address, or a token that returns false). Nothing moved.",
  SemvioReceivedMismatch: "A token delivered a different amount than was sent (fee-on-transfer). Such tokens are not supported; nothing moved.",
  SemvioRefused: "The room refused; see the reasons.",
  SemvioPracticeMintCap: "The test token mints at most 100,000 per call.",
};

/*
 * Browser-side reads. They go through the site relay first (some networks intercept the chain's public
 * RPC host), then the configured RPC, then the public fallback.
 */

// A local test chain (anvil) gets no mainnet fallback, so reads never mix two chains.
const isLocal = (u: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(u);
function endpointsOf(net: NetKey): string[] {
  const n = NETWORKS[net];
  const list = isLocal(n.rpc) ? [`/api/rpc?net=${net}`, n.rpc] : [`/api/rpc?net=${net}`, n.rpc, n.fallbackRpc ?? ""];
  return list.filter((u, i, all) => u && all.indexOf(u) === i);
}
const pref: Record<NetKey, number> = { mainnet: 0, testnet: 0 };

export class ChainError extends Error {
  constructor(
    message: string,
    readonly data: string | null = null,
    readonly final = false,
  ) {
    super(message);
  }
}

type RpcBody = { id?: number; result?: unknown; error?: { message?: string; data?: unknown; code?: number } | string };

function errorData(e: { data?: unknown }) {
  if (typeof e.data === "string") return e.data;
  const inner = e.data as { data?: unknown } | null;
  return inner && typeof inner.data === "string" ? inner.data : null;
}

/** One JSON-RPC call with endpoint fallback. A revert is final (not retried elsewhere). */
export async function rpcCall<T>(method: string, params: unknown[], net: NetKey = "mainnet"): Promise<T> {
  const ENDPOINTS = endpointsOf(net);
  let last: unknown = null;
  for (let n = 0; n < ENDPOINTS.length; n++) {
    const index = (pref[net] + n) % ENDPOINTS.length;
    try {
      const res = await fetch(ENDPOINTS[index], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store" });
      const body = (await res.json().catch(() => null)) as RpcBody | null;
      if (!body) throw new Error(`RPC ${res.status}`);
      if (typeof body.error === "string") throw new Error(body.error);
      if (body.error) {
        const final = body.error.code === 3 || /revert/i.test(body.error.message ?? "");
        const err = new ChainError(body.error.message ?? "RPC error", errorData(body.error), final);
        if (final) throw err;
        throw err;
      }
      pref[net] = index;
      return body.result as T;
    } catch (error) {
      if (error instanceof ChainError && error.final) throw error;
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("The chain could not be reached.");
}

/** A batch where each entry may fail on its own (null), with endpoint fallback for the whole batch. */
export async function rpcBatchLoose(calls: { method: string; params: unknown[] }[], net: NetKey = "mainnet"): Promise<(unknown | null)[]> {
  if (calls.length === 0) return [];
  const ENDPOINTS = endpointsOf(net);
  let last: unknown = null;
  for (let n = 0; n < ENDPOINTS.length; n++) {
    const index = (pref[net] + n) % ENDPOINTS.length;
    try {
      const res = await fetch(ENDPOINTS[index], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }))), cache: "no-store" });
      const body = (await res.json().catch(() => null)) as RpcBody[] | RpcBody | null;
      if (!Array.isArray(body)) throw new Error(typeof body?.error === "string" ? body.error : `RPC ${res.status}`);
      const out: (unknown | null)[] = calls.map(() => null);
      for (const e of body) if (typeof e.id === "number" && !e.error && e.result !== undefined) out[e.id] = e.result;
      pref[net] = index;
      return out;
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("The chain could not be reached.");
}

/**
 * Runs a contract call as eth_call from the sender before the wallet opens, so a refusal reaches the visitor in plain words
 * (the contract's custom error) instead of a wallet's generic gas message. Only a revert is thrown; an unreachable node is not
 * a reason to stop the visitor, so it passes.
 */
export async function simulate(from: string, to: string, data: string, net: NetKey = "mainnet"): Promise<void> {
  try {
    await rpcCall<string>("eth_call", [{ from, to, data }, "latest"], net);
  } catch (e) {
    if (e instanceof ChainError && e.final) throw e;
  }
}

export type Read = { to: string; abi: Abi; fn: string; args?: readonly unknown[] };

export const encodeRead = (r: Read) => encodeFunctionData({ abi: r.abi, functionName: r.fn, args: r.args ?? [] } as never);

export async function read<T>(r: Read, net: NetKey = "mainnet", from?: string): Promise<T> {
  const raw = await rpcCall<`0x${string}`>("eth_call", [{ ...(from ? { from } : {}), to: r.to, data: encodeRead(r) }, "latest"], net);
  return decodeFunctionResult({ abi: r.abi, functionName: r.fn, data: raw } as never) as T;
}

/** Many reads in batches of 20; a read that fails or does not decode is null. */
export async function readMany(reads: Read[], net: NetKey = "mainnet"): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < reads.length; i += 20) {
    const chunk = reads.slice(i, i + 20);
    const raw = await rpcBatchLoose(chunk.map((r) => ({ method: "eth_call", params: [{ to: r.to, data: encodeRead(r) }, "latest"] })), net);
    chunk.forEach((r, k) => {
      try {
        out.push(typeof raw[k] === "string" && (raw[k] as string).length > 2 ? decodeFunctionResult({ abi: r.abi, functionName: r.fn, data: raw[k] as `0x${string}` } as never) : null);
      } catch {
        out.push(null);
      }
    });
  }
  return out;
}

/** Waits for a transaction receipt; resolves its status. */
export async function waitForReceipt(hash: string, net: NetKey = "mainnet", timeoutMs = 120_000): Promise<{ ok: boolean; blockNumber: number; contractAddress: string | null }> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await rpcCall<{ status: string; blockNumber: string; contractAddress: string | null } | null>("eth_getTransactionReceipt", [hash], net).catch(() => null);
    if (r) return { ok: r.status === "0x1", blockNumber: Number(BigInt(r.blockNumber)), contractAddress: r.contractAddress };
    await new Promise((res) => setTimeout(res, 1200));
  }
  throw new Error("No receipt yet. The transaction may still land; check the explorer.");
}

/** Plain words for a revert from Semvio's contracts, or the wallet's own message. */
export function explain(cause: unknown): string {
  const e = cause as { code?: number; message?: string; data?: unknown; cause?: unknown } | null;
  if (e?.code === 4001) return "The request was declined in the wallet.";
  const data = e instanceof ChainError ? e.data : typeof e?.data === "string" ? e.data : errorData((e ?? {}) as { data?: unknown });
  if (data && data.length >= 10) {
    try {
      const d = decodeErrorResult({ abi: ALL_ERRORS as Abi, data: data as `0x${string}` });
      if (d.errorName === "SemvioRefused" && d.args?.[0] !== undefined) {
        const names = bitNames(BigInt(d.args[0] as bigint));
        return `The room refused it: ${names.map((n) => BIT_WORDS[n].label).join(", ") || "unknown reason"}.`;
      }
      return ERROR_WORDS[d.errorName] ?? d.errorName;
    } catch {
      // not one of ours
    }
  }
  const msg = e?.message ?? "Something went wrong.";
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

/** Formats a hex wei amount as ETH with a few significant decimals. */
export function formatEth(hexWei: string, digits = 4) {
  const wei = BigInt(hexWei);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
