/*
 * How Semvio recognises Robinhood's stock tokens on Robinhood Chain mainnet (facts read on chain 23 Nov 2026, re-proven by the
 * site on every refresh of /api/assets). A token is offered only when ALL hold:
 *   - it is on the scanned candidate list (src/lib/fixtures/stock-tokens.json: emitters of BeaconUpgraded(STOCK_BEACON)),
 *   - keccak256 of its runtime code equals STOCK_PROXY_CODEHASH and its ERC-1967 beacon slot holds STOCK_BEACON,
 *   - its totalSupply() is above zero, and
 *   - Chainlink publishes a price feed for its ticker on Robinhood Chain (src/lib/fixtures/stock-feeds.json, from Chainlink's own
 *     feed directory) that answers right now.
 * A ticker alone proves nothing: dozens of tokens on the chain copy stock tickers.
 */
export const STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
export const STOCK_PROXY_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
export const BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
export { ETH_USD_FEED } from "@/config/dex";
export const FEED_DIRECTORY = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";
