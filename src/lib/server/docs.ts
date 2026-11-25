import "server-only";
import { getStore } from "@/lib/server/store";
import { MemDocs, recordRevocation } from "@/lib/server/memdocs";
import { keccak256, toBytes } from "viem";

/*
 * Small JSON documents for the token features (board, templates, team workspace). In the configured store (kv-gateway / Redis)
 * when KV_REST_API_URL + KV_REST_API_TOKEN (or another supported Redis) are set; otherwise in this server instance's memory, which
 * the pages announce as "Not configured: saved data may be lost on restart". Writes to one key are serialised (a lock in the
 * store, a promise chain in memory).
 */

const memory = new MemDocs();
/** Every document lives 30 days after its last write (board requests expire much earlier on their own). */
export const DOC_TTL = 30 * 24 * 3600;
const chains = new Map<string, Promise<unknown>>();

export const persistent = () => getStore() !== null;

export async function readDoc<T>(key: string, fallback: T): Promise<T> {
  const store = getStore();
  const raw = store ? await store.get(`doc:${key}`) : memory.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeDoc(key: string, value: unknown) {
  const text = JSON.stringify(value);
  if (text.length > 900_000) throw new Error("Document too large.");
  const store = getStore();
  if (store) await store.setEx(`doc:${key}`, text, DOC_TTL);
  else memory.set(key, text, DOC_TTL);
}

/** Read-modify-write under a per-key lock. `fn` returns the new value (or throws to abort). */
export async function updateDoc<T, R>(key: string, fallback: T, fn: (cur: T) => { value: T; result: R }): Promise<R> {
  const run = async () => {
    const store = getStore();
    const token = Math.random().toString(36).slice(2);
    if (store) {
      let got = false;
      for (let i = 0; i < 40 && !got; i++) {
        got = await store.setNx(`lock:${key}`, token, 5);
        if (!got) await new Promise((r) => setTimeout(r, 100));
      }
      if (!got) throw new Error("Busy, try again.");
    }
    try {
      const cur = await readDoc<T>(key, fallback);
      const { value, result } = fn(cur);
      await writeDoc(key, value);
      return result;
    } finally {
      if (store) await store.delIf(`lock:${key}`, token).catch(() => false);
    }
  };
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(run, run);
  chains.set(key, next.catch(() => undefined));
  return next;
}

/** Signed-out session nonces live in their own bounded store (cap + TTL), apart from the documents. */
const revokedMem = new MemDocs(20_000, 1_000_000);

/** Signed-out session nonces, kept until the session would have expired anyway. True only when the record is stored. */
/** Sign-out records hold a fixed-size hash of the nonce, so a record's size cannot be inflated. */
const nk = (nonce: string) => keccak256(toBytes(nonce));

export async function revokeNonce(raw: string, untilSec: number): Promise<boolean> {
  const nonce = nk(raw);
  const ttl = Math.max(1, untilSec - Math.floor(Date.now() / 1000));
  const store = getStore();
  if (!store) return recordRevocation(revokedMem, nonce, ttl);
  try {
    if ((await store.get(`revoked:${nonce}`)) !== null) return true;
    await store.setEx(`revoked:${nonce}`, "1", ttl);
    return (await store.get(`revoked:${nonce}`)) !== null;
  } catch {
    return false;
  }
}
/** True when the memory sign-out store holds 80 % of its keys or bytes after dropping expired ones (the shared store is not bounded here). */
export const revocationsNearFull = () => getStore() === null && revokedMem.nearFull(0.8);

export async function isRevoked(raw: string) {
  const nonce = nk(raw);
  const store = getStore();
  return store ? (await store.get(`revoked:${nonce}`)) !== null : revokedMem.get(nonce) !== null;
}
