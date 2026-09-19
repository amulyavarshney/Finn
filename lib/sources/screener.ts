import * as cheerio from "cheerio";

import type { QuarterColumn, ScreenerTables } from "@/lib/types";

import { browserFetch, parseIndianNumber, retry } from "./http";

/**
 * screener.in consolidates annual reports, concall transcripts and
 * standardised multi-year financials on one page.
 *
 * Everything numeric that FINN displays is parsed from here deterministically.
 * No model is ever asked to produce or restate a figure, which removes the
 * whole class of hallucinated-number failures and costs zero tokens.
 */
export async function fetchScreenerTables(symbol: string): Promise<ScreenerTables | null> {
  const html = await retry(async () => {
    // Consolidated is the right view for a group; standalone is the fallback
    // for single-entity companies that have no consolidated statements.
    for (const path of [`${symbol}/consolidated/`, `${symbol}/`]) {
      const res = await browserFetch(`https://www.screener.in/company/${path}`, { tolerant: true });
      if (res.ok) {
        const body = await res.text();
        if (body.includes('id="quarters"')) return body;
      }
    }
    throw new Error(`screener.in has no usable page for ${symbol}`);
  }).catch(() => null);

  if (!html) return null;

  const $ = cheerio.load(html);

  return {
    symbol,
    name: text($("h1.margin-0").first()) || null,
    // screener's profile carries inline "[1]" footnote markers pointing at
    // sources further down their page, which are meaningless once lifted out.
    about: text($(".company-profile .about p").first()).replace(/\s*\[\d+\]/g, "") || null,
    topRatios: parseTopRatios($),
    quarters: parseDataTable($, "#quarters"),
    profitLoss: parseDataTable($, "#profit-loss"),
    balanceSheet: parseDataTable($, "#balance-sheet"),
    cashFlow: parseDataTable($, "#cash-flow"),
    ratios: parseDataTable($, "#ratios"),
    annualReports: parseAnnualReports($),
    concalls: parseConcalls($),
  };
}

function text(el: cheerio.Cheerio<never> | ReturnType<cheerio.CheerioAPI>): string {
  return (el.text() ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** `#top-ratios` is a flat list of headline figures (Market Cap, P/E, ROCE...). */
function parseTopRatios($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $("#top-ratios li").each((_, li) => {
    const name = $(li).find(".name").text().replace(/\s+/g, " ").trim();
    const value = $(li).find(".value").text().replace(/\s+/g, " ").trim();
    if (name && value) out[name] = value;
  });
  return out;
}

/**
 * Parses screener's `table.data-table`, which is the same markup for quarterly
 * results, P&L, balance sheet, cash flow and ratios: a header row of period
 * labels and one body row per line item.
 */
function parseDataTable(
  $: cheerio.CheerioAPI,
  sectionId: string,
): { rows: string[]; columns: QuarterColumn[] } {
  const table = $(`${sectionId} table.data-table`).first();
  if (table.length === 0) return { rows: [], columns: [] };

  const periods: string[] = [];
  table
    .find("thead th")
    .slice(1) // first header cell is the empty corner above the row labels
    .each((_, th) => {
      periods.push($(th).text().replace(/\s+/g, " ").trim());
    });

  const rowLabels: string[] = [];
  const cells: Array<Array<number | null>> = [];

  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    // Strip the trailing "+" toggle screener adds to expandable line items.
    const label = $(tds[0]).text().replace(/\u00a0/g, " ").replace(/\s*\+\s*$/, "").replace(/\s+/g, " ").trim();
    if (!label) return;

    rowLabels.push(label);
    const values: Array<number | null> = [];
    for (let i = 1; i < tds.length; i++) {
      values.push(parseIndianNumber($(tds[i]).text()));
    }
    cells.push(values);
  });

  const columns: QuarterColumn[] = periods.map((label, colIdx) => {
    const values: Record<string, number | null> = {};
    rowLabels.forEach((rowLabel, rowIdx) => {
      values[rowLabel] = cells[rowIdx]?.[colIdx] ?? null;
    });
    return { label, values };
  });

  return { rows: rowLabels, columns };
}

function parseAnnualReports($: cheerio.CheerioAPI): Array<{ label: string; url: string }> {
  const out: Array<{ label: string; url: string }> = [];
  $(".documents .annual-reports a, #documents .annual-reports a").each((_, a) => {
    const label = $(a).text().replace(/\s+/g, " ").trim();
    const url = $(a).attr("href");
    if (label && url && /annual report|^\s*20\d\d/i.test(label)) {
      out.push({ label, url: absolute(url) });
    }
  });
  return dedupe(out);
}

/**
 * The Concalls block lists one row per call: a date, then chips for Transcript,
 * PPT and sometimes an audio recording. Only the transcript matters to us --
 * it is where guidance and management's own framing live.
 */
function parseConcalls($: cheerio.CheerioAPI): ScreenerTables["concalls"] {
  const out: ScreenerTables["concalls"] = [];

  $(".documents .concalls li, #documents .concalls li").each((_, li) => {
    const label = $(li).find("div").first().text().replace(/\s+/g, " ").trim();
    if (!label) return;

    let transcriptUrl: string | null = null;
    let pptUrl: string | null = null;

    $(li)
      .find("a")
      .each((_, a) => {
        const kind = $(a).text().replace(/\s+/g, " ").trim().toLowerCase();
        const href = $(a).attr("href");
        if (!href) return;
        if (kind.includes("transcript")) transcriptUrl = absolute(href);
        else if (kind.includes("ppt")) pptUrl = absolute(href);
      });

    if (transcriptUrl || pptUrl) out.push({ label, transcriptUrl, pptUrl });
  });

  return out;
}

function absolute(href: string): string {
  return href.startsWith("http") ? href : `https://www.screener.in${href}`;
}

function dedupe<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

/** Reads a labelled line item out of a parsed table, newest period last. */
export function seriesFor(
  table: { rows: string[]; columns: QuarterColumn[] },
  candidates: string[],
): { label: string; values: Array<{ period: string; value: number | null }> } | null {
  const match = candidates
    .map((c) => table.rows.find((r) => r.toLowerCase() === c.toLowerCase()))
    .find(Boolean);

  const loose =
    match ??
    table.rows.find((r) => candidates.some((c) => r.toLowerCase().includes(c.toLowerCase())));

  if (!loose) return null;

  return {
    label: loose,
    values: table.columns.map((col) => ({ period: col.label, value: col.values[loose] ?? null })),
  };
}
