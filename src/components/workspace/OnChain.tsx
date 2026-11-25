"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, getAddress } from "viem";
import { isAddress } from "@/config/brand";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { TESTNET_WETH, USDG, WETH } from "@/config/dex";
import { NETWORKS, explorerTx, type NetKey } from "@/config/networks";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { LiveBadge, StatusBadge } from "@/components/site/PageHead";
import { DealCard, Timeline, type CardModel } from "@/components/workspace/DealCard";
import { useAssets } from "@/components/workspace/assets";
import { useChain } from "@/components/site/useChain";
import { ERC20_ABI, ROOM_ABI } from "@/lib/abi";
import { BIT_WORDS, bitNames } from "@/lib/deal/bits";
import { feeOf, fromUnits, MAX_FEE_BPS, noteHashOf, toUnits, ZERO_ADDR, type Terms } from "@/lib/deal/math";
import { explain, read, simulate, waitForReceipt } from "@/lib/client";

/*
 * On-chain mode: the same deal card and history, read from SemvioDealRoom on Robinhood Chain or its testnet. Every write is a
 * transaction from the visitor's own wallet. Before a wallet opens, the call is run as a read (eth_call) so a refusal comes
 * back in words, and checkDeal() returns every reason a deal cannot settle yet. Limits typed here are only sent in those reads.
 */

type Token = { address: `0x${string}`; symbol: string; decimals: number };
type DealApi = {
  deal: {
    id: number;
    seller: string;
    buyer: string;
    maker: string;
    baseToken: { address: string; symbol: string | null; decimals: number | null };
    quoteToken: { address: string; symbol: string | null; decimals: number | null };
    baseAmount: string;
    validUntil: number;
    revision: number;
    sellerApproved: number;
    buyerApproved: number;
    status: string;
    sellerAgent: string;
    buyerAgent: string;
    lastHash: string;
    terms: { quoteAmount: string; feeBps: number; feeRecipient: string; offerValidUntil: number; noteHash: string };
  };
  revisions: { n: number; proposer: string; sellerSide: boolean; hash: string; terms: { quoteAmount: string; feeBps: number; offerValidUntil: number }; tx: string; hashOk: boolean }[];
  events: { name: string; block: number; tx: string; args: Record<string, unknown> }[];
  chainIntact: boolean;
  scanned: { complete: boolean; gaps: [number, number][] };
};

const nowS = () => Math.floor(Date.now() / 1000);
const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const roomOf = (net: NetKey) => CONTRACTS[net].room as `0x${string}`;

function presets(net: NetKey, stocks: Token[]): { base: Token[]; quote: Token[] } {
  if (net === "mainnet") {
    return {
      base: [{ address: WETH as `0x${string}`, symbol: "WETH", decimals: 18 }, ...stocks],
      quote: [{ address: USDG as `0x${string}`, symbol: "USDG", decimals: 6 }],
    };
  }
  const t = CONTRACTS.testnet.testToken;
  return {
    base: [{ address: TESTNET_WETH as `0x${string}`, symbol: "WETH", decimals: 18 }],
    quote: isAddress(t) ? [{ address: t, symbol: "tUSD", decimals: 6 }] : [],
  };
}

async function tokenInfo(addr: string, net: NetKey): Promise<Token | null> {
  try {
    const [symbol, decimals] = await Promise.all([read<string>({ to: addr, abi: ERC20_ABI, fn: "symbol" }, net), read<number>({ to: addr, abi: ERC20_ABI, fn: "decimals" }, net)]);
    return { address: getAddress(addr), symbol: String(symbol).slice(0, 16), decimals: Number(decimals) };
  } catch {
    return null;
  }
}

