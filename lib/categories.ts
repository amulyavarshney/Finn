import {
  BarChart3,
  Banknote,
  CalendarDays,
  Factory,
  FileText,
  Gavel,
  GitMerge,
  HandCoins,
  Headphones,
  Lock,
  Megaphone,
  ShieldCheck,
  Split,
  UserRoundCog,
  UserRoundSearch,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";

import type { Category, MaterialityTier } from "./types";

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  /** OKLCH hue angle. The tile derives fill, border and glyph colour from this
   *  one number so all seventeen tiles stay tonally consistent. */
  hue: number;
  chroma: number;
  /** Baseline materiality contribution, before recency and market reaction. */
  weight: number;
  /** One-line gloss shown in the category legend on the Tune screen. */
  gloss: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  results: {
    label: "Results",
    icon: BarChart3,
    hue: 255,
    chroma: 0.15,
    weight: 92,
    gloss: "Quarterly or annual results and the board meeting approving them",
  },
  "M&A": {
    label: "M&A",
    icon: GitMerge,
    hue: 300,
    chroma: 0.16,
    weight: 95,
    gloss: "Acquisitions, mergers, demergers, joint ventures, stake sales",
  },
  fund_raise: {
    label: "Fund raise",
    icon: Banknote,
    hue: 160,
    chroma: 0.14,
    weight: 80,
    gloss: "Rights issues, QIPs, preferential allotments, buybacks, debt",
  },
  management_change: {
    label: "Management",
    icon: UserRoundCog,
    hue: 75,
    chroma: 0.15,
    weight: 85,
    gloss: "A CEO, CFO, MD or director joining, resigning or retiring",
  },
  litigation: {
    label: "Litigation",
    icon: Gavel,
    hue: 25,
    chroma: 0.18,
    weight: 82,
    gloss: "Lawsuits, regulatory orders, fines, insolvency proceedings",
  },
  insider_trading: {
    label: "Insider",
    icon: UserRoundSearch,
    hue: 50,
    chroma: 0.16,
    weight: 62,
    gloss: "A promoter or insider trading their own shareholding",
  },
  earnings_call: {
    label: "Earnings call",
    icon: Headphones,
    hue: 200,
    chroma: 0.12,
    weight: 55,
    gloss: "Concall notice, transcript or recording link",
  },
  investor_meetings: {
    label: "Investor meet",
    icon: Users,
    hue: 232,
    chroma: 0.12,
    weight: 32,
    gloss: "One-on-one or small-group investor meetings and conferences",
  },
  credit_rating: {
    label: "Credit rating",
    icon: ShieldCheck,
    hue: 185,
    chroma: 0.12,
    weight: 70,
    gloss: "A rating assigned, upgraded, downgraded or reaffirmed",
  },
  dividend: {
    label: "Dividend",
    icon: HandCoins,
    hue: 145,
    chroma: 0.14,
    weight: 66,
    gloss: "A cash dividend declared, with its record date",
  },
  bonus_split: {
    label: "Bonus / split",
    icon: Split,
    hue: 130,
    chroma: 0.15,
    weight: 64,
    gloss: "Bonus issue or stock split -- share count changes, no cash moves",
  },
  capex: {
    label: "Capex",
    icon: Factory,
    hue: 275,
    chroma: 0.13,
    weight: 74,
    gloss: "Approving spend on a new plant, facility or capacity expansion",
  },
  press_release: {
    label: "Press release",
    icon: Megaphone,
    hue: 250,
    chroma: 0.04,
    weight: 45,
    gloss: "Order wins, new products, partnerships, rumour clarifications",
  },
  postal_ballot: {
    label: "Postal ballot",
    icon: Vote,
    hue: 60,
    chroma: 0.02,
    weight: 22,
    gloss: "Shareholders voting by postal ballot -- notice and result",
  },
  agm_egm: {
    label: "AGM / EGM",
    icon: CalendarDays,
    hue: 265,
    chroma: 0.02,
    weight: 20,
    gloss: "Annual or Extraordinary General Meeting -- notice and result",
  },
  pledging: {
    label: "Pledging",
    icon: Lock,
    hue: 12,
    chroma: 0.15,
    weight: 72,
    gloss: "A promoter pledging, releasing or changing share pledge status",
  },
  unclassified: {
    label: "Routine",
    icon: FileText,
    hue: 260,
    chroma: 0.005,
    weight: 8,
    gloss: "ESOP allotments, compliance certificates, lost share certificates",
  },
};

export const TIER_THRESHOLDS: Record<Exclude<MaterialityTier, "routine">, number> = {
  critical: 80,
  high: 60,
  medium: 35,
};

export function tierFor(score: number): MaterialityTier {
  if (score >= TIER_THRESHOLDS.critical) return "critical";
  if (score >= TIER_THRESHOLDS.high) return "high";
  if (score >= TIER_THRESHOLDS.medium) return "medium";
  return "routine";
}

/** Tile colours derived from the category's single hue value. */
export function categoryColors(category: Category, dark: boolean) {
  const { hue, chroma } = CATEGORY_META[category];
  return dark
    ? {
        fill: `oklch(0.62 ${chroma} ${hue} / 0.2)`,
        glyph: `oklch(0.84 ${Math.min(chroma, 0.13)} ${hue})`,
        ring: `oklch(0.7 ${chroma} ${hue} / 0.3)`,
      }
    : {
        fill: `oklch(0.72 ${chroma} ${hue} / 0.22)`,
        glyph: `oklch(0.44 ${chroma} ${hue})`,
        ring: `oklch(0.6 ${chroma} ${hue} / 0.26)`,
      };
}
