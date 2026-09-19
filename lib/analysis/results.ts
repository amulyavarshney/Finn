import { seriesFor } from "@/lib/sources/screener";
import type { QoQYoYMetric, RawAnnouncement, ResultsEnrichment, ScreenerTables } from "@/lib/types";

/**
 * The first cut of a results filing: Revenue, EBITDA, PBT and PAT, this quarter
 * against the previous one and against the same quarter a year ago.
 *
 * Every figure is read out of screener's standardised quarterly table rather
 * than parsed out of the results PDF or produced by a model. Two reasons: the
 * table is already normalised across companies, and a headline number that a
 * language model invented is worse than no number at all.
 *
 * Screener's "Operating Profit" is sales minus operating expenses, before
 * interest, depreciation and other income -- which is EBITDA as the reference
 * document defines it.
 */

const METRIC_MAP: Array<{ label: QoQYoYMetric["label"]; rows: string[]; unit: QoQYoYMetric["unit"] }> = [
  { label: "Revenue", rows: ["Sales", "Revenue", "Total Income"], unit: "cr" },
  { label: "EBITDA", rows: ["Operating Profit"], unit: "cr" },
  { label: "PBT", rows: ["Profit before tax"], unit: "cr" },
  { label: "PAT", rows: ["Net Profit"], unit: "cr" },
  { label: "EBITDA margin", rows: ["OPM %"], unit: "pct" },
];

export function buildResultsEnrichment(
  announcement: RawAnnouncement,
  tables: ScreenerTables | null,
): ResultsEnrichment | null {
  if (!tables || tables.quarters.columns.length < 2) return null;

  const columns = tables.quarters.columns;
  const targetIdx = resolveQuarterIndex(announcement, columns.map((c) => c.label));
  if (targetIdx < 0) return null;

  const current = columns[targetIdx];
  const prevQuarter = targetIdx - 1 >= 0 ? columns[targetIdx - 1] : null;
  // Four columns back is the same quarter a year earlier, which is how YoY
  // strips out seasonality.
  const yearAgo = targetIdx - 4 >= 0 ? columns[targetIdx - 4] : null;

  const metrics: QoQYoYMetric[] = [];

  for (const spec of METRIC_MAP) {
    const series = seriesFor(tables.quarters, spec.rows);
    if (!series) continue;

    const row = series.label;
    const cur = current.values[row] ?? null;
    const prev = prevQuarter?.values[row] ?? null;
    const ago = yearAgo?.values[row] ?? null;

    if (cur === null && prev === null && ago === null) continue;

    metrics.push({
      label: spec.label,
      current: cur,
      previousQuarter: prev,
      yearAgoQuarter: ago,
      // Margins are already percentages, so the sensible comparison is a
      // difference in basis points, not a percentage of a percentage.
      qoqPct: spec.unit === "pct" ? diff(cur, prev) : pctChange(cur, prev),
      yoyPct: spec.unit === "pct" ? diff(cur, ago) : pctChange(cur, ago),
      unit: spec.unit,
    });
  }

  if (metrics.length === 0) return null;

  return {
    kind: "results",
    quarter: current.label,
    previousQuarter: prevQuarter?.label ?? null,
    yearAgoQuarter: yearAgo?.label ?? null,
    metrics,
  };
}

/**
 * Works out which quarter a filing is reporting.
 *
 * The filing text usually names it ("quarter ended June 30, 2026"), which is
 * more reliable than the filing date because results land weeks after the
 * period closes.
 *
 * When the text names nothing -- a bare "Investor Presentation" upload, say --
 * fall back to the filing DATE and pick the latest quarter that had actually
 * closed by then. Defaulting to screener's newest column instead would attach
 * this quarter's numbers to a filing from two quarters ago.
 */
function resolveQuarterIndex(announcement: RawAnnouncement, labels: string[]): number {
  const MONTHS: Record<string, string> = {
    january: "Mar", february: "Mar", march: "Mar",
    april: "Jun", may: "Jun", june: "Jun",
    july: "Sep", august: "Sep", september: "Sep",
    october: "Dec", november: "Dec", december: "Dec",
  };

  const named = announcement.text.match(
    /(?:quarter|period|nine months|half year)\s+(?:and\s+\w+\s+)?ended\s+(?:on\s+)?(\w+)\s+\d{1,2},?\s*(\d{4})/i,
  );

  if (named) {
    const monthEnd = MONTHS[named[1].toLowerCase()];
    if (monthEnd) {
      // A quarter ending in March belongs to the following calendar label only
      // when screener labels it that way, so match on the label text directly.
      const want = `${monthEnd} ${named[2]}`;
      const idx = labels.findIndex((l) => l.toLowerCase() === want.toLowerCase());
      if (idx >= 0) return idx;
    }
  }

  const quarterRef = announcement.text.match(/\bQ([1-4])\s*FY\s*(\d{2,4})\b/i);
  if (quarterRef) {
    const ends = ["Jun", "Sep", "Dec", "Mar"];
    const monthEnd = ends[Number(quarterRef[1]) - 1];
    const fy = Number(quarterRef[2].length === 2 ? `20${quarterRef[2]}` : quarterRef[2]);
    // FY27 Q1 ends Jun 2026; Q4 ends Mar 2027.
    const year = monthEnd === "Mar" ? fy : fy - 1;
    const idx = labels.findIndex((l) => l.toLowerCase() === `${monthEnd} ${year}`.toLowerCase());
    if (idx >= 0) return idx;
  }

  return latestClosedQuarter(announcement.filedAt, labels);
}

/** Index of the last quarter to have ended on or before the filing date. */
function latestClosedQuarter(filedAt: string, labels: string[]): number {
  const filed = filedAt.slice(0, 10);

  for (let i = labels.length - 1; i >= 0; i--) {
    const end = quarterEndDate(labels[i]);
    if (end && end <= filed) return i;
  }

  return labels.length - 1;
}

/** "Jun 2026" -> "2026-06-30". Screener labels a quarter by its closing month. */
function quarterEndDate(label: string): string | null {
  const m = label.trim().match(/^(\w{3})\s+(\d{4})$/);
  if (!m) return null;

  const ends: Record<string, string> = {
    mar: "03-31",
    jun: "06-30",
    sep: "09-30",
    dec: "12-31",
  };
  const end = ends[m[1].toLowerCase()];
  return end ? `${m[2]}-${end}` : null;
}

function pctChange(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  // A swing across zero (loss to profit) makes a percentage meaningless.
  if (base < 0 && current > 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

function diff(current: number | null, base: number | null): number | null {
  if (current === null || base === null) return null;
  return current - base;
}