export function OnChain() {
  const w = useWallet();
  const { open: openWallet } = useWalletModal();
  const net = w.target.key;
  const live = roomLive(net);
  const snap = useChain(net);
  const { list } = useAssets();
  const stocks = useMemo(() => list.filter((a) => a.symbol !== "WETH").map((a) => ({ address: a.address, symbol: a.symbol, decimals: a.decimals })), [list]);
  const [dealId, setDealId] = useState<number | null>(null);

  return (
    <div className="grid gap-8">
      <section className="panel-line flex flex-wrap items-center justify-between gap-4 p-5" data-testid="onchain-status">
        <div className="seg" role="group" aria-label="Network">
          {(["mainnet", "testnet"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={net === k} onClick={() => w.setTarget(k)} data-testid={`net-${k}`}>
              {NETWORKS[k].name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--muted)]">
          <LiveBadge label={`${NETWORKS[net].short} · chain ${NETWORKS[net].id}`} />
          <span>block {snap.data?.block?.toLocaleString("en-US") ?? "…"}</span>
          {live ? (
            <a className="underline" href={`${NETWORKS[net].explorer}/address/${roomOf(net)}`} target="_blank" rel="noreferrer" data-testid="room-link">
              SemvioDealRoom {roomOf(net).slice(0, 6)}…{roomOf(net).slice(-4)}
            </a>
          ) : (
            <span data-testid="room-missing">SemvioDealRoom: not deployed on this network yet</span>
          )}
          {net === "testnet" && snap.data?.wethBacked !== null && snap.data?.wethBacked !== undefined ? <span>testnet WETH {snap.data.wethBacked ? "fully ETH-backed" : "NOT fully backed"}</span> : null}
        </div>
      </section>

      {!live ? (
        <p className="verdict" data-testid="not-deployed">
          The deal room is not deployed on {NETWORKS[net].name} yet. The owner deploys it from a local-only page; until then use Practice mode, which runs the same
          rules with sample counterparties. {NETWORKS[net].test ? "Testnet ETH comes from the faucet linked in the footer." : ""}
        </p>
      ) : null}

      {!w.address ? (
        <div className="verdict flex flex-wrap items-center justify-between gap-3">
          <span>Connect a wallet to open, approve or settle deals. Reading a deal needs no wallet.</span>
          <button type="button" className="btn btn-white" onClick={openWallet}>
            Connect wallet
          </button>
        </div>
      ) : !w.onChain ? (
        <div className="verdict bad flex flex-wrap items-center justify-between gap-3">
          <span>Your wallet is on chain {w.chainId}; this page works on {w.target.name} ({w.target.id}).</span>
          <button type="button" className="btn btn-white" onClick={() => w.switchNetwork()}>
            Switch to {w.target.name}
          </button>
        </div>
      ) : null}

      <div className="grid gap-8 min-[1000px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <OpenForm key={net} net={net} live={live} stocks={stocks} onOpened={setDealId} />
        <DealPanel net={net} live={live} dealId={dealId} setDealId={setDealId} />
      </div>
    </div>
  );
}

function useTx(net: NetKey) {
  const w = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const send = useCallback(
    async (label: string, to: string, data: `0x${string}`) => {
      if (!w.address) return false;
      setBusy(label);
      setMsg(null);
      try {
        await simulate(w.address, to, data, net);
        const hash = await w.sendTransaction({ to, data });
        setMsg({ ok: true, text: `${label}: sent, waiting for the block…`, tx: hash });
        const r = await waitForReceipt(hash, net);
        setMsg({ ok: r.ok, text: r.ok ? `${label}: confirmed in block ${r.blockNumber.toLocaleString("en-US")}.` : `${label}: the transaction reverted.`, tx: hash });
        w.refreshBalance();
        return r.ok;
      } catch (e) {
        setMsg({ ok: false, text: explain(e) });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [w, net],
  );
  return { busy, msg, send, setMsg };
}

function Msg({ msg, net }: { msg: { ok: boolean; text: string; tx?: string } | null; net: NetKey }) {
  if (!msg) return null;
  return (
    <p className={`verdict mt-3 ${msg.ok ? "ok" : "bad"}`} role="status" data-testid="tx-msg">
      {msg.text}
      {msg.tx ? (
        <>
          {" "}
          <a className="underline" href={explorerTx(msg.tx, net)} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </>
      ) : null}
    </p>
  );
}

function TokenPick({ label, options, value, onChange, net, testid }: { label: string; options: Token[]; value: Token | null; onChange: (t: Token | null) => void; net: NetKey; testid: string }) {
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const known = options.find((o) => same(o.address, value?.address));
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="inp"
        value={known ? known.address : value ? "custom" : ""}
        onChange={(e) => {
          if (e.target.value === "custom") onChange(null);
          else onChange(options.find((o) => o.address === e.target.value) ?? null);
        }}
        data-testid={testid}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.address} value={o.address}>
            {o.symbol} · {o.address.slice(0, 6)}…{o.address.slice(-4)}
          </option>
        ))}
        <option value="custom">Other ERC-20 address…</option>
      </select>
      {!known ? (
        <span className="flex gap-2">
          <input className="inp" placeholder="0x… token address" value={custom} onChange={(e) => setCustom(e.target.value.trim())} data-testid={`${testid}-custom`} />
          <button
            type="button"
            className="btn btn-dark"
            onClick={async () => {
              setErr(null);
              if (!isAddress(custom)) return setErr("Not an address.");
              const t = await tokenInfo(custom, net);
              if (!t) return setErr("No ERC-20 answered symbol() and decimals() at that address on this network.");
              onChange(t);
            }}
          >
            Read
          </button>
        </span>
      ) : null}
      {value && !known ? <small className="text-[11px] text-[var(--amber)]">Read from chain: {value.symbol}, {value.decimals} decimals. Not on Semvio&apos;s checked list: verify it yourself.</small> : null}
      {err ? <small className="text-[11px] text-[var(--red)]">{err}</small> : null}
    </label>
  );
}

