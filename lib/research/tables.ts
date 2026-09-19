import { seriesFor } from "@/lib/sources/screener";
import type { Citation, ScreenerTables } from "@/lib/types";

/**
 * Deterministic readings of screener's standardised tables.
 *
 * These carry the numeric half of the research sheet, and no model touches
 * them. Financial snapshot, trajectory, balance sheet and cash quality are all
 * arithmetic over a table we already parsed -- so they render instantly, cost
 * nothing, and cannot be wrong in the way a generated number can.
 *
 * The model's job is confined to language: what management claimed, where the
 * story and the statements diverge, and the case each way.
 */

export interface MetricRow {
  label: string;
  value: string;
  /** Change against the prior period, already formatted. */
  change: string | null;
  /** Whether the change is good or bad, which drives colour. Inverted for
      metrics like borrowings where growth is the unwelcome direction. */
  tone: "up" | "down" | "flat" | "none";
  /** The literal sign of the change, which drives the arrow. Kept separate
      from tone so the arrow never contradicts the printed sign. */
  direction: "up" | "down" | "flat" | "none";
  note?: string;
}

export interface TableBlock {
  title: string;
  rows: MetricRow[];
  citation: Citation;
}

function tableCitation(document: string, locator: string | null, symbol: string): Citation {
  return {
    document,
    locator,
    url: `https://www.screener.in/company/${symbol}/consolidated/`,
  };
}

