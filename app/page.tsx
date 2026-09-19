import { BriefFeed } from "@/components/brief/brief-feed";
import { NoSnapshot } from "@/components/shell/no-snapshot";
import { defaultPortfolio, loadBrief } from "@/lib/server/brief";

/**
 * Push mode. Snapshots are committed to the repo, so this reads from disk at
 * request time -- no upstream call, no API key, nothing to rate-limit.
 */
export const dynamic = "force-dynamic";

export default function BriefPage() {
  const portfolio = defaultPortfolio();

  if (portfolio.length === 0) return <NoSnapshot />;

  return <BriefFeed payload={loadBrief(portfolio)} />;
}
