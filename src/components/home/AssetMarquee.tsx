import FEEDS from "@/lib/fixtures/stock-feeds.json";

/*
 * The reference's integration tiles, as a slow marquee. Ours are the assets the workspace offers on Robinhood Chain: WETH,
 * USDG and the Robinhood stock tokens that Chainlink prices there. Tickers only (no company logos); every one is re-proven on
 * chain before the workspace lists it.
 */
const STOCKS = [...new Set((FEEDS.feeds as { symbol: string; name: string }[]).map((f) => f.symbol))].sort();

export function AssetMarquee() {
  const tiles = [
    { s: "WETH", n: "Wrapped Ether" },
    { s: "USDG", n: "Global Dollar" },
    ...STOCKS.map((s) => ({ s, n: "stock token · Chainlink feed" })),
  ];
  const row = (hidden: boolean) =>
    tiles.map((t) => (
      <div className="tile" key={`${hidden ? "b" : "a"}-${t.s}`} aria-hidden={hidden || undefined}>
        <span>
          <b>{t.s}</b>
          <small>{t.n}</small>
        </span>
      </div>
    ));
  return (
    <div className="marquee mt-10" data-testid="asset-marquee">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

export const STOCK_COUNT = STOCKS.length;
