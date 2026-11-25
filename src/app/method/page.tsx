import Link from "next/link";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";
import { ETH_USD_FEED, TESTNET_WETH, USDG, WETH } from "@/config/dex";
import { FEED_DIRECTORY, STOCK_BEACON, STOCK_PROXY_CODEHASH } from "@/config/chain";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BITS, BIT_WORDS, type BitName } from "@/lib/deal/bits";
import { FAQ } from "@/lib/faq";
import { breadcrumbLd, faqLd, ldJson, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/method",
  title: "Method, fee math and reason codes | Semvio",
  description: "How Semvio works: deal and revision hashes, two-sided approval of one revision, atomic transferFrom settlement, the fee and net formula, every reason code, the data sources and what is not supported.",
});

const S = (dot: string) => ({ "--dot": dot }) as React.CSSProperties;
const exp = (k: "mainnet" | "testnet", a: string) => `${NETWORKS[k].explorer}/address/${a}`;

const STEPS = [
  { t: "Request", d: "You choose buy or sell, the asset, the amount, your price limit and how long the request stands. The limit stays with your agent." },
  { t: "Match", d: "Counterparties on the other side are tested for size and price overlap after the fee; each one gets a reason in numbers." },
  { t: "Revisions", d: "The agents (or the people) propose terms. Each proposal is revision n with hash H(n) = keccak(tag, H(n-1), deal, n, proposer, side, price, fee, recipient, expiry, note hash); revision 1 chains from the deal's own hash." },
  { t: "Checks", d: "Buyer budget: gross ≤ max gross. Seller minimum: gross − fee ≥ min net. Plus expiry, balances and allowances. checkDeal() returns them as bits." },
  { t: "Approval", d: "Seller and buyer each approve one revision number and hash. Any new revision voids older approvals; either side may withdraw." },
  { t: "Settlement", d: "settle() or approveAndSettle() moves the asset seller → buyer, net buyer → seller and fee buyer → recipient with transferFrom, in one transaction, and checks each arrival." },
];

