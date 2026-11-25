import "server-only";
import { decodeEventLog, pad, toHex } from "viem";
import { CONTRACTS, roomLive } from "@/config/contracts";
import type { NetKey } from "@/config/networks";
import { ROOM_ABI } from "@/lib/abi";
import { deriveAlerts, type RoomLog } from "@/lib/alerts/derive";
import { headBlock, logReader, withNet, type RawLog } from "@/lib/server/chainread";
import { scanBack } from "@/lib/logscan";
import { readDeals } from "@/lib/server/deals";

/* Alerts for one wallet: its latest 30 deals (views) and the room's events for those deals from block `from` (or the deploy block). */
export async function readAlerts(net: NetKey, addr: string, from: number) {
  if (!roomLive(net)) return { deployed: false, alerts: [], head: null };
  const { deals } = await readDeals(net, addr);
  return withNet(net, async () => {
    const head = await headBlock();
    if (!deals.length) return { deployed: true, alerts: [], head };
    const start = Math.max(CONTRACTS[net].block, from);
    const ids = deals.map((d) => pad(toHex(d.id), { size: 32 }));
    const scan = await scanBack<RawLog>(logReader({ address: CONTRACTS[net].room, topics: [null, ids] }), start, head, { maxCalls: 12 });
    const logs: RoomLog[] = [];
    for (const l of scan.logs) {
      try {
        const e = decodeEventLog({ abi: ROOM_ABI, data: l.data as `0x${string}`, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] });
        const args = JSON.parse(JSON.stringify(e.args ?? {}, (_, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
        logs.push({ name: String(e.eventName), block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, logIndex: Number(BigInt(l.logIndex)), args });
      } catch {
        // not a room event
      }
    }
    const lite = deals.map((d) => ({ id: d.id, seller: d.seller, buyer: d.buyer, status: d.status, validUntil: d.validUntil, offerValidUntil: d.terms.offerValidUntil, revision: d.revision }));
    return { deployed: true, head, alerts: deriveAlerts(addr, lite, logs, Math.floor(Date.now() / 1000)), complete: scan.gaps.length === 0 };
  });
}
