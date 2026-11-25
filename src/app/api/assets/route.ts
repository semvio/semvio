import { allowPublic, tooMany } from "@/lib/guard";
import { fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";
import { readBoard } from "@/lib/server/stocks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/assets → the assets Semvio offers on Robinhood Chain mainnet, with live reference prices: WETH (Chainlink ETH/USD)
 * and Robinhood stock tokens proven on chain that have a Chainlink feed. The board is refreshed by one request at a time and
 * a failed refresh never replaces a good board (src/lib/server/stocks.ts).
 */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "assets", 30, 600))) return tooMany();
  try {
    const b = await readBoard();
    const stocks = b.stocks
      .map((s) => {
        const f = s.feeds.find((x) => x.answer !== null);
        return f ? { address: s.address, symbol: s.symbol, name: s.name, decimals: s.decimals, price: Number(f.answer) / 10 ** f.decimals, updatedAt: f.updatedAt, feed: f.proxy, feedName: f.name, stale: f.stale } : null;
      })
      .filter((x) => x !== null);
    const eth = b.ethUsd.answer ? { price: Number(b.ethUsd.answer) / 1e8, updatedAt: b.ethUsd.updatedAt } : null;
    return ok({ stocks, eth, head: b.head, readAt: b.readAt, candidates: b.candidates, unknown: b.unknown, complete: b.complete }, 30);
  } catch (e) {
    return fail(e);
  }
}
