import { CATEGORY_META, tierFor } from "@/lib/categories";
import { averageVolume, dayChangePct, findBar } from "@/lib/prices";
import type {
  Category,
  MarketReaction,
  MaterialityBreakdown,
  PricePoint,
  RawAnnouncement,
} from "@/lib/types";

/**
 * Scores how much a filing deserves the investor's attention, 0-100.
 *
 * The brief's thesis is that filtering is the scarce skill, so this function is
 * the product. Two design commitments follow from that:
 *
 *   1. Every contribution is returned as a labelled factor, not folded into an
 *      opaque number. The UI shows the breakdown on demand, so the ranking can
 *      be argued with rather than trusted blindly.
 *   2. The market's own same-day reaction is an input. A "routine" press release
 *      that moved the stock 6% on triple volume was not routine, and no
 *      category table can know that in advance.
 */

/** Phrases that raise or lower a filing's stakes within its own category. */
const TEXT_MODIFIERS: Array<{ pattern: RegExp; points: number; label: string }> = [
  { pattern: /\bresign(ed|ation)\b|\bstepped down\b|\bcease[ds]? to be\b/i, points: 6, label: "Departure language" },
  { pattern: /\bwith immediate effect\b/i, points: 7, label: "Immediate effect" },
  { pattern: /\bchief (executive|financial)\b|\bceo\b|\bcfo\b|\bmanaging director\b/i, points: 8, label: "Top-of-house role" },
  { pattern: /\b(?:rs\.?|inr|₹)\s?[\d,]+(?:\.\d+)?\s*(?:crore|cr\b|lakh|billion|bn\b)/i, points: 6, label: "Names a rupee amount" },
  { pattern: /\bdowngrade[ds]?\b|\bnegative outlook\b|\bwatch (?:with )?negative\b/i, points: 9, label: "Rating deterioration" },
  { pattern: /\bupgrade[ds]?\b|\bpositive outlook\b/i, points: 5, label: "Rating improvement" },
  { pattern: /\bpenalty\b|\bfine\b|\bshow cause\b|\bfraud\b|\bqualified opinion\b/i, points: 9, label: "Adverse regulatory language" },
  { pattern: /\bapproved\b.*\bacquisition\b|\bdefinitive agreement\b|\bbinding\b/i, points: 6, label: "Deal is firm, not exploratory" },
  { pattern: /\bno unpublished price sensitive information\b/i, points: -14, label: "Filing states nothing material was shared" },
  { pattern: /\bdematerialis|\bduplicate share certificate\b|\blost share\b/i, points: -10, label: "Share-registry housekeeping" },
  { pattern: /\btrading window\b/i, points: -8, label: "Standing compliance notice" },
  { pattern: /\bnewspaper (?:clipping|publication)\b/i, points: -8, label: "Newspaper copy of an earlier filing" },
];

export function marketReaction(
  announcement: RawAnnouncement,
  prices: PricePoint[],
): MarketReaction | null {
  if (prices.length < 10) return null;

  const filedOn = announcement.filedAt.slice(0, 10);
  const found = findBar(prices, filedOn);
  if (!found) return null;

  const change = dayChangePct(prices, found.index);
  const avg = averageVolume(prices, 20, found.index);

  return {
    date: found.bar.date,
    priceChangePct: change ?? 0,
    volume: found.bar.volume,
    volumeMultiple: avg && avg > 0 ? found.bar.volume / avg : 1,
  };
}

export function scoreMateriality(
  announcement: RawAnnouncement,
  category: Category,
  reaction: MarketReaction | null,
  now: Date = new Date(),
): MaterialityBreakdown {
  const factors: MaterialityBreakdown["factors"] = [];
  const meta = CATEGORY_META[category];

  // 1. Category baseline -- what this kind of filing is usually worth.
  factors.push({
    label: `${meta.label} filing`,
    detail: meta.gloss,
    points: meta.weight,
  });

  // 2. Recency. A day-old results filing still matters; a week-old one is
  //    history. Decay is gentle for the first day then falls away.
  //    Saturating too quickly would flatten the ranking across a week-long
  //    window, so the slope runs out to roughly two weeks.
  const ageHours = Math.max(0, (now.getTime() - new Date(announcement.filedAt).getTime()) / 3_600_000);
  const recency = ageHours <= 24 ? 0 : -Math.min(20, Math.round((ageHours - 24) / 18));
  if (recency !== 0) {
    factors.push({
      label: "Age",
      detail: `Filed ${formatAge(ageHours)} ago`,
      points: recency,
    });
  }

  // 3. The market's verdict on the day. This is what lets an unglamorous
  //    category still reach the top of the feed.
  if (reaction) {
    const move = Math.abs(reaction.priceChangePct);
    if (move >= 2) {
      factors.push({
        label: "Price reacted",
        detail: `${reaction.priceChangePct >= 0 ? "+" : ""}${reaction.priceChangePct.toFixed(1)}% on ${reaction.date}`,
        points: Math.min(16, Math.round(move * 2.5)),
      });
    }
    if (reaction.volumeMultiple >= 1.8) {
      factors.push({
        label: "Volume spiked",
        detail: `${reaction.volumeMultiple.toFixed(1)}x the 20-day average`,
        points: Math.min(14, Math.round((reaction.volumeMultiple - 1) * 7)),
      });
    }
  }

  // 4. Language inside the filing.
  const haystack = `${announcement.desc} ${announcement.text}`;
  for (const mod of TEXT_MODIFIERS) {
    if (mod.pattern.test(haystack)) {
      factors.push({ label: mod.label, detail: "Detected in the filing text", points: mod.points });
    }
  }

  // 5. A filing with no body text is almost always a bare compliance upload.
  if (announcement.text.length < 60) {
    factors.push({
      label: "No substantive text",
      detail: "The exchange record carries only a subject line",
      points: -6,
    });
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));

  return { score, tier: tierFor(score), factors };
}

function formatAge(hours: number): string {
  if (hours < 1) return "minutes";
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
