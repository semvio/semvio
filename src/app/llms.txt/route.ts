import { BRAND } from "@/config/brand";
import { CONTRACTS, roomLive } from "@/config/contracts";
import { NETWORKS } from "@/config/networks";

export const dynamic = "force-static";

export function GET() {
  const room = (k: "mainnet" | "testnet") => (roomLive(k) ? CONTRACTS[k].room : "not deployed yet");
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} A deal card holds the asset, amount, gross price, agreed fee (max 1 %, to a named third party), the seller's net and the offer's expiry. Every change of terms is a revision chained by hash. A deterministic agent proposes prices inside one side's limit and never signs. Both parties approve one exact revision; SemvioDealRoom settles only that revision, as one transferFrom swap (base asset seller -> buyer, quote asset buyer -> seller and fee recipient). The room never holds a balance; no admin, no protocol fee, no upgrade. checkDeal(id, buyerMaxGross, sellerMinNet) returns a reason bitmask before anything is signed. Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `Workspace (practice mode needs no wallet): ${BRAND.url}/workspace`,
    `Deals and settlement proofs: ${BRAND.url}/deals`,
    `Method, fee math and reason bits: ${BRAND.url}/method`,
    `Deal history API (JSON): ${BRAND.url}/api/deal?net=mainnet&id=<n>`,
    `Deals of a wallet (JSON): ${BRAND.url}/api/deals?net=mainnet&addr=<address>`,
    `Assets with live reference prices (JSON): ${BRAND.url}/api/assets`,
    `SemvioDealRoom on ${NETWORKS.mainnet.name} (${NETWORKS.mainnet.id}): ${room("mainnet")}`,
    `SemvioDealRoom on ${NETWORKS.testnet.name} (${NETWORKS.testnet.id}): ${room("testnet")}`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
