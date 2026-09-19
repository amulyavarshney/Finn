import { CATEGORY_META } from "@/lib/categories";
import { averageVolume } from "@/lib/prices";
import type { AlertRule, Category, Filing, PricePoint, TriggeredAlert } from "@/lib/types";

/**
 * Threshold alerts over the end-of-day series.
 *
 * The brief is explicit that the investor decides what "unusual" means, so
 * nothing here is a constant -- every bound comes from the rule the user set on
 * the Tune screen, and the defaults below are only a starting point.
 */

export const DEFAULT_RULE: AlertRule = {
  /** The brief's own example: volume more than ~2x its recent average. */
  volumeMultiple: 2,
  priceMovePct: 4,
  watchedCategories: ["results", "M&A", "management_change", "litigation", "credit_rating"],
};

export function evaluateAlerts(
  symbol: string,
  company: string,
  prices: PricePoint[],
  filings: Filing[],
  rule: AlertRule,
  lookbackDays = 5,
): TriggeredAlert[] {
  const alerts: TriggeredAlert[] = [];

  // --- Unusual market activity, measured against each day's own baseline ----
  const start = Math.max(1, prices.length - lookbackDays);
  for (let i = start; i < prices.length; i++) {
    const bar = prices[i];
    const prev = prices[i - 1];

    const avg = averageVolume(prices, 20, i);
    if (avg && avg > 0) {
      const multiple = bar.volume / avg;
      if (multiple >= rule.volumeMultiple) {
        alerts.push({
          id: `${symbol}-vol-${bar.date}`,
          symbol,
          company,
          kind: "volume",
          summary: `${multiple.toFixed(1)}x average volume`,
          detail: `${formatVolume(bar.volume)} traded on ${bar.date} against a 20-day average of ${formatVolume(Math.round(avg))}`,
          date: bar.date,
          magnitude: multiple,
        });
      }
    }

    if (prev.close > 0) {
      const movePct = ((bar.close - prev.close) / prev.close) * 100;
      if (Math.abs(movePct) >= rule.priceMovePct) {
        alerts.push({
          id: `${symbol}-px-${bar.date}`,
          symbol,
          company,
          kind: "price",
          summary: `${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}% in a day`,
          detail: `Closed at ₹${bar.close.toFixed(2)} on ${bar.date}, from ₹${prev.close.toFixed(2)}`,
          date: bar.date,
          magnitude: Math.abs(movePct),
        });
      }
    }
  }

  // --- A watched category filing ------------------------------------------
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const watched = new Set<Category>(rule.watchedCategories);

  for (const filing of filings) {
    if (filing.filedAt < cutoff || !watched.has(filing.category)) continue;
    alerts.push({
      id: `${symbol}-cat-${filing.id}`,
      symbol,
      company,
      kind: "category",
      summary: `${CATEGORY_META[filing.category].label} filing`,
      detail: filing.headline,
      date: filing.filedAt.slice(0, 10),
      magnitude: filing.materiality.score,
    });
  }

  return alerts;
}

function formatVolume(volume: number): string {
  if (volume >= 10_000_000) return `${(volume / 10_000_000).toFixed(2)} cr shares`;
  if (volume >= 100_000) return `${(volume / 100_000).toFixed(2)} lakh shares`;
  return `${volume.toLocaleString("en-IN")} shares`;
}

/** Newest and largest first, so the strip leads with the loudest signal. */
export function rankAlerts(alerts: TriggeredAlert[]): TriggeredAlert[] {
  const kindRank: Record<TriggeredAlert["kind"], number> = { price: 0, volume: 1, category: 2 };
  return [...alerts].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      kindRank[a.kind] - kindRank[b.kind] ||
      b.magnitude - a.magnitude,
  );
}
