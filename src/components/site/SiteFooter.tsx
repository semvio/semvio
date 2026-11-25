import Link from "next/link";
import { BRAND, hasGithub } from "@/config/brand";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";
import { USDG, WETH } from "@/config/dex";
import { Wordmark } from "@/components/site/Mark";
import { CaBox } from "@/components/site/CaCopy";

/* The reference's footer: a lighter band, logo + one line on the left, three link columns, a small closing note under the logo. */
export function SiteFooter() {
  const room = (k: "mainnet" | "testnet") =>
    roomLive(k) ? (
      <a className="l" href={`${NETWORKS[k].explorer}/address/${CONTRACTS[k].room}`} target="_blank" rel="noreferrer">
        Deal room on {NETWORKS[k].short} {CONTRACTS[k].room.slice(0, 6)}…{CONTRACTS[k].room.slice(-4)}
      </a>
    ) : (
      <span className="l block py-[6px] text-[12px] text-[var(--faint)]">Deal room on {NETWORKS[k].short}: not deployed yet</span>
    );
  return (
    <footer className="ft">
      <div className="wrap grid gap-10 min-[900px]:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <Wordmark size={18} />
            <p className="mt-4 max-w-[300px] text-[12px] text-[var(--ink-2)]">{BRAND.slogan}</p>
          </div>
          <div className="grid max-w-[340px] gap-4">
            <CaBox testid="footer-ca" />
            <p className="text-[11.5px] leading-[1.5] text-[var(--muted)]">
              {BRAND.name} is an independent prototype on Robinhood Chain, not affiliated with Robinhood or with any token it reads. The deal room has not had an
              independent security review: use small amounts first. Nothing here is investment advice.
            </p>
          </div>
        </div>
        <div>
          <h3>Product</h3>
          <Link className="l" href="/workspace">Workspace</Link>
          <Link className="l" href="/board">Matching board</Link>
          <Link className="l" href="/deals">Deals &amp; proofs</Link>
          <Link className="l" href="/method">Method</Link>
          <Link className="l" href="/token">{BRAND.symbol}</Link>
          <a className="l" href="/llms.txt">llms.txt</a>
        </div>
        <div>
          <h3>On chain</h3>
          {room("mainnet")}
          {room("testnet")}
          <a className="l" href={`${NETWORKS.mainnet.explorer}/token/${WETH}`} target="_blank" rel="noreferrer">WETH</a>
          <a className="l" href={`${NETWORKS.mainnet.explorer}/token/${USDG}`} target="_blank" rel="noreferrer">USDG</a>
          <a className="l" href={NETWORKS.mainnet.explorer} target="_blank" rel="noreferrer">Robinhood Chain explorer</a>
        </div>
        <div>
          <h3>Project</h3>
          <a className="l" href={BRAND.x} target="_blank" rel="noreferrer">X {BRAND.xHandle}</a>
          {hasGithub ? (
            <a className="l" href={BRAND.github} target="_blank" rel="noreferrer">Source code</a>
          ) : null}
          <a className="l" href={NETWORKS.testnet.faucet ?? NETWORKS.testnet.explorer} target="_blank" rel="noreferrer">Testnet faucet</a>
        </div>
      </div>
    </footer>
  );
}
