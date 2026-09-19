/**
 * Source health check: `npx tsx scripts/check-sources.ts [SYMBOL]`
 *
 * All three upstreams are scraped rather than contracted APIs, so they will
 * eventually change shape. This exercises each adapter end to end and prints
 * what came back, which turns "the app is broken" into "screener changed its
 * table markup" in about ten seconds.
 */
import { extractPdf, guidancePassages } from "../lib/sources/pdf";
import { fetchAnnouncements } from "../lib/sources/nse";
import { fetchScreenerTables, seriesFor } from "../lib/sources/screener";
import { averageVolume, fetchPrices } from "../lib/sources/yahoo";

const symbol = (process.argv[2] ?? "TITAN").toUpperCase();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(12)} ${detail}`);
}

console.log(`\nChecking sources for ${symbol}\n`);

const prices = await fetchPrices(symbol, 60);
report(
  "yahoo",
  prices.length > 20,
  `${prices.length} bars, last ${prices.at(-1)?.date} close ${prices.at(-1)?.close?.toFixed(2)}, 20d avg vol ${Math.round(averageVolume(prices) ?? 0).toLocaleString("en-IN")}`,
);

const anns = await fetchAnnouncements(symbol, 8);
report("nse", anns.length > 0, `${anns.length} announcements, newest ${anns[0]?.filedAt.slice(0, 10)}`);
for (const a of anns.slice(0, 4)) {
  console.log(
    `         · ${a.filedAt.slice(0, 10)}  ${a.desc.slice(0, 40).padEnd(40)} ${String(a.text.length).padStart(5)}ch ${a.attachmentUrl ? "pdf" : "   "}`,
  );
}

const tables = await fetchScreenerTables(symbol);
report(
  "screener",
  !!tables && tables.quarters.columns.length > 4,
  tables
    ? `${tables.name} — ${tables.quarters.columns.length} quarters, ${tables.profitLoss.rows.length} P&L rows, ${tables.balanceSheet.rows.length} BS rows, ${tables.cashFlow.rows.length} CF rows`
    : "no usable page",
);

if (tables) {
  const sales = seriesFor(tables.quarters, ["Sales", "Revenue"]);
  report(
    "quarters",
    !!sales && sales.values.some((v) => v.value != null),
    `"${sales?.label}" → ${sales?.values
      .slice(-3)
      .map((v) => `${v.period}: ${v.value}`)
      .join(", ")}`,
  );
  report(
    "documents",
    tables.annualReports.length > 0 || tables.concalls.length > 0,
    `${tables.annualReports.length} annual reports, ${tables.concalls.filter((c) => c.transcriptUrl).length} transcripts (${tables.concalls.slice(0, 4).map((c) => c.label).join(", ")})`,
  );

  const url = tables.concalls.find((c) => c.transcriptUrl)?.transcriptUrl;
  if (url) {
    const doc = await extractPdf(url);
    const passages = guidancePassages(doc?.text ?? "");
    report(
      "pdf",
      !!doc && doc.text.length > 5000,
      `${doc?.pages} pages, ${doc?.text.length.toLocaleString()} chars (~${Math.round((doc?.text.length ?? 0) / 4).toLocaleString()} tokens), ${passages.length} guidance passages`,
    );
    if (passages[0]) console.log(`         · "${passages[0].passage.slice(0, 120)}…"`);
  } else {
    report("pdf", false, "no transcript link to test");
  }
}

console.log(`\n${failures === 0 ? "All sources healthy." : `${failures} source check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