export default function MethodPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson([breadcrumbLd([{ name: "Method", path: "/method" }]), faqLd(FAQ)])} />
      <PageHead eyebrow="Method" dot="var(--purple)" title="What runs, what is checked, what is not.">
        Everything on this page is true of the site and the contract as built. Where something is planned, it says Concept.
      </PageHead>

      <section className="wrap">
        <ol className="grid gap-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="panel grid gap-2 p-5 min-[640px]:grid-cols-[140px_minmax(0,1fr)]" data-reveal="" style={{ "--delay": `${i * 60}ms` } as React.CSSProperties}>
              <span className="h-card">
                <span className="text-[var(--faint)]">0{i + 1} </span>
                {s.t}
              </span>
              <span className="text-[13px] text-[var(--ink-2)]">{s.d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--yellow)")}>Fee and net</p>
        <h2 className="h-sub mt-5">fee = ⌊gross × feeBps / 10,000⌋ · net = gross − fee</h2>
        <div className="mt-5 grid gap-3 text-[13px] text-[var(--ink-2)]">
          <p>The fee is optional, at most 100 basis points (1 %), and goes to a third-party recipient named in the revision (a broker or the operator of an agent). It cannot go to the buyer or the seller. Rounding is down, so the seller never pays more than the stated rate. Semvio itself charges nothing and the room has no fee switch.</p>
          <p>The smallest gross that leaves a seller at least a given net is computed exactly (minGrossForNet), so the agent can turn a seller&apos;s minimum net into a gross floor. The site and the contract share the same integer math; tests run fixed vectors on both.</p>
        </div>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--cyan)")}>Reason codes</p>
        <h2 className="h-sub mt-5">One bit per reason, the same on the site and in the contract</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Bit</th>
                <th>Name</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(BITS) as BitName[]).map((n) => (
                <tr key={n}>
                  <td>{BITS[n]}</td>
                  <td>{BIT_WORDS[n].label}</td>
                  <td className="text-[var(--ink-2)]">{BIT_WORDS[n].why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] text-[var(--muted)]">A reverted transaction leaves no event, so the site runs checkDeal() and checkTerms() as free reads first and shows these bits before your wallet opens.</p>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--mint)")}>The contract</p>
        <h2 className="h-sub mt-5">SemvioDealRoom (+ library SemvioFeeMath)</h2>
        <ul className="mt-5 grid gap-2 text-[13px] text-[var(--ink-2)]">
          <li>· openDeal, proposeRevision, approve, approveAndSettle, settle, withdrawApproval, cancel, setAgent; views getDeal, dealsOf, checkDeal, checkTerms, previewRevisionHash, quote, minGrossForNet.</li>
          <li>· Non-custodial: transferFrom straight between the two wallets; the room&apos;s balance is zero before and after every call. No payable function.</li>
          <li>· No admin, no protocol fee, no upgrade, no pause over other people&apos;s deals. Reentrancy guard on every state change; effects before token calls.</li>
          <li>· Tokens that return nothing are handled; tokens that return false revert; fee-on-transfer tokens are refused (each arrival must equal the amount sent). Native ETH is not supported: wrap it to WETH.</li>
          <li>· Agents may only propose for their side. Removing an agent takes effect for the next transaction, even in the same block.</li>
          <li>· Limits: deal window up to 30 days, offer expiry inside it, 64 revisions per deal.</li>
          <li>· No independent security review yet. Use the testnet first, then small amounts.</li>
        </ul>
        <div className="mt-6 grid gap-2 text-[12.5px]">
          {(["mainnet", "testnet"] as const).map((k) => (
            <p key={k}>
              {NETWORKS[k].name} ({NETWORKS[k].id}):{" "}
              {roomLive(k) ? (
                <a className="underline" href={exp(k, CONTRACTS[k].room)} target="_blank" rel="noreferrer">
                  {CONTRACTS[k].room}
                </a>
              ) : (
                <span className="text-[var(--muted)]">not deployed yet</span>
              )}
            </p>
          ))}
        </div>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--blue)")}>Data sources</p>
        <h2 className="h-sub mt-5">What is read live, and from where</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="tbl">
            <tbody>
              <tr>
                <td>Block, gas price</td>
                <td className="text-[var(--ink-2)]">JSON-RPC of each network (official endpoint first, public fallbacks), through the site&apos;s rate-limited read relay.</td>
              </tr>
              <tr>
                <td>ETH reference price</td>
                <td className="text-[var(--ink-2)]">
                  Chainlink ETH / USD on Robinhood Chain,{" "}
                  <a className="underline" href={exp("mainnet", ETH_USD_FEED)} target="_blank" rel="noreferrer">{ETH_USD_FEED}</a>, with its update time.
                </td>
              </tr>
              <tr>
                <td>Stock tokens</td>
                <td className="text-[var(--ink-2)]">
                  Listed only when the proxy code hash is {STOCK_PROXY_CODEHASH.slice(0, 10)}…, its ERC-1967 beacon is {STOCK_BEACON.slice(0, 10)}…, its supply is above zero and Chainlink lists a feed for it (
                  <a className="underline" href={FEED_DIRECTORY} target="_blank" rel="noreferrer">feed directory</a>) that answers now. A ticker alone proves nothing. Feeds follow market hours and can be a day old on weekends; the age is always shown.
                </td>
              </tr>
              <tr>
                <td>WETH / USDG</td>
                <td className="text-[var(--ink-2)]">
                  <a className="underline" href={exp("mainnet", WETH)} target="_blank" rel="noreferrer">WETH</a> and <a className="underline" href={exp("mainnet", USDG)} target="_blank" rel="noreferrer">USDG</a> (Global Dollar, 6 decimals) on mainnet; on the testnet,{" "}
                  <a className="underline" href={exp("testnet", TESTNET_WETH)} target="_blank" rel="noreferrer">WETH</a> whose ETH balance is checked against its supply live.
                </td>
              </tr>
              <tr>
                <td>Deals</td>
                <td className="text-[var(--ink-2)]">The room&apos;s views and logs; the revision chain is re-hashed on the server and compared with what the room stores.</td>
              </tr>
              <tr>
                <td>Practice desks</td>
                <td className="text-[var(--ink-2)]">Sample data: six desks whose limits sit around the reference price. Labelled wherever they appear.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--lime)")}>Board, sessions and alerts</p>
        <h2 className="h-sub mt-5">What the server keeps, and how it checks you</h2>
        <ul className="mt-5 grid gap-2 text-[13px] text-[var(--ink-2)]">
          <li>· Sign-in: one EIP-4361 message (no gas) for semvio.xyz, chain 4663, valid at most 4 hours. The server checks the signature, a fixed list of domains (never the request&apos;s Host header), the chain, the expiry and that you did not sign out, on every request. EOA wallets only.</li>
          <li>· Tier: balanceOf × 1000 ≥ totalSupply on the {"$SEMVIO"} contract, read at each holder action (cached 30 seconds per wallet). Before launch everyone is on the free tier.</li>
          <li>· Board: public requests (side, asset, size, indicative unit price, validity). Limits per wallet by tier, per network and for the whole site; a full board refuses new posts and never drops anyone&apos;s request. Holder requests are listed and matched first.</li>
          <li>· Storage: a shared store when configured; otherwise this server&apos;s memory (bounded, with expiry), and the page says data may be lost on restart.</li>
          <li>· Alerts: derived from the deal room&apos;s events for your wallet on request; nothing is stored about you on the server. Browser notifications only while a tab is open.</li>
        </ul>
      </section>

      <section className="wrap pt-20">
        <p className="eyebrow" style={S("var(--orange)")}>Status</p>
        <ul className="mt-6 grid gap-2 text-[13px]">
          {[
            ["Deal card, revisions, checks, approvals, practice settlement", "Prototype"],
            ["On-chain deals on Robinhood Chain and Robinhood Chain Testnet", "Prototype"],
            ["Deterministic agent proposing inside one limit", "Prototype"],
            ["Matching board: post a request, see crossing requests on the other side, open the deal", "Prototype"],
            ["Holder tier (0.1 % of $SEMVIO supply, read on chain): board priority, templates, team workspace", "Prototype"],
            ["Alerts: bell inbox and browser notifications from the room's events", "Prototype"],
            ["Automatic negotiation between two real users' agents on the board", "Concept"],
            ["Language-model assistant that drafts notes", "Concept"],
          ].map(([t, s]) => (
            <li key={t} className="panel flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="text-[var(--ink-2)]">{t}</span>
              <StatusBadge status={s as "Prototype" | "Concept"} />
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Link href="/workspace" className="btn btn-white">
            Open the workspace
          </Link>
        </div>
      </section>
    </>
  );
}