function OpenForm({ net, live, stocks, onOpened }: { net: NetKey; live: boolean; stocks: Token[]; onOpened: (id: number) => void }) {
  const w = useWallet();
  const { busy, msg, send } = useTx(net);
  const opts = presets(net, stocks);
  // A link from the board or a template prefills the form: ?side=&cp=&base=&amountRaw=&priceRaw= (raw base units / USDG units).
  const [pre] = useState(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    return q.get("base") ? q : null;
  });
  const [iSell, setISell] = useState(pre ? pre.get("side") !== "buy" : true);
  const [cp, setCp] = useState(pre && isAddress(pre.get("cp") ?? "") ? (pre.get("cp") as string) : "");
  const [base, setBase] = useState<Token | null>(() => (pre ? (opts.base.find((t) => same(t.address, pre.get("base"))) ?? opts.base[0] ?? null) : (opts.base[0] ?? null)));
  const [quote, setQuote] = useState<Token | null>(opts.quote[0] ?? null);
  const [amountText, setAmount] = useState(() => {
    const raw = pre?.get("amountRaw");
    return raw && /^\d+$/.test(raw) && base ? fromUnits(BigInt(raw), base.decimals, base.decimals).replace(/,/g, "") : "";
  });
  const [grossText, setGross] = useState(() => {
    const a = pre?.get("amountRaw");
    const p = pre?.get("priceRaw");
    if (!a || !p || !/^\d+$/.test(a) || !/^\d+$/.test(p) || !base) return "";
    return fromUnits((BigInt(p) * BigInt(a)) / 10n ** BigInt(base.decimals), 6, 6).replace(/,/g, "");
  });
  const [feeText, setFee] = useState("0");
  const [feeTo, setFeeTo] = useState("");
  const [dealHours, setDealHours] = useState("72");
  const [offerHours, setOfferHours] = useState("12");
  const [agent, setAgent] = useState("");
  const [note, setNote] = useState("");
  const [allowance, setAllowance] = useState<bigint | null>(null);

  const feeBps = Math.round(Number(feeText || "0") * 100);
  const amount = base ? toUnits(amountText, base.decimals) : null;
  const gross = quote ? toUnits(grossText, quote.decimals) : null;
  const pullToken = iSell ? base : quote;
  const pullAmount = iSell ? amount : gross;

  const refreshAllowance = useCallback(async () => {
    if (!w.address || !pullToken || !live) return setAllowance(null);
    try {
      setAllowance(await read<bigint>({ to: pullToken.address, abi: ERC20_ABI, fn: "allowance", args: [w.address, roomOf(net)] }, net));
    } catch {
      setAllowance(null);
    }
  }, [w.address, pullToken, live, net]);
  useEffect(() => {
    const t = window.setTimeout(() => void refreshAllowance(), 0);
    return () => window.clearTimeout(t);
  }, [refreshAllowance]);

  const problems: string[] = [];
  if (!isAddress(cp)) problems.push("Counterparty: enter their wallet address.");
  else if (same(cp, w.address)) problems.push("The counterparty must be another wallet.");
  if (!base || !quote) problems.push("Choose both tokens.");
  else if (same(base.address, quote.address)) problems.push("The two tokens must differ.");
  if (!amount) problems.push(`Amount of ${base?.symbol ?? "the asset"}: a positive number with at most ${base?.decimals ?? 18} decimals.`);
  if (!gross) problems.push(`Total price in ${quote?.symbol ?? "the quote token"}: a positive number.`);
  if (!(feeBps >= 0 && feeBps <= MAX_FEE_BPS)) problems.push("Fee: 0 to 1 %.");
  if (feeBps > 0 && !isAddress(feeTo)) problems.push("A fee needs a recipient address (a third party, not you or the counterparty).");
  if (agent && !isAddress(agent)) problems.push("Agent: a wallet address, or leave empty.");
  const dh = Number(dealHours);
  const oh = Number(offerHours);
  if (!(dh >= 1 && dh <= 720)) problems.push("Deal window: 1 to 720 hours.");
  if (!(oh >= 1 && oh <= dh)) problems.push("Offer validity: at least 1 hour and not longer than the deal window.");

  const fee = gross ? feeOf(gross, feeBps) : 0n;
  const needsAllowance = allowance !== null && pullAmount !== null && allowance < pullAmount;

  const openDeal = async () => {
    if (problems.length || !base || !quote || !amount || !gross || !w.address) return;
    const now = nowS();
    const p = {
      counterparty: getAddress(cp),
      makerIsSeller: iSell,
      baseToken: base.address,
      quoteToken: quote.address,
      baseAmount: amount,
      validUntil: BigInt(now + Math.round(dh * 3600)),
      ref: noteHashOf(`semvio:${w.address}:${now}`),
      makerAgent: agent ? getAddress(agent) : ZERO_ADDR,
      approve: true,
    };
    const t: Terms = { quoteAmount: gross, feeBps, feeRecipient: feeBps ? getAddress(feeTo) : ZERO_ADDR, offerValidUntil: now + Math.round(oh * 3600), noteHash: noteHashOf(note) };
    const data = encodeFunctionData({ abi: ROOM_ABI, functionName: "openDeal", args: [p, { ...t, offerValidUntil: BigInt(t.offerValidUntil) }] });
    if (await send("Open deal", roomOf(net), data)) {
      const ids = await read<bigint[]>({ to: roomOf(net), abi: ROOM_ABI, fn: "dealsOfPage", args: [w.address, 0n, 1n] }, net).catch(() => []);
      if (ids.length) onOpened(Number(ids[0]));
    }
  };

  return (
    <section className="panel-line content-start p-5" data-testid="open-form">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h-card">Open a deal</h2>
        <StatusBadge status="Prototype" />
      </div>
      <p className="mt-1 text-[12px] text-[var(--muted)]">You propose revision 1 and approve it. The counterparty reviews, counters or approves.</p>
      <div className="mt-5 grid gap-4">
        <div className="seg" role="group" aria-label="Your side">
          <button type="button" aria-pressed={iSell} onClick={() => setISell(true)} data-testid="oc-sell">
            I sell
          </button>
          <button type="button" aria-pressed={!iSell} onClick={() => setISell(false)} data-testid="oc-buy">
            I buy
          </button>
        </div>
        <label className="field">
          <span>Counterparty wallet</span>
          <input className="inp" placeholder="0x…" value={cp} onChange={(e) => setCp(e.target.value.trim())} data-testid="oc-cp" />
        </label>
        <TokenPick label="Asset" options={opts.base} value={base} onChange={setBase} net={net} testid="oc-base" />
        <TokenPick label="Paid in" options={opts.quote} value={quote} onChange={setQuote} net={net} testid="oc-quote" />
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Amount ({base?.symbol ?? "asset"})</span>
            <input className="inp" inputMode="decimal" value={amountText} onChange={(e) => setAmount(e.target.value)} data-testid="oc-amount" />
          </label>
          <label className="field">
            <span>Total price ({quote?.symbol ?? "quote"}, gross)</span>
            <input className="inp" inputMode="decimal" value={grossText} onChange={(e) => setGross(e.target.value)} data-testid="oc-gross" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Agreed fee (%)</span>
            <input className="inp" inputMode="decimal" value={feeText} onChange={(e) => setFee(e.target.value)} data-testid="oc-fee" />
          </label>
          <label className="field">
            <span>Fee recipient</span>
            <input className="inp" placeholder={feeBps ? "0x…" : "no fee"} disabled={!feeBps} value={feeTo} onChange={(e) => setFeeTo(e.target.value.trim())} data-testid="oc-feeto" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Deal window (hours)</span>
            <input className="inp" inputMode="numeric" value={dealHours} onChange={(e) => setDealHours(e.target.value)} />
          </label>
          <label className="field">
            <span>Offer valid (hours)</span>
            <input className="inp" inputMode="numeric" value={offerHours} onChange={(e) => setOfferHours(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Your agent (optional: may propose revisions for you, never approve)</span>
          <input className="inp" placeholder="0x… or empty" value={agent} onChange={(e) => setAgent(e.target.value.trim())} />
        </label>
        <label className="field">
          <span>Note (only its hash goes on chain)</span>
          <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {gross && quote ? (
          <dl className="kv">
            <dt>Buyer pays</dt>
            <dd>{fromUnits(gross, quote.decimals)} {quote.symbol}</dd>
            <dt>Fee {feeBps / 100} %</dt>
            <dd>{fromUnits(fee, quote.decimals)} {quote.symbol}</dd>
            <dt>Seller receives</dt>
            <dd className="text-[var(--mint)]">{fromUnits(gross - fee, quote.decimals)} {quote.symbol}</dd>
          </dl>
        ) : null}
        {problems.length && (cp || amountText || grossText) ? (
          <ul className="grid gap-1 text-[11.5px] text-[var(--amber)]">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {needsAllowance && pullToken && pullAmount ? (
          <button
            type="button"
            className="btn btn-dark"
            disabled={!live || !w.onChain || Boolean(busy)}
            onClick={async () => {
              await send(`Allow ${pullToken.symbol}`, pullToken.address, encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [roomOf(net), pullAmount] }));
              await refreshAllowance();
            }}
            data-testid="oc-allow"
          >
            {busy?.startsWith("Allow") ? "Confirm in wallet…" : `Allow the room to move ${fromUnits(pullAmount, pullToken.decimals)} ${pullToken.symbol}`}
          </button>
        ) : null}
        <button type="button" className="btn btn-white btn-lg" disabled={!live || !w.onChain || problems.length > 0 || Boolean(busy)} onClick={openDeal} data-testid="oc-open">
          {busy === "Open deal" ? "Confirm in wallet…" : "Open deal and approve revision 1"}
        </button>
        {!live ? <p className="text-[11.5px] text-[var(--faint)]">Disabled: the room is not deployed on this network yet.</p> : null}
        <Msg msg={msg} net={net} />
      </div>
    </section>
  );
}

function DealPanel({ net, live, dealId, setDealId }: { net: NetKey; live: boolean; dealId: number | null; setDealId: (n: number | null) => void }) {
  const w = useWallet();
  const [idText, setIdText] = useState("");
  const [data, setData] = useState<DealApi | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { busy, msg, send } = useTx(net);
  const [maxGrossText, setMaxGross] = useState("");
  const [minNetText, setMinNet] = useState("");
  const [bits, setBits] = useState<bigint | null>(null);
  const [counterText, setCounter] = useState("");
  const [allow, setAllow] = useState<bigint | null>(null);

  useEffect(() => {
    if (!dealId || !live) return;
    let dead = false;
    fetch(`/api/deal?net=${net}&id=${dealId}${tick ? "&fresh=1" : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => null)) as (DealApi & { error?: string }) | null;
        if (dead) return;
        setErr(null);
        if (!r.ok || !b) {
          setData(null);
          setErr(b?.error ?? `Could not read deal ${dealId}.`);
        } else setData(b);
      })
      .catch(() => !dead && setErr("Network error."));
    return () => {
      dead = true;
    };
  }, [dealId, net, live, tick]);

  const d = data?.deal;
  const me = w.address;
  const iSeller = same(me, d?.seller);
  const iBuyer = same(me, d?.buyer);
  const qd = d?.quoteToken.decimals ?? 18;
  const bd = d?.baseToken.decimals ?? 18;
  const qs = d?.quoteToken.symbol ?? "quote";

  const runCheck = useCallback(async () => {
    if (!d) return;
    const mg = maxGrossText ? toUnits(maxGrossText, qd) ?? 0n : 0n;
    const mn = minNetText ? toUnits(minNetText, qd) ?? 0n : 0n;
    try {
      setBits(await read<bigint>({ to: roomOf(net), abi: ROOM_ABI, fn: "checkDeal", args: [BigInt(d.id), mg, mn] }, net));
    } catch {
      setBits(null);
    }
    if (me && (iSeller || iBuyer)) {
      const tok = iSeller ? d.baseToken.address : d.quoteToken.address;
      setAllow(await read<bigint>({ to: tok, abi: ERC20_ABI, fn: "allowance", args: [me, roomOf(net)] }, net).catch(() => null));
    }
  }, [d, maxGrossText, minNetText, qd, net, me, iSeller, iBuyer]);
  useEffect(() => {
    const t = window.setTimeout(() => void runCheck(), 0);
    return () => window.clearTimeout(t);
  }, [runCheck]);

  const after = (ok: boolean) => {
    if (ok) setTick((t) => t + 1);
  };

  const now = nowS();
  const model: CardModel | null = d
    ? {
        title: `Deal #${d.id} · ${d.baseToken.symbol ?? "?"} / ${qs} · ${NETWORKS[net].name}`,
        base: { symbol: d.baseToken.symbol ?? "asset", decimals: bd },
        quote: { symbol: qs, decimals: qd },
        amount: BigInt(d.baseAmount),
        gross: BigInt(d.terms.quoteAmount),
        fee: feeOf(BigInt(d.terms.quoteAmount), d.terms.feeBps),
        feeBps: d.terms.feeBps,
        net: BigInt(d.terms.quoteAmount) - feeOf(BigInt(d.terms.quoteAmount), d.terms.feeBps),
        feeRecipient: d.terms.feeBps ? d.terms.feeRecipient : null,
        offerValidUntil: d.terms.offerValidUntil,
        validUntil: d.validUntil,
        status: d.status,
        revision: d.revision,
        hash: d.lastHash,
        seller: { label: iSeller ? "you" : `${d.seller.slice(0, 6)}…${d.seller.slice(-4)}`, approved: d.sellerApproved === d.revision },
        buyer: { label: iBuyer ? "you" : `${d.buyer.slice(0, 6)}…${d.buyer.slice(-4)}`, approved: d.buyerApproved === d.revision },
        reference: null,
        now,
      }
    : null;

  const room = roomOf(net);
  const enc = (fn: string, args: unknown[]) => encodeFunctionData({ abi: ROOM_ABI, functionName: fn, args } as never);
  const youApproved = d ? (iSeller ? d.sellerApproved === d.revision : iBuyer ? d.buyerApproved === d.revision : false) : false;
  const otherApproved = d ? (iSeller ? d.buyerApproved === d.revision : iBuyer ? d.sellerApproved === d.revision : false) : false;
  const need = d ? (iSeller ? BigInt(d.baseAmount) : BigInt(d.terms.quoteAmount)) : 0n;

  return (
    <section className="grid content-start gap-6" data-testid="deal-panel">
      <div className="panel-line flex flex-wrap items-end gap-3 p-5">
        <label className="field min-w-0 flex-1">
          <span>Load a deal by number</span>
          <input className="inp" inputMode="numeric" placeholder="1" value={idText} onChange={(e) => setIdText(e.target.value)} data-testid="load-id" />
        </label>
        <button type="button" className="btn btn-white" disabled={!live || !/^\d+$/.test(idText)} onClick={() => setDealId(Number(idText))} data-testid="load">
          Load
        </button>
        {dealId ? (
          <button type="button" className="btn btn-dark" onClick={() => setTick((t) => t + 1)}>
            Refresh
          </button>
        ) : null}
      </div>
      {err ? <p className="verdict bad">{err}</p> : null}
      {model && d && data ? (
        <>
          <DealCard m={model} />
          <section className="panel-line p-5" data-testid="oc-checks">
            <h3 className="h-card">Check before you sign</h3>
            <p className="mt-1 text-[12px] text-[var(--muted)]">checkDeal() on the room, as a read. The two limits below are only sent in this read, never written to the chain.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
              <label className="field">
                <span>Buyer budget, max gross ({qs})</span>
                <input className="inp" inputMode="decimal" value={maxGrossText} onChange={(e) => setMaxGross(e.target.value)} />
              </label>
              <label className="field">
                <span>Seller minimum net ({qs})</span>
                <input className="inp" inputMode="decimal" value={minNetText} onChange={(e) => setMinNet(e.target.value)} />
              </label>
            </div>
            {bits === null ? (
              <p className="mt-3 text-[12px] text-[var(--faint)]">Reading…</p>
            ) : bits === 0n ? (
              <p className="verdict ok mt-3" data-testid="oc-bits">Nothing blocks settlement of revision {d.revision}.</p>
            ) : (
              <ul className="mt-3 grid gap-1" data-testid="oc-bits">
                {bitNames(bits).map((n) => (
                  <li key={n} className="verdict bad text-[12.5px]">
                    <b className="font-normal">{BIT_WORDS[n].label}.</b> <span className="text-[var(--muted)]">{BIT_WORDS[n].why}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {(iSeller || iBuyer) && d.status === "Open" ? (
            <section className="panel-line p-5" data-testid="oc-actions">
              <h3 className="h-card">You are the {iSeller ? "seller" : "buyer"}</h3>
              {allow !== null && allow < need ? (
                <button
                  type="button"
                  className="btn btn-dark mt-4"
                  disabled={Boolean(busy) || !w.onChain}
                  onClick={async () => after(await send("Allow token", iSeller ? d.baseToken.address : d.quoteToken.address, encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [room, need] })))}
                  data-testid="oc-allow-deal"
                >
                  Allow the room to move {fromUnits(need, iSeller ? bd : qd)} {iSeller ? d.baseToken.symbol : qs}
                </button>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {!youApproved ? (
                  <button
                    type="button"
                    className="btn btn-white"
                    disabled={Boolean(busy) || !w.onChain}
                    onClick={async () => after(await send(otherApproved ? "Approve and settle" : "Approve", room, enc(otherApproved ? "approveAndSettle" : "approve", [BigInt(d.id), d.revision, d.lastHash])))}
                    data-testid="oc-approve"
                  >
                    {otherApproved ? `Approve revision ${d.revision} and settle` : `Approve revision ${d.revision}`}
                  </button>
                ) : (
                  <button type="button" className="btn btn-dark" disabled={Boolean(busy) || !w.onChain} onClick={async () => after(await send("Withdraw approval", room, enc("withdrawApproval", [BigInt(d.id)])))} data-testid="oc-withdraw">
                    Withdraw my approval
                  </button>
                )}
                {youApproved && otherApproved ? (
                  <button type="button" className="btn btn-white" disabled={Boolean(busy) || !w.onChain} onClick={async () => after(await send("Settle", room, enc("settle", [BigInt(d.id), d.revision, d.lastHash])))} data-testid="oc-settle">
                    Settle
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" disabled={Boolean(busy) || !w.onChain} onClick={async () => after(await send("Cancel", room, enc("cancel", [BigInt(d.id)])))} data-testid="oc-cancel">
                  Cancel deal
                </button>
              </div>
              <div className="mt-5 grid gap-2 min-[560px]:grid-cols-[minmax(0,1fr)_auto]">
                <label className="field">
                  <span>Counter: new gross price ({qs}), same fee, offer valid 12 h</span>
                  <input className="inp" inputMode="decimal" value={counterText} onChange={(e) => setCounter(e.target.value)} data-testid="oc-counter-input" />
                </label>
                <button
                  type="button"
                  className="btn btn-dark self-end"
                  disabled={Boolean(busy) || !w.onChain}
                  data-testid="oc-counter"
                  onClick={async () => {
                    const g = toUnits(counterText, qd);
                    if (!g) return;
                    const until = Math.min(d.validUntil, nowS() + 12 * 3600);
                    const t = { quoteAmount: g, feeBps: d.terms.feeBps, feeRecipient: d.terms.feeBps ? d.terms.feeRecipient : ZERO_ADDR, offerValidUntil: BigInt(until), noteHash: noteHashOf(`Counter ${counterText}`) };
                    after(await send("Propose revision", room, enc("proposeRevision", [BigInt(d.id), d.revision, t, true])));
                  }}
                >
                  Propose and approve it
                </button>
              </div>
              <Msg msg={msg} net={net} />
            </section>
          ) : (
            <Msg msg={msg} net={net} />
          )}
          <Timeline
            intact={data.scanned.complete ? data.chainIntact : null}
            label={data.scanned.complete ? "Re-hashed from the room's logs with the site's copy of the fee math, and compared with what the room stores." : "Part of the log range could not be read; the chain check is skipped."}
            items={data.revisions.map((r) => {
              const g = BigInt(r.terms.quoteAmount);
              const by = same(r.proposer, d.seller) ? "Seller" : same(r.proposer, d.buyer) ? "Buyer" : r.sellerSide ? "Seller's agent" : "Buyer's agent";
              return { n: r.n, by, changes: [`${fromUnits(g, qd)} ${qs}`, `fee ${r.terms.feeBps / 100} %`], hash: r.hash, ok: r.hashOk, link: explorerTx(r.tx, net), current: r.n === d.revision };
            })}
          />
          <section className="panel-line p-5">
            <h3 className="h-card">Events from the room</h3>
            <ul className="mt-3 grid gap-1 text-[12px] text-[var(--ink-2)]" data-testid="oc-events">
              {data.events.map((e, i) => (
                <li key={i}>
                  <span className="text-[var(--faint)]">block {e.block.toLocaleString("en-US")} · </span>
                  {e.name}
                  {e.name === "Settled" ? <span className="text-[var(--mint)]"> · proof of settlement</span> : null} ·{" "}
                  <a className="underline" href={explorerTx(e.tx, net)} target="_blank" rel="noreferrer">
                    tx
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : !err ? (
        <section className="prism grid min-h-[360px] place-items-center">
          <div className="window my-10 max-w-[420px] p-6 text-[13px]">
            <p className="h-card">No deal loaded</p>
            <p className="mt-2 text-[var(--ink-2)]">Open a deal on the left, or load one by its number. The card, the checks and the full revision history are read from the room.</p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
