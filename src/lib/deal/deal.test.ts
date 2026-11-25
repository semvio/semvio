import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BITS, bit, bitNames, maskOf } from "./bits";
import { dealHash, feeOf, fromUnits, limitBits, minGrossForNet, netOf, revisionHash, termsBits, toUnits, ZERO_ADDR } from "./math";
import { keccak256, toBytes } from "viem";
import { bounds, negotiate } from "./agent";
import { deskBook, matchDesks } from "./book";
import { approve, chainIntact, counter, current, openPractice, practiceBits, settle, termsOf, withdraw, cancel, YOU } from "./practice";

const SOL = readFileSync(new URL("../../../contracts/src/SemvioFeeMath.sol", import.meta.url), "utf8");

test("reason bits match SemvioFeeMath.sol one for one", () => {
  const found = [...SOL.matchAll(/R_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], Number(m[2])] as const);
  assert.equal(found.length, Object.keys(BITS).length);
  for (const [name, n] of found) assert.equal(BITS[name as keyof typeof BITS], n, name);
  assert.match(SOL, /MAX_FEE_BPS = 100;/);
});

test("hashes match the Solidity vectors (contracts/test/SemvioHashVectors.t.sol)", () => {
  const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
  const dh = dealHash({ chainId: 4663, room: A(0x1234), id: 7n, seller: A(0xa11ce), buyer: A(0xb0b), baseToken: A(0xba5e), quoteToken: A(0x0d0d), baseAmount: 5n * 10n ** 18n, validUntil: 1_800_000_000, ref: keccak256(toBytes("ref")) });
  assert.equal(dh, "0x6ad95b10a49e1e544d2e70be65e9ceab1e2faf4f5ef73e3ccf1885167bd746f7");
  const rh = revisionHash(dh, 7n, 3, A(0xa11ce), true, { quoteAmount: 15_000_000_000n, feeBps: 25, feeRecipient: A(0xfee), offerValidUntil: 1_800_003_600, noteHash: keccak256(toBytes("note")) });
  assert.equal(rh, "0x8c60ba00e67cd5354cf41b0f88e09d6c8222d8f70f7b133c0e36ba4d78721bbe");
});

test("fee rounds down, net + fee = gross, minimum gross is the smallest", () => {
  assert.equal(feeOf(15_000_000_000n, 25), 37_500_000n);
  assert.equal(feeOf(399n, 25), 0n);
  for (const bps of [0, 1, 10, 25, 50, 99, 100])
    for (const net of [1n, 7n, 999_999n, 1_000_000n, 123_456_789_012n]) {
      const g = minGrossForNet(net, bps);
      assert.ok(netOf(g, bps) >= net);
      assert.ok(netOf(g - 1n, bps) < net);
      assert.equal(feeOf(g, bps) + netOf(g, bps), g);
    }
});

test("terms and limit checks name every problem", () => {
  const t = { quoteAmount: 0n, feeBps: 101, feeRecipient: ZERO_ADDR, offerValidUntil: 10, noteHash: ZERO_ADDR as `0x${string}` };
  assert.deepEqual(bitNames(termsBits(t, YOU, ZERO_ADDR, 100, 50)), ["FEE_OVER_CAP", "BAD_FEE_RECIPIENT", "ZERO_AMOUNT", "OFFER_WINDOW"]);
  assert.equal(limitBits(100n, 0, 99n, 101n), maskOf("OVER_BUDGET", "UNDER_MIN_NET"));
  assert.equal(limitBits(100n, 100, 0n, 99n), 0n);
  assert.equal(limitBits(100n, 100, 0n, 100n), bit("UNDER_MIN_NET"));
});

test("units convert exactly", () => {
  assert.equal(toUnits("1,234.5", 6), 1_234_500_000n);
  assert.equal(toUnits("0.0000001", 6), null);
  assert.equal(toUnits("abc", 6), null);
  assert.equal(fromUnits(1_234_500_000n, 6), "1,234.5");
});

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(Math.round(n * 1e6));

