"use client";

import { useEffect, useMemo, useState } from "react";
import { storageKey } from "@/config/storage";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { SampleBadge, StatusBadge } from "@/components/site/PageHead";
import { DealCard, Timeline, type CardModel } from "@/components/workspace/DealCard";
import { SAMPLE_ETH_PRICE, USDG_ASSET, useAssets, type LiveAsset } from "@/components/workspace/assets";
import { explainCheck, type Side } from "@/lib/deal/agent";
import { deskBook, matchDesks, type Candidate } from "@/lib/deal/book";
import { BIT_WORDS, bitNames } from "@/lib/deal/bits";
import { feeOf, fromUnits, toUnits, ZERO_ADDR } from "@/lib/deal/math";
import { approve, buyer, cancel, chainIntact, counter, current, limitsOf, openPractice, practiceBits, seller, settle, termsOf, withdraw, YOU, type PracticeDeal, type Settlement } from "@/lib/deal/practice";

/*
 * Practice mode: the whole Semvio flow in the browser with SAMPLE counterparties. Nothing is signed or sent. The steps follow the
 * product's MVP: 1 request with a price limit and validity, 2 the agent proposes to a matching counterparty (each change a
 * revision), 3 budget and minimum-net checks, 4 both sides approve, then a simulated settlement.
 */

const BROKER = "0x5e0000000000000000000000000000000000fee0" as const;
const nowS = () => Math.floor(Date.now() / 1000);

