// Checks behind scripts/verify-deployment.mjs, free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's SemvioDealRoom:
//   - Runtime code is compared byte for byte with src/lib/contracts/artifacts.json (`npm run contracts:artifacts -- --check`
//     proves that file is a fresh forge build). The room has no immutables and no constructor arguments.
//   - The creation transaction is required (no tx => FAIL, never MATCH). It must have succeeded, created exactly the address
//     checked, have no recipient, and carry exactly this build's creation code.
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.

/** Robinhood Chain mainnet and Robinhood Chain Testnet: the room may be deployed on either. */
export const CHAIN_IDS = { 4663: "Robinhood Chain", 46630: "Robinhood Chain Testnet" };
export const NAME = "SemvioDealRoom";

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isTx = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** True when `code` is this build's runtime for `name` (no immutables are expected). */
export function match(ART, name, code) {
  const a = ART[name];
  if (!a || a.immutables.length) return false;
  return String(code).toLowerCase().replace(/^0x/, "") === a.runtime.slice(2);
}

/** input: { room, roomTx, rpc, ART }. Returns { ok, lines }. */
export async function verifyDeployment({ room: guard, roomTx: guardTx, rpc, ART }) {
  const lines = [];
  let failed = false;
  const ok = (m) => lines.push(`OK   ${m}`);
  const fail = (m) => {
    failed = true;
    lines.push(`FAIL ${m}`);
  };
  const done = () => ({ ok: !failed, lines });

  try {
    const id = await rpc("eth_chainId", []);
    const n = Number(BigInt(id));
    if (!CHAIN_IDS[n]) {
      fail(`chain id ${id}, expected 4663 or 46630`);
      return done();
    }
    ok(`chain id ${n} (${CHAIN_IDS[n]})`);
  } catch (e) {
    fail(`chain id unreadable: ${e.message}`);
    return done();
  }
  if (!isAddr(guard)) {
    fail("give --room <address>");
    return done();
  }
  try {
    const c = await rpc("eth_getCode", [guard, "latest"]);
    if (!isHex(c) || c.length <= 2) throw new Error(`no code at ${guard}`);
    if (match(ART, NAME, c)) ok(`${NAME} at ${guard}: runtime matches this build`);
    else fail(`${NAME} at ${guard}: runtime differs from this build`);
  } catch (e) {
    fail(`${NAME}: ${e.message}`);
  }
  if (!isTx(guardTx)) {
    fail(`${NAME}: no valid creation tx given; runtime alone is not a full match`);
    return done();
  }
  try {
    const [t, rc] = await Promise.all([rpc("eth_getTransactionByHash", [guardTx]), rpc("eth_getTransactionReceipt", [guardTx])]);
    if (!t || !rc) fail(`${NAME}: creation tx ${guardTx} not found`);
    else if (rc.status !== "0x1") fail(`${NAME}: creation tx failed`);
    else if (!same(rc.contractAddress, guard)) fail(`${NAME}: tx created ${rc.contractAddress}, not ${guard}`);
    else if (t.to) fail(`${NAME}: tx has a recipient, not a deployment`);
    else if (String(t.input).toLowerCase() === ART[NAME].creation.toLowerCase()) ok(`${NAME}: creation input is exactly this build's creation code`);
    else fail(`${NAME}: creation input differs from this build`);
  } catch (e) {
    fail(`${NAME}: creation tx unreadable: ${e.message}`);
  }
  return done();
}
