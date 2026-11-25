"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/site/PageHead";

/*
 * The reference's features accordion: one item open at a time, a yellow rule that fills while it is current, the next item
 * opening by itself after a few seconds (paused while the pointer is over the list or after a click), and the picture on
 * the right cross-fading to match (MOTION.txt 4). The pictures are our own small interface drawings, not photos.
 */

type Item = { title: string; text: string; status: "Prototype" | "Concept"; scene: React.ReactNode };

const Row = ({ k, v, tone = "" }: { k: string; v: string; tone?: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-2 text-[12px]">
    <span className="text-[var(--muted)]">{k}</span>
    <span className={`num ${tone}`}>{v}</span>
  </div>
);

const ITEMS: Item[] = [
  {
    title: "Deal card",
    status: "Prototype",
    text: "Asset, amount, gross price, the agreed fee, what the seller receives and how long the offer stands, on one card that both sides read the same way.",
    scene: (
      <div className="p-5">
        <p className="text-[11px] text-[var(--faint)]">DEAL · 2 WETH / USDG</p>
        <p className="h-card mt-2 text-[22px]">2 WETH for 3,320.00</p>
        <div className="mt-4">
          <Row k="Gross" v="3,320.00 USDG" />
          <Row k="Fee 0.10 %" v="3.32 USDG" />
          <Row k="Seller net" v="3,316.68 USDG" tone="text-[var(--mint)]" />
          <Row k="Offer valid" v="until 18:00 UTC" />
        </div>
      </div>
    ),
  },
  {
    title: "Revision history",
    status: "Prototype",
    text: "Every change of the offer is a numbered revision: who proposed it, what changed, why, and a hash that links it to the one before.",
    scene: (
      <ol className="tl p-5 text-[12px]">
        {["r1 · asks 3,420.00", "r2 · bids 3,220.00", "r3 · asks 3,360.00", "r4 · accepts 3,320.00"].map((t, i) => (
          <li key={t} className={`tl-item ${i === 3 ? "cur" : ""}`}>
            <span className="tl-dot" />
            <span>
              {t}
              <br />
              <span className="hash">0x{["8c60ba", "41f2d0", "9e07a1", "c3b85e"][i]}…{["1bbe", "77a2", "05c9", "e410"][i]}</span>
            </span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    title: "Budget and net check",
    status: "Prototype",
    text: "Each offer is tested against the buyer's budget and the seller's minimum net after the fee, with the numbers on both lines. The room repeats the check in a free read.",
    scene: (
      <div className="grid gap-3 p-5 text-[12px]">
        <div className="verdict ok">Buyer pays 3,320.00 ≤ budget 3,330.00 → passes</div>
        <div className="verdict ok">Seller receives 3,316.68 ≥ minimum 3,310.00 → passes</div>
        <div className="verdict bad">r2 · seller would receive 3,216.78 &lt; 3,310.00 → refused</div>
      </div>
    ),
  },
  {
    title: "Two-sided approval",
    status: "Prototype",
    text: "Both wallets approve the same revision hash. A newer revision voids older approvals, and either side can withdraw before settlement.",
    scene: (
      <div className="grid gap-3 p-5">
        <span className="appr yes">
          <i className="d" /> Seller approved r4 · 0xc3b8…e410
        </span>
        <span className="appr yes">
          <i className="d" /> Buyer approved r4 · 0xc3b8…e410
        </span>
        <span className="appr">
          <i className="d" /> r3 approvals: void
        </span>
      </div>
    ),
  },
  {
    title: "Atomic settlement",
    status: "Prototype",
    text: "One transaction moves the asset to the buyer and the quote token to the seller and fee recipient, straight between wallets. If any leg falls short, nothing moves.",
    scene: (
      <div className="grid gap-2 p-5 text-[12px]">
        <Row k="Seller → Buyer" v="2 WETH" />
        <Row k="Buyer → Seller" v="3,316.68 USDG" />
        <Row k="Buyer → Fee recipient" v="3.32 USDG" />
        <Row k="Room balance after" v="0" tone="text-[var(--mint)]" />
      </div>
    ),
  },
  {
    title: "Priority matching with $SEMVIO",
    status: "Concept",
    text: "Planned: token holders could save deal templates and get matched first. Not built; the workspace never needs the token.",
    scene: (
      <div className="grid h-full place-items-center p-5 text-center text-[12px] text-[var(--muted)]">
        <span>
          <span className="badge concept">
            <i /> Concept
          </span>
          <br />
          <br />
          Planned, not built.
        </span>
      </div>
    ),
  },
];

const STEP_MS = 6000;

export function Features() {
  const [cur, setCur] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState === "visible") setCur((c) => (c + 1) % ITEMS.length);
    }, STEP_MS);
    return () => window.clearTimeout(t);
  }, [cur, held]);
  return (
    <div className="mt-12 grid gap-6 min-[900px]:grid-cols-2" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <div className="acc" style={{ "--acc-ms": `${STEP_MS}ms` } as React.CSSProperties}>
        {ITEMS.map((it, i) => (
          <button
            key={it.title}
            type="button"
            className="acc-item"
            aria-expanded={i === cur}
            onClick={() => {
              setCur(i);
              setHeld(true);
            }}
            data-testid={`acc-${i}`}
          >
            <span className="bar" aria-hidden="true" />
            <span className="flex items-center justify-between gap-3">
              <span className="h-card">{it.title}</span>
              <StatusBadge status={it.status} />
            </span>
            <span className="acc-body">
              <div>
                <p>{it.text}</p>
              </div>
            </span>
          </button>
        ))}
      </div>
      <div className={`scene prism ${cur % 2 ? "flip" : ""}`} aria-hidden="true">
        {ITEMS.map((it, i) => (
          <div key={it.title} className={`layer grid place-items-center ${i === cur ? "on" : ""}`}>
            <div className="window my-0 w-[86%] max-w-[380px]">{it.scene}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
