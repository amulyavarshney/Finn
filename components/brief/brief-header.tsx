"use client";

import { Moon, Sun } from "lucide-react";

import { GlassPanel } from "@/components/glass/glass";
import { useTheme } from "@/components/glass/theme-provider";
import { formatDate } from "@/lib/format";

/** Sticky chrome for the Brief. One of the four real-blur surfaces. */
export function BriefHeader({
  dataAsOf,
  tickerCount,
  windowLabel,
}: {
  dataAsOf: string | null;
  tickerCount: number;
  windowLabel: string;
}) {
  const { resolved, cycle } = useTheme();

  return (
    <GlassPanel className="sticky top-0 z-30 mb-3 border-b px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-none tracking-display text-primary">
            The Brief
          </h1>
          <p className="mt-1 text-[11.5px] text-secondary">
            Last {windowLabel.toLowerCase()} across {tickerCount} holdings
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dataAsOf && (
            <span className="text-right text-[9.5px] leading-tight tnum text-tertiary">
              EOD data
              <br />
              {formatDate(dataAsOf)}
            </span>
          )}
          <button
            onClick={cycle}
            aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-surface active:scale-95"
          >
            {resolved === "dark" ? (
              <Sun size={15} className="text-secondary" />
            ) : (
              <Moon size={15} className="text-secondary" />
            )}
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
