import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { decodeCred, encodeCred, sessionMessage, verifySession } from "./session";
import { QUOTA, thresholdOf, tierOf } from "./tier";
import { deriveAlerts } from "../alerts/derive";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const NOW = 1_800_000_000;
const ALLOWED = [{ domain: "semvio.xyz", uri: "https://semvio.xyz" }, { domain: "www.semvio.xyz", uri: "https://www.semvio.xyz" }];
const fields = (o: Partial<Parameters<typeof sessionMessage>[0]> = {}) => ({ domain: "semvio.xyz", uri: "https://semvio.xyz", wallet: acct.address, chainId: 4663, issuedAt: NOW, expiresAt: NOW + 3600, nonce: "a1b2c3d4e5f60718", ...o });
async function cred(o = {}) {
  const message = sessionMessage(fields(o));
  return { message, signature: await acct.signMessage({ message }) };
}

test("a good SIWE session verifies, and survives the header round trip", async () => {
  const c = await cred();
  assert.match(c.message, /^semvio\.xyz wants you to sign in with your Ethereum account:\n0x/);
  const r = await verifySession(decodeCred(encodeCred(c)), ALLOWED, NOW + 10);
  assert.ok(r.ok && r.wallet === acct.address.toLowerCase());
});

test("foreign domain, spoofed host, non-SIWE text, wrong chain, expired, over 4 h, future, forged, edited and signed-out sessions are refused", async () => {
  // A phishing site's domain: refused whatever the request's Host header says (the server never reads it).
  const foreign = await verifySession(await cred({ domain: "evil.example", uri: "https://evil.example" }), ALLOWED, NOW);
  assert.ok(!foreign.ok && /accepted only for semvio.xyz/.test(foreign.reason));
  // Right domain, wrong URI (as a spoofed Host could suggest): refused.
  assert.equal((await verifySession(await cred({ uri: "https://evil.example" }), ALLOWED, NOW)).ok, false);
  // A localhost session is refused when localhost is not on the allowlist (production).
  assert.equal((await verifySession(await cred({ domain: "localhost:6740", uri: "http://localhost:6740" }), ALLOWED, NOW)).ok, false);
  const plain = "I agree to start a session on semvio.xyz";
  assert.equal((await verifySession({ message: plain, signature: await acct.signMessage({ message: plain }) }, ALLOWED, NOW)).ok, false);
  const wrongChain = await verifySession(await cred({ chainId: 1 }), ALLOWED, NOW);
  assert.ok(!wrongChain.ok && /chain 1/.test(wrongChain.reason));
  const c = await cred();
  const expired = await verifySession(c, ALLOWED, NOW + 3600);
  assert.ok(!expired.ok && /expired/.test(expired.reason));
  assert.equal((await verifySession(c, ALLOWED, NOW + 90_000)).ok, false);
  const long = await verifySession(await cred({ expiresAt: NOW + 4 * 3600 + 1 }), ALLOWED, NOW);
  assert.ok(!long.ok && /4 hours/.test(long.reason));
  assert.ok((await verifySession(await cred({ expiresAt: NOW + 4 * 3600 }), ALLOWED, NOW)).ok);
  assert.equal((await verifySession(await cred({ issuedAt: NOW + 3600, expiresAt: NOW + 7200 }), ALLOWED, NOW)).ok, false);
  const other = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const m = sessionMessage(fields());
  assert.equal((await verifySession({ message: m, signature: await other.signMessage({ message: m }) }, ALLOWED, NOW)).ok, false);
  const edited = c.message.replace("Version: 1", "Version: 1\nResources: x");
  assert.equal((await verifySession({ message: edited, signature: c.signature }, ALLOWED, NOW)).ok, false);
  const out = await verifySession(c, ALLOWED, NOW, async (n) => n === "a1b2c3d4e5f60718");
  assert.ok(!out.ok && /signed out/.test(out.reason));
  assert.equal((await verifySession(null, ALLOWED, NOW)).ok, false);
});

test("tier: exactly 0.1 % is a holder, one unit under is not, zero supply has no holders", () => {
  const supply = 1_000_000n * 10n ** 18n;
  const t = supply / 1000n;
  assert.equal(tierOf(t, supply), "holder");
  assert.equal(tierOf(t - 1n, supply), "free");
  assert.equal(tierOf(0n, 0n), "free");
  assert.equal(tierOf(5n, 0n), "free");
  assert.equal(thresholdOf(1001n), 2n);
  assert.equal(tierOf(1n, 1001n), "free");
  assert.equal(tierOf(2n, 1001n), "holder");
  assert.ok(QUOTA.holder.liveRequests > QUOTA.free.liveRequests && QUOTA.free.templates === 0);
});

