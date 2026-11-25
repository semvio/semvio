import "server-only";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { holderToken } from "@/config/contracts";
import { ERC20_ABI } from "@/lib/abi";
import { rpcBatch, withNet } from "@/lib/server/chainread";
import { quotaOf, shareText, thresholdOf, tierOf, type Tier } from "@/lib/holder/tier";
import { decodeCred, SESSION_HEADER, verifySession } from "@/lib/holder/session";
import { sessionOrigins } from "@/config/brand";
import { isRevoked } from "@/lib/server/docs";

/* Holder tier read live from the token contract on Robinhood Chain (balanceOf + totalSupply + block in one batch), cached 30 s per
   wallet. Before the token exists the tier is "free" with launched = false ("Unlocks at launch"). */

export type TierInfo = {
  launched: boolean;
  token: string | null;
  tier: Tier;
  balance: string;
  supply: string;
  threshold: string;
  share: string;
  block: number | null;
  checkedAt: number;
  quota: ReturnType<typeof quotaOf>;
};

const cache = new Map<string, { at: number; value: TierInfo }>();
const TTL = 30_000;

const dec = (fn: "balanceOf" | "totalSupply", raw: unknown): bigint | null => {
  if (typeof raw !== "string" || raw.length < 4) return null;
  try {
    return decodeFunctionResult({ abi: ERC20_ABI, functionName: fn, data: raw as `0x${string}` }) as bigint;
  } catch {
    return null;
  }
};

export async function readTier(wallet: string): Promise<TierInfo> {
  const token = holderToken();
  const w = wallet.toLowerCase();
  if (!token) return { launched: false, token: null, tier: "free", balance: "0", supply: "0", threshold: "0", share: "0 %", block: null, checkedAt: Date.now(), quota: quotaOf("free") };
  const hit = cache.get(w);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const r = await withNet("mainnet", () =>
    rpcBatch<unknown>([
      { method: "eth_call", params: [{ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [w as `0x${string}`] }) }, "latest"] },
      { method: "eth_call", params: [{ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "totalSupply" }) }, "latest"] },
      { method: "eth_blockNumber", params: [] },
    ]),
  );
  const balance = dec("balanceOf", r[0]);
  const supply = dec("totalSupply", r[1]);
  if (balance === null || supply === null) throw new Error("The token could not be read.");
  const tier = tierOf(balance, supply);
  const value: TierInfo = {
    launched: true,
    token,
    tier,
    balance: balance.toString(),
    supply: supply.toString(),
    threshold: thresholdOf(supply).toString(),
    share: shareText(balance, supply),
    block: typeof r[2] === "string" ? Number(BigInt(r[2])) : null,
    checkedAt: Date.now(),
    quota: quotaOf(tier),
  };
  if (cache.size > 2000) cache.clear();
  cache.set(w, { at: Date.now(), value });
  return value;
}

/** Verifies the session on this request against the fixed origin allowlist (never the Host header) and the sign-out list. */
export async function sessionOf(request: Request) {
  return verifySession(decodeCred(request.headers.get(SESSION_HEADER)), sessionOrigins(), Math.floor(Date.now() / 1000), isRevoked);
}
