import { completeJson } from "@/lib/llm/router";
import { CATEGORIES, type Category, type RawAnnouncement } from "@/lib/types";
import { z } from "zod";

/**
 * Maps exchange filings onto the seventeen reference categories.
 *
 * The rules below are derived from a survey of 102 distinct `desc` values
 * across eight tickers (see scripts/survey-descs.ts and data/desc-survey.txt),
 * not from guesswork. This matters for cost: NSE already tells us the subject
 * line, so roughly three quarters of filings are classified for free and a
 * model is only consulted for the genuinely ambiguous buckets.
 *
 * Resolution order, cheapest first:
 *   1. exact/regex match on `desc`
 *   2. text disambiguation for descs that legitimately cover two categories
 *   3. keyword scoring over the announcement body
 *   4. the fast model, given only the inline text -- never the PDF
 */

type Rule = [RegExp, Category];

/** Longest and most specific patterns first; the list is evaluated in order. */
const DESC_RULES: Rule[] = [
  // --- results -------------------------------------------------------------
  [/^financial results? updates?$/i, "results"],
  [/^integrated filing-\s*financial/i, "results"],
  [/clarification\s*-?\s*financial results/i, "results"],
  [/^reply to clarification-\s*financial results/i, "results"],
  [/^investor presentation/i, "results"],
  [/^option to submit standalone/i, "unclassified"],

  // --- earnings call vs investor meetings ---------------------------------
  // "Updates" on this desc covers both a transcript drop and a one-on-one
  // roadshow, so it is resolved against the body text below.
  [/^transcript of analysts/i, "earnings_call"],
  [/^schedule of analysts/i, "earnings_call"],
  [/^audio recording/i, "earnings_call"],

  // --- M&A -----------------------------------------------------------------
  [/^acquisition/i, "M&A"],
  [/^sale or disposal/i, "M&A"],
  [/^amalgamation|^merger/i, "M&A"],
  [/^scheme of arrangement/i, "M&A"],
  [/^other restructuring/i, "M&A"],
  [/^incorporation/i, "M&A"],
  [/^joint venture/i, "M&A"],
  [/^voluntary delisting/i, "M&A"],
  [/^slump sale/i, "M&A"],

  // --- fund raise ----------------------------------------------------------
  [/^allotment of securities/i, "fund_raise"],
  [/buy\s*-?\s*back/i, "fund_raise"],
  [/^raising of funds/i, "fund_raise"],
  [/^rights issue|^qip|^preferential (allotment|issue)/i, "fund_raise"],
  [/^forfeiture/i, "fund_raise"],
  [/commercial paper|^debenture|^ncd/i, "fund_raise"],

  // --- management change ---------------------------------------------------
  // The reference document files auditor appointments under routine paperwork,
  // so "Change in Auditors" deliberately does not land here.
  [/^change in auditors?/i, "unclassified"],
  [/^appointment/i, "management_change"],
  [/^re-?appointment/i, "management_change"],
  [/^resignation/i, "management_change"],
  [/^retirement/i, "management_change"],
  [/^cessation/i, "management_change"],
  [/^demise/i, "management_change"],
  [/^change in (management|director|company secretary|key managerial|kmp)/i, "management_change"],

  // --- litigation ----------------------------------------------------------
  [/^action\(s\) (taken|initiated) or orders passed/i, "litigation"],
  [/^pendency of litigation/i, "litigation"],
  [/insolvency|^nclt|winding up/i, "litigation"],

  // --- insider / SAST ------------------------------------------------------
  [/takeover regulations|sebi \(sast\)|\bsast\b/i, "insider_trading"],
  [/^trading plan under/i, "insider_trading"],

  // --- credit rating -------------------------------------------------------
  [/^credit rating/i, "credit_rating"],

  // --- dividend ------------------------------------------------------------
  [/^dividend/i, "dividend"],
  [/^date of payment of dividend/i, "dividend"],

  // --- bonus / split -------------------------------------------------------
  [/^bonus$|^bonus issue/i, "bonus_split"],
  [/^stock split|^sub-?division of shares/i, "bonus_split"],

  // --- capex ---------------------------------------------------------------
  [/capacity expansion|^capex|new (plant|facility)/i, "capex"],

  // --- meetings / ballots --------------------------------------------------
  [/^postal ballot/i, "postal_ballot"],
  [/^shareholders meeting/i, "agm_egm"],
  [/^annual general meeting|^extra ?-?ordinary (general )?meeting|^egm$/i, "agm_egm"],

  // --- pledging ------------------------------------------------------------
  [/pledge/i, "pledging"],

  // --- press release -------------------------------------------------------
  [/^press release|^media release/i, "press_release"],
  [/^(news|rumour) (verification|clarification)/i, "press_release"],
  [/^reply to clarification sought$|^clarification$/i, "press_release"],
  [/bagging|receiving of orders|awarding of order/i, "press_release"],
  [/^agreements?|memorandum of understanding|mou/i, "press_release"],
  [/^communication to shareholders/i, "press_release"],
  [/^disclosure of material issue/i, "press_release"],

  // --- routine paperwork ---------------------------------------------------
  [/loss of share certificate|duplicate share certificate/i, "unclassified"],
  [/^esop|esps|sbeb|^options to purchase securities|^allotment of esop/i, "unclassified"],
  [/trading window/i, "unclassified"],
  [/^certificate under/i, "unclassified"],
  [/secretarial compliance|^annual secretarial/i, "unclassified"],
  [/^copy of newspaper publication|newspaper clipping/i, "unclassified"],
  [/^related party transaction/i, "unclassified"],
  [/^amendment to aoa|^amendment to moa/i, "unclassified"],
  [/^code of conduct/i, "unclassified"],
  [/^address change|^corrigendum|^addendum/i, "unclassified"],
  [/registrar & share transfer|^rta update/i, "unclassified"],
  [/^annual disclosure$/i, "unclassified"],
  [/^esg|business responsibility/i, "unclassified"],
];

