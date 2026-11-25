/*
 * The product view inside the hero's light-streak frame (the reference puts an app window there). An illustration of a deal
 * card, labelled as one: its rows come in one after another on a loop (MOTION.txt 2), and it is fully visible without motion.
 */
const ROWS = [
  { r: "r1", who: "Their agent", text: "asks 8,520.00 USDG", tone: "" },
  { r: "r2", who: "Your agent", text: "bids 8,080.00 USDG", tone: "" },
  { r: "r3", who: "Their agent", text: "asks 8,410.00 USDG", tone: "" },
  { r: "r4", who: "Your agent", text: "accepts 8,300.00 USDG", tone: "cur" },
];

export function DealMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="window p-4 text-[12px] min-[640px]:p-6" aria-label="Illustration of a deal card" role="img">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[var(--ink-2)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--yellow)]" />
          Deal #12 · WETH / USDG
        </span>
        <span className="badge sample">Illustration</span>
      </div>
      <div className={`mt-4 grid gap-4 ${compact ? "" : "min-[640px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}`}>
        <div className="rounded-md bg-[var(--panel)] p-4">
          <p className="h-card text-[20px]">5 WETH for 8,300 USDG</p>
          <dl className="kv mt-4 text-[12px]">
            <dt>Gross (buyer pays)</dt>
            <dd>8,300.00</dd>
            <dt>Agreed fee 0.25 %</dt>
            <dd>20.75</dd>
            <dt>Seller receives</dt>
            <dd className="text-[var(--mint)]">8,279.25</dd>
            <dt>Offer valid</dt>
            <dd>5 h 42 m</dd>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <span className="appr yes mock-row" style={{ "--i": 5 } as React.CSSProperties}>
              <i className="d" /> Seller
            </span>
            <span className="appr yes mock-row" style={{ "--i": 6 } as React.CSSProperties}>
              <i className="d" /> Buyer
            </span>
          </div>
        </div>
        {compact ? null : (
          <ol className="tl self-start">
            {ROWS.map((row, i) => (
              <li key={row.r} className={`tl-item mock-row ${row.tone}`} style={{ "--i": i + 1 } as React.CSSProperties}>
                <span className="tl-dot" />
                <span>
                  <span className="text-[var(--faint)]">{row.r} · {row.who}</span>
                  <br />
                  <span className={row.tone ? "text-white" : "text-[var(--ink-2)]"}>{row.text}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
