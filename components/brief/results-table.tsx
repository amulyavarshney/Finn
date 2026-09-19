"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { formatCrore, formatPercent, formatPoints } from "@/lib/format";
import type { ResultsEnrichment } from "@/lib/types";

/**
 * The headline numbers off a results filing: Revenue, EBITDA, PBT and PAT,
 * this quarter against last and against the same quarter a year ago.
 *
 * These are the four the brief names, and every value is read from screener's
 * standardised quarterly table rather than generated -- so the QoQ and YoY
 * columns are arithmetic, not a model's opinion.
 */
export function ResultsTable({ enrichment }: { enrichment: ResultsEnrichment }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
          {enrichment.quarter} results
        </span>
        <span className="text-[10px] text-tertiary">
          vs {enrichment.previousQuarter ?? "—"} · vs {enrichment.yearAgoQuarter ?? "—"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 border-b border-hairline bg-surface-sunken px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
          <span>Metric</span>
          <span className="text-right">{enrichment.quarter}</span>
          <span className="w-[52px] text-right">QoQ</span>
          <span className="w-[52px] text-right">YoY</span>
        </div>

        {enrichment.metrics.map((m) => (
          <div
            key={m.label}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 border-b border-hairline px-3 py-2 last:border-b-0"
          >
            <span className="text-[13px] font-medium text-primary">{m.label}</span>

            <span className="text-right text-[13px] font-semibold tnum text-primary">
              {m.unit === "pct" ? (
                <CountUp value={m.current} suffix="%" digits={1} />
              ) : (
                <CountUp value={m.current} formatter={formatCrore} />
              )}
            </span>

            <ChangeCell value={m.qoqPct} unit={m.unit} />
            <ChangeCell value={m.yoyPct} unit={m.unit} />
          </div>
        ))}
      </div>

      <p className="text-[10.5px] leading-snug text-tertiary">
        Figures parsed from screener.in&rsquo;s standardised quarterly table. EBITDA is operating
        profit before interest, depreciation and other income. Margin changes are percentage points.
      </p>
    </div>
  );
}

function ChangeCell({ value, unit }: { value: number | null; unit: "cr" | "pct" }) {
  if (value === null) {
    return <span className="w-[52px] text-right text-xs tnum text-tertiary">—</span>;
  }

  const flat = Math.abs(value) < 0.05;
  const tone = flat ? "var(--flat)" : value > 0 ? "var(--up)" : "var(--down)";

  return (
    <span className="w-[52px] text-right text-[11.5px] font-semibold tnum" style={{ color: tone }}>
      {unit === "pct" ? formatPoints(value, 1) : formatPercent(value, 1)}
    </span>
  );
}

/**
 * Counts a figure up on first paint. Tabular numerals keep the column from
 * jittering while it animates.
 */
function CountUp({
  value,
  formatter,
  suffix = "",
  digits = 0,
}: {
  value: number | null;
  formatter?: (v: number | null) => string;
  suffix?: string;
  digits?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (value === null || reduced) {
      setShown(value);
      return;
    }

    const duration = 520;
    const start = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // Ease-out cubic: fast settle, no overshoot on financial figures.
      setShown(value * (1 - (1 - p) ** 3));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, reduced]);

  if (value === null) return <>—</>;
  if (formatter) return <>{formatter(shown)}</>;
  return (
    <>
      {(shown ?? 0).toFixed(digits)}
      {suffix}
    </>
  );
}
