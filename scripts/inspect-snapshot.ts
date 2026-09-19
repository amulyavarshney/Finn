/**
 * `npx tsx scripts/inspect-snapshot.ts [SYMBOL]`
 *
 * Prints the category mix, tier mix and the top-scoring filings for an
 * ingested ticker. Used to tune the materiality weights -- the ranking is a
 * judgment call, so it needs to be eyeballed against real filings rather than
 * assumed correct.
 */
import { readSnapshot } from "../lib/snapshot";

const symbol = (process.argv[2] ?? "TITAN").toUpperCase();
const snap = readSnapshot(symbol);

if (!snap) {
  console.error(`No snapshot for ${symbol}. Run: npm run ingest -- --ticker ${symbol}`);
  process.exit(1);
}

console.log(`\n${snap.company} (${symbol}) — ${snap.filings.length} filings\n`);

const byCategory = new Map<string, number>();
const byTier = new Map<string, number>();
const bySource = new Map<string, number>();

for (const f of snap.filings) {
  byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  byTier.set(f.materiality.tier, (byTier.get(f.materiality.tier) ?? 0) + 1);
  bySource.set(f.categorySource, (bySource.get(f.categorySource) ?? 0) + 1);
}

console.log("Tier mix");
for (const tier of ["critical", "high", "medium", "routine"]) {
  const n = byTier.get(tier) ?? 0;
  const bar = "█".repeat(Math.round((n / snap.filings.length) * 40));
  console.log(`  ${tier.padEnd(9)} ${String(n).padStart(4)}  ${bar}`);
}

console.log("\nCategory mix");
for (const [cat, n] of [...byCategory].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat.padEnd(20)} ${String(n).padStart(4)}`);
}

console.log("\nClassified by");
for (const [src, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
  const pct = ((n / snap.filings.length) * 100).toFixed(0);
  console.log(`  ${src.padEnd(10)} ${String(n).padStart(4)}  ${pct}%`);
}

console.log("\nTop 12 by materiality");
for (const f of snap.filings.slice(0, 12)) {
  console.log(
    `\n  ${String(f.materiality.score).padStart(3)} ${f.materiality.tier.padEnd(8)} ${f.category.padEnd(18)} ${f.filedAt.slice(0, 10)}`,
  );
  console.log(`      ${f.headline.slice(0, 110)}`);
  console.log(
    `      factors: ${f.materiality.factors.map((x) => `${x.label} ${x.points >= 0 ? "+" : ""}${x.points}`).join(", ")}`,
  );
  if (f.enrichment?.kind === "results") {
    const m = f.enrichment.metrics
      .map((x) => `${x.label} ${x.current}${x.unit === "pct" ? "%" : ""} (QoQ ${x.qoqPct?.toFixed(1) ?? "—"}%)`)
      .join("  ");
    console.log(`      results ${f.enrichment.quarter}: ${m}`);
  }
  if (f.enrichment?.kind === "management_change") {
    console.log(
      `      people: ${f.enrichment.people.map((p) => `${p.name} (${p.direction}${p.role ? `, ${p.role}` : ""})`).join("; ")}`,
    );
  }
}

console.log("\nBottom 5 (correctly buried?)");
for (const f of snap.filings.slice(-5)) {
  console.log(`  ${String(f.materiality.score).padStart(3)} ${f.category.padEnd(16)} ${f.headline.slice(0, 84)}`);
}
console.log("");
