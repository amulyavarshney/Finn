"use client";

import { useEffect, useRef } from "react";

import { TIER_THRESHOLDS } from "@/lib/categories";

/**
 * The materiality dial -- FINN's signature control.
 *
 * The brief's thesis is that filtering, not aggregating, is the scarce skill.
 * That belief deserves a physical control rather than a settings page full of
 * checkboxes: one knob that says how much noise you will tolerate today, with
 * the feed reacting under your thumb and a live count of what survived.
 *
 * A native range input does the work, so keyboard, screen-reader and touch
 * support come for free; everything else here is the skin over it.
 */
export function MaterialityDial({
  value,
  onChange,
  surfaced,
  total,
}: {
  value: number;
  onChange: (next: number) => void;
  surfaced: number;
  total: number;
}) {
  const lastTick = useRef(surfaced);

  // A short haptic tick each time an item drops out or returns, so the
  // filtering is felt as well as seen.
  useEffect(() => {
    if (surfaced !== lastTick.current) {
      lastTick.current = surfaced;
      navigator.vibrate?.(8);
    }
  }, [surfaced]);

  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="px-1">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
            Materiality floor
          </span>
          <span className="text-[13px] font-semibold tnum text-primary">{value}</span>
        </div>
        <span className="text-[11px] tnum text-secondary">
          showing <span className="font-semibold text-primary">{surfaced}</span> of {total}
        </span>
      </div>

      <div className="relative h-6">
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, var(--tier-routine), var(--tier-medium) 40%, var(--tier-high) 72%, var(--tier-critical))",
            }}
          />
        </div>

        {/* Tier boundaries, so the number on the dial has meaning. */}
        {Object.entries(TIER_THRESHOLDS).map(([tier, at]) => (
          <div
            key={tier}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-hairline-strong"
            style={{ left: `${at}%` }}
            aria-hidden
          />
        ))}

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Materiality floor"
          aria-valuetext={`${value} of 100, showing ${surfaced} of ${total} filings`}
          className="absolute inset-0 w-full cursor-grab appearance-none bg-transparent active:cursor-grabbing [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-hairline-strong [&::-webkit-slider-thumb]:bg-surface-raised [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-hairline-strong [&::-moz-range-thumb]:bg-surface-raised"
        />
      </div>

      <div className="mt-1 flex justify-between text-[9.5px] uppercase tracking-wide text-tertiary">
        <span>everything</span>
        <span>material only</span>
      </div>
    </div>
  );
}
