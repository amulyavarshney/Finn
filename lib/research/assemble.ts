import { extractPdf } from "@/lib/sources/pdf";
import { fetchAnnouncements } from "@/lib/sources/nse";
import { fetchScreenerTables } from "@/lib/sources/screener";
import { fetchPrices } from "@/lib/sources/yahoo";
import { readSnapshot, type StoredSnapshot } from "@/lib/snapshot";
import { buildFilings } from "@/lib/analysis/pipeline";
import type { TickerSnapshot } from "@/lib/types";

/**
 * Resolves a research target.
 *
 * The brief insists the engine generalise: "we may point it at a company you
 * didn't pick." So a committed snapshot is the fast path, and anything else is
 * fetched live and cached in memory for the life of the server process.
 *
 * Live fetching may fail in production -- NSE and screener answer a
 * residential IP far more reliably than a datacenter one -- so the caller
 * surfaces that as a clear state rather than an empty sheet, and the portfolio
 * demo never depends on it.
 */

const liveCache = new Map<string, { at: number; snapshot: StoredSnapshot }>();
const LIVE_TTL_MS = 30 * 60 * 1000;

export type ResearchSource = "snapshot" | "live";

export interface ResolvedTarget {
  snapshot: StoredSnapshot;
  source: ResearchSource;
}

export async function resolveTarget(symbolRaw: string): Promise<ResolvedTarget | null> {
  const symbol = symbolRaw.toUpperCase().trim();

  const stored = readSnapshot(symbol);
  if (stored) return { snapshot: stored, source: "snapshot" };

  const cached = liveCache.get(symbol);
  if (cached && Date.now() - cached.at < LIVE_TTL_MS) {
    return { snapshot: cached.snapshot, source: "live" };
  }

  const live = await fetchLive(symbol);
  if (!live) return null;

  liveCache.set(symbol, { at: Date.now(), snapshot: live });
  return { snapshot: live, source: "live" };
}

async function fetchLive(symbol: string): Promise<StoredSnapshot | null> {
  try {
    const [prices, announcements, tables] = await Promise.all([
      fetchPrices(symbol, 120).catch(() => []),
      fetchAnnouncements(symbol, 80).catch(() => []),
      fetchScreenerTables(symbol).catch(() => null),
    ]);

    // Without tables there is nothing to ground the pull side in, and without
    // any filings or prices the symbol probably does not exist.
    if (!tables && announcements.length === 0 && prices.length === 0) return null;

    const transcripts: TickerSnapshot["transcripts"] = [];
    if (tables) {
      for (const call of tables.concalls.filter((c) => c.transcriptUrl).slice(0, 4)) {
        const doc = await extractPdf(call.transcriptUrl!);
        if (doc && doc.text.length > 4000) {
          transcripts.push({ label: call.label, url: call.transcriptUrl!, pages: doc.pages, text: doc.text });
        }
      }
    }

    const filings = await buildFilings(announcements, prices, tables, { enrichLimit: 10 });

    return {
      symbol,
      company: tables?.name ?? announcements[0]?.company ?? symbol,
      fetchedAt: new Date().toISOString(),
      prices,
      announcements,
      tables,
      transcripts,
      filings,
    };
  } catch {
    return null;
  }
}
