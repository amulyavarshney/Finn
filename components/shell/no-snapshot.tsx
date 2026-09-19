import { Database } from "lucide-react";

/**
 * Shown when no snapshot has been ingested yet. Tells the reader exactly which
 * command fixes it -- a blank screen with no instruction is the worst outcome
 * for someone cloning the repo.
 */
export function NoSnapshot() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div
        className="glass-tile grid h-14 w-14 place-items-center"
        style={{ background: "var(--surface-sunken)" }}
      >
        <Database size={22} className="text-tertiary" />
      </div>

      <div>
        <h1 className="text-[17px] font-semibold tracking-display text-primary">No data ingested</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          FINN reads committed snapshots rather than scraping at request time. Run the ingest once
          to populate them.
        </p>
      </div>

      <code className="rounded-xl border border-hairline bg-surface-sunken px-3.5 py-2 text-[12px] tnum text-primary">
        npm run ingest
      </code>

      <p className="max-w-[300px] text-[11px] leading-relaxed text-tertiary">
        No API key is needed. Without one, categories and summaries fall back to deterministic rules
        and the feed still works.
      </p>
    </div>
  );
}
