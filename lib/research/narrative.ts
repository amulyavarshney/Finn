import { complete, completeJson } from "@/lib/llm/router";
import { seriesFor } from "@/lib/sources/screener";
import type { Citation, ScreenerTables, TickerSnapshot } from "@/lib/types";
import { z } from "zod";

/**
 * The language half of the research sheet.
 *
 * One discipline governs everything here, straight from the brief: ground it in
 * primary sources -- annual reports and transcripts -- and do not lean on the
 * model's own outside knowledge of the company. That is enforced twice:
 *
 *  1. The retrieval layer only ever passes transcript text and figures we
 *     parsed ourselves. No news, no broker notes, nothing else is fetched.
 *  2. The prompts instruct the model to work only from the supplied excerpts
 *     and to say so when the excerpts do not support a claim.
 *
 * It is not a guarantee -- a model can still reach for a memorised fact -- but
 * withholding secondary sources removes the easy path to one, and citations
 * make an unsupported claim visible.
 */

const GROUNDING_RULE = [
  "You work ONLY from the excerpts and figures supplied in this message.",
  "Do not use anything you know about this company from outside these excerpts.",
  "Do not cite news, broker notes, analyst reports or price targets.",
  "If the excerpts do not support a point, leave it out or say the transcripts do not address it.",
  "Never state a number that does not appear in the supplied figures.",
].join(" ");

/** Compact table digest passed alongside transcript text so prose can cite figures. */
function figuresDigest(tables: ScreenerTables | null): string {
  if (!tables) return "No standardised financial tables available.";

  const lines: string[] = [];
  const q = tables.quarters;
  const recent = q.columns.slice(-6);

  for (const name of ["Sales", "Operating Profit", "OPM %", "Net Profit"]) {
    const s = seriesFor(q, [name]);
    if (!s) continue;
    const cells = recent
      .map((c) => `${c.label}: ${c.values[s.label] ?? "—"}`)
      .join(", ");
    lines.push(`${s.label} (quarterly, ₹cr except %): ${cells}`);
  }

  const yearly = tables.profitLoss.columns.filter((c) => /^[A-Za-z]{3} \d{4}$/.test(c.label)).slice(-5);
  for (const name of ["Sales", "Operating Profit", "Net Profit"]) {
    const s = seriesFor(tables.profitLoss, [name]);
    if (!s) continue;
    lines.push(
      `${s.label} (annual, ₹cr): ${yearly.map((c) => `${c.label}: ${c.values[s.label] ?? "—"}`).join(", ")}`,
    );
  }

  const ratios = Object.entries(tables.topRatios)
    .slice(0, 8)
    .map(([k, v]) => `${k} ${v.replace(/\s+/g, " ").trim()}`)
    .join(" · ");
  if (ratios) lines.push(`Headline ratios: ${ratios}`);

  return lines.join("\n");
}

/** Most recent transcript text, trimmed to a token budget. */
function transcriptExcerpts(
  transcripts: TickerSnapshot["transcripts"],
  count = 2,
  charsEach = 14_000,
): { text: string; citations: Citation[] } {
  const used = transcripts.slice(0, count);
  return {
    text: used
      .map((t) => `=== ${t.label} concall transcript ===\n${t.text.slice(0, charsEach)}`)
      .join("\n\n"),
    citations: used.map((t) => ({
      document: `${t.label} concall transcript`,
      locator: `${t.pages} pages`,
      url: t.url,
    })),
  };
}

export interface ProseSection {
  body: string;
  citations: Citation[];
}

/** What the company does, in management's own framing. */
export async function businessNarrative(
  snapshot: Pick<TickerSnapshot, "company" | "transcripts" | "tables">,
): Promise<ProseSection | null> {
  const { text, citations } = transcriptExcerpts(snapshot.transcripts, 1, 16_000);
  if (!text) return null;

  const body = await complete({
    task: "business-snapshot",
    tier: "fast",
    maxTokens: 420,
    temperature: 0.2,
    system: [
      "You summarise what a company does for an investor who has never looked at it.",
      GROUNDING_RULE,
      "",
      "Write 3-4 short sentences: what the business sells, which segments or divisions drive it,",
      "and where the revenue mix sits. Plain prose, no headings, no bullet points, no preamble.",
    ].join("\n"),
    user: `Company: ${snapshot.company}\n\n${figuresDigest(snapshot.tables)}\n\n${text}`,
  });

  return body ? { body: body.trim(), citations } : null;
}

