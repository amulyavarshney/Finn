import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Token and cost accounting.
 *
 * "Efficiency earns bonus points" is only a claim until it is a number, so
 * every call — including cache hits, which are recorded at zero cost — lands
 * here, and the total is reported in the README and on /tune.
 */

export interface LedgerEntry {
  task: string;
  provider: string;
  model: string;
  tier: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached: boolean;
  at: string;
}

export interface LedgerTotals {
  calls: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byTask: Record<string, { calls: number; cacheHits: number; costUsd: number; tokens: number }>;
}

const LEDGER_PATH = join(process.cwd(), "data", "llm-ledger.json");

const session: LedgerEntry[] = [];

export function record(entry: Omit<LedgerEntry, "at">): void {
  session.push({ ...entry, at: new Date().toISOString() });
}

export function totals(entries: LedgerEntry[] = session): LedgerTotals {
  const out: LedgerTotals = {
    calls: 0,
    cacheHits: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    byTask: {},
  };

  for (const e of entries) {
    out.calls++;
    if (e.cached) out.cacheHits++;
    out.inputTokens += e.inputTokens;
    out.outputTokens += e.outputTokens;
    out.costUsd += e.costUsd;

    const task = (out.byTask[e.task] ??= { calls: 0, cacheHits: 0, costUsd: 0, tokens: 0 });
    task.calls++;
    if (e.cached) task.cacheHits++;
    task.costUsd += e.costUsd;
    task.tokens += e.inputTokens + e.outputTokens;
  }

  return out;
}

/** Merges the session into the on-disk ledger. Local runs only; no-ops on Vercel. */
export function persist(): LedgerTotals | null {
  if (session.length === 0) return null;
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    const existing: LedgerEntry[] = existsSync(LEDGER_PATH)
      ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")).entries ?? []
      : [];
    const merged = [...existing, ...session];
    writeFileSync(
      LEDGER_PATH,
      JSON.stringify({ updatedAt: new Date().toISOString(), totals: totals(merged), entries: merged }, null, 2),
    );
    return totals(merged);
  } catch {
    return null;
  }
}

export function loadLedger(): { totals: LedgerTotals; entries: LedgerEntry[] } | null {
  try {
    if (!existsSync(LEDGER_PATH)) return null;
    const raw = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
    return { totals: raw.totals ?? totals(raw.entries ?? []), entries: raw.entries ?? [] };
  } catch {
    return null;
  }
}

export function sessionTotals(): LedgerTotals {
  return totals();
}
