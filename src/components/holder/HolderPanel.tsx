"use client";

import Link from "next/link";
import { BRAND } from "@/config/brand";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useHolder } from "@/components/holder/useHolder";
import { fromUnits } from "@/lib/deal/math";
import { QUOTA } from "@/lib/holder/tier";

/* Connect → sign one session message → tier read on chain, with the numbers that decided it. */
export function HolderPanel({ h }: { h: ReturnType<typeof useHolder> }) {
  const { open } = useWalletModal();
  const i = h.info;
  return (
    <section className="panel-line p-5" data-testid="holder-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-card">Your tier</h2>
        {i ? (
          <span className={`badge ${i.tier === "holder" ? "proto" : "live"}`} data-testid="holder-tier">
            <i aria-hidden="true" />
            {i.tier === "holder" ? `Holder · 0.1 % of ${BRAND.symbol}` : "Free tier"}
          </span>
        ) : null}
      </div>
      {!h.address ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-[var(--ink-2)]">
          <span>Connect a wallet to post on the board. Reading the board needs nothing.</span>
          <button type="button" className="btn btn-white" onClick={open}>
            Connect wallet
          </button>
        </div>
      ) : !h.valid ? (
        <div className="mt-4 grid gap-3 text-[12.5px] text-[var(--ink-2)]">
          <p>Sign one message to start a session (no gas, nothing moves, valid 4 hours in this tab). Your wallet shows it as a sign-in for this site. The server checks the signature, the domain, chain 4663, the expiry and that you did not sign out, on every request.</p>
          <button type="button" className="btn btn-white justify-self-start" disabled={h.busy} onClick={() => void h.signIn()} data-testid="holder-sign">
            {h.busy ? "Confirm in wallet…" : "Sign in with wallet"}
          </button>
          {h.err ? <p className="verdict bad">{h.err}</p> : null}
        </div>
      ) : !i ? (
        <p className="mt-4 text-[12.5px] text-[var(--muted)]">{h.err ?? "Reading your balance on chain…"}</p>
      ) : (
        <div className="mt-4 grid gap-3 text-[12.5px]">
          {i.launched ? (
            <dl className="kv" data-testid="holder-numbers">
              <dt>Your balance</dt>
              <dd>{fromUnits(BigInt(i.balance), 18, 4)}</dd>
              <dt>Holder threshold (0.1 %)</dt>
              <dd>{fromUnits(BigInt(i.threshold), 18, 4)}</dd>
              <dt>Your share of supply</dt>
              <dd>{i.share}</dd>
              <dt>Checked</dt>
              <dd>
                block {i.block?.toLocaleString("en-US") ?? "—"}, {new Date(i.checkedAt).toISOString().slice(11, 19)} UTC
              </dd>
            </dl>
          ) : (
            <p className="verdict" data-testid="holder-unlocks">Holder features unlock at launch: {BRAND.symbol} does not exist yet, so everyone is on the free tier, which works fully.</p>
          )}
          <dl className="kv">
            <dt>Live board requests</dt>
            <dd data-testid="quota-requests">
              {i.usage.liveRequests} / {i.quota.liveRequests}
            </dd>
            <dt>Saved templates</dt>
            <dd>{i.quota.templates ? `${i.usage.templates} / ${i.quota.templates}` : "holders only"}</dd>
            <dt>Team members</dt>
            <dd>{i.quota.teamMembers ? `${i.usage.teamMembers} / ${i.quota.teamMembers}` : "holders only"}</dd>
          </dl>
          {!i.persistent ? <p className="note">Not configured: saved data may be lost on restart (no shared store on this server). Export what you keep.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-dark" onClick={() => void h.refresh()}>
              Check again
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void h.signOut()} data-testid="holder-signout">
              Sign out
            </button>
            <Link href="/token" className="btn btn-ghost">
              What 0.1 % unlocks
            </Link>
          </div>
          <p className="text-[11px] text-[var(--faint)]">
            Free: {QUOTA.free.liveRequests} live requests. Holder: {QUOTA.holder.liveRequests} live requests offered first, {QUOTA.holder.templates} templates, a team of{" "}
            {QUOTA.holder.teamMembers}. EOA wallets only in this version.
          </p>
        </div>
      )}
      {h.err && h.valid && i ? <p className="verdict bad mt-3">{h.err}</p> : null}
    </section>
  );
}
