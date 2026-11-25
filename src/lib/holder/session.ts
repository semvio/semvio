import { getAddress, recoverMessageAddress } from "viem";

/*
 * Holder session, EIP-4361 (Sign-In with Ethereum) so wallets warn when the domain does not match the page. The wallet signs ONE
 * message (personal_sign, no gas); the signed message is the credential, kept in sessionStorage (this tab only) and sent in a header.
 * The server checks on every request: SIWE shape, domain + URI against a FIXED allowlist from config (never the Host or
 * X-Forwarded-Host header), chain id 4663, issued/expiry (at most 4 hours), the signature (EOA only in v1, no ERC-1271), and that the
 * nonce was not signed out. No server secret.
 *
 * Replay: the credential is meant to be reused for its lifetime by the same tab (that is what a session is). A copy can only act as
 * that same wallet, on that wallet's own quota and data, for at most 4 hours; Sign out records the nonce as revoked until it
 * expires (KV when configured, memory otherwise), and every request, read or write, checks that list.
 */

export const SESSION_CHAIN_ID = 4663;
export const MAX_SESSION_SEC = 4 * 3600;
const SKEW = 120;
export const STATEMENT = "Start a Semvio holder session. This costs no gas and moves nothing; it only proves you control this wallet.";

export type SessionFields = { domain: string; uri: string; wallet: `0x${string}`; chainId: number; issuedAt: number; expiresAt: number; nonce: string };
export type Origin = { domain: string; uri: string };

const iso = (s: number) => new Date(s * 1000).toISOString();

export function sessionMessage(f: SessionFields): string {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    getAddress(f.wallet),
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${iso(f.issuedAt)}`,
    `Expiration Time: ${iso(f.expiresAt)}`,
  ].join("\n");
}

/** Parses a SIWE message this site issues; anything else (other text, extra fields, edits) is null. */
export function parseSession(message: string): SessionFields | null {
  const lines = message.split("\n");
  if (lines.length !== 11) return null;
  const head = lines[0].match(/^([a-z0-9.-]+(?::\d{1,5})?) wants you to sign in with your Ethereum account:$/i);
  const wallet = lines[1];
  const get = (i: number, k: string) => (lines[i].startsWith(`${k}: `) ? lines[i].slice(k.length + 2) : null);
  const uri = get(5, "URI");
  const chain = get(7, "Chain ID");
  const nonce = get(8, "Nonce");
  const issued = get(9, "Issued At");
  const expires = get(10, "Expiration Time");
  if (!head || !/^0x[0-9a-fA-F]{40}$/.test(wallet) || !uri || !chain || !nonce || !issued || !expires) return null;
  if (!/^\d+$/.test(chain) || !/^[A-Za-z0-9]{8,64}$/.test(nonce)) return null;
  const issuedAt = Math.floor(Date.parse(issued) / 1000);
  const expiresAt = Math.floor(Date.parse(expires) / 1000);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  const f: SessionFields = { domain: head[1], uri, wallet: wallet as `0x${string}`, chainId: Number(chain), issuedAt, expiresAt, nonce };
  return sessionMessage(f) === message ? f : null;
}

export type SessionCheck = { ok: true; wallet: `0x${string}`; nonce: string; expiresAt: number } | { ok: false; reason: string };

/**
 * Verifies a credential at time `now` (seconds) against the allowed origins (from config, never from request headers).
 * `revoked(nonce)` reports a signed-out session.
 */
export async function verifySession(cred: { message: string; signature: string } | null, allowed: Origin[], now: number, revoked: (nonce: string) => Promise<boolean> = async () => false): Promise<SessionCheck> {
  if (!cred || typeof cred.message !== "string" || typeof cred.signature !== "string" || cred.message.length > 1200) return { ok: false, reason: "No holder session. Sign in with your wallet first." };
  const f = parseSession(cred.message);
  if (!f) return { ok: false, reason: "The session message is not a sign-in this site issues." };
  const origin = allowed.find((o) => o.domain === f.domain.toLowerCase());
  if (!origin) return { ok: false, reason: `Sessions are accepted only for ${allowed.map((o) => o.domain).join(", ")}; this one was signed for ${f.domain}.` };
  if (origin.uri !== f.uri) return { ok: false, reason: `The session URI must be ${origin.uri}.` };
  if (f.chainId !== SESSION_CHAIN_ID) return { ok: false, reason: `The session names chain ${f.chainId}, not ${SESSION_CHAIN_ID}.` };
  if (f.expiresAt <= f.issuedAt || f.expiresAt - f.issuedAt > MAX_SESSION_SEC) return { ok: false, reason: "A session may last at most 4 hours." };
  if (f.issuedAt > now + SKEW) return { ok: false, reason: "The session starts in the future." };
  if (now >= f.expiresAt) return { ok: false, reason: "The session expired. Sign in again." };
  if (!/^0x[0-9a-fA-F]{130}$/.test(cred.signature)) return { ok: false, reason: "The signature is malformed." };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: cred.message, signature: cred.signature as `0x${string}` });
  } catch {
    return { ok: false, reason: "The signature could not be checked." };
  }
  if (signer.toLowerCase() !== f.wallet.toLowerCase()) return { ok: false, reason: "The signature does not match the wallet in the message." };
  if (await revoked(f.nonce)) return { ok: false, reason: "This session was signed out. Sign in again." };
  return { ok: true, wallet: f.wallet.toLowerCase() as `0x${string}`, nonce: f.nonce, expiresAt: f.expiresAt };
}

/** The credential travels in one header, base64 of {message, signature}. */
export const SESSION_HEADER = "x-semvio-session";
const toB64 = (s: string) => (typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(String.fromCharCode(...new TextEncoder().encode(s))));
const fromB64 = (s: string) => (typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
export const encodeCred = (c: { message: string; signature: string }) => toB64(JSON.stringify(c));
export function decodeCred(v: string | null): { message: string; signature: string } | null {
  if (!v || v.length > 4000) return null;
  try {
    const o = JSON.parse(fromB64(v)) as { message?: unknown; signature?: unknown };
    return typeof o.message === "string" && typeof o.signature === "string" ? { message: o.message, signature: o.signature } : null;
  } catch {
    return null;
  }
}
