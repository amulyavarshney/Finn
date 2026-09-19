import type { PricePoint } from "./types";

/**
 * Pure maths over an end-of-day series.
 *
 * Kept separate from lib/sources/yahoo.ts deliberately: the alert engine and
 * the materiality scorer both run in the browser, and importing them from the
 * fetch adapter would drag yahoo-finance2 -- and its node: builtins -- into the
 * client bundle.
 */

/** Trailing average volume, the baseline for the "unusual" test. */
export function averageVolume(prices: PricePoint[], window = 20, endIndex?: number): number | null {
  const end = endIndex ?? prices.length - 1;
  const start = Math.max(0, end - window);
  const slice = prices.slice(start, end);
  if (slice.length < 5) return null;
  return slice.reduce((sum, p) => sum + p.volume, 0) / slice.length;
}

/**
 * The session a filing lands in. Filings often arrive after the close or on a
 * holiday, so settle on the first session at or after the filing date.
 */
export function findBar(
  prices: PricePoint[],
  date: string,
): { bar: PricePoint; index: number } | null {
  for (let i = 0; i < prices.length; i++) {
    if (prices[i].date >= date) return { bar: prices[i], index: i };
  }
  return null;
}

export function dayChangePct(prices: PricePoint[], index: number): number | null {
  if (index <= 0 || index >= prices.length) return null;
  const prev = prices[index - 1].close;
  if (!prev) return null;
  return ((prices[index].close - prev) / prev) * 100;
}
