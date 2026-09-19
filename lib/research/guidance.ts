import { completeJson } from "@/lib/llm/router";
import { guidancePassages } from "@/lib/sources/pdf";
import { seriesFor } from "@/lib/sources/screener";
import type { Citation, GuidanceClaim, ScreenerTables, TickerSnapshot } from "@/lib/types";
import { z } from "zod";

/**
 * Promised vs Delivered.
 *
 * The brief's worked example, and the thing it says it values most: take the
 * last four quarters, and against management's own headline guidance, report
 * what was promised versus what was actually delivered. That is the difference
 * between summarising management and analysing them.
 *
 * The pipeline is built around one asymmetry: the *claim* is language and needs
 * a model, but the *outcome* is a number and must not. So the model extracts
 * quotes and says what each one commits to, and the verdict is then reached
 * against figures read from screener's quarterly table.
 *
 * Cost: a full transcript is ~12k tokens. The regex prefilter in
 * sources/pdf.ts narrows each one to its guidance-bearing passages, roughly an
 * 85% cut, before the strong model sees anything.
 */

const ClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        quote: z.string().min(20).max(600),
        metric: z.enum([
          "revenue growth",
          "margin",
          "capex",
          "profit growth",
          "volume growth",
          "store or capacity additions",
          "other",
        ]),
        promised: z.string().min(2).max(160),
        /** Which quarter or year the claim is about, in management's words. */
        horizon: z.string().max(80).nullable(),
      }),
    )
    .max(6),
});

export interface PromisedVsDelivered {
  claims: GuidanceClaim[];
  /** Quarters we had transcripts for, newest first. */
  quartersCovered: string[];
  unavailableReason: string | null;
}

