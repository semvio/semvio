"use client";

import { USDG, WETH } from "@/config/dex";
import { useJson } from "@/lib/useJson";
import type { Asset } from "@/lib/deal/practice";

export type LiveAsset = Asset & { price: number | null; updatedAt: number | null; source: string; feed: string | null; stale: boolean | null };
type Api = {
  stocks: { address: string; symbol: string; name: string; decimals: number; price: number; updatedAt: number; feed: string; feedName: string; stale: boolean | null }[];
  eth: { price: number; updatedAt: number } | null;
  readAt: number;
  complete: boolean;
};

export const USDG_ASSET: Asset = { symbol: "USDG", name: "Global Dollar", address: USDG as `0x${string}`, decimals: 6 };
const WETH_BASE: Asset = { symbol: "WETH", name: "Wrapped Ether", address: WETH as `0x${string}`, decimals: 18 };
/** Used only when the live price cannot be read; the page labels it. */
export const SAMPLE_ETH_PRICE = 1650;

/** Assets for the workspace with live reference prices (Chainlink on Robinhood Chain). */
export function useAssets() {
  const { data, error, loading } = useJson<Api>("/api/assets", 120_000);
  const list: LiveAsset[] = [
    { ...WETH_BASE, price: data?.eth?.price ?? null, updatedAt: data?.eth?.updatedAt ?? null, source: "Chainlink ETH / USD", feed: "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9", stale: null },
    ...(data?.stocks ?? []).map((s) => ({ symbol: s.symbol, name: s.name, address: s.address as `0x${string}`, decimals: s.decimals, price: s.price, updatedAt: s.updatedAt, source: s.feedName, feed: s.feed, stale: s.stale })),
  ];
  return { list, error, loading, readAt: data?.readAt ?? null };
}
