import Link from "next/link";
import { BRAND } from "@/config/brand";
import { DealMock } from "@/components/home/DealMock";
import { Features } from "@/components/home/Features";
import { LiveStrip } from "@/components/home/LiveStrip";
import { AssetMarquee, STOCK_COUNT } from "@/components/home/AssetMarquee";
import { FAQ } from "@/lib/faq";
import { faqLd, appLd, ldJson } from "@/lib/seo";

/* Home, in the UI reference's order: hero + framed product view, four short features, an accordion section, a tile marquee,
   a talk-to-it section with alternating framed views, a five-tile trust row, a closing card, then the footer. */

const S = (dot: string) => ({ "--dot": dot }) as React.CSSProperties;
const D = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;
const L = (i: number) => ({ "--i": i }) as React.CSSProperties;

const FOUR = [
  { t: "Write the request", d: "Buy or sell, the asset and amount, your price limit and how long the request stands.", icon: "M3 4h10M3 8h10M3 12h6" },
  { t: "Let the agent propose", d: "It offers inside your limit, concedes step by step and logs every revision.", icon: "M2 8h4l2-4 2 8 2-4h2" },
  { t: "Check the numbers", d: "Buyer budget and seller net after the fee, line by line, before anyone signs.", icon: "M3 8.5l3 3L13 4.5" },
  { t: "Approve one version", d: "Both wallets approve the same revision; one swap settles exactly that.", icon: "M4 7V5a4 4 0 0 1 8 0v2M3 7h10v7H3z" },
];

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const TRUST = [
  { k: "Non-custodial", svg: <path d="M8 34V16a16 16 0 0 1 32 0v18M6 34h36v20H6z" /> },
  { k: "One revision", svg: <path d="M10 8h28v40H10zM16 18h16M16 26h16M16 34h10" /> },
  { k: "Two wallets", svg: <><circle cx="16" cy="24" r="10" /><circle cx="32" cy="24" r="10" /></> },
  { k: "Offer expiry", svg: <><circle cx="24" cy="28" r="18" /><path d="M24 16v12l8 6" /></> },
  { k: "Atomic swap", svg: <path d="M6 18h30l-8-8M42 32H12l8 8" /> },
];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={ldJson([appLd, faqLd(FAQ)])} />
      <section className="hero">
        <div className="wrap">
          <div className="hero-inner">
            <p className="eyebrow" data-load="" style={{ ...S("#fff"), ...L(0) }}>
              The OTC deal workspace for Robinhood Chain
            </p>
            <h1 className="h-hero mt-6 max-w-[640px]" data-load="" style={L(1)}>
              {BRAND.slogan}
            </h1>
            <p className="lede mt-6 max-w-[500px]" data-load="" style={L(2)}>
              {BRAND.tagline}
            </p>
            <p className="pill-note mt-6" data-load="" style={L(3)}>
              Non-custodial · Prototype · No token needed
            </p>
            <div className="mt-6 flex flex-wrap gap-2" data-load="" style={L(4)}>
              <Link href="/workspace" className="btn btn-white btn-lg" data-testid="hero-cta">
                Open the workspace
              </Link>
              <Link href="/method" className="btn btn-dark btn-lg">
                See how it settles
              </Link>
            </div>
          </div>
        </div>
        <div className="wrap mt-16" data-load="" style={L(5)}>
          <div className="prism">
            <DealMock />
          </div>
        </div>
        <div className="wrap mt-8">
          <LiveStrip />
        </div>
      </section>

      <section className="wrap pb-8">
        <div className="feat-row">
          {FOUR.map((f, i) => (
            <div key={f.t} data-reveal="" style={D(i * 90)}>
              <p className="h-card flex items-center gap-2">
                <span className="text-[var(--muted)]">
                  <Glyph d={f.icon} />
                </span>
                {f.t}
              </p>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap pt-28" id="workspace">
        <p className="eyebrow" style={S("var(--yellow)")} data-reveal="">
          Workspace
        </p>
        <h2 className="h-sec mt-6 max-w-[520px]" data-reveal="" style={D(80)}>
          One card per deal, nothing to chase in chat
        </h2>
        <p className="lede mt-6 max-w-[440px]" data-reveal="" style={D(160)}>
          Semvio is deliberately small. Each part answers one question you would otherwise ask in a thread.
        </p>
        <Features />
      </section>

      <section className="wrap pt-32" id="assets">
        <p className="eyebrow" style={S("var(--cyan)")} data-reveal="">
          Assets
        </p>
        <h2 className="h-sec mt-6 max-w-[520px]" data-reveal="" style={D(80)}>
          Works with what is really on Robinhood Chain
        </h2>
        <p className="lede mt-6 max-w-[440px]" data-reveal="" style={D(160)}>
          WETH, USDG and {STOCK_COUNT} Robinhood stock tokens with a Chainlink price on the chain. Each one is checked on chain before it is offered.
        </p>
        <div className="mt-6" data-reveal="" style={D(240)}>
          <Link href="/workspace" className="btn btn-white">
            Price a deal now
          </Link>
        </div>
      </section>
      <div className="wrap-wide">
        <AssetMarquee />
      </div>

      <section className="wrap pt-32" id="agent">
        <p className="eyebrow" style={S("var(--blue)")} data-reveal="">
          The agent
        </p>
        <h2 className="h-sec mt-6" data-reveal="" style={D(80)}>
          The agent proposes. You decide.
        </h2>
        <p className="lede mt-6 max-w-[420px]" data-reveal="" style={D(160)}>
          A deterministic negotiator, not a chatbot. It knows only your limit, and it can never sign for you.
        </p>
        <div className="mt-6" data-reveal="" style={D(240)}>
          <Link href="/workspace" className="btn btn-white">
            Try it without a wallet
          </Link>
        </div>

        <div className="mt-16 grid items-center gap-10 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="prism" data-reveal="">
            <div className="window my-10 text-[12px]">
              <div className="p-5">
                <p className="text-[var(--faint)]">Your agent · limit 1,670.00 per WETH</p>
                <ol className="tl mt-4">
                  <li className="tl-item"><span className="tl-dot" /><span>r1 · bids 1,619.90 <span className="text-[var(--faint)]">(3 % under your limit)</span></span></li>
                  <li className="tl-item"><span className="tl-dot" /><span>r3 · bids 1,636.60 <span className="text-[var(--faint)]">(a third closer)</span></span></li>
                  <li className="tl-item cur"><span className="tl-dot" /><span>r5 · bids 1,670.00 <span className="text-[var(--faint)]">(last turn: your limit)</span></span></li>
                </ol>
              </div>
            </div>
          </div>
          <div data-reveal="" style={D(120)}>
            <h3 className="h-sub">Proposes inside your limit</h3>
            <p className="lede mt-4 text-[15px]">It opens 3 % better than your limit and moves a third of the way each turn. It never crosses your number.</p>
            <p className="pill-note mt-6">Same inputs, same revisions, every time.</p>
          </div>
        </div>

        <div className="mt-16 grid items-center gap-10 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="order-2 min-[900px]:order-1" data-reveal="">
            <h3 className="h-sub">Never signs for you</h3>
            <p className="lede mt-4 text-[15px]">An agent address can propose revisions on the room. It cannot approve, settle, cancel or appoint anyone, and you remove it with one call.</p>
            <p className="pill-note mt-6">Enforced by the contract, not by the website.</p>
          </div>
          <div className="prism flip order-1 min-[900px]:order-2" data-reveal="" style={D(120)}>
            <div className="window my-10 p-5 text-[12px]">
              <div className="verdict bad">approve(r5) from the agent → refused: Not a party</div>
              <div className="verdict ok mt-3">approve(r5) from your wallet → approved</div>
            </div>
          </div>
        </div>

        <div className="mt-16 grid items-center gap-10 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="prism low" data-reveal="">
            <div className="window my-10 p-5 text-[12px]">
              <p className="text-[var(--muted)]">No agreement</p>
              <p className="mt-2">The seller needs at least 1,660.00 USDG gross and the buyer&apos;s budget is 1,600.00 USDG (gap 60.00 USDG).</p>
            </div>
          </div>
          <div data-reveal="" style={D(120)}>
            <h3 className="h-sub">Explains every refusal</h3>
            <p className="lede mt-4 text-[15px]">When a deal cannot happen it says which limit, by how much, in numbers. No guessing what went wrong.</p>
            <p className="pill-note mt-6">Each reason is one bit the contract also returns.</p>
          </div>
        </div>
      </section>

      <section className="wrap pt-32" id="settlement">
        <p className="eyebrow" style={S("var(--mint)")} data-reveal="">
          Settlement
        </p>
        <h2 className="h-sec mt-6" data-reveal="" style={D(80)}>
          Non-custodial by design
        </h2>
        <p className="lede mt-6 max-w-[440px]" data-reveal="" style={D(160)}>
          Your tokens stay in your wallet until the one transaction that swaps them. The room never holds a balance.
        </p>
        <div className="trust mt-14">
          {TRUST.map((t, i) => (
            <div key={t.k} data-reveal="" style={D(i * 80)}>
              <svg width="48" height="58" viewBox="0 0 48 58" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {t.svg}
              </svg>
              <span>{t.k}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-[12px] text-[var(--ink-2)]" data-reveal="">
          No admin, no protocol fee, no upgrade. Not reviewed by an independent security firm yet: start with small amounts.
        </p>
      </section>

      <section className="wrap pt-32" id="start">
        <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <div className="panel flex flex-col justify-center p-10" data-reveal="">
            <p className="eyebrow" style={S("var(--lime)")}>
              Get started
            </p>
            <h2 className="h-sub mt-6">Your next OTC deal on one card. Approved by both sides, settled in one transaction.</h2>
            <p className="lede mt-5 text-[15px]">Chat threads lose track of who offered what. Semvio keeps every revision, the fee and the net in one place.</p>
            <div className="mt-6">
              <Link href="/workspace" className="btn btn-white">
                Open the workspace
              </Link>
            </div>
          </div>
          <div className="prism flip" data-reveal="" style={D(120)}>
            <DealMock compact />
          </div>
        </div>
      </section>

      <section className="wrap pt-28" id="faq">
        <p className="eyebrow" style={S("var(--purple)")} data-reveal="">
          Questions
        </p>
        <div className="mt-8 grid gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="panel group px-5 py-4" data-reveal="">
              <summary className="h-card cursor-pointer list-none">{f.q}</summary>
              <p className="mt-3 text-[13px] leading-[1.5] text-[var(--ink-2)]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
