"use client";

import { useSyncExternalStore } from "react";
import { storageKey } from "@/config/storage";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { Practice } from "@/components/workspace/Practice";
import { OnChain } from "@/components/workspace/OnChain";

/* Two modes, one workspace: practice (no wallet, sample counterparties) and on chain (SemvioDealRoom on mainnet or testnet). */
export function Workspace() {
  const [mode, setMode] = useLocalStore<"practice" | "chain">(storageKey("ws", "mode"), "practice");
  // Rendered after hydration only: both modes read the browser (saved deals, the wallet).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <div className="wrap-wide pb-10">
      <div className="seg" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === "practice"} onClick={() => setMode("practice")} data-testid="mode-practice">
          Practice · no wallet
        </button>
        <button type="button" aria-pressed={mode === "chain"} onClick={() => setMode("chain")} data-testid="mode-chain">
          On chain
        </button>
      </div>
      <div className="mt-8">{mounted ? mode === "chain" ? <OnChain /> : <Practice /> : <p className="text-[12px] text-[var(--muted)]">Loading the workspace…</p>}</div>
    </div>
  );
}
