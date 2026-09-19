"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { CitationChips } from "./citation-chip";
import type { TableBlock } from "@/lib/research/tables";

/**
 * A block of parsed figures.
 *
 * Every value here came out of a table parse, so this component never shows a
 * loading state and never waits on a model. It is also why the sheet has
 * something substantial on screen before any language arrives.
 */
export function MetricTable({ block }: { block: TableBlock }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{block.title}</p>

      <div className="overflow-hidden rounded-xl border border-hairline">
        {block.rows.map((row, i) => (
          <div
            key={`${row.label}-${i}`}
            className="border-b border-hairline px-3 py-2 last:border-b-0"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-primary">{row.label}</span>

              <span className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold tnum text-primary">{row.value}</span>
                {row.change && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold tnum"
                    style={{ color: toneColor(row.tone) }}
                  >
                    {row.direction === "up" ? (
                      <ArrowUpRight size={11} strokeWidth={2.6} />
                    ) : row.direction === "down" ? (
                      <ArrowDownRight size={11} strokeWidth={2.6} />
                    ) : null}
                    {row.change}
                  </span>
                )}
              </span>
            </div>

            {row.note && <p className="mt-0.5 text-[10px] leading-snug text-tertiary">{row.note}</p>}
          </div>
        ))}
      </div>

      <CitationChips citations={[block.citation]} />
    </div>
  );
}

function toneColor(tone: TableBlock["rows"][number]["tone"]): string {
  switch (tone) {
    case "up":
      return "var(--up)";
    case "down":
      return "var(--down)";
    case "flat":
      return "var(--flat)";
    case "none":
      return "var(--text-tertiary)";
    default: {
      const never: never = tone;
      return never;
    }
  }
}
