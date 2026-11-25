# Semvio

Semvio is a workspace for over-the-counter deals on Robinhood Chain, for people who agree a price with one named counterparty instead of trading on a pool. Negotiations usually live in chat: offers change, nobody is sure which number was the last one, and the seller only finds out what is left after fees at the end. Semvio puts the deal on one card (asset, amount, gross price, agreed fee, the seller's net and how long the offer stands), records every change as a revision chained by hash, and settles only the revision both wallets approved, as one non-custodial swap.

Agent-assisted OTC deals with clear fees, price limits & wallet approval. One deal card, every revision on record, both wallets approving the same version before one atomic swap on Robinhood Chain.

## Read this before anything else

This repository is the working code behind https://semvio.xyz.

- **What runs today.** The workspace (`/workspace`) has a practice mode that needs no wallet: write a buy or sell request with a price limit, let the agent negotiate with sample counterparties (every proposal is a revision), see the buyer-budget and seller-net checks in numbers, approve, and settle in a simulated swap. On-chain mode opens, counters, approves and settles real deals against the `SemvioDealRoom` contract on Robinhood Chain or Robinhood Chain Testnet. `/deals` lists a wallet's deals with their settlement transactions.
- **Live data.** Block, gas price and the deal room come from each network's JSON-RPC. Reference prices come from Chainlink feeds on Robinhood Chain (ETH / USD and the stock-token feeds), with their update time. Robinhood stock tokens are offered only after an on-chain identity check.
- **The contract.** `SemvioDealRoom` records deals and chained revisions, takes one approval per side for one exact revision, and settles it with `transferFrom` straight between the two wallets. It has no owner, no admin, no protocol fee, no upgrade, and never holds a balance. **It is not deployed yet**, and it has not had an independent security review: use the testnet first, then small amounts.
- **The agent** is deterministic code that proposes prices inside one side's private limit. It is not a language model, it cannot approve or sign, and it never sees the other side's limit.
- **Board, alerts and token features.** `/board` is a matching board open to everyone with a signed sign-in (EIP-4361, no gas): post a request, see crossing requests, open the deal. The bell lists events on your deals and can raise browser notifications; alerts are free. A wallet holding at least 0.1 % of the $SEMVIO supply (balanceOf × 1000 ≥ totalSupply, read on chain at each action) gets more live requests, matched first, saved deal templates and a team workspace; before the token exists these unlock at launch.
- **Concept, not built.** Agents negotiating automatically between two real users, and a language-model assistant for notes. Nothing here guarantees a fair price, a counterparty, or any value for $SEMVIO.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (`/`, `/workspace`, `/board`, `/deals`, `/method`, `/token`, a localhost-only `/deploy`) and API routes (`/api/chain`, `/api/assets`, `/api/deal`, `/api/deals`, `/api/rpc`, `/api/board`, `/api/holder`, `/api/templates`, `/api/team`, `/api/alerts`). |
| `src/components/` | Interface components: the deal card and revision timeline, practice and on-chain workspaces, wallet connection. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `networks.ts` (mainnet and testnet), `contracts.ts` (deployed addresses), `dex.ts` and `chain.ts` (on-chain facts). |
| `src/lib/deal/` | The site's copy of the fee math, reason bits and hashes, the negotiation agent, sample desks and the practice deal model. |
| `src/lib/holder/`, `src/lib/alerts/` | Sign-in sessions, holder tier and quotas, board rules, and alert derivation from the room's events. |
| `src/lib/server/` | Chain reads behind the API routes: deals and their logs, the stock-token board, live snapshots. |
| `contracts/` | Solidity sources (`src/`) and Foundry tests (`test/`). |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Brand images and wallet logos. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-25 (UTC), Node.js 25.8.2, forge 1.5.1: `npm run typecheck` exit 0; `npm test` 30 pass / 0 fail (fee math and hash vectors shared with Solidity, reason bits parsed from the contract, agent and practice deals, relay and rate limits, deployment check); `npm run build` 20 routes; `forge test` 45 passed (33 unit tests in `SemvioDealRoom.t.sol` including hostile tokens and reentrancy, 3 fuzz tests and 4 invariants over random sequences of opens, revisions, approvals, withdrawals, cancels and settlements, 1 hash-vector test, 1 practice-token test, and 3 fork tests that run only with `--fork-url`); the fork tests passed against Robinhood Chain mainnet with the real WETH and USDG. A browser run on a local fork of Robinhood Chain (chain id 4663) opened, countered, approved and settled a deal through the site with injected wallets (8 of 8 steps) and checked the balances moved exactly; that run needs a local chain and is not part of `npm test`.

2026-11-25 (UTC), token features added: `npm test` 41 pass / 0 fail (adds sign-in checks: foreign domain, spoofed host, non-SIWE text, wrong chain, expired, over 4 hours, signed out; tier at exactly 0.1 %, one unit under and zero supply; quotas, holder reserve and a full board that keeps every entry; bounded memory store; alert derivation); `forge test` unchanged at 45 (no contract change). The browser run on a local Robinhood Chain fork now has 12 of 12 steps, with a test ERC-20 standing in for $SEMVIO: a holder above 0.1 % saves a template, a wallet under it is refused with the numbers and hits the free quota on its 4th post, the holder's request is listed and matched first, a signed-out session is refused, and the buyer's bell shows the other side's approval and the settlement.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6740. Everything works with no configuration: practice mode, live chain data through the public RPC, and on-chain mode once a room address is set in `src/config/contracts.ts`. Optional: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (a WalletConnect Cloud project id, 32 hex characters); without it WalletConnect shows "Not configured on this site yet".

## Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| SemvioDealRoom | Robinhood Chain (4663) | not deployed yet | — |
| SemvioDealRoom | Robinhood Chain Testnet (46630) | not deployed yet | — |
| SemvioPracticeToken (test dollar, testnet only) | Robinhood Chain Testnet | not deployed yet | — |

`SemvioDealRoom` (with the internal library `SemvioFeeMath`) stores each deal's parties, assets, base amount and validity, and each revision's terms (gross price, fee in basis points up to 1 %, fee recipient, offer expiry, note hash) with a hash chained to the previous revision. Each party approves one revision number and hash; a new revision makes older approvals worthless. `settle` / `approveAndSettle` move the base asset seller to buyer and the quote asset buyer to seller and fee recipient in one transaction, checking that each amount arrived. `checkDeal(id, buyerMaxGross, sellerMinNet)` and `checkTerms(...)` return a reason bitmask as a free read. No owner, no admin, no protocol fee, no upgrade, no payable function; native ETH and fee-on-transfer tokens are not supported.

## Verify a deployment

```
npm run verify-deployment -- --room <address> --room-tx <creation tx> [--testnet]
```

The script compares the bytecode on Robinhood Chain (or its testnet with `--testnet`) with the build in this repository, checks that the creation transaction carried exactly this build's creation code, and prints MATCH or each difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

Testnet: chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com, explorer https://explorer.testnet.chain.robinhood.com. The site offers to add the network you pick when you connect.

## Data sources and limits

- Robinhood Chain JSON-RPC (official endpoint first, public fallbacks) for blocks, gas, contract reads and the room's logs. The browser reads through the site's relay, which forwards only reads to known contracts or plain ERC-20 read functions and is rate-limited per network.
- Chainlink ETH / USD and stock-token feeds on Robinhood Chain for reference prices, shown with their update time. Stock feeds follow market hours and can be a day old on weekends.
- Stock tokens: candidates from a scan of the official beacon's upgrade events; each is listed only when its code hash, beacon slot and minted supply check out on chain and Chainlink publishes a feed for it.
- Live answers are cached for seconds; a failed read never replaces the last good one, and anything that cannot be read is shown as "Not known" or "—".
- Practice counterparties are sample data and are labelled wherever they appear.

## Token

$SEMVIO is the community token of Semvio on Robinhood Chain. Contract address: announced on https://semvio.xyz at launch. It has no promised value, and Semvio never needs it.

Token features (Prototype, covered by the end-to-end run on a local Robinhood Chain fork with a test token): a wallet holding at least 0.1 % of the supply gets 20 live board requests instead of 3, listed and matched first, up to 20 saved deal templates and a team workspace of up to 10 member wallets. The check: the wallet signs one EIP-4361 sign-in (no gas, at most 4 hours, accepted only for the site's own domains); the server reads `balanceOf` and `totalSupply` from the token contract at each holder action and compares `balance × 1000 ≥ supply`. Until the token exists, everyone is on the free tier. Holding gives no fee discount, share or reward. Quotas live in `src/lib/holder/tier.ts`.

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`, Node.js 20+).
2. Optional environment variables (names and formats only):

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Private mainnet RPC for server reads (log scans) | `https://…` |
| `RH_TESTNET_RPC_URL` | Private testnet RPC for server reads | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Public mainnet RPC the browser may use | `https://…` |
| `NEXT_PUBLIC_RH_TESTNET_RPC_URL` | Public testnet RPC the browser may use | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect option in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared store for rate limits, the board, templates, teams and sign-outs (Redis REST). Without it they live in one server's memory and the pages say saved data may be lost on restart | `https://…`, token string |

3. Point your domain at the deployment and check `/` (200), `/api/chain?net=mainnet` (JSON with a block number) and `/deploy` (404 on the public host).
4. Contracts: run `npm run build` and `npm start` locally, open http://localhost:6740/deploy, deploy `SemvioDealRoom` (no constructor arguments) on the network you want, paste the address, block and creation transaction into `src/config/contracts.ts`, and run `npm run verify-deployment`.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The contracts, the API routes and the transactions the site builds are in scope; wallets, RPC providers, explorers and launchpads are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). The Geist and Geist Mono fonts in `src/fonts/` are self-hosted under the SIL Open Font License 1.1 (`src/fonts/OFL-geist.txt`). Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Semvio name, logo and artwork belong to the project and are not licensed for reuse as a brand. Semvio is not affiliated with Robinhood; "Robinhood Chain" names the network.
