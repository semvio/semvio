import "server-only";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { ETH_USD_FEED, TESTNET_WETH } from "@/config/dex";
import { CONTRACTS, roomLive } from "@/config/contracts";
import type { NetKey } from "@/config/networks";
import { FEED_ABI } from "@/lib/abi";
import { rpcBatch, withNet } from "@/lib/server/chainread";

/* Light live facts for one network: head block, its time, block time over the last 100,000 blocks, gas price, Chainlink ETH/USD
   (mainnet), whether the deal room has code, and (testnet) whether its WETH is still fully ETH-backed. */

export type ChainSnapshot = {
  net: NetKey;
  chainId: number | null;
  block: number | null;
  time: number | null;
  blockSeconds: number | null;
  gasPriceWei: string | null;
  ethUsd: { price: number; updatedAt: number; feed: string } | null;
  room: string;
  roomCode: boolean | null;
  wethBacked: boolean | null;
  readAt: number;
};

const SPAN = 100_000;
const has = (x: unknown) => typeof x === "string" && x.length > 2;

export function readSnapshot(net: NetKey): Promise<ChainSnapshot> {
  return withNet(net, async () => {
    const head = await rpcBatch<unknown>([{ method: "eth_getBlockByNumber", params: ["latest", false] }, { method: "eth_chainId", params: [] }]).catch(() => [null, null]);
    const blk = head[0] as { number?: string; timestamp?: string } | null;
    const n = blk?.number ? Number(BigInt(blk.number)) : null;
    const room = CONTRACTS[net].room;
    const calls: { method: string; params: unknown[] }[] = [{ method: "eth_gasPrice", params: [] }];
    const at: Record<string, number> = {};
    const push = (k: string, c: { method: string; params: unknown[] }) => {
      at[k] = calls.length;
      calls.push(c);
    };
    if (n !== null) push("old", { method: "eth_getBlockByNumber", params: [`0x${Math.max(0, n - SPAN).toString(16)}`, false] });
    if (net === "mainnet") push("feed", { method: "eth_call", params: [{ to: ETH_USD_FEED, data: encodeFunctionData({ abi: FEED_ABI, functionName: "latestRoundData" }) }, "latest"] });
    if (roomLive(net)) push("room", { method: "eth_getCode", params: [room, "latest"] });
    if (net === "testnet") {
      push("wbal", { method: "eth_getBalance", params: [TESTNET_WETH, "latest"] });
      push("wsup", { method: "eth_call", params: [{ to: TESTNET_WETH, data: "0x18160ddd" }, "latest"] });
    }
    const r = await rpcBatch<unknown>(calls).catch(() => calls.map(() => null));
    const time = blk?.timestamp ? Number(BigInt(blk.timestamp)) : null;
    let ethUsd: ChainSnapshot["ethUsd"] = null;
    if (at.feed !== undefined && has(r[at.feed])) {
      try {
        const [, answer, , updatedAt] = decodeFunctionResult({ abi: FEED_ABI, functionName: "latestRoundData", data: r[at.feed] as `0x${string}` });
        if (answer > 0n) ethUsd = { price: Number(answer) / 1e8, updatedAt: Number(updatedAt), feed: ETH_USD_FEED };
      } catch {
        ethUsd = null;
      }
    }
    const old = at.old !== undefined ? (r[at.old] as { timestamp?: string } | null) : null;
    const blockSeconds = time !== null && old?.timestamp && n !== null ? (time - Number(BigInt(old.timestamp))) / Math.min(SPAN, n) : null;
    let wethBacked: boolean | null = null;
    if (at.wbal !== undefined && has(r[at.wbal]) && has(r[at.wsup])) wethBacked = BigInt(r[at.wbal] as string) >= BigInt((r[at.wsup] as string).slice(0, 66));
    return {
      net,
      chainId: typeof head[1] === "string" ? Number(BigInt(head[1])) : null,
      block: n,
      time,
      blockSeconds,
      gasPriceWei: typeof r[0] === "string" ? BigInt(r[0]).toString() : null,
      ethUsd,
      room,
      roomCode: at.room !== undefined ? has(r[at.room]) : null,
      wethBacked,
      readAt: Date.now(),
    };
  });
}
