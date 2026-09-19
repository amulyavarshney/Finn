"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A signed change.
 *
 * Colour is never the only carrier of meaning: every delta also renders an
 * arrow and an explicit sign, so the up/down reading survives colour-blindness
 * and greyscale. Green is up and red is down, per Indian market convention.
 */
export function Delta({
  value,
  suffix = "%",
  digits = 1,
  size = "sm",
  showIcon = true,
  className,
}: {
  value: number | null;
  suffix?: string;
  digits?: number;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  className?: string;
}) {
  if (value === null) {
    return <span className={cn("text-tertiary tnum", className)}>—</span>;
  }

  const flat = Math.abs(value) < 0.05;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? "text-flat" : value > 0 ? "text-up" : "text-down";
  const textSize = size === "xs" ? "text-[11px]" : size === "sm" ? "text-xs" : "text-sm";
  const iconSize = size === "xs" ? 11 : size === "sm" ? 13 : 15;

  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tnum", tone, textSize, className)}>
      {showIcon && <Icon size={iconSize} strokeWidth={2.6} />}
      {value > 0 && !flat ? "+" : ""}
      {value.toFixed(digits)}
      {suffix}
    </span>
  );
}

/** Same semantics, filled pill form, for use inside dense card headers. */
export function DeltaPill({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  const flat = Math.abs(value) < 0.05;

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum"
      style={{
        background: flat ? "var(--surface-sunken)" : value > 0 ? "var(--up-soft)" : "var(--down-soft)",
        color: flat ? "var(--flat)" : value > 0 ? "var(--up)" : "var(--down)",
      }}
    >
      {value > 0 && !flat ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
