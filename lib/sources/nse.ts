import type { RawAnnouncement } from "@/lib/types";

import { browserFetch, clearCookies, primeNseSession, retry } from "./http";

/** Shape of one row from NSE's corporate-announcements endpoint. */
interface NseRow {
  an_dt?: string;
  sort_date?: string;
  desc?: string;
  attchmntText?: string;
  attchmntFile?: string;
  sm_name?: string;
  smIndustry?: string;
  seq_id?: string;
  symbol?: string;
}

const HOST = "www.nseindia.com";
const ENDPOINT = `https://${HOST}/api/corporate-announcements`;
const REFERER = `https://${HOST}/companies-listing/corporate-filings-announcements`;

/**
 * Each call returns a company's entire filing history, which is a heavy
 * response. Twenty-two of them back to back is enough for NSE to start
 * stalling requests, so leave a gap between them.
 */
const MIN_GAP_MS = 1_500;
let lastCall = 0;

async function pace() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/**
 * Corporate announcements for one NSE symbol, newest first.
 *
 * The endpoint returns the company's entire filing history, which for a large
 * cap is several thousand rows, so callers cap with `limit`.
 */
export async function fetchAnnouncements(symbol: string, limit = 400): Promise<RawAnnouncement[]> {
  await pace();
  await primeNseSession();

  const url = `${ENDPOINT}?index=equities&symbol=${encodeURIComponent(symbol)}`;

  let attempt = 0;
  const rows = await retry(async () => {
    // A jar that has gone stale does not 401, it hangs until the timeout. Any
    // repeat attempt therefore starts from a fresh handshake rather than
    // burning another 30 seconds on the same dead session.
    if (attempt++ > 0) {
      clearCookies(HOST);
      await primeNseSession();
    }

    const res = await browserFetch(url, {
      referer: REFERER,
      accept: "application/json, text/plain, */*",
    });
    const body = (await res.json()) as NseRow[] | { data?: NseRow[] };
    return Array.isArray(body) ? body : (body.data ?? []);
  });

  return rows
    .map((row) => normalise(row, symbol))
    .filter((a): a is RawAnnouncement => a !== null)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt))
    .slice(0, limit);
}

function normalise(row: NseRow, symbol: string): RawAnnouncement | null {
  const filedAt = parseFiledAt(row);
  if (!filedAt) return null;

  const text = clean(row.attchmntText ?? "");
  const desc = clean(row.desc ?? "");
  if (!desc && !text) return null;

  return {
    id: row.seq_id ? `${symbol}-${row.seq_id}` : `${symbol}-${filedAt}-${hash(desc + text)}`,
    symbol: row.symbol?.trim() || symbol,
    company: clean(row.sm_name ?? "") || symbol,
    desc,
    text,
    attachmentUrl: row.attchmntFile?.trim() || null,
    filedAt,
    industry: clean(row.smIndustry ?? "") || null,
  };
}

/**
 * `sort_date` is already sortable ("2026-09-17 19:50:37"); `an_dt` is display
 * format ("17-Sep-2026 19:50:37"). Prefer the former, parse the latter.
 */
function parseFiledAt(row: NseRow): string | null {
  if (row.sort_date && /^\d{4}-\d{2}-\d{2}/.test(row.sort_date)) {
    return new Date(row.sort_date.replace(" ", "T") + "+05:30").toISOString();
  }
  if (row.an_dt) {
    const m = row.an_dt.match(/^(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const months = "JanFebMarAprMayJunJulAugSepOctNovDec";
      const mon = months.indexOf(m[2]) / 3;
      if (mon >= 0) {
        const iso = `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`;
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
    }
  }
  return null;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
