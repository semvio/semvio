"use client";

import { useState, useSyncExternalStore } from "react";
import { storageKey } from "@/config/storage";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { Practice } from "@/components/workspace/Practice";
import { OnChain } from "@/components/workspace/OnChain";

/* Two modes, one workspace: practice (no wallet, sample counterparties) and on chain (SemvioDealRoom on mainnet or testnet). */
export function Workspace() {
  const [stored, setMode] = useLocalStore<"practice" | "chain">(storageKey("ws", "mode"), "practice");
  // ?mode=chain (links from the board) opens on-chain mode.
  const linked = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("mode"),
    () => null,
  );
  const [clicked, setClicked] = useState(false);
  const mode = !clicked && linked === "chain" ? "chain" : stored;
  // Rendered after hydration only: both modes read the browser (saved deals, the wallet).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <div className="wrap-wide pb-10">
      <div className="seg" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === "practice"} onClick={() => { setClicked(true); setMode("practice"); }} data-testid="mode-practice">
          Practice · no wallet
        </button>
        <button type="button" aria-pressed={mode === "chain"} onClick={() => { setClicked(true); setMode("chain"); }} data-testid="mode-chain">
          On chain
        </button>
      </div>
      <div className="mt-8">{mounted ? mode === "chain" ? <OnChain /> : <Practice /> : <p className="text-[12px] text-[var(--muted)]">Loading the workspace…</p>}</div>
    </div>
  );
}
