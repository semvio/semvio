import Link from "next/link";
import { BRAND, TOKEN, buyUrl, chartUrl, tokenExplorerUrl } from "@/config/brand";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | Semvio`,
  description: `${BRAND.symbol} on Robinhood Chain: contract address, launch status and the planned uses. Semvio's workspace and deal room never need the token.`,
});

export default function TokenPage() {
  const chart = TOKEN.isLive ? chartUrl(BRAND.ca) : null;
  const exp = tokenExplorerUrl();
  return (
    <>
      <PageHead eyebrow={BRAND.symbol} dot="var(--lime)" title="A memecoin with planned uses, never a requirement.">
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
        <div className="grid gap-3" data-reveal="">
          {[
            ["Priority matching: holders' requests are offered to counterparties first", "Concept"],
            ["Saved deal templates and team workspaces", "Concept"],
            ["Settlement, approvals, checks and history", "Free, no token"],
          ].map(([t, s]) => (
            <div key={t} className="panel flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-[13px]">
              <span className="text-[var(--ink-2)]">{t}</span>
              {s === "Concept" ? <StatusBadge status="Concept" /> : <span className="badge proto">{s}</span>}
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--muted)]">
          Planned means not built. The deal room has no token logic and takes no fee. <Link className="underline" href="/method">How Semvio works</Link>.
        </p>
      </section>
    </>
  );
}
