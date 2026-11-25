"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useHolder } from "@/components/holder/useHolder";
import { HolderPanel } from "@/components/holder/HolderPanel";
import { useAssets } from "@/components/workspace/assets";
import { StatusBadge } from "@/components/site/PageHead";
import { fromUnits, toUnits } from "@/lib/deal/math";
import type { BoardRequest, Match, Team, Template } from "@/lib/holder/board";

/*
 * The matching board (open to everyone with a signed session), holder templates and the holder team workspace. Everything is
 * enforced by the server routes; this page only shows what they answer.
 */

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const price = (r: { price: string }) => `${fromUnits(BigInt(r.price), 6, 2)} USDG`;
const amt = (r: { amount: string; asset: { decimals: number; symbol: string } }) => `${fromUnits(BigInt(r.amount), r.asset.decimals)} ${r.asset.symbol}`;

function workspaceLink(r: { wallet?: string; side: "buy" | "sell"; asset: { address: string }; amount: string; price: string; decimals?: number }, myAmount?: string) {
  const amount = myAmount ?? r.amount;
  const p = new URLSearchParams({ mode: "chain", side: r.side === "buy" ? "sell" : "buy", base: r.asset.address, amountRaw: amount, priceRaw: r.price });
  if (r.wallet) p.set("cp", r.wallet);
  return `/workspace?${p.toString()}`;
}