const crore = (v: number | null) =>
  v === null ? "—" : `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;

const pct = (v: number | null, digits = 1) => (v === null ? "—" : `${v.toFixed(digits)}%`);

function pctChange(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  if (base < 0 && current > 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

function toneFor(value: number | null, invert = false): MetricRow["tone"] {
  if (value === null) return "none";
  if (Math.abs(value) < 0.05) return "flat";
  const positive = value > 0;
  return (invert ? !positive : positive) ? "up" : "down";
}

/** Latest quarter's headline numbers, with QoQ and YoY alongside. */
export function financialSnapshot(tables: ScreenerTables): TableBlock | null {
  const q = tables.quarters;
  if (q.columns.length < 2) return null;

  const last = q.columns.length - 1;
  const current = q.columns[last];
  const yearAgo = last - 4 >= 0 ? q.columns[last - 4] : null;

  const read = (names: string[]) => {
    const s = seriesFor(q, names);
    if (!s) return { cur: null, ago: null };
    return {
      cur: current.values[s.label] ?? null,
      ago: yearAgo ? (yearAgo.values[s.label] ?? null) : null,
    };
  };

  const revenue = read(["Sales", "Revenue"]);
  const ebitda = read(["Operating Profit"]);
  const opm = read(["OPM %"]);
  const pbt = read(["Profit before tax"]);
  const pat = read(["Net Profit"]);
  const eps = read(["EPS in Rs"]);

  const rows: MetricRow[] = [
    row("Revenue", crore(revenue.cur), pctChange(revenue.cur, revenue.ago), "YoY"),
    row("EBITDA", crore(ebitda.cur), pctChange(ebitda.cur, ebitda.ago), "YoY"),
    row("EBITDA margin", pct(opm.cur), opm.cur !== null && opm.ago !== null ? opm.cur - opm.ago : null, "YoY, pp"),
    row("PBT", crore(pbt.cur), pctChange(pbt.cur, pbt.ago), "YoY"),
    row("PAT", crore(pat.cur), pctChange(pat.cur, pat.ago), "YoY"),
    row("EPS", eps.cur === null ? "—" : `₹${eps.cur.toFixed(2)}`, pctChange(eps.cur, eps.ago), "YoY"),
  ];

  return {
    title: `${current.label} quarter`,
    rows,
    citation: tableCitation("screener.in quarterly results", current.label, tables.symbol),
  };
}

/** Multi-year direction: what is compounding and what is compressing. */
export function trajectory(tables: ScreenerTables): TableBlock | null {
  const pl = tables.profitLoss;
  if (pl.columns.length < 4) return null;

  // Screener's P&L ends with a trailing-twelve-month column; comparing a TTM
  // figure against a full year would overstate growth.
  const yearly = pl.columns.filter((c) => /^[A-Za-z]{3} \d{4}$/.test(c.label));
  if (yearly.length < 4) return null;

  const latest = yearly.at(-1)!;
  const threeBack = yearly.at(-4) ?? null;
  const fiveBack = yearly.length >= 6 ? yearly.at(-6)! : null;

  const read = (names: string[], col: (typeof yearly)[number] | null) => {
    if (!col) return null;
    const s = seriesFor(pl, names);
    return s ? (col.values[s.label] ?? null) : null;
  };

  const rows: MetricRow[] = [];

  for (const [label, names] of [
    ["Revenue", ["Sales", "Revenue"]],
    ["Operating profit", ["Operating Profit"]],
    ["Net profit", ["Net Profit"]],
  ] as const) {
    const now = read([...names], latest);
    const then = read([...names], threeBack);
    const cagr = cagrOf(then, now, 3);
    rows.push(row(label, crore(now), cagr, "3-yr CAGR"));
  }

  const opmNow = read(["OPM %"], latest);
  const opmThen = read(["OPM %"], threeBack);
  rows.push(
    row(
      "Operating margin",
      pct(opmNow),
      opmNow !== null && opmThen !== null ? opmNow - opmThen : null,
      "vs 3 yrs ago, pp",
    ),
  );

  if (fiveBack) {
    const now = read(["Sales", "Revenue"], latest);
    const then = read(["Sales", "Revenue"], fiveBack);
    rows.push(row("Revenue, 5-yr", crore(now), cagrOf(then, now, 5), "5-yr CAGR"));
  }

  return {
    title: `${yearly.at(-4)?.label ?? ""} → ${latest.label}`,
    rows,
    citation: tableCitation("screener.in annual profit & loss", `${latest.label} FY`, tables.symbol),
  };
}

/** Leverage and funding structure. */
export function balanceSheet(tables: ScreenerTables): TableBlock | null {
  const bs = tables.balanceSheet;
  if (bs.columns.length < 2) return null;

  const yearly = bs.columns.filter((c) => /^[A-Za-z]{3} \d{4}$/.test(c.label));
  const latest = yearly.at(-1) ?? bs.columns.at(-1)!;
  const prior = yearly.at(-2) ?? null;

  const read = (names: string[], col: typeof latest | null) => {
    if (!col) return null;
    const s = seriesFor(bs, names);
    return s ? (col.values[s.label] ?? null) : null;
  };

  const borrowings = read(["Borrowings"], latest);
  const priorBorrowings = read(["Borrowings"], prior);
  const equity = read(["Equity Capital"], latest);
  const reserves = read(["Reserves"], latest);
  const netWorth = equity !== null && reserves !== null ? equity + reserves : null;
  const total = read(["Total Liabilities", "Total Assets"], latest);
  const fixed = read(["Fixed Assets"], latest);

  const rows: MetricRow[] = [
    row("Borrowings", crore(borrowings), pctChange(borrowings, priorBorrowings), "YoY", true),
    row("Net worth", crore(netWorth), null, null),
    row(
      "Debt to equity",
      borrowings !== null && netWorth ? (borrowings / netWorth).toFixed(2) + "×" : "—",
      null,
      null,
    ),
    row("Fixed assets", crore(fixed), null, null),
    row("Balance-sheet size", crore(total), null, null),
  ];

  // Screener reports ROCE in the top-ratios block rather than the tables.
  const roce = tables.topRatios["ROCE"];
  if (roce) rows.push(row("ROCE", roce.replace(/\s+/g, " ").trim(), null, null));

  return {
    title: `As at ${latest.label}`,
    rows,
    citation: tableCitation("screener.in balance sheet", latest.label, tables.symbol),
  };
}

/** Does accounting profit turn into cash? */
export function cashQuality(tables: ScreenerTables): TableBlock | null {
  const cf = tables.cashFlow;
  const pl = tables.profitLoss;
  if (cf.columns.length < 2) return null;

  const yearly = cf.columns.filter((c) => /^[A-Za-z]{3} \d{4}$/.test(c.label));
  const latest = yearly.at(-1) ?? cf.columns.at(-1)!;

  const readCf = (names: string[], col: typeof latest) => {
    const s = seriesFor(cf, names);
    return s ? (col.values[s.label] ?? null) : null;
  };

  const operating = readCf(["Cash from Operating Activity"], latest);
  const investing = readCf(["Cash from Investing Activity"], latest);
  const financing = readCf(["Cash from Financing Activity"], latest);

  const plCol = pl.columns.find((c) => c.label === latest.label);
  const patSeries = seriesFor(pl, ["Net Profit"]);
  const pat = plCol && patSeries ? (plCol.values[patSeries.label] ?? null) : null;

  // Capex is not a line in screener's cash-flow table; investing outflow is the
  // closest honest proxy, and is labelled as such rather than called FCF.
  const proxyFcf = operating !== null && investing !== null ? operating + investing : null;
  const conversion = operating !== null && pat !== null && pat > 0 ? (operating / pat) * 100 : null;

  const rows: MetricRow[] = [
    row("Cash from operations", crore(operating), null, null),
    row("Cash used in investing", crore(investing), null, null),
    row("Cash from financing", crore(financing), null, null),
    {
      label: "Operating cash ÷ PAT",
      value: conversion === null ? "—" : `${conversion.toFixed(0)}%`,
      change: null,
      tone: conversion === null ? "none" : conversion >= 80 ? "up" : conversion >= 50 ? "flat" : "down",
      direction: "none",
      note: "Persistent profit without matching cash is a red flag",
    },
    {
      label: "Operating + investing",
      value: crore(proxyFcf),
      change: null,
      tone: toneFor(proxyFcf),
      direction: "none",
      note: "A proxy for free cash flow; screener does not break out capex separately",
    },
  ];

  return {
    title: `${latest.label} financial year`,
    rows,
    citation: tableCitation("screener.in cash-flow statement", latest.label, tables.symbol),
  };
}

/** What the company does, from screener's own profile text. */
export function businessSnapshot(tables: ScreenerTables): { about: string | null; ratios: MetricRow[] } {
  const keys = ["Market Cap", "Current Price", "Stock P/E", "ROCE", "ROE", "Dividend Yield", "Book Value", "High / Low"];
  const ratios: MetricRow[] = [];

  for (const key of keys) {
    const raw = tables.topRatios[key];
    if (raw) {
      ratios.push({
        label: key,
        value: raw.replace(/\s+/g, " ").replace(/₹\s+/g, "₹").trim(),
        change: null,
        tone: "none",
        direction: "none",
      });
    }
  }

  return { about: tables.about, ratios };
}

function row(
  label: string,
  value: string,
  change: number | null,
  note: string | null,
  invertTone = false,
): MetricRow {
  return {
    label,
    value,
    change: change === null ? null : `${change >= 0 ? "+" : ""}${change.toFixed(1)}${note?.includes("pp") ? " pp" : "%"}`,
    tone: toneFor(change, invertTone),
    direction: toneFor(change),
    note: note ?? undefined,
  };
}

function cagrOf(from: number | null, to: number | null, years: number): number | null {
  if (from === null || to === null || from <= 0 || to <= 0) return null;
  return ((to / from) ** (1 / years) - 1) * 100;
}
