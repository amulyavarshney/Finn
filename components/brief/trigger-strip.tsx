"use client";

import Link from "next/link";
import { Activity, BellRing, SlidersHorizontal, TrendingUp } from "lucide-react";
import { motion } from "motion/react";

import { GlassCard } from "@/components/glass/glass";
import type { TriggeredAlert } from "@/lib/types";

/**
 * Threshold alerts, pinned above the digest.
 *
 * These are answers to a question the investor set themselves -- "tell me when
 * volume doubles" -- so they sit apart from the ranked feed, which answers a
 * question FINN asked on their behalf. Empty is the normal state and reads as
 * reassurance rather than a gap.
 */
export function TriggerStrip({ alerts }: { alerts: TriggeredAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-hairline px-3 py-2.5">
        <BellRing size={13} className="shrink-0 text-tertiary" />
        <p className="flex-1 text-[11.5px] text-tertiary">
          No thresholds crossed. Nothing in the book is behaving unusually.
        </p>
        <Link href="/tune" className="shrink-0 text-[11px] font-semibold text-accent">
          Tune
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
          <BellRing size={12} style={{ color: "var(--tier-high)" }} />
          {alerts.length} {alerts.length === 1 ? "trigger" : "triggers"} fired
        </span>
        <Link
          href="/tune"
          className="flex items-center gap-1 text-[11px] font-semibold text-accent"
        >
          <SlidersHorizontal size={11} />
          Thresholds
        </Link>
      </div>

      {/* Horizontal rail: triggers are glanceable, so they scroll sideways
          instead of pushing the digest below the fold. */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
        {alerts.map((alert, i) => {
          const Icon = alert.kind === "volume" ? Activity : alert.kind === "price" ? TrendingUp : BellRing;
          const tone =
            alert.kind === "price"
              ? "var(--tier-critical)"
              : alert.kind === "volume"
                ? "var(--tier-high)"
                : "var(--accent)";

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), type: "spring", stiffness: 400, damping: 34 }}
              className="w-[212px] shrink-0 snap-start"
            >
              <Link href={`/c/${alert.symbol}`}>
                <GlassCard className="h-full px-3 py-2.5" style={{ borderLeft: `2px solid ${tone}` }}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon size={12} style={{ color: tone }} strokeWidth={2.4} />
                    <span className="text-[11.5px] font-bold text-primary">{alert.symbol}</span>
                    <span className="ml-auto text-[9.5px] tnum text-tertiary">{alert.date}</span>
                  </div>
                  <p className="text-[12.5px] font-semibold leading-tight" style={{ color: tone }}>
                    {alert.summary}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-tertiary">
                    {alert.detail}
                  </p>
                </GlassCard>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
