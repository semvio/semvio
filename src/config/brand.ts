// Single place to change project identity. Everything on the site reads from here.
// To publish the real contract address, replace the value of CA below. The header pill, the footer, the token page
// and every explorer link derive from it. Anything that is not a 0x + 40 hex address is treated as "not launched yet".

/** Contract address of $SEMVIO on Robinhood Chain. "TBA" until the token exists. */
const CA: string = "TBA";

/**
 * True once the domain points at this deployment. While false, the production *.vercel.app host is served as is (kept
 * out of search with noindex) instead of redirecting to a domain that does not serve the site.
 * DNS 25 Nov 2026 (DoH): semvio.xyz is on Cloudflare nameservers but has no A record yet.
 */
export const DOMAIN_LIVE = true;

export const isAddress = (v: string): v is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(v);

const NAME = "Semvio";
const SLUG = "semvio";
/** Shown upper case everywhere. The only place the ticker is written. */
const TICKER = "SEMVIO";
const DOMAIN = "semvio.xyz";
/** X account of the project (the owner's handle, exactly as written in the order). */
const X_HANDLE = "semvio";

export const BRAND = {
  name: NAME,
  short: NAME,
  slug: SLUG,
  ticker: TICKER,
  symbol: `$${TICKER}`,
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  /** Token name: the owner wrote "semvio"; shown capitalised. */
  tokenName: "Semvio",
  slogan: "Agent-assisted OTC deals with clear fees, price limits & wallet approval.",
  tagline: "One deal card, every revision on record, both wallets approving the same version before one atomic swap on Robinhood Chain.",
  category: "OTC deal workspace",
  chainName: "Robinhood Chain",
  description: `${NAME} is a calm workspace for over-the-counter deals on Robinhood Chain. A deal card shows the asset, amount, agreed fee, the seller's net and how long the offer stands; every change of the offer is a revision on record, chained by hash. An agent can propose revisions inside your price limit but never signs. Both sides approve one exact revision, and only that revision settles, as one non-custodial swap.`,
  x: `https://x.com/${X_HANDLE}`,
  xHandle: `@${X_HANDLE}`,
  // No public repository yet: the link stays hidden until this is a full repository URL.
  github: "https://github.com",
  ca: CA,
} as const;

/** True once BRAND.github points at an actual repository, not the bare host. */
export const hasGithub = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(BRAND.github);

export const TOKEN = {
  get isLive() {
    return isAddress(BRAND.ca);
  },
};

export function shortAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Chart links: DEXTools only. Robinhood Chain is listed there under the chain slug "robinhood".
 */
export const DEXTOOLS_CHAIN = "robinhood";
export function chartUrl(address: string): string | null {
  return isAddress(address) ? `https://www.dextools.io/app/en/${DEXTOOLS_CHAIN}/pair-explorer/${address.toLowerCase()}` : null;
}

/**
 * Where $SEMVIO is planned to launch: TBA in public copy. Internal note: Pons on Robinhood Chain is the likely launchpad, as for
 * the owner's other launches. Before the CA is real, the buy button opens the launchpad home and says "At launch".
 * Semvio itself never needs the token.
 */
export const LAUNCHPAD = {
  name: "Pons",
  home: "https://ponsfamily.com/launchpad",
  tokenUrl: (address: string) => `https://ponsfamily.com/launchpad/${address.toLowerCase()}`,
} as const;

export function buyUrl(): string {
  return isAddress(BRAND.ca) ? LAUNCHPAD.tokenUrl(BRAND.ca) : LAUNCHPAD.home;
}

export function tokenExplorerUrl(): string | null {
  return isAddress(BRAND.ca) ? `https://robinhoodchain.blockscout.com/token/${BRAND.ca}` : null;
}

// Network details live in src/config/networks.ts (mainnet + testnet). CHAIN is the home network the token lives on.
export { CHAIN, addChainParams, serverRpc, explorerAddress, explorerTx, explorerToken } from "@/config/networks";

/**
 * Origins a holder session (SIWE) may name. Fixed here, never taken from request headers: the brand domain and www, plus the local
 * QA ports (site 6740, end-to-end build 6741) only when the server is not running on Vercel.
 */
export function sessionOrigins(): { domain: string; uri: string }[] {
  const list = [
    { domain: DOMAIN, uri: `https://${DOMAIN}` },
    { domain: `www.${DOMAIN}`, uri: `https://www.${DOMAIN}` },
  ];
  if (!process.env.VERCEL) for (const h of ["localhost", "127.0.0.1"]) for (const p of [6740, 6741]) list.push({ domain: `${h}:${p}`, uri: `http://${h}:${p}` });
  return list;
}
