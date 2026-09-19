import YahooFinance from "yahoo-finance2";

import type { PricePoint } from "@/lib/types";

// v4 dropped the v2 singleton default export; the class must be instantiated.
const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false },
});

/**
 * End-of-day bars for an NSE symbol. `.NS` is appended here so callers only
 * ever deal in bare tickers, and `.BO` is tried as a fallback for the handful
 * of names that only resolve on the BSE feed.
 */
export async function fetchPrices(symbol: string, days = 260): Promise<PricePoint[]> {
  const from = new Date();
  from.setDate(from.getDate() - Math.ceil(days * 1.6)); // pad for weekends and holidays

  for (const suffix of [".NS", ".BO"]) {
    try {
      const res = await yf.chart(`${symbol}${suffix}`, {
        period1: from,
        interval: "1d",
      });

      const points = res.quotes
        .filter((q) => q.close != null && q.volume != null)
        .map((q) => ({
          date: q.date.toISOString().slice(0, 10),
          open: q.open ?? q.close!,
          high: q.high ?? q.close!,
          low: q.low ?? q.close!,
          close: q.close!,
          volume: q.volume!,
        }));

      if (points.length > 0) return points.slice(-days);
    } catch {
      // Fall through to the next suffix.
    }
  }

  return [];
}

// The series maths lives in lib/prices.ts so browser code can use it without
// pulling this module's node: dependencies into the client bundle.
export { averageVolume, dayChangePct, findBar } from "@/lib/prices";
