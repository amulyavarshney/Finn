import { complete } from "@/lib/llm/router";
import { CATEGORY_META } from "@/lib/categories";
import type { Category, MaterialityTier, RawAnnouncement } from "@/lib/types";

/**
 * The one line that decides whether the investor taps.
 *
 * A filing title tells you the paperwork type; the headline should tell you
 * what happened. The brief leaves this judgment to us, so the rule is: spend a
 * model call only where the answer changes behaviour. Items that will be
 * collapsed into the routine digest get a cheap deterministic cleanup instead,
 * which keeps the marginal cost of a quiet day at zero.
 */

/** NSE bodies open with a stock boilerplate clause that carries no information. */
const BOILERPLATE = [
  /^.{0,80}?has informed the exchange (?:regarding|about|that)\s*/i,
  /^.{0,80}?has submitted to the exchange,?\s*(?:a copy of)?\s*/i,
  /^pursuant to (?:the provisions of )?regulation[^,.]*,?\s*/i,
  /^(?:this is )?(?:further to|in continuation of) (?:our|the) (?:letter|disclosure|intimation)[^,.]*,?\s*/i,
  /^disclosure under regulation[^,.]*,?\s*/i,
  /^we (?:wish to|would like to) inform (?:you )?that\s*/i,
  /^please (?:note|find attached|be informed)\s*(?:that)?\s*/i,
  /^with reference to (?:the above|your)[^,.]*,?\s*/i,
];

export interface Headline {
  text: string;
  source: "rules" | "model" | "fallback";
}

/** Deterministic cleanup: strip boilerplate, take the first real clause. */
export function headlineByRules(announcement: RawAnnouncement, category: Category): Headline {
  let body = announcement.text.replace(/\s+/g, " ").trim();

  for (const pattern of BOILERPLATE) {
    body = body.replace(pattern, "").trim();
  }
  // Exchange text is riddled with doubled apostrophes from their own encoding.
  body = body.replace(/''/g, "'").replace(/^[,;:\-\s]+/, "");

  const sentence = body.split(/(?<=[.!?])\s+/)[0] ?? "";
  const candidate = sentence.length > 24 ? sentence : body.slice(0, 160);

  if (candidate.length < 16) {
    // Nothing usable in the body -- fall back to the exchange's own subject
    // line, which at least names the paperwork.
    return { text: announcement.desc || CATEGORY_META[category].label, source: "fallback" };
  }

  return { text: truncate(capitalise(candidate), 170), source: "rules" };
}

/**
 * A written "so what" for filings that earned attention. Only called for
 * medium-tier and above, so the routine long tail never costs anything.
 */
async function headlineByModel(
  announcement: RawAnnouncement,
  category: Category,
): Promise<Headline> {
  const text = await complete({
    task: "headline",
    tier: "fast",
    maxTokens: 90,
    temperature: 0.1,
    system:
      "You write the single line an investor reads to decide whether a stock-exchange filing matters. " +
      "Rules: one sentence, under 20 words, no preamble, no quotes, no ticker, no 'the company'. " +
      "Lead with what actually happened and include any number or name that appears in the filing. " +
      "State only what the filing says -- never add outside knowledge or speculate about impact.",
    user: `Category: ${category}\nSubject: ${announcement.desc}\nFiling text: ${announcement.text.slice(0, 1600)}`,
  });

  const cleaned = text?.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length < 12) return headlineByRules(announcement, category);

  return { text: truncate(cleaned, 170), source: "model" };
}

/** Routes by tier: the model only where the line changes a decision. */
export async function buildHeadline(
  announcement: RawAnnouncement,
  category: Category,
  tier: MaterialityTier,
): Promise<Headline> {
  if (tier === "routine") return headlineByRules(announcement, category);
  return headlineByModel(announcement, category);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max)}…`;
}
