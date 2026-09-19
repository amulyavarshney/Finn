/**
 * Ingestion CLI.
 *
 *   npm run ingest                    every portfolio + ad-hoc ticker
 *   npm run ingest -- --ticker DIXON  one ticker
 *   npm run ingest -- --rules-only    skip all model calls
 *   npm run ingest -- --no-pdf        skip transcript download (much faster)
 *   npm run ingest -- --days 120 --announcements 250
 *
 * Writes data/snapshot/<SYMBOL>.json plus an index, so the deployed app serves
 * pre-computed filings and needs no API key to render the Brief.
 */
import { ADHOC_SYMBOLS, ALL_SYMBOLS, PORTFOLIO_SYMBOLS, holdingFor } from "../lib/portfolio";
import { buildFilings } from "../lib/analysis/pipeline";
import { activeProviderLabel, llmAvailable } from "../lib/llm/router";
import { extractPdf } from "../lib/sources/pdf";
import { fetchAnnouncements } from "../lib/sources/nse";
import { fetchScreenerTables } from "../lib/sources/screener";
import { fetchPrices } from "../lib/sources/yahoo";
import { persist, sessionTotals } from "../lib/llm/ledger";
import { readIndex, readSnapshot, writeIndex, writeSnapshot } from "../lib/snapshot";
import type { SnapshotIndex, TickerSnapshot } from "../lib/types";

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function opt(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || !args[i + 1]) return fallback;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

function optStr(name: string): string | null {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? null);
}

const only = optStr("ticker");
const symbols = only ? [only.toUpperCase()] : ALL_SYMBOLS;
const rulesOnly = flag("rules-only") || !llmAvailable();
const skipPdf = flag("no-pdf");
const days = opt("days", 260);
const annLimit = opt("announcements", 220);
/** How many recent concall transcripts to extract per company. */
const transcriptCount = opt("transcripts", 5);
/**
 * Filings older than this are classified by rules alone. It matches the Brief's
 * retention window, so nothing a user can actually see is affected.
 */
const modelDays = opt("model-days", 60);
const modelCutoff = new Date(Date.now() - modelDays * 86_400_000).toISOString();

console.log("\nFINN ingest");
console.log(`  tickers      ${symbols.length}${only ? ` (${only})` : ""}`);
console.log(`  model        ${rulesOnly ? "disabled — rules only" : activeProviderLabel()}`);
console.log(`  transcripts  ${skipPdf ? "skipped" : `${transcriptCount} per company`}`);
if (!llmAvailable() && !flag("rules-only")) {
  console.log("  note         no API key found, so headlines and ambiguous");
  console.log("               categories fall back to deterministic rules");
}
console.log("");

// Carry forward whatever is already indexed, so a single-ticker run tops up the
// index instead of replacing it with one entry.
const index: SnapshotIndex = {
  generatedAt: new Date().toISOString(),
  portfolio: PORTFOLIO_SYMBOLS,
  adhoc: ADHOC_SYMBOLS,
  companies: readIndex()?.companies ?? {},
};

let ok = 0;
let failed = 0;

for (const symbol of symbols) {
  const started = Date.now();
  process.stdout.write(`  ${symbol.padEnd(12)}`);

  try {
    // Settled rather than all: NSE in particular will stall a request under
    // sustained use, and losing the prices and financials too because the
    // announcements feed timed out throws away a perfectly good ticker.
    const [pricesRes, annRes, tablesRes] = await Promise.allSettled([
      fetchPrices(symbol, days),
      fetchAnnouncements(symbol, annLimit),
      fetchScreenerTables(symbol),
    ]);

    // A source that failed this run falls back to whatever was ingested last
    // time. Writing an empty announcement list over a good snapshot would turn
    // a transient upstream timeout into permanent data loss.
    const previous = readSnapshot(symbol);

    const prices = pricesRes.status === "fulfilled" ? pricesRes.value : (previous?.prices ?? []);
    const announcements =
      annRes.status === "fulfilled" ? annRes.value : (previous?.announcements ?? []);
    const tables = tablesRes.status === "fulfilled" ? tablesRes.value : (previous?.tables ?? null);

    const degraded = [
      pricesRes.status === "rejected" ? "prices" : null,
      annRes.status === "rejected" ? "announcements" : null,
      tablesRes.status === "rejected" ? "financials" : null,
    ].filter((s): s is string => s !== null);

    if (prices.length === 0 && announcements.length === 0) {
      throw new Error(
        `no data from any source${degraded.length > 0 ? ` (${degraded.join(", ")} failed)` : ""}`,
      );
    }

    // Transcripts are the pull side's primary source. Newest first, capped --
    // Promised vs Delivered only looks back four quarters.
    const transcripts: TickerSnapshot["transcripts"] = [];
    if (!skipPdf && tables) {
      const withTranscript = tables.concalls.filter((c) => c.transcriptUrl).slice(0, transcriptCount);
      for (const call of withTranscript) {
        const doc = await extractPdf(call.transcriptUrl!);
        if (doc && doc.text.length > 4000) {
          transcripts.push({ label: call.label, url: call.transcriptUrl!, pages: doc.pages, text: doc.text });
        }
      }
    }

    // Same reasoning as the sources above: a failed PDF fetch should not strip
    // transcripts the pull side already has.
    if (transcripts.length === 0 && previous?.transcripts?.length) {
      transcripts.push(...previous.transcripts);
    }

    const company = tables?.name ?? announcements[0]?.company ?? holdingFor(symbol)?.name ?? symbol;

    const filings = await buildFilings(announcements, prices, tables, { rulesOnly, modelCutoff });

    const snapshot: TickerSnapshot = {
      symbol,
      company,
      fetchedAt: new Date().toISOString(),
      prices,
      announcements,
      tables,
      transcripts,
    };

    writeSnapshot(snapshot, filings);
    index.companies[symbol] = { company, industry: announcements[0]?.industry ?? null };

    const surfaced = filings.filter((f) => f.materiality.tier !== "routine").length;
    const modelled = filings.filter((f) => f.headlineSource === "model").length;

    console.log(
      `${prices.length} bars · ${filings.length} filings (${surfaced} material) · ` +
        `${tables?.quarters.columns.length ?? 0} quarters · ${transcripts.length} transcripts · ` +
        `${modelled} written · ${((Date.now() - started) / 1000).toFixed(1)}s` +
        (degraded.length > 0 ? ` · reused cached ${degraded.join(", ")}` : ""),
    );
    ok++;
  } catch (err) {
    console.log(`FAILED — ${(err as Error).message}`);
    failed++;
  }
}

writeIndex(index);

const t = sessionTotals();
persist();

console.log(`\n  ${ok} ingested, ${failed} failed`);
if (t.calls > 0) {
  console.log(
    `  ${t.calls} model calls (${t.cacheHits} from cache) · ` +
      `${(t.inputTokens + t.outputTokens).toLocaleString()} tokens · $${t.costUsd.toFixed(4)}`,
  );
  for (const [task, s] of Object.entries(t.byTask)) {
    console.log(`     ${task.padEnd(20)} ${String(s.calls).padStart(4)} calls  $${s.costUsd.toFixed(4)}`);
  }
}
console.log("");

process.exit(failed > 0 && ok === 0 ? 1 : 0);
