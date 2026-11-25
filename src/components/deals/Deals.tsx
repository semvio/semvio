"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isAddress } from "@/config/brand";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { NETWORKS, explorerTx, type NetKey } from "@/config/networks";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { SampleBadge } from "@/components/site/PageHead";
import { feeOf, fromUnits } from "@/lib/deal/math";
import { chainIntact, current, termsOf, type PracticeDeal } from "@/lib/deal/practice";

/* Dashboard: a wallet's deals from the room (views), each one's settlement proof from the room's logs, and the practice deals
   kept in this browser. */

type Row = {
  id: number;
  seller: string;
  buyer: string;
  baseToken: { symbol: string | null; decimals: number | null };
  quoteToken: { symbol: string | null; decimals: number | null };
  baseAmount: string;
  revision: number;
  sellerApproved: number;
  buyerApproved: number;
  status: string;
  validUntil: number;
  terms: { quoteAmount: string; feeBps: number };
};
type Proof = { events: { name: string; tx: string; block: number }[]; chainIntact: boolean };

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function Deals() {
  const w = useWallet();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [net, setNet] = useState<NetKey>("mainnet");
  const [addrText, setAddr] = useState("");
  const who = isAddress(addrText) ? addrText : w.address ?? "";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [proofs, setProofs] = useState<Record<number, Proof | "loading" | "error">>({});
  const [practice] = useLocalStore<PracticeDeal[]>(storageKey("practice", "deals"), []);
  const live = roomLive(net);

  useEffect(() => {
    if (!who || !live) return;
    let dead = false;
    fetch(`/api/deals?net=${net}&addr=${who}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => null)) as { deals?: Row[]; total?: number; error?: string } | null;
        if (dead) return;
        if (!r.ok || !b?.deals) {
          setErr(b?.error ?? "Could not read deals.");
          setRows(null);
        } else {
          setErr(null);
          setRows(b.deals);
          setTotal(b.total ?? b.deals.length);
        }
      })
      .catch(() => !dead && setErr("Network error."));
    return () => {
      dead = true;
    };
  }, [who, net, live]);

  const loadProof = async (id: number) => {
    setProofs((p) => ({ ...p, [id]: "loading" }));
    const r = await fetch(`/api/deal?net=${net}&id=${id}`, { cache: "no-store" }).catch(() => null);
    const b = r && r.ok ? ((await r.json()) as Proof) : null;
    setProofs((p) => ({ ...p, [id]: b ?? "error" }));
  };

  return (
    <div className="wrap-wide grid gap-10 pb-10">
      <section className="panel-line p-5" data-testid="deals-chain">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h-card">On chain</h2>
          <div className="seg" role="group" aria-label="Network">
            {(["mainnet", "testnet"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={net === k} onClick={() => setNet(k)}>
                {NETWORKS[k].name}
              </button>
            ))}
          </div>
        </div>
        <label className="field mt-4 max-w-[520px]">
          <span>Wallet (the connected one, or paste any address)</span>
          <input className="inp" placeholder={mounted && w.address ? w.address : "0x…"} value={addrText} onChange={(e) => setAddr(e.target.value.trim())} data-testid="deals-addr" />
        </label>
        {!live ? (
          <p className="verdict mt-4">SemvioDealRoom is not deployed on {NETWORKS[net].name} yet, so there are no on-chain deals to show.</p>
        ) : !who ? (
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">Connect a wallet or paste an address to list its deals.</p>
        ) : err ? (
          <p className="verdict bad mt-4">{err}</p>
        ) : rows === null ? (
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">Reading the room…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">No deals for this wallet in the room at {CONTRACTS[net].room}.</p>
        ) : (
          <>
            <p className="mt-4 text-[12px] text-[var(--muted)]">
              {total} deal{total === 1 ? "" : "s"} · showing the latest {rows.length}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="tbl" data-testid="deals-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Role</th>
                    <th>Deal</th>
                    <th>Gross / net</th>
                    <th>Approvals</th>
                    <th>Status</th>
                    <th>Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const g = BigInt(r.terms.quoteAmount);
                    const qd = r.quoteToken.decimals ?? 18;
                    const p = proofs[r.id];
                    const settled = p && typeof p === "object" ? p.events.find((e) => e.name === "Settled") : null;
                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{same(r.seller, who) ? "seller" : "buyer"}</td>
                        <td>
                          {fromUnits(BigInt(r.baseAmount), r.baseToken.decimals ?? 18)} {r.baseToken.symbol ?? "?"} · r{r.revision}
                        </td>
                        <td>
                          {fromUnits(g, qd, 2)} / {fromUnits(g - feeOf(g, r.terms.feeBps), qd, 2)} {r.quoteToken.symbol ?? ""}
                        </td>
                        <td>
                          S {r.sellerApproved === r.revision ? "✓" : "–"} · B {r.buyerApproved === r.revision ? "✓" : "–"}
                        </td>
                        <td>{r.status}</td>
                        <td>
                          {p === undefined ? (
                            <button type="button" className="underline" onClick={() => loadProof(r.id)}>
                              read logs
                            </button>
                          ) : p === "loading" ? (
                            "…"
                          ) : p === "error" ? (
                            "unreadable"
                          ) : (
                            <span>
                              {p.chainIntact ? "chain intact" : "chain not verified"}
                              {settled ? (
                                <>
                                  {" · "}
                                  <a className="underline" href={explorerTx(settled.tx, net)} target="_blank" rel="noreferrer">
                                    settlement tx
                                  </a>
                                </>
                              ) : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel-line p-5" data-testid="deals-practice">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h-card">Practice deals in this browser</h2>
          <SampleBadge label="Sample counterparties" />
        </div>
        {mounted && practice.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Deal</th>
                  <th>Gross / net</th>
                  <th>Revisions</th>
                  <th>Status</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {practice.map((d) => {
                  const t = termsOf(current(d));
                  const net6 = t.quoteAmount - feeOf(t.quoteAmount, t.feeBps);
                  return (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>
                        {d.side} {fromUnits(BigInt(d.amount), d.asset.decimals)} {d.asset.symbol} · {d.desk.label}
                      </td>
                      <td>
                        {fromUnits(t.quoteAmount, 6, 2)} / {fromUnits(net6, 6, 2)} USDG
                      </td>
                      <td>{d.revisions.length}</td>
                      <td>{d.status}</td>
                      <td>{chainIntact(d) ? "chain intact" : "chain broken"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">None yet. Practice deals you open in the workspace are listed here (stored in this browser only).</p>
        )}
      </section>
    </div>
  );
}
