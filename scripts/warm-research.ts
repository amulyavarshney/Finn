/**
 * Warms the model cache for the pull side.
 *
 *   npm run warm                     the default demo tickers
 *   npm run warm -- INFY TITAN       specific ones
 *
 * The research sheet's five written sections are generated on demand, and on a
 * free Groq tier the token-per-minute ceiling makes a cold sheet take minutes --
 * longer than the route's own `maxDuration`. Every response is content-hash
 * cached to `data/llm-cache/`, which is committed and bundled into the
 * deployment, so running this once makes those tickers instant everywhere.
 *
 * It calls the same builders the route does rather than going over HTTP, so
 * there is nothing to keep running while it works.
 */
import { bullBear, businessNarrative, guidanceSummary, narrativeVsNumbers } from "../lib/research/narrative";
import { buildPromisedVsDelivered } from "../lib/research/guidance";
import { llmAvailable } from "../lib/llm/router";
import { persist, sessionTotals } from "../lib/llm/ledger";
import { readSnapshot } from "../lib/snapshot";

const DEFAULT_TICKERS = ["INFY", "TITAN", "DIXON"];

const symbols = (process.argv.slice(2).filter((a) => !a.startsWith("--")).length > 0
  ? process.argv.slice(2).filter((a) => !a.startsWith("--"))
  : DEFAULT_TICKERS
).map((s) => s.toUpperCase());

if (!llmAvailable()) {
  console.error("\nNo API key resolved. Set GROQ_API_KEY in .env.local.\n");
  process.exit(1);
}

console.log(`\nWarming research cache for ${symbols.join(", ")}\n`);

for (const symbol of symbols) {
  const snapshot = readSnapshot(symbol);

  if (!snapshot) {
    console.log(`  ${symbol.padEnd(12)}no snapshot — run: npm run ingest -- --ticker ${symbol}`);
    continue;
  }

  if (snapshot.transcripts.length === 0) {
    console.log(`  ${symbol.padEnd(12)}no transcripts, nothing to ground a written section in`);
    continue;
  }

  const sections = [
    { id: "business", run: () => businessNarrative(snapshot) },
    { id: "guidance", run: () => guidanceSummary(snapshot) },
    { id: "promised", run: () => buildPromisedVsDelivered(snapshot) },
    { id: "narrative", run: () => narrativeVsNumbers(snapshot) },
    { id: "bullbear", run: () => bullBear(snapshot) },
  ];

  process.stdout.write(`  ${symbol.padEnd(12)}`);

  for (const section of sections) {
    const started = Date.now();
    try {
      const payload = await section.run();
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(payload === null ? `${section.id}:empty ` : `${section.id}:${secs}s `);
    } catch (err) {
      process.stdout.write(`${section.id}:FAILED(${(err as Error).message.slice(0, 40)}) `);
    }
  }

  console.log("");
}

const t = sessionTotals();
persist();

console.log(
  `\n  ${t.calls} model calls (${t.cacheHits} from cache) · ` +
    `${(t.inputTokens + t.outputTokens).toLocaleString()} tokens · $${t.costUsd.toFixed(4)}\n`,
);
