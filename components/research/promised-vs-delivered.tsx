"use client";

import { Check, CircleSlash, Minus, Quote, X } from "lucide-react";
import { motion } from "motion/react";

import { CitationChips } from "./citation-chip";
import { GlassCard } from "@/components/glass/glass";
import type { GuidanceClaim } from "@/lib/types";
import type { PromisedVsDelivered as Data } from "@/lib/research/guidance";

/**
 * Promised vs Delivered -- the sheet's headline view.
 *
 * The brief calls this the difference between summarising management and
 * analysing them, so it leads the research sheet and gets the strongest
 * treatment: management's own words on one side, the reported figure on the
 * other, and a verdict between them.
 *
 * "Unverifiable" is a first-class outcome rather than a failure. Capex plans and
 * store counts are not in the standardised tables, and saying so is more useful
 * than a confident guess.
 */
export function PromisedVsDelivered({ data }: { data: Data }) {
  if (data.claims.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center">
        <p className="text-[12.5px] leading-relaxed text-secondary">
          {data.unavailableReason ?? "No checkable guidance found."}
        </p>
      </div>
    );
  }

  const tally = data.claims.reduce<Record<GuidanceClaim["verdict"], number>>(
    (acc, c) => ({ ...acc, [c.verdict]: (acc[c.verdict] ?? 0) + 1 }),
    { hit: 0, miss: 0, partial: 0, unverifiable: 0 },
  );

  return (
    <div className="space-y-3">
      {/* Scorecard */}
      <div className="flex gap-1.5">
        {(["hit", "partial", "miss", "unverifiable"] as const).map((verdict) => {
          const style = VERDICT[verdict];
          const count = tally[verdict];
          return (
            <div
              key={verdict}
              className="flex-1 rounded-xl border border-hairline px-2 py-2 text-center"
              style={{ background: count > 0 ? style.soft : "var(--surface-sunken)" }}
            >
              <p
                className="text-[17px] font-bold leading-none tnum"
                style={{ color: count > 0 ? style.color : "var(--text-tertiary)" }}
              >
                {count}
              </p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-tertiary">
                {style.label}
              </p>
            </div>
          );
        })}
      </div>

      <p className="px-1 text-[10.5px] leading-snug text-tertiary">
        Guidance taken from the last {data.quartersCovered.length} earnings calls (
        {data.quartersCovered.join(", ")}) and checked against the reported quarter that followed.
      </p>

      {/* Claims */}
      <div className="space-y-2.5">
        {data.claims.map((claim, i) => (
          <ClaimCard key={`${claim.quarter}-${i}`} claim={claim} index={i} />
        ))}
      </div>
    </div>
  );
}

function ClaimCard({ claim, index }: { claim: GuidanceClaim; index: number }) {
  const style = VERDICT[claim.verdict];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), type: "spring", stiffness: 380, damping: 32 }}
    >
      <GlassCard className="overflow-hidden">
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ background: style.soft }}
        >
          <Icon size={12} strokeWidth={2.6} style={{ color: style.color }} />
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: style.color }}
          >
            {style.label}
          </span>
          <span className="ml-auto text-[10px] tnum text-tertiary">{claim.quarter} call</span>
        </div>

        <div className="space-y-2.5 px-3 py-3">
          {/* Promised: management's own words */}
          <div>
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-tertiary">
              Promised
            </p>
            <div className="flex gap-1.5">
              <Quote size={11} className="mt-[3px] shrink-0 text-tertiary" />
              <p className="text-[12.5px] italic leading-relaxed text-secondary">
                &ldquo;{claim.quote}&rdquo;
              </p>
            </div>
            <p className="mt-1 text-[12px] font-medium text-primary">{claim.promised}</p>
          </div>

          {/* Delivered: the reported figure */}
          <div className="border-t border-hairline pt-2.5">
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-tertiary">
              Delivered
            </p>
            <p className="text-[13px] font-semibold tnum" style={{ color: style.color }}>
              {claim.delivered ?? "Not yet reported"}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-tertiary">{claim.reasoning}</p>
          </div>

          <CitationChips citations={[claim.citation]} />
        </div>
      </GlassCard>
    </motion.div>
  );
}

const VERDICT = {
  hit: { label: "Hit", color: "var(--up)", soft: "var(--up-soft)", icon: Check },
  partial: { label: "Partial", color: "var(--tier-high)", soft: "var(--accent-soft)", icon: Minus },
  miss: { label: "Miss", color: "var(--down)", soft: "var(--down-soft)", icon: X },
  unverifiable: {
    label: "Can't check",
    color: "var(--flat)",
    soft: "var(--surface-sunken)",
    icon: CircleSlash,
  },
} as const;
