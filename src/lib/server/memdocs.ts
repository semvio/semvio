/*
 * In-memory fallback for the token-feature documents when no shared store is configured. Bounded on every write path: a key cap, a TTL
 * on every key (expired keys are dropped before each write and never read), and a total byte budget; a write that would pass either
 * cap is refused with an error (existing data is never evicted silently).
 */
export class MemDocs {
  private m = new Map<string, { v: string; exp: number }>();
  private bytes = 0;
  constructor(
    readonly maxKeys = 5_000,
    readonly maxBytes = 8_000_000,
    private now: () => number = () => Date.now(),
  ) {}

  private sweep() {
    const t = this.now();
    for (const [k, e] of this.m) if (e.exp <= t) this.drop(k);
  }
  private drop(k: string) {
    const e = this.m.get(k);
    if (!e) return;
    this.bytes -= k.length + e.v.length;
    this.m.delete(k);
  }
  get(k: string): string | null {
    const e = this.m.get(k);
    if (!e) return null;
    if (e.exp <= this.now()) {
      this.drop(k);
      return null;
    }
    return e.v;
  }
  /** Sets with a TTL in seconds (required, at least 1). Throws when a cap would be passed. */
  set(k: string, v: string, ttlSec: number) {
    if (!(ttlSec >= 1)) throw new Error("Every key needs a TTL.");
    this.sweep();
    const old = this.m.get(k);
    const size = k.length + v.length;
    const next = this.bytes - (old ? k.length + old.v.length : 0) + size;
    if (!old && this.m.size >= this.maxKeys) throw new Error("Storage full (key limit). Try again later.");
    if (next > this.maxBytes) throw new Error("Storage full (size limit). Try again later.");
    this.m.set(k, { v, exp: this.now() + ttlSec * 1000 });
    this.bytes = next;
  }
  /** Only if the key is free; same caps and TTL rule. */
  setNx(k: string, v: string, ttlSec: number) {
    if (this.get(k) !== null) return false;
    this.set(k, v, ttlSec);
    return true;
  }
  del(k: string) {
    this.drop(k);
  }
  get size() {
    return { keys: this.m.size, bytes: this.bytes };
  }
  /** Drops expired keys, then reports whether keys or bytes are at or above `share` of their caps. */
  nearFull(share = 0.8) {
    this.sweep();
    return this.m.size >= this.maxKeys * share || this.bytes >= this.maxBytes * share;
  }
}

/** Records a sign-out in its own bounded store: true when stored (or already there), false when the store refused it. */
export function recordRevocation(mem: MemDocs, nonce: string, ttlSec: number): boolean {
  if (mem.get(nonce) !== null) return true;
  try {
    mem.set(nonce, "1", Math.max(1, ttlSec));
    return true;
  } catch {
    return false;
  }
}
