"use client";

import { memo } from "react";
import { Paperclip } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { CATEGORY_META } from "@/lib/categories";
import { DeltaPill } from "@/components/ui/delta";
import { GlassCard, GlassTile } from "@/components/glass/glass";
import { Sparkline } from "@/components/ui/sparkline";
import { relativeTime } from "@/lib/format";
import type { Filing } from "@/lib/types";

/**
 * One filing in the Brief.
 *
 * Dense on purpose -- the brief asks for density and design together, so a card
 * carries the category glyph, ticker, age, score, the "so what" line and the
 * market's reaction, and stops there. Anything more goes behind a tap.
 *
 * Deliberately a GlassCard rather than a GlassPanel: this is the one component
 * that renders dozens of times inside a scroll container, and a real
 * backdrop-filter here is what would cost the feed its frame rate.
 */
export const FilingCard = memo(function FilingCard({
  filing,
  prices,
  index,
  onOpen,
}: {
  filing: Filing;
  prices: number[];
  index: number;
  onOpen: (filing: Filing) => void;
}) {
  const reduced = useReducedMotion();
  const meta = CATEGORY_META[filing.category];
  const { tier, score } = filing.materiality;

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : // Stagger caps out so a long list does not crawl in.
            { type: "spring", stiffness: 380, damping: 32, delay: Math.min(index * 0.024, 0.36) }
      }
    >
      <GlassCard tier={tier} className="overflow-hidden">
        <button
          onClick={() => onOpen(filing)}
          className="w-full px-3.5 py-3 text-left active:opacity-70"
          aria-label={`${filing.symbol}: ${filing.headline}`}
        >
          <div className="flex items-start gap-3">
            <GlassTile category={filing.category} size={34} className="mt-0.5" />

            <div className="min-w-0 flex-1">
              {/* Row 1: identity and score */}
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[12.5px] font-bold tracking-tight text-primary">
                  {filing.symbol}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-tertiary">
                  {meta.label}
                </span>
                <span className="text-[10px] text-tertiary">·</span>
                <span className="text-[10px] tnum text-tertiary">{relativeTime(filing.filedAt)}</span>

                <span className="ml-auto flex items-center gap-1.5">
                  {filing.reaction && Math.abs(filing.reaction.priceChangePct) >= 1 && (
                    <DeltaPill value={filing.reaction.priceChangePct} />
                  )}
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tnum"
                    style={{ background: `var(--tier-${tier})`, color: "white", opacity: 0.92 }}
                  >
                    {score}
                  </span>
                </span>
              </div>

              {/* Row 2: the line that decides whether they tap */}
              <p className="text-[13.5px] font-medium leading-[1.35] text-primary">
                {filing.headline}
              </p>

              {/* Row 3: supporting signal */}
              <div className="mt-1.5 flex items-center gap-2">
                {filing.reaction && filing.reaction.volumeMultiple >= 1.5 && (
                  <span className="text-[10.5px] font-medium tnum text-secondary">
                    {filing.reaction.volumeMultiple.toFixed(1)}× vol
                  </span>
                )}
                {filing.attachmentUrl && (
                  <Paperclip size={10.5} className="text-tertiary" aria-label="Has attachment" />
                )}
                {prices.length > 2 && <Sparkline values={prices} className="ml-auto" />}
              </div>
            </div>
          </div>
        </button>
      </GlassCard>
    </motion.div>
  );
});