test("agents agree inside both limits and never cross their own", () => {
  for (const [bl, sl, fee] of [[3010, 2990, 0], [3000, 3000, 25], [3200, 2800, 100], [3001, 2999, 10]] as const) {
    const out = negotiate({ buyerLimit: usd(bl), sellerLimit: usd(sl), amount: 2n * E18, baseDecimals: 18, feeBps: fee, quoteDecimals: 6, quoteSymbol: "USDG" });
    const b = bounds(usd(bl), usd(sl), 2n * E18, 18, fee);
    assert.equal(out.agreed, b.overlap);
    for (const s of out.steps) assert.ok(s.by === "buyer" ? s.gross <= b.maxGross : s.gross >= b.minGross);
    if (out.finalGross !== null) assert.ok(out.finalGross <= b.maxGross && netOf(out.finalGross, fee) >= b.minNet);
    // deterministic
    assert.deepEqual(negotiate({ buyerLimit: usd(bl), sellerLimit: usd(sl), amount: 2n * E18, baseDecimals: 18, feeBps: fee, quoteDecimals: 6, quoteSymbol: "USDG" }), out);
  }
  const none = negotiate({ buyerLimit: usd(2900), sellerLimit: usd(3000), amount: E18, baseDecimals: 18, feeBps: 0, quoteDecimals: 6, quoteSymbol: "USDG" });
  assert.equal(none.agreed, false);
  assert.match(none.summary, /gap 100 USDG/);
});

const WETH = { symbol: "WETH", name: "Wrapped Ether", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as const, decimals: 18 };
const USDG = { symbol: "USDG", name: "Global Dollar", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as const, decimals: 6 };

test("matching explains each desk and the practice deal settles only the revision both approved", () => {
  const desks = deskBook(usd(3000), E18, 1n);
  const cands = matchDesks({ side: "buy", amount: E18, limitPerUnit: usd(3010), validHours: 24, feeBps: 0, decimals: 18, quoteDecimals: 6, quoteSymbol: "USDG", desks });
  assert.ok(cands[0].ok);
  assert.ok(cands.some((c) => !c.ok && c.reasons.some((r) => /No price overlap|at most/.test(r))));
  const now = 1_800_000_000;
  let d = openPractice(1, { side: "buy", asset: WETH, quote: USDG, amount: E18, limitPerUnit: usd(3010), validHours: 24, feeBps: 0, feeRecipient: ZERO_ADDR }, cands[0].desk, now);
  assert.ok(d.revisions.length >= 1);
  assert.ok(chainIntact(d));
  assert.equal(practiceBits(d, now + 10), bit("BUYER_NOT_APPROVED"));
  // Settling before you approve is refused.
  assert.equal(settle(d, now + 10).bits, bit("BUYER_NOT_APPROVED"));
  d = approve(d, false, "You", now + 11);
  // A withdrawn approval blocks settlement again.
  assert.equal(practiceBits(withdraw(d, now + 12), now + 12), bit("BUYER_NOT_APPROVED"));
  // A counter voids both approvals; the desk re-approves if it is inside its limit.
  const c = counter(d, termsOf(current(d)).quoteAmount - 1_000_000n, 0, ZERO_ADDR, 2, "a dollar less", now + 13);
  assert.equal(c.refused, 0n);
  assert.ok(chainIntact(c.deal));
  assert.ok(practiceBits(c.deal, now + 14) & bit("BUYER_NOT_APPROVED"));
  const s = settle(d, now + 15);
  assert.equal(s.bits, 0n);
  assert.equal(s.deal.status, "settled");
  assert.equal(s.result!.net + s.result!.fee, s.result!.gross);
  // A tampered revision breaks the chain.
  const bad = { ...d, revisions: d.revisions.map((r, i) => (i === 0 ? { ...r, terms: { ...r.terms, quoteAmount: "1" } } : r)) };
  assert.equal(chainIntact(bad), false);
  assert.equal(cancel(d, now).status, "cancelled");
  // Expired offer: nothing settles.
  assert.ok(settle(d, now + 7 * 3600).bits & bit("OFFER_EXPIRED"));
});

test("a counter with bad terms is refused before it is recorded", () => {
  const desks = deskBook(usd(3000), E18, 1n);
  const d = openPractice(2, { side: "sell", asset: WETH, quote: USDG, amount: E18, limitPerUnit: usd(2990), validHours: 24, feeBps: 0, feeRecipient: ZERO_ADDR }, desks[0], 1_800_000_000);
  const c = counter(d, usd(3000), 150, ZERO_ADDR, 1, "", 1_800_000_100);
  assert.equal(c.refused, maskOf("FEE_OVER_CAP", "BAD_FEE_RECIPIENT"));
  assert.equal(c.deal.revisions.length, d.revisions.length);
});
