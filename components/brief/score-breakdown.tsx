"use client";

import type { MaterialityBreakdown } from "@/lib/types";

/**
 * Why a filing ranked where it did.
 *
 * Ranking is the product, so an opaque score would be asking for trust we have
 * not earned. Every contribution is listed with its sign and reason, which
 * makes the judgment arguable -- and an investor who disagrees can go and move
 * the dial or the thresholds instead of losing faith in the feed.
 */
export function ScoreBreakdown({ materiality }: { materiality: MaterialityBreakdown }) {
  const max = Math.max(...materiality.factors.map((f) => Math.abs(f.points)), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
          Why this ranked here
        </span>
        <span className="text-xs tnum text-secondary">
          <span className="text-base font-semibold text-primary">{materiality.score}</span>
          <span className="text-tertiary">/100 · {materiality.tier}</span>
        </span>
      </div>

      <ul className="space-y-1.5">
        {materiality.factors.map((factor, i) => {
          const positive = factor.points >= 0;
          return (
            <li key={`${factor.label}-${i}`} className="flex items-start gap-2.5">
              <div className="mt-1 h-7 w-[3px] shrink-0 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="w-full rounded-full"
                  style={{
                    height: `${(Math.abs(factor.points) / max) * 100}%`,
                    background: positive ? "var(--up)" : "var(--down)",
                  }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-primary">{factor.label}</span>
                  <span
                    className="shrink-0 text-xs font-semibold tnum"
                    style={{ color: positive ? "var(--up)" : "var(--down)" }}
                  >
                    {positive ? "+" : "−"}
                    {Math.abs(factor.points)}
                  </span>
                </div>
                <p className="text-[11.5px] leading-snug text-tertiary">{factor.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
