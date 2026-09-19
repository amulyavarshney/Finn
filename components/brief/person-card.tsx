"use client";

import { ArrowDownLeft, ArrowUpRight, Info } from "lucide-react";

import type { PersonEnrichment } from "@/lib/types";

/**
 * Management-change enrichment.
 *
 * The brief's example: don't just say "CFO resigned" -- say who is arriving and
 * where they came from, so the reader places them instantly.
 *
 * Where a background came from is labelled rather than implied. The pull side's
 * primary-source discipline does not apply to a person's professional history,
 * but the investor should still be able to see which is which.
 */
export function PersonCard({ enrichment }: { enrichment: PersonEnrichment }) {
  return (
    <div className="space-y-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
        Who moved
      </span>

      <div className="space-y-2">
        {enrichment.people.map((person, i) => {
          const incoming = person.direction === "incoming";
          const Icon = incoming ? ArrowUpRight : ArrowDownLeft;
          const tone = incoming ? "var(--up)" : "var(--down)";

          return (
            <div
              key={`${person.name}-${i}`}
              className="rounded-xl border border-hairline bg-surface-sunken p-3"
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="glass-tile mt-0.5 grid h-7 w-7 shrink-0 place-items-center"
                  style={{ background: incoming ? "var(--up-soft)" : "var(--down-soft)" }}
                >
                  <Icon size={14} strokeWidth={2.4} style={{ color: tone }} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-primary">{person.name}</span>
                    <span
                      className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider"
                      style={{ color: tone }}
                    >
                      {incoming ? "joining" : "leaving"}
                    </span>
                  </div>

                  {person.role && (
                    <p className="text-[12px] leading-snug text-secondary">{person.role}</p>
                  )}

                  {person.background ? (
                    <>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-primary">
                        {person.background}
                      </p>
                      {person.backgroundSource && (
                        <p className="mt-1 text-[10px] text-tertiary">{person.backgroundSource}</p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-tertiary">
                      <Info size={11} className="mt-0.5 shrink-0" />
                      The filing gives no background for this person.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