function useNow() {
  const [now, setNow] = useState(nowS);
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowS()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function Practice() {
  const { list, loading } = useAssets();
  const [deals, setDeals] = useLocalStore<PracticeDeal[]>(storageKey("practice", "deals"), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const now = useNow();

  // request form
  const [side, setSide] = useState<Side>("buy");
  const [sym, setSym] = useState("WETH");
  const [amountText, setAmount] = useState("2");
  const [limitText, setLimit] = useState("");
  const [hours, setHours] = useState("24");
  const [feeText, setFee] = useState("0.10");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const asset: LiveAsset = list.find((a) => a.symbol === sym) ?? list[0];
  const refPrice = asset.price ?? (asset.symbol === "WETH" ? SAMPLE_ETH_PRICE : null);
  const refIsSample = asset.price === null;
  // Default limit: half a percent on your side of the reference price.
  const suggested = refPrice ? (side === "buy" ? refPrice * 1.005 : refPrice * 0.995) : null;
  const limitShown = limitText || (suggested ? suggested.toFixed(2) : "");

  const feeBps = Math.round(Number(feeText || "0") * 100);
  const parsed = useMemo(() => {
    const amount = toUnits(amountText, asset.decimals);
    const limit = toUnits(limitShown, USDG_ASSET.decimals);
    const h = Number(hours);
    if (!amount || amount === 0n) return { err: "Enter an amount above zero." };
    if (!limit || limit === 0n) return { err: "Enter your price limit per unit in USDG." };
    if (!Number.isFinite(h) || h < 1 || h > 720) return { err: "Validity must be between 1 and 720 hours (30 days)." };
    if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 100) return { err: "The agreed fee may be 0 to 1 %." };
    return { amount, limit, h };
  }, [amountText, limitShown, hours, feeBps, asset.decimals]);

  const deal = deals.find((d) => d.id === openId) ?? null;
  const save = (d: PracticeDeal) => setDeals((all) => [d, ...all.filter((x) => x.id !== d.id)].slice(0, 20));

  const find = () => {
    setFormErr(null);
    if ("err" in parsed) return setFormErr(parsed.err ?? null);
    if (!refPrice) return setFormErr("No reference price for this asset right now, so the sample desks cannot be priced. Pick WETH or try again shortly.");
    const ref = toUnits(refPrice.toFixed(6), 6)!;
    const unit = 10n ** BigInt(asset.decimals);
    const desks = deskBook(ref, unit, asset.symbol === "WETH" ? 1n : 10n);
    setCands(matchDesks({ side, amount: parsed.amount!, limitPerUnit: parsed.limit!, validHours: parsed.h!, feeBps, decimals: asset.decimals, quoteDecimals: 6, quoteSymbol: "USDG", desks }));
  };

  const open = (c: Candidate) => {
    if ("err" in parsed) return;
    const id = (deals.reduce((m, d) => Math.max(m, d.id), 0) || 0) + 1;
    const d = openPractice(id, { side, asset, quote: USDG_ASSET, amount: parsed.amount!, limitPerUnit: parsed.limit!, validHours: parsed.h!, feeBps, feeRecipient: feeBps > 0 ? BROKER : ZERO_ADDR }, c.desk, nowS());
    save(d);
    setOpenId(id);
    setCands(null);
    requestAnimationFrame(() => document.getElementById("practice-deal")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="grid gap-8 min-[1000px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className="grid content-start gap-6">
        <section className="panel-line p-5" data-testid="request-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="h-card">1 · Your request</h2>
            <StatusBadge status="Prototype" />
          </div>
          <div className="mt-5 grid gap-4">
            <div className="seg" role="group" aria-label="Side">
              {(["buy", "sell"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} data-testid={`side-${s}`}>
                  {s === "buy" ? "I want to buy" : "I want to sell"}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Asset (paid in USDG)</span>
              <select className="inp" value={asset.symbol} onChange={(e) => { setSym(e.target.value); setLimit(""); }} data-testid="asset">
                {list.map((a) => (
                  <option key={a.address} value={a.symbol}>
                    {a.symbol} · {a.name}
                  </option>
                ))}
              </select>
              <small className="text-[11px] text-[var(--faint)]">
                {loading && list.length < 2 ? "Reading the proven stock-token list…" : `${list.length - 1} stock tokens proven on chain with a Chainlink price`}
              </small>
            </label>
            <label className="field">
              <span>Amount ({asset.symbol})</span>
              <input className="inp" inputMode="decimal" value={amountText} onChange={(e) => setAmount(e.target.value)} data-testid="amount" />
            </label>
            <label className="field">
              <span>{side === "buy" ? "Highest price you pay per unit (USDG, gross)" : "Lowest price you accept per unit (USDG, after the fee)"}</span>
              <input className="inp" inputMode="decimal" value={limitShown} onChange={(e) => setLimit(e.target.value)} data-testid="limit" />
              <small className="text-[11px] text-[var(--faint)]">
                Reference {refPrice ? `${refPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD` : "not known"} ·{" "}
                {refIsSample ? "sample price, live feed not read" : asset.source}. Private: only your agent sees it.
              </small>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Valid for (hours)</span>
                <input className="inp" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label className="field">
                <span>Agreed fee (%)</span>
                <input className="inp" inputMode="decimal" value={feeText} onChange={(e) => setFee(e.target.value)} data-testid="fee" />
              </label>
            </div>
            {feeBps > 0 ? <p className="note">The fee (at most 1 %) is paid from the gross to a broker address named in the revision. Semvio takes nothing.</p> : null}
            {formErr ? <p className="verdict bad" role="alert">{formErr}</p> : null}
            <button type="button" className="btn btn-white btn-lg" onClick={find} data-testid="find">
              Find counterparties
            </button>
          </div>
        </section>

        {deals.length ? (
          <section className="panel-line p-5">
            <h2 className="h-card">Your practice deals</h2>
            <ul className="mt-3 grid gap-1 text-[12.5px]">
              {deals.map((d) => (
                <li key={d.id}>
                  <button type="button" className={`w-full rounded-md px-2 py-2 text-left hover:bg-[var(--panel)] ${d.id === openId ? "bg-[var(--panel)]" : ""}`} onClick={() => setOpenId(d.id)}>
                    #{d.id} · {d.side} {fromUnits(BigInt(d.amount), d.asset.decimals)} {d.asset.symbol} · <span className="text-[var(--muted)]">{d.status}, r{d.revisions.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost mt-3" onClick={() => { setDeals([]); setOpenId(null); }}>
              Clear practice deals
            </button>
          </section>
        ) : null}
      </aside>

      <div className="grid content-start gap-6">
        {cands ? (
          <section className="panel-line p-5" data-testid="candidates">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h-card">2 · Matching counterparties</h2>
              <SampleBadge label="Sample desks" />
            </div>
            <p className="mt-1 text-[12px] text-[var(--muted)]">These desks do not exist; their limits sit around the reference price so the numbers look like real ones.</p>
            <ul className="mt-4 grid gap-3">
              {cands.map((c) => (
                <li key={c.desk.id} className={`verdict ${c.ok ? "ok" : ""}`} data-testid={`cand-${c.desk.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="font-normal">{c.desk.label}</b>
                    {c.ok ? (
                      <button type="button" className="btn btn-white" onClick={() => open(c)} data-testid={`open-${c.desk.id}`}>
                        Let the agents negotiate
                      </button>
                    ) : (
                      <span className="badge bad">Does not fit</span>
                    )}
                  </div>
                  <ul className="mt-2 grid gap-1 text-[12px] text-[var(--ink-2)]">
                    {c.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {deal ? <PracticeDealView key={deal.id} deal={deal} now={now} save={save} refAsset={list.find((a) => a.symbol === deal.asset.symbol) ?? null} /> : cands ? null : <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="prism grid min-h-[420px] place-items-center" data-testid="practice-empty">
      <div className="window my-10 max-w-[420px] p-6 text-[13px]">
        <p className="h-card">No deal open yet</p>
        <p className="mt-2 text-[var(--ink-2)]">Write a request on the left and find counterparties. The agents negotiate inside both limits; every offer becomes a revision on the card.</p>
      </div>
    </section>
  );
}

function PracticeDealView({ deal, now, save, refAsset }: { deal: PracticeDeal; now: number; save: (d: PracticeDeal) => void; refAsset: LiveAsset | null }) {
  const r = current(deal);
  const t = termsOf(r);
  const fee = feeOf(t.quoteAmount, t.feeBps);
  const lim = limitsOf(deal, t.feeBps);
  const youSell = deal.side === "sell";
  const youApproved = youSell ? deal.sellerApproved === r.n : deal.buyerApproved === r.n;
  const bits = practiceBits(deal, now);
  const [counterText, setCounter] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<Settlement | null>(null);
  const q = (v: bigint) => `${fromUnits(v, 6, 2)} USDG`;
  const check = explainCheck(t.quoteAmount, t.feeBps, lim.maxGross, lim.minNet, 6, "USDG");

  const model: CardModel = {
    title: `Practice deal #${deal.id} · ${deal.asset.symbol} / USDG · with ${deal.desk.label}`,
    base: deal.asset,
    quote: deal.quote,
    amount: BigInt(deal.amount),
    gross: t.quoteAmount,
    fee,
    feeBps: t.feeBps,
    net: t.quoteAmount - fee,
    feeRecipient: t.feeBps ? t.feeRecipient : null,
    offerValidUntil: t.offerValidUntil,
    validUntil: deal.validUntil,
    status: deal.status === "open" ? "Open" : deal.status === "settled" ? "Settled" : "Cancelled",
    revision: r.n,
    hash: r.hash,
    seller: { label: seller(deal) === YOU ? "you" : "counterparty", approved: deal.sellerApproved === r.n },
    buyer: { label: buyer(deal) === YOU ? "you" : "counterparty", approved: deal.buyerApproved === r.n },
    reference: refAsset ? { price: refAsset.price ?? (refAsset.symbol === "WETH" ? SAMPLE_ETH_PRICE : null), source: refAsset.source, updatedAt: refAsset.updatedAt, sample: refAsset.price === null } : null,
    now,
  };

  const act = (next: PracticeDeal, text: string, ok = true) => {
    save(next);
    setMsg({ ok, text });
  };

  return (
    <div id="practice-deal" className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <SampleBadge label="Practice · sample counterparty" />
        <span className="text-[12px] text-[var(--muted)]">Practice hashes use chain id 0 and no room address, so they never match a real deal.</span>
      </div>
      <DealCard m={model}>
        {deal.agentSummary ? <p className="note mt-5" data-testid="agent-summary">Agents: {deal.agentSummary}</p> : null}
      </DealCard>

      <section className="panel-line p-5" data-testid="checks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="h-card">3 · Checks on revision {r.n}</h3>
          <span className={`badge ${check.ok ? "proto" : "bad"}`}>
            <i aria-hidden="true" />
            {check.ok ? "Inside both limits" : "Outside a limit"}
          </span>
        </div>
        <ul className="mt-4 grid gap-2 text-[12.5px]">
          {check.lines.map((l) => (
            <li key={l} className={`verdict ${/passes$/.test(l) ? "ok" : "bad"}`}>
              {l}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] text-[var(--faint)]">
          Your limit is yours; the counterparty&apos;s is sample data shown here only because this is practice. On chain, each side checks its own limit in a free read.
        </p>
      </section>

      <section className="panel-line p-5" data-testid="actions">
        <h3 className="h-card">4 · Approve, counter or settle</h3>
        {bits ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {bitNames(bits).map((n) => (
              <li key={n} className="badge" title={BIT_WORDS[n].why}>
                {BIT_WORDS[n].label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-[var(--mint)]">Both sides approved revision {r.n}: ready to settle.</p>
        )}
        {deal.status === "open" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {youApproved ? (
              <button type="button" className="btn btn-dark" onClick={() => act(withdraw(deal, nowS()), "You withdrew your approval.")} data-testid="withdraw">
                Withdraw my approval
              </button>
            ) : (
              <button type="button" className="btn btn-white" onClick={() => act(approve(deal, youSell, "You", nowS()), `You approved revision ${r.n}.`)} data-testid="approve">
                Approve revision {r.n}
              </button>
            )}
            <button
              type="button"
              className="btn btn-white"
              onClick={() => {
                const s = settle(deal, nowS());
                if (s.result) {
                  setDone(s.result);
                  act(s.deal, "Settled in one simulated swap.");
                } else setMsg({ ok: false, text: `Not yet: ${bitNames(s.bits).map((n) => BIT_WORDS[n].label).join(", ")}.` });
              }}
              data-testid="settle"
            >
              Settle (simulated)
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => act(cancel(deal, nowS()), "Deal cancelled.")}>
              Cancel deal
            </button>
          </div>
        ) : null}
        {deal.status === "open" ? (
          <div className="mt-5 grid gap-2 min-[560px]:grid-cols-[minmax(0,1fr)_auto]">
            <label className="field">
              <span>Counter with a new gross price (USDG)</span>
              <input className="inp" inputMode="decimal" placeholder={fromUnits(t.quoteAmount, 6, 2).replace(/,/g, "")} value={counterText} onChange={(e) => setCounter(e.target.value)} data-testid="counter-input" />
            </label>
            <button
              type="button"
              className="btn btn-dark self-end"
              data-testid="counter"
              onClick={() => {
                const g = toUnits(counterText, 6);
                if (!g) return setMsg({ ok: false, text: "Enter a gross price in USDG." });
                const c = counter(deal, g, t.feeBps, t.feeRecipient, 6, `Counter by you: ${q(g)}`, nowS());
                if (c.refused) return setMsg({ ok: false, text: `Refused before it was recorded: ${bitNames(c.refused).map((n) => BIT_WORDS[n].label).join(", ")}.` });
                setCounter("");
                act(c.deal, "Your counter is revision " + c.deal.revisions.length + ". Both approvals now point at older revisions.");
              }}
            >
              Propose revision
            </button>
          </div>
        ) : null}
        {msg ? (
          <p className={`verdict mt-4 ${msg.ok ? "ok" : "bad"}`} role="status" data-testid="practice-msg">
            {msg.text}
          </p>
        ) : null}
        {done ? (
          <div className="verdict ok mt-4 text-[12.5px]" data-testid="settled">
            <p>Simulated settlement of revision {r.n} (one transaction on chain):</p>
            <ul className="mt-2 grid gap-1">
              <li>Seller → buyer: {fromUnits(BigInt(deal.amount), deal.asset.decimals)} {deal.asset.symbol}</li>
              <li>Buyer → seller: {q(done.net)}</li>
              {done.fee ? <li>Buyer → fee recipient: {q(done.fee)}</li> : null}
              <li>Left in the room: 0</li>
            </ul>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(deal, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `semvio-practice-deal-${deal.id}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export deal (JSON)
          </button>
        </div>
      </section>

      <Timeline
        intact={chainIntact(deal)}
        label="Each revision's hash covers the one before it, so an edited history no longer re-hashes."
        items={deal.revisions.map((x) => ({ n: x.n, by: x.by, changes: x.changes, why: x.note, hash: x.hash, current: x.n === r.n, link: null }))}
      />

      <section className="panel-line p-5">
        <h3 className="h-card">Activity</h3>
        <ol className="mt-3 grid gap-1 text-[12px] text-[var(--ink-2)]">
          {[...deal.events].reverse().map((e, i) => (
            <li key={i}>
              <span className="text-[var(--faint)]">{new Date(e.at * 1000).toISOString().slice(11, 19)} · </span>
              {e.text}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
