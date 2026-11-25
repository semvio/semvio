"use client";

import type { NetKey } from "@/config/networks";
import { useJson } from "@/lib/useJson";

export type ChainSnap = {
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

/** Live facts for one network from /api/chain, refreshed every 20 s while the tab is visible. */
export const useChain = (net: NetKey = "mainnet", every = 20_000) => useJson<ChainSnap>(`/api/chain?net=${net}`, every);

export const gweiText = (wei: string | null) => (wei === null ? "—" : `${(Number(wei) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 })} gwei`);
