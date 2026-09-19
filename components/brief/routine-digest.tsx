"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { CATEGORY_META } from "@/lib/categories";
import { GlassCard, GlassTile } from "@/components/glass/glass";
import { relativeTime } from "@/lib/format";
import type { Filing } from "@/lib/types";

/**
 * Everything below the materiality floor, folded into one row.
 *
 * "Burying everything else, beautifully" is half the brief. Routine filings are
 * not hidden -- a compliance certificate you cannot find is its own problem --
 * but they cost one line instead of eighteen cards, and the row names what is
 * inside so the investor can decide without expanding it.
 */
export function RoutineDigest({
  filings,
  onOpen,
}: {
  filings: Filing[];
  onOpen: (filing: Filing) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  if (filings.length === 0) return null;

  const counts = new Map<string, number>();
  for (const f of filings) {
    const label = CATEGORY_META[f.category].label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${n} ${label.toLowerCase()}`)
    .join(", ");

  return (
    <GlassCard className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:opacity-70"
      >
        <div className="flex -space-x-2">
          {[...new Set(filings.map((f) => f.category))].slice(0, 3).map((category) => (
            <GlassTile key={category} category={category} size={26} />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-primary">
            {filings.length} routine {filings.length === 1 ? "filing" : "filings"}
          </p>
          <p className="truncate text-[11px] text-tertiary">{summary}</p>
        </div>

        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} className="text-tertiary" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ul className="border-t border-hairline">
              {filings.map((filing) => (
                <li key={filing.id}>
                  <button
                    onClick={() => onOpen(filing)}
                    className="flex w-full items-center gap-2.5 border-b border-hairline px-3.5 py-2 text-left last:border-b-0 active:bg-surface-sunken"
                  >
                    <GlassTile category={filing.category} size={20} />
                    <span className="w-[74px] shrink-0 truncate text-[10.5px] font-semibold text-secondary">
                      {filing.symbol}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-secondary">
                      {filing.headline}
                    </span>
                    <span className="shrink-0 text-[10px] tnum text-tertiary">
                      {relativeTime(filing.filedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
