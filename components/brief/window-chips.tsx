"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";
import type { WindowKey } from "@/lib/settings";

/**
 * The digest window. The brief asks for 24 hours by default but insists the
 * investor can pick the period, so the three common spans are one tap and an
 * arbitrary range is two.
 */
const CHIPS: Array<{ key: WindowKey; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "3d", label: "3d" },
  { key: "1w", label: "1w" },
];

export function WindowChips({
  active,
  customFrom,
  customTo,
  onSelect,
  onCustom,
}: {
  active: WindowKey;
  customFrom: string | null;
  customTo: string | null;
  onSelect: (key: WindowKey) => void;
  onCustom: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {CHIPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              onSelect(key);
              setOpen(false);
            }}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              active === key ? "text-accent" : "text-secondary hover:text-primary",
            )}
          >
            {active === key && (
              <motion.span
                layoutId="window-chip"
                className="absolute inset-0 rounded-full bg-accent-soft"
                transition={{ type: "spring", stiffness: 480, damping: 36 }}
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "relative flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            active === "custom" ? "text-accent" : "text-secondary hover:text-primary",
          )}
        >
          {active === "custom" && (
            <motion.span
              layoutId="window-chip"
              className="absolute inset-0 rounded-full bg-accent-soft"
              transition={{ type: "spring", stiffness: 480, damping: 36 }}
            />
          )}
          <CalendarRange size={13} className="relative" />
          <span className="relative">
            {active === "custom" && customFrom ? `${short(customFrom)}–${short(customTo ?? today)}` : "Range"}
          </span>
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center gap-2 overflow-hidden pl-1"
        >
          <input
            type="date"
            max={today}
            defaultValue={customFrom ?? today}
            onChange={(e) => onCustom(e.target.value, customTo ?? today)}
            className="rounded-lg border border-hairline bg-surface px-2 py-1 text-[11px] tnum text-primary"
            aria-label="From date"
          />
          <span className="text-tertiary">→</span>
          <input
            type="date"
            max={today}
            defaultValue={customTo ?? today}
            onChange={(e) => onCustom(customFrom ?? today, e.target.value)}
            className="rounded-lg border border-hairline bg-surface px-2 py-1 text-[11px] tnum text-primary"
            aria-label="To date"
          />
        </motion.div>
      )}
    </div>
  );
}

function short(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
