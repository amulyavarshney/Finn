import type { Filing, PricePoint, RawAnnouncement, ScreenerTables } from "@/lib/types";

import { classify, classifyByRules } from "./categorize";
import { buildHeadline, headlineByRules } from "./headline";
import { buildPersonEnrichment } from "./people";
import { buildResultsEnrichment } from "./results";
import { marketReaction, scoreMateriality } from "./materiality";

/**
 * Turns raw exchange filings into the scored, enriched items the Brief renders.
 *
 * The ordering here is the cost model. Categorisation and scoring are cheap and
 * run over everything, because we cannot know what is routine until we have
 * scored it. Only then do the expensive steps -- a written headline, a results
 * table, a person lookup -- run, and only on what survived the cut.
 *
 * Run once per ticker at ingest time so the deployed app serves a pre-computed
 * snapshot and needs no API key at all to show the feed.
 */

export interface PipelineOptions {
  /** How many of the top-scoring filings get a model-written headline. */
  enrichLimit?: number;
  /** Skip every model call. Used for fast local iteration and as the no-key path. */
  rulesOnly?: boolean;
  /**
   * ISO date before which filings never reach a model.
   *
   * The Brief only renders a trailing window, so resolving an ambiguous
   * category on a filing from fourteen months ago buys nothing a user can
   * see. On the ingested book this is the difference between ~1,000 model
   * calls and ~130.
   */
  modelCutoff?: string | null;
  now?: Date;
  onProgress?: (done: number, total: number) => void;
}

export async function buildFilings(
  announcements: RawAnnouncement[],
  prices: PricePoint[],
  tables: ScreenerTables | null,
  opts: PipelineOptions = {},
): Promise<Filing[]> {
  const { enrichLimit = 24, rulesOnly = false, modelCutoff = null, now = new Date() } = opts;

  const mayUseModel = (a: RawAnnouncement) =>
    !rulesOnly && (modelCutoff === null || a.filedAt >= modelCutoff);

  // --- Pass 1: classify and score everything (cheap) ------------------------
  const scored = await Promise.all(
    announcements.map(async (a) => {
      const classification = mayUseModel(a)
        ? await classify(a)
        : (classifyByRules(a) ?? { category: "unclassified" as const, source: "fallback" as const });

      const reaction = marketReaction(a, prices);
      const materiality = scoreMateriality(a, classification.category, reaction, now);

      return { announcement: a, classification, reaction, materiality };
    }),
  );

  // --- Pass 2: spend tokens only on what earned attention -------------------
  const ranked = [...scored].sort((a, b) => b.materiality.score - a.materiality.score);
  const enrichable = new Set(
    ranked
      .filter((s) => s.materiality.tier !== "routine")
      .slice(0, enrichLimit)
      .map((s) => s.announcement.id),
  );

  const filings: Filing[] = [];
  let done = 0;

  for (const item of scored) {
    const { announcement, classification, reaction, materiality } = item;
    const worthEnriching = mayUseModel(announcement) && enrichable.has(announcement.id);

    const headline = worthEnriching
      ? await buildHeadline(announcement, classification.category, materiality.tier)
      : headlineByRules(announcement, classification.category);

    let enrichment: Filing["enrichment"] = null;

    // The brief singles out two presentations it wants done properly. The
    // results table is deterministic so it runs regardless of tier or key;
    // the person lookup needs language work, so it is gated.
    if (classification.category === "results") {
      enrichment = buildResultsEnrichment(announcement, tables);
    } else if (classification.category === "management_change" && worthEnriching) {
      enrichment = await buildPersonEnrichment(announcement);
    }

    filings.push({
      ...announcement,
      category: classification.category,
      categorySource: classification.source,
      headline: headline.text,
      headlineSource: headline.source,
      materiality,
      reaction,
      enrichment,
    });

    opts.onProgress?.(++done, scored.length);
  }

  return filings.sort((a, b) => b.materiality.score - a.materiality.score);
}