"use client";

import { gweiText, useChain } from "@/components/site/useChain";
import { ago } from "@/lib/format";

/* Live facts from Robinhood Chain under the hero: block, gas, Chainlink ETH/USD with its age, deal room status. */
export function LiveStrip() {
  const { data, error } = useChain("mainnet");
  return (
    <div className="livebar" data-testid="live-strip" aria-live="polite">
      <span className="badge live">
        <i aria-hidden="true" />
        Live · Robinhood Chain
      </span>
      {data ? (
        <>
          <span>
            block <b className="num" data-testid="live-block">{data.block?.toLocaleString("en-US") ?? "—"}</b>
          </span>
          <span>
            gas <b>{gweiText(data.gasPriceWei)}</b>
          </span>
          <span>
            ETH/USD{" "}
            <b>{data.ethUsd ? data.ethUsd.price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not known"}</b>
            {data.ethUsd ? <> (Chainlink, {ago(data.ethUsd.updatedAt)})</> : null}
          </span>
          <span>
            deal room <b>{data.roomCode === null ? "not deployed yet" : data.roomCode ? "live" : "no code"}</b>
          </span>
        </>
      ) : (
        <span>{error ? "The chain could not be reached right now." : "Reading the chain…"}</span>
      )}
    </div>
  );
}
