"use client";

import { useJson } from "@/lib/useJson";
import { fromUnits } from "@/lib/deal/math";

/* The live holder threshold: 0.1 % of totalSupply read from the token contract, with block and time; "Unlocks at launch" before. */
export function Threshold() {
  const { data, error } = useJson<{ launched: boolean; supply?: string; threshold?: string; block?: number; checkedAt?: number }>("/api/holder/threshold", 60_000);
  if (error) return <span className="text-[var(--muted)]">Not known right now ({error})</span>;
  if (!data) return <span className="text-[var(--muted)]">Reading…</span>;
  if (!data.launched) return <span data-testid="threshold">Unlocks at launch</span>;
  return (
    <span data-testid="threshold">
      {fromUnits(BigInt(data.threshold ?? "0"), 18, 2)} of {fromUnits(BigInt(data.supply ?? "0"), 18, 0)} supply · block {data.block?.toLocaleString("en-US")} ·{" "}
      {data.checkedAt ? new Date(data.checkedAt).toISOString().slice(11, 19) : ""} UTC
    </span>
  );
}
