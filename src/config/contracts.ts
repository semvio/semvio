import { isAddress } from "@/config/brand";
import type { NetKey } from "@/config/networks";

/*
 * Semvio's own contracts, one deployment per network. Nothing is deployed yet: the owner deploys from /deploy (localhost only)
 * and pastes the address, block and creation tx here. Check a deployment yourself:
 *   npm run verify-deployment -- --room <address> --room-tx <tx> [--testnet]   (prints MATCH)
 *   room       SemvioDealRoom (+ internal library SemvioFeeMath, inlined): deals, chained revisions, two-sided approval of one
 *              revision, atomic transferFrom settlement. No admin, no fee, no upgrade, never holds a balance.
 *   testToken  SemvioPracticeToken "Semvio Test Dollar" (tUSD, 6 decimals), testnet only, anyone may mint (no value).
 */
export type Deployment = { room: string; block: number; tx: string; testToken: string };

const DEPLOYED: Record<NetKey, Deployment> = {
  mainnet: { room: "", block: 0, tx: "", testToken: "" },
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