/** Where management's story and the statements disagree. */
export async function narrativeVsNumbers(
  snapshot: Pick<TickerSnapshot, "company" | "transcripts" | "tables">,
): Promise<ProseSection | null> {
  const { text, citations } = transcriptExcerpts(snapshot.transcripts, 2, 13_000);
  if (!text) return null;

  const tableCitation: Citation = {
    document: "screener.in standardised financials",
    locator: "quarterly and annual",
    url: `https://www.screener.in/company/${snapshot.tables?.symbol ?? ""}/consolidated/`,
  };

  const body = await complete({
    task: "narrative-vs-numbers",
    tier: "strong",
    maxTokens: 700,
    temperature: 0.25,
    system: [
      "You compare how management describes the business against what the financial statements show.",
      GROUNDING_RULE,
      "",
      "Structure your reply as two labelled parts, each 2-3 sentences:",
      "AGREE: where the commentary is borne out by the figures.",
      "DIVERGE: where the tone runs ahead of, or behind, what the numbers show.",
      "",
      "Quote or paraphrase the specific figure that supports each point. If the two genuinely do",
      "not diverge, say so plainly rather than manufacturing a tension.",
    ].join("\n"),
    user: `Company: ${snapshot.company}\n\nFIGURES:\n${figuresDigest(snapshot.tables)}\n\nTRANSCRIPTS:\n${text}`,
  });

  return body ? { body: body.trim(), citations: [...citations, tableCitation] } : null;
}

const CaseSchema = z.object({
  bull: z.array(z.string().min(20).max(320)).min(1).max(4),
  bear: z.array(z.string().min(20).max(320)).min(1).max(4),
});

export interface BullBear {
  bull: string[];
  bear: string[];
  citations: Citation[];
}

/** A tight case each way, from the primary record only. */
export async function bullBear(
  snapshot: Pick<TickerSnapshot, "company" | "transcripts" | "tables">,
): Promise<BullBear | null> {
  const { text, citations } = transcriptExcerpts(snapshot.transcripts, 2, 12_000);
  if (!text) return null;

  const result = await completeJson({
    task: "bull-bear",
    tier: "strong",
    schema: CaseSchema,
    maxTokens: 900,
    temperature: 0.3,
    system: [
      "You write the investment case both ways for an investor reading the primary record.",
      GROUNDING_RULE,
      "",
      'Reply with {"bull": [...], "bear": [...]} -- two to four points each.',
      "Every point must be one sentence, specific, and anchored to a figure from the supplied",
      "financials or a statement from the supplied transcripts. No valuation calls, no price",
      "targets, no generic risks that would apply to any company.",
    ].join("\n"),
    user: `Company: ${snapshot.company}\n\nFIGURES:\n${figuresDigest(snapshot.tables)}\n\nTRANSCRIPTS:\n${text}`,
  });

  return result ? { ...result, citations } : null;
}

/** What management has explicitly guided on, as a standalone list. */
export async function guidanceSummary(
  snapshot: Pick<TickerSnapshot, "company" | "transcripts">,
): Promise<ProseSection | null> {
  const { text, citations } = transcriptExcerpts(snapshot.transcripts, 1, 15_000);
  if (!text) return null;

  const body = await complete({
    task: "guidance-summary",
    tier: "fast",
    maxTokens: 460,
    temperature: 0.15,
    system: [
      "You list what management has explicitly guided on for future periods.",
      GROUNDING_RULE,
      "",
      "One line per commitment, in the form 'Metric — what they said (period)'. Cover growth,",
      "margins and capex where addressed. Only include forward-looking statements by management,",
      "never analysts' questions or commentary on the quarter just reported. If they guided on",
      "nothing, say exactly that.",
    ].join("\n"),
    user: `Company: ${snapshot.company}\n\n${text}`,
  });

  return body ? { body: body.trim(), citations } : null;
}
