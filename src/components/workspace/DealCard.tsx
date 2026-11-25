"use client";

import { fromUnits } from "@/lib/deal/math";
import { ago } from "@/lib/format";

export type CardModel = {
  title: string;
  base: { symbol: string; decimals: number };
  quote: { symbol: string; decimals: number };
  amount: bigint;
  gross: bigint;
  fee: bigint;
  feeBps: number;
  net: bigint;
  feeRecipient: string | null;
  offerValidUntil: number;
  validUntil: number;
  status: string;
  revision: number;
  hash: string;
  seller: { label: string; approved: boolean };
  buyer: { label: string; approved: boolean };
  reference?: { price: number | null; source: string; updatedAt: number | null; sample: boolean } | null;
  now: number;
};

const left = (until: number, now: number) => {
  const s = until - now;
  if (s <= 0) return "expired";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 47 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} m`;
};

/** The core object: one card with everything both sides need to read before approving. */
export function DealCard({ m, children }: { m: CardModel; children?: React.ReactNode }) {
  const q = (v: bigint) => `${fromUnits(v, m.quote.decimals, 2)} ${m.quote.symbol}`;
  const unit = m.amount > 0n ? (m.gross * 10n ** BigInt(m.base.decimals)) / m.amount : 0n;
  const refDiff = m.reference?.price ? (Number(unit) / 10 ** m.quote.decimals / m.reference.price - 1) * 100 : null;
  return (
    <article className="dealcard" data-testid="deal-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--muted)]">{m.title}</span>
        <span className={`badge ${m.status === "Settled" ? "proto" : m.status === "Open" ? "live" : "bad"}`} data-testid="deal-status">
          <i aria-hidden="true" />
          {m.status}
        </span>
      </div>
      <p className="h-sub mt-3 text-[26px]" data-testid="deal-headline">
        {fromUnits(m.amount, m.base.decimals)} {m.base.symbol} for {q(m.gross)}
      </p>
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        {q(unit)} per {m.base.symbol} · revision {m.revision}
      </p>
      <dl className="kv mt-5">
        <dt>Buyer pays (gross)</dt>
        <dd data-testid="deal-gross">{q(m.gross)}</dd>
        <dt>Agreed fee {m.feeBps / 100} %</dt>
        <dd>{q(m.fee)}</dd>
        <dt>Seller receives (net)</dt>
        <dd className="text-[var(--mint)]" data-testid="deal-net">
          {q(m.net)}
        </dd>
        {m.feeRecipient ? (
          <>
            <dt>Fee goes to</dt>
            <dd className="text-[12px]">{m.feeRecipient}</dd>
          </>
        ) : null}
        <dt>Offer stands</dt>
        <dd>{left(m.offerValidUntil, m.now)}</dd>
        <dt>Deal window</dt>
        <dd>{left(m.validUntil, m.now)}</dd>
        {m.reference ? (
          <>
            <dt>Reference price</dt>
            <dd>
              {m.reference.price ? `${m.reference.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD` : "Not known"}
              {refDiff !== null ? <span className="text-[var(--muted)]"> ({refDiff >= 0 ? "+" : ""}{refDiff.toFixed(2)} %)</span> : null}
              <br />
              <span className="text-[11px] text-[var(--faint)]">
                {m.reference.sample ? "Sample price (live feed unavailable)" : `${m.reference.source}${m.reference.updatedAt ? `, ${ago(m.reference.updatedAt)}` : ""}`}
              </span>
            </dd>
          </>
        ) : null}
      </dl>
      <div className="mt-5 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
        <span className={`appr ${m.seller.approved ? "yes" : ""}`} data-testid="appr-seller">
          <i className="d" />
          <span className="min-w-0 truncate">
            Seller · {m.seller.label} · {m.seller.approved ? `approved r${m.revision}` : "not approved"}
          </span>
        </span>
        <span className={`appr ${m.buyer.approved ? "yes" : ""}`} data-testid="appr-buyer">
          <i className="d" />
          <span className="min-w-0 truncate">
            Buyer · {m.buyer.label} · {m.buyer.approved ? `approved r${m.revision}` : "not approved"}
          </span>
        </span>
      </div>
      <p className="hash mt-4">current revision hash {m.hash}</p>
      {children}
    </article>
  );
}

export type TimelineItem = { n: number; by: string; changes: string[]; why?: string; hash: string; ok?: boolean; link?: string | null; current: boolean };

export function Timeline({ items, intact, label }: { items: TimelineItem[]; intact: boolean | null; label: string }) {
  return (
    <section className="panel-line p-5" data-testid="timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-card">Revision history</h3>
        {intact === null ? null : (
          <span className={`badge ${intact ? "proto" : "bad"}`} data-testid="chain-intact">
            <i aria-hidden="true" />
            {intact ? "Hash chain intact" : "Hash chain broken"}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--faint)]">{label}</p>
      <ol className="tl mt-5">
        {items.map((r, i) => (
          <li key={r.n} className={`tl-item fresh ${r.current ? "cur" : ""}`} style={{ "--i": i } as React.CSSProperties} data-testid={`rev-${r.n}`}>
            <span className="tl-dot" />
            <div className="min-w-0 text-[12.5px]">
              <p>
                <span className="text-[var(--faint)]">r{r.n} · </span>
                {r.by}
                {r.current ? <span className="text-[var(--yellow)]"> · current</span> : null}
              </p>
              <p className="text-[var(--ink-2)]">{r.changes.join(" · ")}</p>
              {r.why ? <p className="text-[var(--muted)]">{r.why}</p> : null}
              <p className="hash">
                {r.hash}
                {r.ok === false ? <span className="text-[var(--red)]"> · does not re-hash</span> : null}
                {r.link ? (
                  <>
                    {" · "}
                    <a href={r.link} target="_blank" rel="noreferrer" className="underline">
                      tx
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