export async function buildPromisedVsDelivered(
  snapshot: Pick<TickerSnapshot, "symbol" | "transcripts" | "tables">,
): Promise<PromisedVsDelivered> {
  const { transcripts, tables } = snapshot;

  if (transcripts.length === 0) {
    return {
      claims: [],
      quartersCovered: [],
      unavailableReason:
        "No concall transcripts were found for this company on screener.in, so there is no management guidance to hold against the numbers.",
    };
  }

  // Newest four calls: the brief asks for the last four quarters.
  const recent = transcripts.slice(0, 4);
  const claims: GuidanceClaim[] = [];

  for (const transcript of recent) {
    const passages = guidancePassages(transcript.text);
    if (passages.length === 0) continue;

    // Cap the payload: twenty passages is ample and bounds the cost per call.
    const excerpt = passages
      .slice(0, 20)
      .map((p) => `[p${p.page}] ${p.passage}`)
      .join("\n\n");

    const extracted = await completeJson({
      task: "guidance-extract",
      // Strong tier: distinguishing a commitment from an analyst's question or
      // a hedge is exactly the judgment cheap models get wrong.
      tier: "strong",
      schema: ClaimsSchema,
      maxTokens: 1400,
      temperature: 0.1,
      system: [
        "You read excerpts from an Indian company's quarterly earnings call and extract only the",
        "forward-looking commitments MANAGEMENT made about headline numbers.",
        "",
        "Include a claim only if management states an expectation about a future period with enough",
        "specificity to check later -- a number, a range, or a clear direction ('margins should",
        "improve through the year').",
        "",
        "Exclude: analysts' questions, commentary about the quarter just reported, generic ambition",
        "with no metric, and anything said by someone other than management.",
        "",
        'Reply with {"claims": [{"quote", "metric", "promised", "horizon"}]}.',
        "- quote: management's own words, verbatim and trimmed to the commitment.",
        "- promised: the commitment restated plainly, e.g. 'low-teens revenue growth for FY27'.",
        "- horizon: the period it refers to, if stated.",
        "Return an empty array rather than stretching to fill it.",
      ].join("\n"),
      user: `Call: ${transcript.label}\n\nExcerpts:\n${excerpt}`,
    });

    if (!extracted) continue;

    // The model routinely restates one commitment two or three ways when it
    // appears in several passages. Three identical rows read as three separate
    // promises, which overstates the scorecard.
    const seen = new Set<string>();

    for (const claim of extracted.claims) {
      const fingerprint = `${claim.metric}|${asciify(claim.promised).toLowerCase().replace(/\W+/g, " ").trim()}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const citation: Citation = {
        document: `${transcript.label} concall transcript`,
        locator: locatorFor(transcript.text, claim.quote),
        url: transcript.url,
      };

      const outcome = evaluateClaim(claim.metric, claim.promised, transcript.label, tables);

      claims.push({
        quarter: transcript.label,
        quote: claim.quote,
        metric: claim.metric,
        promised: claim.promised,
        delivered: outcome.delivered,
        verdict: outcome.verdict,
        reasoning: outcome.reasoning,
        citation,
      });
    }
  }

  return {
    claims,
    quartersCovered: recent.map((t) => t.label),
    unavailableReason:
      claims.length === 0
        ? "Transcripts were read but contained no checkable forward guidance on headline numbers."
        : null,
  };
}

/**
 * Scores a claim against the tables.
 *
 * Deliberately conservative: anything we cannot check arithmetically is marked
 * unverifiable rather than guessed at. A confident wrong verdict on whether
 * management hit their guidance is far worse than an honest "cannot tell".
 */
function evaluateClaim(
  metric: string,
  promised: string,
  callLabel: string,
  tables: ScreenerTables | null,
): { delivered: string | null; verdict: GuidanceClaim["verdict"]; reasoning: string } {
  if (!tables || tables.quarters.columns.length < 2) {
    return {
      delivered: null,
      verdict: "unverifiable",
      reasoning: "No standardised quarterly table is available to check this against.",
    };
  }

  const columns = tables.quarters.columns;
  const callIdx = quarterIndexForCall(callLabel, columns.map((c) => c.label));
  // The quarter the guidance was given about is the one after the call.
  const nextIdx = callIdx + 1;

  if (nextIdx >= columns.length) {
    return {
      delivered: null,
      verdict: "unverifiable",
      reasoning: "The period this guidance covers has not been reported yet.",
    };
  }

  const target = columns[nextIdx];
  const yearAgo = nextIdx - 4 >= 0 ? columns[nextIdx - 4] : null;
  const prior = columns[callIdx];

  const value = (names: string[], col: (typeof columns)[number] | null) => {
    if (!col) return null;
    const s = seriesFor(tables.quarters, names);
    return s ? (col.values[s.label] ?? null) : null;
  };

  const target01 = promisedRange(promised);

  if (metric === "margin") {
    const actual = value(["OPM %"], target);
    const before = value(["OPM %"], prior);
    if (actual === null) {
      return { delivered: null, verdict: "unverifiable", reasoning: "Margin not reported for the period." };
    }
    const delivered = `${actual.toFixed(1)}% operating margin in ${target.label}`;
    if (target01) {
      // Clearing the top of the range is delivering, not missing. Only falling
      // short of the floor counts against management.
      const verdict = actual >= target01.low ? "hit" : actual >= target01.low - 1 ? "partial" : "miss";
      return {
        delivered,
        verdict,
        reasoning:
          `Guided ${target01.low}–${target01.high}%; reported ${actual.toFixed(1)}% in ` +
          `${target.label}${actual > target01.high ? ", ahead of the range" : ""}.`,
      };
    }
    // No number in the guidance, so fall back on the stated direction.
    const direction = directionOf(promised);
    if (direction && before !== null) {
      const moved = actual - before;
      const consistent = direction === "up" ? moved > 0.2 : moved < -0.2;
      return {
        delivered,
        verdict: consistent ? "hit" : Math.abs(moved) <= 0.2 ? "partial" : "miss",
        reasoning: `Guided margins ${direction === "up" ? "higher" : "lower"}; moved from ${before.toFixed(1)}% to ${actual.toFixed(1)}%.`,
      };
    }
    return { delivered, verdict: "unverifiable", reasoning: "Guidance carries no checkable number or direction." };
  }

  if (metric === "revenue growth" || metric === "profit growth" || metric === "volume growth") {
    const names = metric === "profit growth" ? ["Net Profit"] : ["Sales", "Revenue"];
    const actual = value(names, target);
    const base = value(names, yearAgo);
    if (actual === null || base === null || base === 0) {
      return { delivered: null, verdict: "unverifiable", reasoning: "Not enough history to compute the comparable growth rate." };
    }
    const growth = ((actual - base) / Math.abs(base)) * 100;
    const delivered = `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% YoY in ${target.label}`;

    // Guidance quoted in constant currency cannot be checked against screener,
    // which reports INR. Saying so is worth more than a verdict that silently
    // compares two different things.
    if (constantCurrency(promised)) {
      return {
        delivered,
        verdict: "unverifiable",
        reasoning:
          `Guidance was given in constant currency; the standardised table reports INR, ` +
          `so the two are not comparable. Reported ${growth.toFixed(1)}% YoY in ${target.label}.`,
      };
    }

    if (target01) {
      const verdict =
        growth >= target01.low
          ? "hit"
          : growth >= target01.low - 3
            ? "partial"
            : "miss";
      return {
        delivered,
        verdict,
        reasoning:
          `Guided ${target01.low}–${target01.high}% growth; delivered ${growth.toFixed(1)}% YoY in ` +
          `${target.label}${growth > target01.high ? ", ahead of the range" : ""}.`,
      };
    }

    const direction = directionOf(promised);
    if (direction) {
      const consistent = direction === "up" ? growth > 0 : growth < 0;
      return {
        delivered,
        verdict: consistent ? "hit" : "miss",
        reasoning: `Guided growth ${direction === "up" ? "higher" : "lower"}; delivered ${growth.toFixed(1)}% YoY.`,
      };
    }

    return { delivered, verdict: "unverifiable", reasoning: "Guidance carries no checkable number or direction." };
  }

  return {
    delivered: null,
    verdict: "unverifiable",
    reasoning:
      "Capex plans, store counts and similar commitments are not in screener's standardised quarterly table, so this one cannot be checked arithmetically.",
  };
}

/** Pulls a numeric range out of guidance text, including words like "low teens". */
/**
 * Models freely emit typographic punctuation -- U+2011 non-breaking hyphens,
 * curly quotes, non-breaking spaces -- where the source PDF has ASCII. Left
 * alone that silently breaks the deterministic layer twice over: a range like
 * "1.5%‑3.5%" fails the range match and is read as a single point target, and
 * a quote never matches the transcript so the citation loses its page.
 */
function asciify(s: string): string {
  return s
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, " ");
}

function promisedRange(raw: string): { low: number; high: number } | null {
  const promised = asciify(raw);

  const range = promised.match(/(-?\d+(?:\.\d+)?)\s*%?\s*(?:to|-)\s*(-?\d+(?:\.\d+)?)\s*%/);
  if (range) return { low: Number(range[1]), high: Number(range[2]) };

  const single = promised.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (single) {
    const n = Number(single[1]);
    // Treat a point target as a band; guidance is never met to the decimal.
    return { low: n - 1, high: n + 1 };
  }

  const words: Record<string, [number, number]> = {
    "low single digit": [1, 3],
    "mid single digit": [4, 6],
    "high single digit": [7, 9],
    "low double digit": [10, 13],
    "low teens": [11, 13],
    "mid teens": [14, 16],
    "high teens": [17, 19],
    "low twenties": [20, 23],
    "double digit": [10, 20],
  };
  const lowered = promised.toLowerCase();
  for (const [phrase, [low, high]] of Object.entries(words)) {
    if (lowered.includes(phrase)) return { low, high };
  }

  return null;
}

function directionOf(promised: string): "up" | "down" | null {
  const lowered = asciify(promised).toLowerCase();
  if (/improv|expand|increas|higher|grow|better|accelerat|uptick/.test(lowered)) return "up";
  if (/declin|compress|lower|moderat|soften|contract|reduc/.test(lowered)) return "down";
  return null;
}

function constantCurrency(promised: string): boolean {
  return /constant currency|\bcc\b|in cc terms/i.test(asciify(promised));
}

/**
 * Maps a concall label to the quarter it discussed.
 *
 * A call held in August 2026 reports the June 2026 quarter, so the label's own
 * month is one quarter ahead of the results under discussion.
 */
function quarterIndexForCall(callLabel: string, quarterLabels: string[]): number {
  const m = callLabel.trim().match(/^(\w{3})\s*(\d{4})$/);
  if (!m) return quarterLabels.length - 2;

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthIdx = months.indexOf(m[1].toLowerCase().slice(0, 3));
  if (monthIdx < 0) return quarterLabels.length - 2;

  const year = Number(m[2]);
  // The quarter that closed most recently before the call.
  const endings: Array<[string, number]> = [["Mar", 2], ["Jun", 5], ["Sep", 8], ["Dec", 11]];
  let best = -1;
  let bestKey = "";

  for (const [name, endMonth] of endings) {
    for (const y of [year - 1, year]) {
      const key = `${name} ${y}`;
      const idx = quarterLabels.findIndex((l) => l.toLowerCase() === key.toLowerCase());
      if (idx < 0) continue;
      const closedBefore = y < year || endMonth < monthIdx;
      if (closedBefore && idx > best) {
        best = idx;
        bestKey = key;
      }
    }
  }

  void bestKey;
  return best >= 0 ? best : quarterLabels.length - 2;
}

/** Page number for a quote, so the citation can point at it. */
function locatorFor(fullText: string, quote: string): string | null {
  const flatten = (s: string) => asciify(s).replace(/\s+/g, " ");

  const needle = flatten(quote).slice(0, 48);
  const pages = fullText.split("\n\n");

  for (let i = 0; i < pages.length; i++) {
    if (flatten(pages[i]).includes(needle)) return `p${i + 1}`;
  }

  // A verbatim quote can still straddle a page break or carry a stray
  // transcription fix. Fall back to the longest run of words that does match,
  // so the citation keeps a page rather than losing its provenance entirely.
  const words = needle.split(" ");
  for (let take = words.length - 1; take >= 5; take--) {
    const shorter = words.slice(0, take).join(" ");
    for (let i = 0; i < pages.length; i++) {
      if (flatten(pages[i]).includes(shorter)) return `p${i + 1}`;
    }
  }

  return null;
}
