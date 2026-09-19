/**
 * `npx tsx scripts/survey-descs.ts`
 *
 * Prints the distribution of NSE's own `desc` subject lines across a sample of
 * tickers. The categorisation rules table is built from this, so that mapping
 * reflects what the exchange actually emits rather than what we assume it does.
 */
import { fetchAnnouncements } from "../lib/sources/nse";

const SAMPLE = ["RELIANCE", "TITAN", "HDFCBANK", "TCS", "ITC", "POLYCAB", "LAURUSLABS", "BEL"];

const counts = new Map<string, number>();
const examples = new Map<string, string>();

for (const symbol of SAMPLE) {
  try {
    const anns = await fetchAnnouncements(symbol, 600);
    for (const a of anns) {
      counts.set(a.desc, (counts.get(a.desc) ?? 0) + 1);
      if (!examples.has(a.desc) && a.text.length > 40) examples.set(a.desc, a.text);
    }
    console.error(`  fetched ${symbol}: ${anns.length}`);
  } catch (err) {
    console.error(`  failed ${symbol}: ${(err as Error).message}`);
  }
}

const sorted = [...counts].sort((a, b) => b[1] - a[1]);
console.log(`\n${sorted.length} distinct desc values across ${SAMPLE.length} tickers\n`);
for (const [desc, n] of sorted) {
  console.log(`${String(n).padStart(5)}  ${desc}`);
  const ex = examples.get(desc);
  if (ex) console.log(`         e.g. "${ex.slice(0, 110).replace(/\s+/g, " ")}…"`);
}
