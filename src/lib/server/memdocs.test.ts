import { test } from "node:test";
import assert from "node:assert/strict";
import { MemDocs, recordRevocation } from "./memdocs";

test("memory fallback: TTL required, keys expire, key cap and byte budget refuse new writes", () => {
  let t = 0;
  const m = new MemDocs(3, 100, () => t);
  assert.throws(() => m.set("a", "1", 0), /TTL/);
  m.set("a", "1", 10);
  m.set("b", "2", 10);
  m.set("c", "3", 1);
  assert.throws(() => m.set("d", "4", 10), /key limit/);
  m.set("a", "11", 10); // overwriting an existing key is fine
  assert.throws(() => m.set("b", "x".repeat(200), 10), /size limit/);
  assert.equal(m.get("b"), "2");
  t = 1500; // "c" expired: its slot frees up
  assert.equal(m.get("c"), null);
  m.set("d", "4", 10);
  assert.equal(m.setNx("d", "5", 10), false);
  assert.ok(m.size.keys <= 3 && m.size.bytes <= 100);
  t = 20_000;
  assert.equal(m.get("a"), null);
});

test("sign-out records: own bounded store, repeat is a no-op, a full store reports failure (fail closed)", () => {
  const m = new MemDocs(2, 1000);
  assert.equal(recordRevocation(m, "n1", 60), true);
  assert.equal(recordRevocation(m, "n1", 60), true);
  assert.equal(recordRevocation(m, "n2", 60), true);
  assert.equal(recordRevocation(m, "n3", 60), false);
  assert.equal(m.get("n3"), null);
});

test("nearFull sweeps expired records first and counts keys or bytes", () => {
  let t = 0;
  const m = new MemDocs(5, 200, () => t);
  for (const k of ["a", "b", "c", "d"]) m.set(k, "1", 1);
  assert.equal(m.nearFull(0.8), true);
  t = 2000;
  assert.equal(m.nearFull(0.8), false);
  m.set("big", "x".repeat(170), 10);
  assert.equal(m.nearFull(0.8), true);
});
