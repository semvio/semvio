import Link from "next/link";
import { BRAND, TOKEN, buyUrl, chartUrl, tokenExplorerUrl } from "@/config/brand";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { pageMeta } from "@/lib/seo";
import { Threshold } from "@/components/token/Threshold";
import { QUOTA } from "@/lib/holder/tier";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | Semvio`,
  description: `${BRAND.symbol} on Robinhood Chain: contract address, launch status and the token features. Semvio's workspace and deal room never need the token.`,
});

export default function TokenPage() {
  const chart = TOKEN.isLive ? chartUrl(BRAND.ca) : null;
  const exp = tokenExplorerUrl();
  return (
    <>
      <PageHead eyebrow={BRAND.symbol} dot="var(--lime)" title="The community token, never a requirement.">
        <p>
          {BRAND.symbol} ({BRAND.tokenName}) lives on Robinhood Chain; gas is paid in ETH. The workspace, the deal room and the dashboard work without it. Nothing here is a
          promise of value.
        </p>
      </PageHead>
      <section className="wrap grid gap-6">
        <div className="panel p-6" data-reveal="">
          <div className="flex flex-wrap items-center gap-4">
            <img src="/brand/mark-tile.webp?v=08c4e052" alt={`${BRAND.tokenName} token logo`} width={56} height={56} className="rounded-[12px]" />
            <div>
              <p className="h-card text-[20px]">{BRAND.tokenName}</p>
              <p className="text-[12px] text-[var(--muted)]">{TOKEN.isLive ? "Live on Robinhood Chain" : "Not launched yet · launchpad TBA"}</p>
            </div>
          </div>
          <div className="mt-6">
            <CaBox testid="token-ca" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <a className="btn btn-white" href={buyUrl()} target="_blank" rel="noreferrer">
              {TOKEN.isLive ? `Buy ${BRAND.symbol}` : "At launch"}
            </a>
            {chart ? (
              <a className="btn btn-dark" href={chart} target="_blank" rel="noreferrer">
                Chart
              </a>
            ) : null}
            {exp ? (
              <a className="btn btn-dark" href={exp} target="_blank" rel="noreferrer">
                Explorer
              </a>
            ) : null}
          </div>
          <p className="mt-5 text-[12px] text-[var(--muted)]">Only the address above is {BRAND.symbol}. Semvio will never DM you first or ask for a seed phrase.</p>
        </div>
        <div className="panel p-6" data-reveal="" data-testid="token-features">
          <h2 className="h-sub">Token features</h2>
          <p className="mt-2 text-[13px] text-[var(--ink-2)]">
            A wallet that holds at least 0.1 % of the {BRAND.symbol} supply is a holder. Live threshold: <Threshold />
          </p>
          <ul className="mt-5 grid gap-2 text-[13px]">
            {[
              [`Matching board priority: holder requests are listed and matched first, up to ${QUOTA.holder.liveRequests} live requests (free tier: ${QUOTA.free.liveRequests})`, "Prototype"],
              [`Saved deal templates, up to ${QUOTA.holder.templates}, opened in the workspace in one click`, "Prototype"],
              [`Team workspace: up to ${QUOTA.holder.teamMembers} member wallets share one list of the team's deals`, "Prototype"],
            ].map(([t, st]) => (
              <li key={t} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2">
                <span className="text-[var(--ink-2)]">{t}</span>
                <StatusBadge status={st as "Prototype"} />
              </li>
            ))}
          </ul>
          <h3 className="h-card mt-6">How the check works</h3>
          <p className="mt-2 text-[12.5px] text-[var(--ink-2)]">
            You sign one sign-in message (no gas). The server checks it on every request, then reads balanceOf(your wallet) and totalSupply() from the token contract on
            Robinhood Chain and compares balance × 1000 with the supply. The result shows your balance, the threshold, your share and the block it was read at, and it is
            read again at each holder action (at most 30 seconds old). Before {BRAND.symbol} exists, holder features unlock at launch.
          </p>
          <h3 className="h-card mt-6">Free for everyone, always</h3>
          <p className="mt-2 text-[12.5px] text-[var(--ink-2)]">
            The workspace, practice mode, the deal room, the deals dashboard, posting on the board ({QUOTA.free.liveRequests} live requests) and alerts (the bell and browser
            notifications). Holding {BRAND.symbol} gives no fee discount, no share of anything and no reward.
          </p>
          <div className="mt-5">
            <Link href="/board" className="btn btn-white">
              Open the board
            </Link>
          </div>
        </div>
        <p className="text-[12px] text-[var(--muted)]">
          The deal room has no token logic and takes no fee. <Link className="underline" href="/method">How Semvio works</Link>.
        </p>
      </section>
    </>
  );
}
