/*
 * Robinhood Chain contracts Semvio reads. Each address was read on chain through the official RPC (dates on each line).
 * None of them is a Semvio contract.
 */

/** Wrapped ether on mainnet, 18 decimals (SwapRouter02 WETH9() returns it; read 24 Nov 2026). Native ETH is not supported: wrap first. */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
/** Global Dollar (USDG) on mainnet: name "Global Dollar", symbol "USDG", 6 decimals, ERC-1967 proxy. Many copies use the symbol; only this address is used. */
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
/** Wrapped ETH on Robinhood Chain Testnet: its ETH balance equalled totalSupply() (8,405.84 ETH) on 25 Nov 2026, so it is native-backed. */
export const TESTNET_WETH = "0x33e4191705c386532ba27cbf171db86919200b94";
/** Chainlink ETH / USD standard proxy on mainnet, 8 decimals (description() "ETH / USD"). */
export const ETH_USD_FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9";
/** Multicall3 (code present on both networks, 25 Nov 2026). */
export const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
