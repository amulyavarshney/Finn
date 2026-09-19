import { PORTFOLIO_SYMBOLS } from "@/lib/portfolio";
import { availableSymbols, readIndex, readSnapshot } from "@/lib/snapshot";
import { scoreMateriality } from "@/lib/analysis/materiality";
import type { Filing, PricePoint } from "@/lib/types";

/**
 * Assembles the Brief's payload from committed snapshots.
 *
 * Two things happen here rather than at ingest time:
 *
 *  - Materiality is re-scored against the current clock. The score has a
 *    recency term, so baking it in at ingest would leave yesterday's ranking
 *    frozen in place. Scoring is a pure function over data we already have, so
 *    this costs nothing and no model is involved.
 *  - Filing text is trimmed and the window is bounded, because shipping every
 *    filing for eighteen companies to a phone would be several megabytes of
 *    JSON for a screen that shows a dozen cards.
 */

export interface BriefTicker {
  symbol: string;
  company: string;
  fetchedAt: string;
  filings: Filing[];
  prices: PricePoint[];
  lastClose: number | null;
  dayChangePct: number | null;
  hasTables: boolean;
  transcriptCount: number;
}

export interface BriefPayload {
  generatedAt: string;
  tickers: BriefTicker[];
  /** Newest data timestamp across the book, so the UI can be honest about staleness. */
  dataAsOf: string | null;
  missing: string[];
}

/** Widest window the UI offers, plus headroom for a custom range. */
const RETAIN_DAYS = 60;
const TEXT_CAP = 2_200;
/** Enough closes for a sparkline and the 20-day volume baseline. */
const PRICE_TAIL = 40;

export function loadBrief(symbols: string[] = PORTFOLIO_SYMBOLS, now: Date = new Date()): BriefPayload {
  const cutoff = new Date(now.getTime() - RETAIN_DAYS * 86_400_000).toISOString();
  const tickers: BriefTicker[] = [];
  const missing: string[] = [];

  for (const symbol of symbols) {
    const snap = readSnapshot(symbol);
    if (!snap) {
      missing.push(symbol);
      continue;
    }

    const filings = snap.filings
      .filter((f) => f.filedAt >= cutoff)
      .map((f) => ({
        ...f,
        text: f.text.length > TEXT_CAP ? `${f.text.slice(0, TEXT_CAP)}…` : f.text,
        materiality: scoreMateriality(f, f.category, f.reaction, now),
      }))
      .sort((a, b) => b.materiality.score - a.materiality.score);

    const prices = snap.prices.slice(-PRICE_TAIL);
    const last = prices.at(-1);
    const prev = prices.at(-2);

    tickers.push({
      symbol,
      company: snap.company,
      fetchedAt: snap.fetchedAt,
      filings,
      prices,
      lastClose: last?.close ?? null,
      dayChangePct:
        last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null,
      hasTables: snap.tables !== null,
      transcriptCount: snap.transcripts.length,
    });
  }

  const dataAsOf = tickers
    .map((t) => t.prices.at(-1)?.date ?? null)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1) ?? null;

  return { generatedAt: now.toISOString(), tickers, dataAsOf, missing };
}

/** Portfolio the Brief defaults to: whatever was actually ingested. */
export function defaultPortfolio(): string[] {
  const index = readIndex();
  const present = new Set(availableSymbols());
  const wanted = index?.portfolio ?? PORTFOLIO_SYMBOLS;
  const filtered = wanted.filter((s) => present.has(s));
  return filtered.length > 0 ? filtered : [...present];
}
