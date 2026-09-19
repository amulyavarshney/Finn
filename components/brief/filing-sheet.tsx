"use client";

import Link from "next/link";
import { ExternalLink, FileText, LineChart, Sparkles } from "lucide-react";

import { CATEGORY_META } from "@/lib/categories";
import { Delta } from "@/components/ui/delta";
import { GlassTile } from "@/components/glass/glass";
import { PersonCard } from "./person-card";
import { ResultsTable } from "./results-table";
import { ScoreBreakdown } from "./score-breakdown";
import { Sheet } from "@/components/ui/sheet";
import { formatFilingTime, formatVolumeShort } from "@/lib/format";
import type { Filing } from "@/lib/types";

/**
 * The expanded filing. Progressive disclosure: the card answers "does this
 * matter", the sheet answers "what exactly happened and how do you know".
 *
 * Ordered by what the reader wants next -- enrichment first, then the market's
 * reaction, then the filing's own words, then the ranking rationale, then a
 * route into the pull side.
 */
export function FilingSheet({
  filing,
  onClose,
}: {
  filing: Filing | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={filing !== null} onClose={onClose} title={filing ? filing.company : undefined}>
      {filing && (
        <div className="space-y-5 pb-2">
          {/* Header */}
          <div className="flex items-start gap-3">
            <GlassTile category={filing.category} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{filing.symbol}</span>
                <span className="text-[10px] uppercase tracking-wide text-tertiary">
                  {CATEGORY_META[filing.category].label}
                </span>
              </div>
              <p className="text-[10.5px] tnum text-tertiary">{formatFilingTime(filing.filedAt)} IST</p>
            </div>
          </div>

          <h2 className="text-[17px] font-semibold leading-snug tracking-display text-primary">
            {filing.headline}
          </h2>

          {/* The two enrichments the brief asks for by name */}
          {filing.enrichment?.kind === "results" && <ResultsTable enrichment={filing.enrichment} />}
          {filing.enrichment?.kind === "management_change" && (
            <PersonCard enrichment={filing.enrichment} />
          )}

          {/* What the market did on the day */}
          {filing.reaction && (
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                <LineChart size={12} />
                Market on {filing.reaction.date}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Price move">
                  <Delta value={filing.reaction.priceChangePct} size="md" />
                </Stat>
                <Stat label="Volume vs 20-day avg">
                  <span className="text-sm font-semibold tnum text-primary">
                    {filing.reaction.volumeMultiple.toFixed(2)}×
                  </span>
                </Stat>
              </div>
              <p className="text-[10.5px] text-tertiary">
                {formatVolumeShort(filing.reaction.volume)} traded. End-of-day data, so this is the
                session&rsquo;s verdict rather than an intraday reaction.
              </p>
            </div>
          )}

          {/* The filing's own words */}
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
              <FileText size={12} />
              As filed — {filing.desc}
            </span>
            <p className="whitespace-pre-line rounded-xl border border-hairline bg-surface-sunken p-3 text-[12.5px] leading-relaxed text-secondary">
              {filing.text || "The exchange record carries only a subject line for this filing."}
            </p>
            {filing.attachmentUrl && (
              <a
                href={filing.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent"
              >
                Open the original filing
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          <ScoreBreakdown materiality={filing.materiality} />

          {/* Provenance. Worth being explicit about which parts were written by
              a model and which are deterministic. */}
          <div className="flex items-start gap-1.5 text-tertiary">
            <Sparkles size={11} className="mt-0.5 shrink-0" />
            <p className="text-[10px] leading-snug">
              Category via {sourceLabel(filing.categorySource)}; summary via{" "}
              {sourceLabel(filing.headlineSource)}. All figures are parsed from source tables,
              never generated.
            </p>
          </div>

          <Link
            href={`/c/${filing.symbol}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-soft py-3 text-[13px] font-semibold text-accent"
          >
            Research {filing.symbol} from primary sources
          </Link>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-sunken px-3 py-2">
      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-tertiary">{label}</p>
      {children}
    </div>
  );
}

function sourceLabel(source: "rules" | "model" | "fallback"): string {
  switch (source) {
    case "rules":
      return "deterministic rules";
    case "model":
      return "a language model";
    case "fallback":
      return "the exchange's own subject line";
    default: {
      const never: never = source;
      return never;
    }
  }
}
