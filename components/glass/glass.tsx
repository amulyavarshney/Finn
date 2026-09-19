"use client";

import { forwardRef, type HTMLAttributes } from "react";

import { CATEGORY_META, categoryColors } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { Category, MaterialityTier } from "@/lib/types";

import { useTheme } from "./theme-provider";

/**
 * Real backdrop-filter. Costs a full-viewport readback every frame, so this is
 * only for fixed chrome -- header, tab bar, ask bar, sheets. Four layers max.
 */
export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function GlassPanel({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("glass-chrome", className)} {...rest} />;
  },
);

/**
 * The same material without the blur, for anything that scrolls. Translucent
 * fill, gradient hairline, inset specular highlight.
 */
export const GlassCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { tier?: MaterialityTier }
>(function GlassCard({ className, tier, style, ...rest }, ref) {
  const tint =
    tier === "critical"
      ? { borderLeft: "2px solid var(--tier-critical)" }
      : tier === "high"
        ? { borderLeft: "2px solid var(--tier-high)" }
        : undefined;

  return (
    <div
      ref={ref}
      className={cn("glass-card", tier === "critical" && "sheen overflow-hidden", className)}
      style={{ ...tint, ...style }}
      {...rest}
    />
  );
});

/**
 * The category glyph tile -- a tinted pane of glass with a specular top edge.
 * All seventeen derive fill, glyph and ring colour from one hue value so the
 * set stays tonally consistent.
 */
export function GlassTile({
  category,
  size = 36,
  className,
}: {
  category: Category;
  size?: number;
  className?: string;
}) {
  const { resolved } = useTheme();
  const meta = CATEGORY_META[category];
  const colors = categoryColors(category, resolved === "dark");
  const Icon = meta.icon;

  return (
    <div
      className={cn("glass-tile grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        background: colors.fill,
        borderColor: colors.ring,
      }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} style={{ color: colors.glyph }} />
    </div>
  );
}

/**
 * The drifting field behind everything. Without luminance variation under the
 * chrome, backdrop-filter has nothing to refract and the glass reads as flat
 * grey. Hue leans green when the book is up, amber when triggers are firing.
 */
export function AuroraField({ mood = "neutral" }: { mood?: "up" | "down" | "alert" | "neutral" }) {
  const hues: Record<string, [number, number]> = {
    up: [152, 190],
    down: [25, 300],
    alert: [62, 32],
    neutral: [268, 210],
  };
  const [a, b] = hues[mood] ?? hues.neutral;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas-deep">
      <div className="absolute inset-0 bg-canvas" />
      <div
        className="aurora-a absolute -top-1/4 -left-1/3 h-[85vh] w-[90vw] rounded-full opacity-90 blur-3xl dark:opacity-70"
        style={{ background: `radial-gradient(circle, oklch(0.74 0.16 ${a} / 0.55), transparent 66%)` }}
      />
      <div
        className="aurora-b absolute -right-1/3 top-1/4 h-[75vh] w-[85vw] rounded-full opacity-80 blur-3xl dark:opacity-60"
        style={{ background: `radial-gradient(circle, oklch(0.72 0.15 ${b} / 0.5), transparent 66%)` }}
      />
      <div
        className="aurora-a absolute -bottom-1/4 left-1/4 h-[60vh] w-[70vw] rounded-full opacity-70 blur-3xl dark:opacity-50"
        style={{ background: `radial-gradient(circle, oklch(0.75 0.12 ${(a + 40) % 360} / 0.4), transparent 66%)` }}
      />
    </div>
  );
}
