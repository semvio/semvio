import { PageHead } from "@/components/site/PageHead";
import { Workspace } from "@/components/workspace/Workspace";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/workspace",
  title: "Deal workspace | Semvio",
  description: "Write a buy or sell request with a price limit, let the agent propose to a matching counterparty, check budget and net after fees, and approve one revision. Practice mode needs no wallet.",
});

export default function WorkspacePage() {
  return (
    <>
      <PageHead wide eyebrow="Workspace" dot="var(--yellow)" title="Request, revisions, checks, approval.">
        Practice runs the whole flow in your browser with sample counterparties. On chain, the same card is read from the deal room on Robinhood Chain or its testnet,
        and every step is a transaction from your own wallet.
      </PageHead>
      <Workspace />
    </>
  );
}
