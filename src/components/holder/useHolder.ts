"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { encodeCred, MAX_SESSION_SEC, parseSession, SESSION_CHAIN_ID, SESSION_HEADER, sessionMessage } from "@/lib/holder/session";

/* The holder session in the browser: one signed message kept in sessionStorage (this tab only), sent as a header with each holder
   request. Signing costs no gas. The server re-checks it every time. */

const KEY = "sv1.holder.session";
type Cred = { message: string; signature: string };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function readCred(): Cred | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cred) : null;
  } catch {
    return null;
  }
}
let snap: string | null = null;
// An expired session reads as none (checked here, outside render).
const getSnap = () => {
  try {
    snap = sessionStorage.getItem(KEY);
    const f = snap ? parseSession((JSON.parse(snap) as Cred).message) : null;
    if (!f || f.expiresAt <= Date.now() / 1000) snap = null;
  } catch {
    snap = null;
  }
  return snap;
};

export type TierInfo = {
  wallet: string;
  launched: boolean;
  token: string | null;
  tier: "holder" | "free";
  balance: string;
  supply: string;
  threshold: string;
  share: string;
  block: number | null;
  checkedAt: number;
  quota: { liveRequests: number; templates: number; teamMembers: number };
  usage: { liveRequests: number; templates: number; teamMembers: number };
  persistent: boolean;
};

export function useHolder() {
  const w = useWallet();
  const raw = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    getSnap,
    () => null,
  );
  const cred: Cred | null = raw ? (JSON.parse(raw) as Cred) : null;
  const fields = cred ? parseSession(cred.message) : null;
  const valid = Boolean(fields && w.address && fields.wallet.toLowerCase() === w.address.toLowerCase());
  const [info, setInfo] = useState<TierInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> => {
      const c = readCred();
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(c ? { [SESSION_HEADER]: encodeCred(c) } : {}), ...(init.headers ?? {}) }, cache: "no-store" });
      const body = (await res.json().catch(() => ({ error: `Request failed (${res.status}).` }))) as T & { error?: string };
      return { ok: res.ok, status: res.status, body };
    },
    [],
  );

  const refresh = useCallback(async () => {
    const r = await call<TierInfo>("/api/holder");
    if (r.ok) {
      setInfo(r.body);
      setErr(null);
    } else setErr(r.body.error ?? "Could not read the tier.");
  }, [call]);

  useEffect(() => {
    if (!valid) return;
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [valid, refresh]);

  const signIn = useCallback(async () => {
    if (!w.address) return;
    setBusy(true);
    setErr(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      const message = sessionMessage({ domain: window.location.host, uri: window.location.origin, wallet: w.address as `0x${string}`, chainId: SESSION_CHAIN_ID, issuedAt: now, expiresAt: now + MAX_SESSION_SEC, nonce });
      const signature = await w.signMessage(message);
      sessionStorage.setItem(KEY, JSON.stringify({ message, signature }));
      emit();
    } catch (e) {
      setErr((e as { code?: number })?.code === 4001 ? "The signature was declined in the wallet." : String((e as Error)?.message ?? e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }, [w]);

  const signOut = useCallback(async () => {
    // Tell the server first, so a copy of this credential stops working too.
    const r = await call<{ signedOut?: boolean }>("/api/holder/signout", { method: "POST" }).catch(() => null);
    if (r && r.body.signedOut === false) setErr(r.body.error ?? "The sign-out was not stored.");
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    setInfo(null);
    emit();
  }, [call]);

  return { address: w.address, valid, fields, info: valid ? info : null, err, busy, signIn, signOut, refresh, call };
}
