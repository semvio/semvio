/*
 * The two networks Semvio works on. Chain ids, RPC hosts and explorers were checked from this machine on 25 Nov 2026:
 *   mainnet  eth_chainId 0x1237 (4663) from rpc.mainnet.chain.robinhood.com, explorer robinhoodchain.blockscout.com
 *   testnet  eth_chainId 0xb626 (46630) from rpc.testnet.chain.robinhood.com (block 157,665,219 at the time), explorer
 *            explorer.testnet.chain.robinhood.com (Blockscout, /api/v2/stats answered keyless).
 * The deal room is the same contract on both; each network has its own deployment (src/config/contracts.ts). The token,
 * the live prices and the proven stock-token list are mainnet facts.
 */

export type NetKey = "mainnet" | "testnet";

export type Network = {
  key: NetKey;
  id: number;
  hex: `0x${string}`;
  name: string;
  short: string;
  publicRpc: string;
  /** RPC the browser and wallet use (an operator can override it with a NEXT_PUBLIC_ variable). */
  rpc: string;
  /** Second public endpoint, used for reads only when the first one fails. */
  fallbackRpc: string | null;
  /** Third read endpoint for server code (some networks intercept the official host). */
  spareRpc: string | null;
  explorer: string;
  nativeSymbol: "ETH";
  decimals: 18;
  test: boolean;
  faucet: string | null;
};

const MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";
const TESTNET_RPC = "https://rpc.testnet.chain.robinhood.com";

export const NETWORKS: Record<NetKey, Network> = {
  mainnet: {
    key: "mainnet",
    id: 4663,
    hex: "0x1237",
    name: "Robinhood Chain",
    short: "Mainnet",
    publicRpc: MAINNET_RPC,
    rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || MAINNET_RPC,
    fallbackRpc: "https://robinhood-rpc.publicnode.com",
    spareRpc: "https://robinhood.drpc.org",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeSymbol: "ETH",
    decimals: 18,
    test: false,
    faucet: null,
  },
  testnet: {
    key: "testnet",
    id: 46630,
    hex: "0xb626",
    name: "Robinhood Chain Testnet",
    short: "Testnet",
    publicRpc: TESTNET_RPC,
    rpc: process.env.NEXT_PUBLIC_RH_TESTNET_RPC_URL || TESTNET_RPC,
    fallbackRpc: null,
    spareRpc: null,
    explorer: "https://explorer.testnet.chain.robinhood.com",
    nativeSymbol: "ETH",
    decimals: 18,
    test: true,
    faucet: "https://faucet.testnet.chain.robinhood.com",
  },
};

export const NET_KEYS: readonly NetKey[] = ["mainnet", "testnet"];
export const isNetKey = (v: unknown): v is NetKey => v === "mainnet" || v === "testnet";
export const netById = (id: number | null | undefined): Network | null => (id === 4663 ? NETWORKS.mainnet : id === 46630 ? NETWORKS.testnet : null);
export const netOf = (v: unknown): NetKey => (isNetKey(v) ? v : "mainnet");

/** Home network (the token, live prices, the proven asset list). */
export const CHAIN = NETWORKS.mainnet;

/** wallet_addEthereumChain parameters, used when the wallet does not know the chain yet (error 4902). */
export function addChainParams(n: Network = CHAIN) {
  return {
    chainId: n.hex,
    chainName: n.name,
    rpcUrls: [n.publicRpc],
    blockExplorerUrls: [n.explorer],
    nativeCurrency: { name: "Ether", symbol: n.nativeSymbol, decimals: n.decimals },
  };
}

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined) || "";

/** RPC for server code: a private endpoint when set, else the public one. */
export function serverRpc(net: NetKey = "mainnet") {
  if (net === "testnet") return env("RH_TESTNET_RPC_URL") || env("NEXT_PUBLIC_RH_TESTNET_RPC_URL") || TESTNET_RPC;
  return env("ROBINHOOD_RPC_URL") || env("NEXT_PUBLIC_ROBINHOOD_RPC_URL") || MAINNET_RPC;
}

export const explorerAddress = (address: string, net: NetKey = "mainnet") => `${NETWORKS[net].explorer}/address/${address}`;
export const explorerToken = (address: string, net: NetKey = "mainnet") => `${NETWORKS[net].explorer}/token/${address}`;
export const explorerTx = (hash: string, net: NetKey = "mainnet") => `${NETWORKS[net].explorer}/tx/${hash}`;
