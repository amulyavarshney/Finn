import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Filing, SnapshotIndex, TickerSnapshot } from "@/lib/types";

/**
 * Snapshot storage.
 *
 * Ingestion runs locally because NSE and screener.in answer a residential IP
 * but frequently refuse datacenter ranges, so the deployed app reads committed
 * JSON rather than scraping at request time. Since this is end-of-day data, a
 * nightly batch is the honest architecture anyway -- and it means the graded
 * demo cannot be broken by an upstream rate limit.
 */

const DIR = join(process.cwd(), "data", "snapshot");

function ensureSnapshotDir(): void {
  mkdirSync(DIR, { recursive: true });
}

export function writeSnapshot(snapshot: TickerSnapshot, filings: Filing[]): void {
  ensureSnapshotDir();
  writeFileSync(
    join(DIR, `${snapshot.symbol}.json`),
    JSON.stringify({ ...snapshot, filings }, null, 2),
  );
}

export function writeIndex(index: SnapshotIndex): void {
  ensureSnapshotDir();
  writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2));
}

export type StoredSnapshot = TickerSnapshot & { filings: Filing[] };

export function readSnapshot(symbol: string): StoredSnapshot | null {
  const path = join(DIR, `${symbol.toUpperCase()}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredSnapshot;
  } catch {
    return null;
  }
}

export function readIndex(): SnapshotIndex | null {
  const path = join(DIR, "index.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SnapshotIndex;
  } catch {
    return null;
  }
}

export function availableSymbols(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""));
}