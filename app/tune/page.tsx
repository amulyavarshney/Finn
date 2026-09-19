import { TunePanel } from "@/components/tune/tune-panel";
import { activeProviderLabel, llmAvailable } from "@/lib/llm/router";
import { availableSymbols, readIndex } from "@/lib/snapshot";
import { loadLedger } from "@/lib/llm/ledger";
import { PORTFOLIO } from "@/lib/portfolio";

/**
 * Thresholds, the category watchlist, the portfolio editor and the cost ledger.
 *
 * The brief makes a point of letting the investor define what "unusual" means,
 * so the alert bounds are editable rather than tuned by us and hidden.
 */
export const dynamic = "force-dynamic";

export default function TunePage() {
  const present = availableSymbols();
  const index = readIndex();
  const ledger = loadLedger();

  return (
    <TunePanel
      available={present.sort()}
      companies={index?.companies ?? {}}
      defaultPortfolio={PORTFOLIO.map((h) => h.symbol).filter((s) => present.includes(s))}
      generatedAt={index?.generatedAt ?? null}
      ledger={ledger?.totals ?? null}
      provider={llmAvailable() ? activeProviderLabel() : null}
    />
  );
}