/** Descs that genuinely span two categories and need the body text to settle. */
const NEEDS_TEXT: Array<{
  match: RegExp;
  resolve: (text: string) => Category;
}> = [
  {
    // 801 filings on this one desc -- the single largest bucket.
    match: /^analysts?\/institutional investor meet/i,
    resolve: (t) =>
      /\btranscript\b|audio recording|earnings call|\bconcall\b|conference call (transcript|recording)/i.test(t)
        ? "earnings_call"
        : "investor_meetings",
  },
  {
    match: /^outcome of board meeting/i,
    resolve: (t) =>
      /financial results|unaudited|audited results|quarter ended/i.test(t)
        ? "results"
        : /dividend/i.test(t)
          ? "dividend"
          : /fund rais|allot|debenture|buyback/i.test(t)
            ? "fund_raise"
            : "press_release",
  },
  {
    // A record date or book closure can serve a dividend, a bonus or an AGM.
    match: /^(revised )?record date|^(revised )?book closure|^agm\/book closure/i,
    resolve: (t) =>
      /bonus|split|sub-?division/i.test(t) ? "bonus_split" : /annual general meeting|\bagm\b/i.test(t) ? "agm_egm" : "dividend",
  },
];

/** Keyword scoring for the ambiguous "Updates" family, before paying for a model. */
const TEXT_SIGNALS: Array<[RegExp, Category, number]> = [
  [/\bacquisition\b|\bacquire[ds]?\b|\bstake (purchase|sale)\b|\bdivest/i, "M&A", 3],
  [/\bmerger\b|\bdemerger\b|\bamalgamation\b|scheme of arrangement/i, "M&A", 3],
  [/unaudited financial results|audited financial results|quarter ended|\bq[1-4]\s*fy/i, "results", 3],
  [/\bresign(ed|ation)\b|\bappoint(ed|ment)\b|\bcease[ds]? to be\b|\bstepped down\b/i, "management_change", 3],
  [/\bdividend\b/i, "dividend", 2],
  [/credit rating|\brated?\b.*\b(aaa|aa\+|aa|a\+)\b/i, "credit_rating", 2],
  [/\bpledge[ds]?\b|\bpledging\b/i, "pledging", 3],
  [/\bqip\b|rights issue|preferential allotment|\bbuyback\b|debenture/i, "fund_raise", 3],
  [/\bpenalty\b|\bfine\b|show cause|\btribunal\b|\bcourt\b|regulatory order/i, "litigation", 2],
  [/\btranscript\b|earnings call|\bconcall\b/i, "earnings_call", 3],
  [/investors' meeting|investor conference|one-on-one|roadshow|\bforum\b/i, "investor_meetings", 2],
  [/\bbonus issue\b|\bstock split\b/i, "bonus_split", 3],
  [/capacity expansion|\bcapex\b|greenfield|brownfield|new (plant|facility|unit)/i, "capex", 2],
  [/\border win\b|\bcontract\b|\bpartnership\b|\blaunch(ed|es)?\b|\bmou\b/i, "press_release", 2],
  [/dematerialis|\bespo?p\b|compliance certificate|lost share|trading window/i, "unclassified", 3],
];

export interface Classification {
  category: Category;
  source: "rules" | "model" | "fallback";
}

/** Rules-only classification. Returns null when a model is genuinely needed. */
export function classifyByRules(announcement: RawAnnouncement): Classification | null {
  const { desc, text } = announcement;

  for (const { match, resolve } of NEEDS_TEXT) {
    if (match.test(desc)) return { category: resolve(text), source: "rules" };
  }

  for (const [pattern, category] of DESC_RULES) {
    if (pattern.test(desc)) return { category, source: "rules" };
  }

  // The "Updates" / "General Updates" family: ~26% of all filings and
  // deliberately uninformative. Score the body before spending a token.
  const scored = scoreText(text);
  if (scored) return { category: scored, source: "rules" };

  return null;
}

function scoreText(text: string): Category | null {
  const scores = new Map<Category, number>();
  for (const [pattern, category, weight] of TEXT_SIGNALS) {
    if (pattern.test(text)) scores.set(category, (scores.get(category) ?? 0) + weight);
  }
  if (scores.size === 0) return null;

  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  // Require a clear winner; a tie means the text is genuinely mixed and is
  // better served by the model.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][1] >= 2 ? ranked[0][0] : null;
}

const ClassifySchema = z.object({
  category: z.enum(CATEGORIES),
});

/** Full classification, escalating to the fast model only when rules cannot decide. */
export async function classify(announcement: RawAnnouncement): Promise<Classification> {
  const byRules = classifyByRules(announcement);
  if (byRules) return byRules;

  const result = await completeJson({
    task: "categorize",
    tier: "fast",
    schema: ClassifySchema,
    maxTokens: 60,
    temperature: 0,
    system:
      "You classify Indian stock-exchange filings into exactly one category. Reply with only " +
      `{"category": "<one of: ${CATEGORIES.join(", ")}>"}. ` +
      "Use 'unclassified' for routine compliance paperwork that cannot move the stock " +
      "(ESOP allotments, compliance certificates, lost share certificates, ESG reports, auditor appointments).",
    user: `Subject: ${announcement.desc}\n\nBody: ${announcement.text.slice(0, 1200)}`,
  });

  if (result) return { category: result.category, source: "model" };
  return { category: "unclassified", source: "fallback" };
}