test("alerts come from the other side's events only, plus deals about to expire", () => {
  const me = "0x00000000000000000000000000000000000000aa";
  const them = "0x00000000000000000000000000000000000000bb";
  const deals = [
    { id: 1, seller: me, buyer: them, status: "Open", validUntil: NOW + 86_400, offerValidUntil: NOW + 3000, revision: 2 },
    { id: 2, seller: them, buyer: me, status: "Settled", validUntil: NOW + 86_400, offerValidUntil: NOW + 10, revision: 1 },
  ];
  const L = (name: string, block: number, args: Record<string, unknown>) => ({ name, block, tx: `0x${block}`, logIndex: 0, args });
  const logs = [
    L("RevisionProposed", 10, { id: 1, revision: 1, proposer: me, sellerSide: true }),
    L("RevisionProposed", 11, { id: 1, revision: 2, proposer: "0x00000000000000000000000000000000000000cc", sellerSide: false }),
    L("Approved", 12, { id: 1, revision: 2, party: them }),
    L("Approved", 13, { id: 1, revision: 2, party: me }),
    L("Settled", 14, { id: 2, revision: 1 }),
    L("Cancelled", 15, { id: 9, by: them }),
  ];
  const a = deriveAlerts(me, deals, logs, NOW);
  assert.deepEqual(a.map((x) => x.kind), ["expiring", "settled", "approved", "revision"]);
  assert.match(a[0].text, /offer ends in 50 min/);
});

import { boardOrder, canPost, matchesFor, validateRequest, validateTeam, type BoardRequest } from "./board";

const R = (o: Partial<BoardRequest>): BoardRequest => ({ id: Math.random().toString(36).slice(2), wallet: "0x" + "1".repeat(40), side: "sell", asset: { symbol: "WETH", address: "0x" + "e".repeat(40), decimals: 18 }, amount: "1000000000000000000", price: "1650000000", note: "", createdAt: NOW, validUntil: NOW + 3600, tier: "free", tierBlock: 1, ...o });

test("quota: the free tier stops at 3 live requests with the numbers, holders at 20, expired ones do not count", () => {
  const w = "0x" + "1".repeat(40);
  const three = [R({ wallet: w }), R({ wallet: w }), R({ wallet: w })];
  const no = canPost(three, w, "free", NOW);
  assert.ok(!no.ok && /3 live requests, the free tier allows 3/.test(no.error));
  assert.ok(canPost(three, w, "holder", NOW).ok);
  assert.ok(canPost(three.map((r) => ({ ...r, validUntil: NOW - 1 })), w, "free", NOW).ok);
});

test("board order and matching put holders first, then size, then price", () => {
  const mine = R({ wallet: "0x" + "2".repeat(40), side: "buy", price: "1700000000" });
  const a = R({ wallet: "0x" + "3".repeat(40), price: "1690000000", tier: "free" });
  const b = R({ wallet: "0x" + "4".repeat(40), price: "1699000000", tier: "holder" });
  const c = R({ wallet: "0x" + "5".repeat(40), price: "1800000000", tier: "holder" }); // does not cross
  const d = R({ wallet: "0x" + "6".repeat(40), price: "1600000000", tier: "free" });
  const m = matchesFor(mine, [mine, a, b, c, d], NOW);
  assert.deepEqual(m.map((x) => x.request.id), [b.id, d.id, a.id]);
  assert.equal(boardOrder([a, b])[0].id, b.id);
  assert.ok(validateRequest({ side: "buy", asset: a.asset, amount: "1", price: "2", validHours: 24 }).ok);
  assert.ok(!validateRequest({ side: "buy", asset: a.asset, amount: "0", price: "2", validHours: 24 }).ok);
  assert.ok(!validateTeam("0x" + "1".repeat(40), "t", Array.from({ length: 11 }, (_, i) => "0x" + String(i).padStart(40, "a")), 10).ok);
});

test("a full board refuses the new post and keeps every live request", () => {
  const others = Array.from({ length: 5 }, (_, i) => R({ wallet: "0x" + String(i).padStart(40, "7") }));
  const r = canPost(others, "0x" + "9".repeat(40), "holder", NOW, 5);
  assert.ok(!r.ok && "full" in r && /board is full \(5 live requests, cap 5\)/.test(r.error));
  assert.equal(others.length, 5);
  assert.ok(canPost(others.map((x, i) => (i === 0 ? { ...x, validUntil: NOW - 1 } : x)), "0x" + "9".repeat(40), "holder", NOW, 5).ok);
});

test("holder reserve: free posts stop before the last quarter of slots, holders can still post", () => {
  const others = Array.from({ length: 6 }, (_, i) => R({ wallet: "0x" + String(i).padStart(40, "7") }));
  const free = canPost(others, "0x" + "9".repeat(40), "free", NOW, 8);
  assert.ok(!free.ok && /kept for holders/.test(free.error));
  assert.ok(canPost(others, "0x" + "9".repeat(40), "holder", NOW, 8).ok);
});
