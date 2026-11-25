import { PageHead } from "@/components/site/PageHead";
import { Deals } from "@/components/deals/Deals";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/deals",
  title: "Deals and settlement proofs | Semvio",
  description: "Every deal of a wallet in the Semvio deal room on Robinhood Chain: role, terms, approvals, status, the re-hashed revision chain and the settlement transaction.",
});

export default function DealsPage() {
  return (
    <>
      <PageHead wide eyebrow="Deals" dot="var(--cyan)" title="Offers, approvals and proofs.">
        Read straight from the deal room: what each deal says now, who approved which revision, and the settlement transaction as proof. Practice deals stay in this
        browser.
      </PageHead>
      <Deals />
    </>
  );
}
