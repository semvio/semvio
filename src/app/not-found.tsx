import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead eyebrow="404" dot="var(--pink)" title="No such revision.">
        <p>This page does not exist. The workspace does.</p>
      </PageHead>
      <div className="wrap flex flex-wrap gap-3 py-16">
        <Link href="/workspace" className="btn btn-white">
          Open the workspace
        </Link>
        <Link href="/" className="btn btn-dark">
          Home
        </Link>
      </div>
    </>
  );
}
