import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DeployPanel } from "@/components/deploy/DeployPanel";
import { PageHead } from "@/components/site/PageHead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deploy", robots: { index: false, follow: false } };

// Owner tool, local only: on any public host this route is a 404.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export default async function DeployPage() {
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) notFound();
  return (
    <>
      <PageHead wide eyebrow="Owner tool · localhost only" dot="var(--orange)" title="Deploy the deal room.">
        <p>This page exists only on localhost. It deploys SemvioDealRoom from the connected wallet on Robinhood Chain or its testnet (and, on the testnet only, a mintable test dollar), then tells you what to paste into src/config/contracts.ts.</p>
      </PageHead>
      <div className="wrap-wide pb-24">
        <DeployPanel />
      </div>
    </>
  );
}
