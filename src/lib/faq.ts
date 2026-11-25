/* Questions answered on the home page and the method page (and as FAQ structured data). Every answer is true of the site as built. */
export type Faq = { q: string; a: string };

export const FAQ: Faq[] = [
  {
    q: "Does Semvio hold my funds?",
    a: "No. Your tokens stay in your wallet until the moment of settlement. You allow the deal room to move the exact amount of one deal, and settlement moves the asset from the seller to the buyer and the quote token from the buyer to the seller (and the agreed fee to its named recipient) inside one transaction. The room never keeps a balance, and it has no admin who could move anything.",
  },
  {
    q: "What exactly do both sides approve?",
    a: "One revision: an exact price, fee, fee recipient and offer expiry, identified by its hash. A new revision makes earlier approvals worthless, so nobody can be held to a number they did not see. Either side can withdraw an approval until the deal settles.",
  },
  {
    q: "What does the agent do?",
    a: "It is deterministic code, not a language model. It knows one side's private limit, opens a little better than that limit and concedes step by step, and every proposal it makes is a revision on record with the reason in words. It can never approve, settle or cancel; a person approves.",
  },
  {
    q: "How are fees and the net result worked out?",
    a: "The buyer pays the gross price. An optional fee agreed in the revision (at most 1 %, rounded down, paid to a third party such as a broker) comes out of it, and the seller receives the rest. Semvio takes no fee. The deal card shows gross, fee and net before anyone approves, and the room checks the buyer's budget and the seller's minimum net in a free read that is never written to the chain.",
  },
  {
    q: "Can I try it without a wallet?",
    a: "Yes. Practice mode runs the whole flow in your browser with sample counterparties: request, matching, agent revisions, checks, approvals and a simulated settlement. Prices are anchored to live Chainlink reference prices when the site can read them, and every sample number is labelled.",
  },
  {
    q: "Which tokens work?",
    a: "Any plain ERC-20 on Robinhood Chain. The site offers WETH and USDG (addresses checked on chain) and Robinhood stock tokens that pass an on-chain identity check and have a Chainlink feed. Native ETH is not supported (wrap it first) and fee-on-transfer tokens are refused. On the testnet you can mint a test dollar from the deploy kit.",
  },
  {
    q: "Do I need the $SEMVIO token?",
    a: "No. The workspace, the room and the dashboard work without it and the token is not live yet. Its planned use (priority matching and saved deal templates) is a concept and is labelled as one.",
  },
  {
    q: "Is Semvio connected to Robinhood?",
    a: "No. Semvio is an independent prototype that uses public contracts on Robinhood Chain. Nothing here is investment advice, and an agreed price is not a fair price.",
  },
];