export function Board() {
  const h = useHolder();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { list } = useAssets();
  const [rows, setRows] = useState<BoardRequest[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [tick, setTick] = useState(0);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [sym, setSym] = useState("WETH");
  const [amountText, setAmount] = useState("1");
  const [priceText, setPrice] = useState("");
  const [hours, setHours] = useState("24");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [matches, setMatches] = useState<{ id: string; list: Match[] } | null>(null);
  const asset = list.find((a) => a.symbol === sym) ?? list[0];

  useEffect(() => {
    let dead = false;
    fetch("/api/board", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { requests?: BoardRequest[]; persistent?: boolean }) => {
        if (dead) return;
        setRows(b.requests ?? []);
        setPersistent(b.persistent !== false);
      })
      .catch(() => !dead && setRows([]));
    return () => {
      dead = true;
    };
  }, [tick]);

  const post = async () => {
    const amount = toUnits(amountText, asset.decimals);
    const p = toUnits(priceText || (asset.price ? asset.price.toFixed(2) : ""), 6);
    if (!amount || !p) return setMsg({ ok: false, text: "Enter an amount and a unit price in USDG." });
    const r = await h.call<{ request?: BoardRequest }>("/api/board", {
      method: "POST",
      body: JSON.stringify({ side, asset: { symbol: asset.symbol, address: asset.address, decimals: asset.decimals }, amount: amount.toString(), price: p.toString(), note, validHours: Number(hours) }),
    });
    setMsg(r.ok ? { ok: true, text: `Posted (${r.body.request?.tier === "holder" ? "holder priority" : "free tier"}).` } : { ok: false, text: r.body.error ?? "Refused." });
    if (r.ok) {
      setTick((t) => t + 1);
      void h.refresh();
    }
  };

  const remove = async (id: string) => {
    const r = await h.call(`/api/board?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) {
      setTick((t) => t + 1);
      void h.refresh();
    }
  };

  const findMatches = async (id: string) => {
    const r = await fetch(`/api/board/match?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setMatches({ id, list: (r?.matches as Match[]) ?? [] });
  };

  const me = h.address?.toLowerCase();
  return (
    <div className="wrap-wide grid gap-8 pb-10 min-[1000px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <aside className="grid content-start gap-6">
        {mounted ? <HolderPanel h={h} /> : null}
        <section className="panel-line p-5" data-testid="board-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="h-card">Post a request</h2>
            <StatusBadge status="Prototype" />
          </div>
          <p className="mt-1 text-[12px] text-[var(--muted)]">Public on the board: side, asset, size and an indicative unit price. Your private limit stays in the workspace.</p>
          <div className="mt-4 grid gap-3">
            <div className="seg" role="group" aria-label="Side">
              {(["sell", "buy"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} data-testid={`bf-${s}`}>
                  {s === "sell" ? "I sell" : "I buy"}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Asset (paid in USDG)</span>
              <select className="inp" value={asset.symbol} onChange={(e) => setSym(e.target.value)}>
                {list.map((a) => (
                  <option key={a.address} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Amount</span>
                <input className="inp" inputMode="decimal" value={amountText} onChange={(e) => setAmount(e.target.value)} data-testid="bf-amount" />
              </label>
              <label className="field">
                <span>Unit price (USDG)</span>
                <input className="inp" inputMode="decimal" placeholder={asset.price ? asset.price.toFixed(2) : ""} value={priceText} onChange={(e) => setPrice(e.target.value)} data-testid="bf-price" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Valid (hours)</span>
                <input className="inp" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label className="field">
                <span>Note (optional)</span>
                <input className="inp" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
            <button type="button" className="btn btn-white btn-lg" disabled={!h.valid} onClick={() => void post()} data-testid="bf-post">
              {h.valid ? "Post to the board" : "Sign in above to post"}
            </button>
            {msg ? (
              <p className={`verdict ${msg.ok ? "ok" : "bad"}`} role="status" data-testid="bf-msg">
                {msg.text}
              </p>
            ) : null}
          </div>
        </section>
      </aside>

      <div className="grid content-start gap-6">
        <section className="panel-line p-5" data-testid="board-list">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-card">Live requests</h2>
            <button type="button" className="btn btn-ghost" onClick={() => setTick((t) => t + 1)}>
              Refresh
            </button>
          </div>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Holder requests (0.1 % of supply, checked on chain when posted) are listed and matched first. Everyone else is listed after them, newest first.
          </p>
          {!persistent ? <p className="note mt-3">Not configured: saved data may be lost on restart (no shared store on this server).</p> : null}
          {rows === null ? (
            <p className="mt-4 text-[12.5px] text-[var(--muted)]">Reading the board…</p>
          ) : rows.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-[var(--muted)]">No live requests yet.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {rows.map((r) => (
                <li key={r.id} className="verdict" data-testid="board-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b className="font-normal">{r.side === "sell" ? "Sells" : "Buys"}</b> {amt(r)} at {price(r)}
                    </span>
                    <span className={`badge ${r.tier === "holder" ? "proto" : ""}`} data-testid="board-tier">
                      {r.tier === "holder" ? "Holder · first" : "Free"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-[var(--muted)]">
                    {short(r.wallet)} · until {new Date(r.validUntil * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC{r.note ? ` · ${r.note}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.wallet === me ? (
                      <>
                        <button type="button" className="btn btn-dark" onClick={() => void findMatches(r.id)} data-testid="board-match">
                          Find matches
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void remove(r.id)}>
                          Remove
                        </button>
                      </>
                    ) : (
                      <Link className="btn btn-dark" href={workspaceLink(r)}>
                        Open a deal with them
                      </Link>
                    )}
                  </div>
                  {matches?.id === r.id ? (
                    <div className="mt-3 grid gap-2" data-testid="board-matches">
                      {matches.list.length === 0 ? (
                        <p className="text-[12px] text-[var(--muted)]">No crossing request on the other side right now.</p>
                      ) : (
                        matches.list.map((m) => (
                          <div key={m.request.id} className="panel px-3 py-2 text-[12px]">
                            {short(m.request.wallet)} {m.request.side === "sell" ? "sells" : "buys"} {amt(m.request)} at {price(m.request)} · {m.reasons.join(" ")}{" "}
                            <Link className="underline" href={workspaceLink(m.request, r.amount)}>
                              open deal
                            </Link>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        {mounted ? <Templates h={h} /> : null}
        {mounted ? <TeamPanel h={h} /> : null}
      </div>
    </div>
  );
}

function Templates({ h }: { h: ReturnType<typeof useHolder> }) {
  const [list, setList] = useState<Template[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { list: assets } = useAssets();
  const load = useCallback(async () => {
    const r = await h.call<{ templates?: Template[] }>("/api/templates");
    if (r.ok) setList(r.body.templates ?? []);
  }, [h]);
  useEffect(() => {
    if (!h.valid) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [h.valid, load]);
  const weth = assets[0];
  const save = async () => {
    const r = await h.call<{ template?: Template }>("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: name || "WETH sell, 1 unit", side: "sell", asset: { symbol: weth.symbol, address: weth.address, decimals: weth.decimals }, amount: (10n ** 18n).toString(), price: toUnits((weth.price ?? 1650).toFixed(2), 6)!.toString(), feeBps: 10, validHours: 24 }),
    });
    setMsg(r.ok ? { ok: true, text: "Template saved." } : { ok: false, text: r.body.error ?? "Refused." });
    if (r.ok) void load();
  };
  return (
    <section className="panel-line p-5" data-testid="templates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-card">Deal templates</h2>
        <span className="badge proto">
          <i /> Holder feature · Prototype
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--muted)]">Save the deals you repeat (side, asset, size, price, fee, validity) and open them in the workspace in one click.</p>
      {!h.valid ? (
        <p className="mt-3 text-[12.5px] text-[var(--muted)]">Sign in to see your templates.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <input className="inp max-w-[260px]" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} data-testid="tpl-name" />
            <button type="button" className="btn btn-white" onClick={() => void save()} data-testid="tpl-save">
              Save a 1 WETH sell template
            </button>
          </div>
          {msg ? (
            <p className={`verdict mt-3 ${msg.ok ? "ok" : "bad"}`} data-testid="tpl-msg">
              {msg.text}
            </p>
          ) : null}
          <ul className="mt-3 grid gap-1 text-[12.5px]">
            {(list ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t.name} · {t.side} {amt(t)} at {price(t)} · fee {t.feeBps / 100} %
                </span>
                <Link className="underline" href={workspaceLink({ ...t, side: t.side === "buy" ? "sell" : "buy" })}>
                  open in workspace
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TeamPanel({ h }: { h: ReturnType<typeof useHolder> }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [deals, setDeals] = useState<{ id: number; status: string; member: string; baseToken: { symbol: string | null } }[]>([]);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await h.call<{ team?: Team | null; deals?: typeof deals }>("/api/team");
    if (r.ok) {
      setTeam(r.body.team ?? null);
      setDeals(r.body.deals ?? []);
    }
  }, [h]);
  useEffect(() => {
    if (!h.valid) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [h.valid, load]);
  const save = async () => {
    const list = members.split(/[\s,]+/).filter(Boolean);
    const r = await h.call<{ team?: Team }>("/api/team", { method: "POST", body: JSON.stringify({ name, members: list }) });
    setMsg(r.ok ? { ok: true, text: "Team saved." } : { ok: false, text: r.body.error ?? "Refused." });
    if (r.ok) void load();
  };
  return (
    <section className="panel-line p-5" data-testid="team">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-card">Team workspace</h2>
        <span className="badge proto">
          <i /> Holder feature · Prototype
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--muted)]">Name up to 10 wallets; every member signed in sees one shared list of the team&apos;s deals, read from the deal room.</p>
      {!h.valid ? (
        <p className="mt-3 text-[12.5px] text-[var(--muted)]">Sign in to see or set your team.</p>
      ) : (
        <>
          {team ? (
            <p className="mt-3 text-[12.5px]">
              {team.name}: {[team.owner, ...team.members].map(short).join(", ")} · {deals.length} deals
            </p>
          ) : null}
          <div className="mt-3 grid gap-2">
            <input className="inp" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="inp" rows={2} placeholder="Member wallets, comma or space separated" value={members} onChange={(e) => setMembers(e.target.value)} />
            <button type="button" className="btn btn-dark justify-self-start" onClick={() => void save()} data-testid="team-save">
              Save team
            </button>
            {msg ? (
              <p className={`verdict ${msg.ok ? "ok" : "bad"}`} data-testid="team-msg">
                {msg.text}
              </p>
            ) : null}
          </div>
          {deals.length ? (
            <ul className="mt-3 grid gap-1 text-[12px] text-[var(--ink-2)]">
              {deals.map((d) => (
                <li key={d.id}>
                  #{d.id} · {d.baseToken.symbol ?? "?"} · {d.status} · {short(d.member)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

