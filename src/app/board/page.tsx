import { PageHead } from "@/components/site/PageHead";
import { Board } from "@/components/holder/Board";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/board",
  title: "Matching board | Semvio",
  description: "Post a buy or sell request for an asset on Robinhood Chain and find the other side. Open to everyone with a signed session; requests from holders of 0.1 % of $SEMVIO are matched first.",
});

export default function BoardPage() {
  return (
    <>
      <PageHead wide eyebrow="Board" dot="var(--blue)" title="Find the other side of your deal.">
        Post a request, see who wants the opposite, and open the deal in the workspace. Free for everyone with a signed session; holders get more live requests and
        are offered first.
      </PageHead>
      <Board />
    </>
  );
}
