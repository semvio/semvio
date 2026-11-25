import { BRAND, isAddress } from "@/config/brand";
import type { NetKey } from "@/config/networks";

/*
 * Semvio's own contracts, one deployment per network. Mainnet: SemvioDealRoom deployed by the owner on 25 Nov 2026 (below).
 * Testnet: not deployed (the testnet mode says so). Check a deployment yourself:
 *   npm run verify-deployment -- --room <address> --room-tx <tx> [--testnet]   (prints MATCH)
 *   room       SemvioDealRoom (+ internal library SemvioFeeMath, inlined): deals, chained revisions, two-sided approval of one
 *              revision, atomic transferFrom settlement. No admin, no fee, no upgrade, never holds a balance.
 *   testToken  SemvioPracticeToken "Semvio Test Dollar" (tUSD, 6 decimals), testnet only, anyone may mint (no value).
 */
export type Deployment = { room: string; block: number; tx: string; testToken: string; token?: string };

const DEPLOYED: Record<NetKey, Deployment> = {
  // Deployed by the owner on 25 Nov 2026 (receipt status 1, 2,672,435 gas); verify-deployment MATCH.
  mainnet: { room: "0xf69e694c36535b7509c35f9a64ae63620a760e4f", block: 122888664, tx: "0x27a0ffedae7e135407bf4a825177f0f83ca2467005893e9c057c045ae6c31f94", testToken: "" },
  testnet: { room: "", block: 0, tx: "", testToken: "" },
};

/**
 * Local tests only: NEXT_PUBLIC_SEMVIO_TEST_CONTRACTS='{"room":"0x…","block":1}' at build time points mainnet at a contract on an
 * anvil chain (chain id 4663). Never set it on Vercel.
 */
function withOverride(): Record<NetKey, Deployment> {
  const raw = process.env.NEXT_PUBLIC_SEMVIO_TEST_CONTRACTS;
  if (!raw) return DEPLOYED;
  try {
    const v = { ...DEPLOYED.mainnet, ...(JSON.parse(raw) as Partial<Deployment>) };
    return isAddress(v.room) ? { ...DEPLOYED, mainnet: v } : DEPLOYED;
  } catch {
    return DEPLOYED;
  }
}

export const CONTRACTS = withOverride();
export const roomOf = (net: NetKey) => CONTRACTS[net].room;
export const roomLive = (net: NetKey) => isAddress(CONTRACTS[net].room);
export const CONTRACT_NAME = "SemvioDealRoom" as const;

/**
 * The token the holder tier reads: $SEMVIO (BRAND.ca) once it is live. The local test override may name a test ERC-20 on anvil
 * (`"token"` in NEXT_PUBLIC_SEMVIO_TEST_CONTRACTS) so the end-to-end run can prove both tiers before launch. Null = not launched.
 */
export function holderToken(): `0x${string}` | null {
  const t = CONTRACTS.mainnet.token;
  if (t && isAddress(t)) return t;
  return isAddress(BRAND.ca) ? BRAND.ca : null;
}
