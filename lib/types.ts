/** The seventeen announcement categories from the challenge reference document. */
export const CATEGORIES = [
  "results",
  "M&A",
  "fund_raise",
  "management_change",
  "litigation",
  "insider_trading",
  "earnings_call",
  "investor_meetings",
  "credit_rating",
  "dividend",
  "bonus_split",
  "capex",
  "press_release",
  "postal_ballot",
  "agm_egm",
  "pledging",
  "unclassified",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type MaterialityTier = "critical" | "high" | "medium" | "routine";

/** One end-of-day bar. */
export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A corporate announcement as filed, before any of our own analysis. */
export interface RawAnnouncement {
  id: string;
  symbol: string;
  company: string;
  /** NSE's own subject line, e.g. "Acquisition" or "Loss of Share Certificates". */
  desc: string;
  /** Announcement body text, served inline by NSE. Often complete enough that
   *  the attached PDF never needs downloading. */
  text: string;
  attachmentUrl: string | null;
  filedAt: string;
  industry: string | null;
}

/** How a filing earned its place in the feed. Surfaced verbatim in the UI so the
 *  ranking is auditable rather than magic. */
export interface MaterialityBreakdown {
  score: number;
  tier: MaterialityTier;
  factors: Array<{
    label: string;
    detail: string;
    /** Points contributed. Negative values pull the score down. */
    points: number;
  }>;
}

/** The market's same-day verdict on a filing. */
export interface MarketReaction {
  date: string;
  priceChangePct: number;
  volume: number;
  volumeMultiple: number;
}

export interface QoQYoYMetric {
  label: string;
  current: number | null;
  previousQuarter: number | null;
  yearAgoQuarter: number | null;
  qoqPct: number | null;
  yoyPct: number | null;
  unit: "cr" | "pct";
}

export interface ResultsEnrichment {
  kind: "results";
  quarter: string;
  previousQuarter: string | null;
  yearAgoQuarter: string | null;
  metrics: QoQYoYMetric[];
}

export interface PersonEnrichment {
  kind: "management_change";
  /** "appointment" | "resignation" | "both" — drives the card's framing. */
  movement: "appointment" | "resignation" | "both" | "unknown";
  people: Array<{
    name: string;
    role: string | null;
    direction: "incoming" | "outgoing";
    background: string | null;
    backgroundSource: string | null;
  }>;
}

export type Enrichment = ResultsEnrichment | PersonEnrichment;

/** A filing after categorisation, scoring and enrichment. */
export interface Filing extends RawAnnouncement {
  category: Category;
  /** Whether the category came from the rules table or needed a model call. */
  categorySource: "rules" | "model" | "fallback";
  headline: string;
  headlineSource: "rules" | "model" | "fallback";
  materiality: MaterialityBreakdown;
  reaction: MarketReaction | null;
  enrichment: Enrichment | null;
}

export interface QuarterColumn {
  /** e.g. "Jun 2026" */
  label: string;
  values: Record<string, number | null>;
}

/** screener.in's standardised tables. Every number FINN shows comes from here,
 *  parsed deterministically -- no model ever invents a figure. */
export interface ScreenerTables {
  symbol: string;
  name: string | null;
  about: string | null;
  topRatios: Record<string, string>;
  quarters: { rows: string[]; columns: QuarterColumn[] };
  profitLoss: { rows: string[]; columns: QuarterColumn[] };
  balanceSheet: { rows: string[]; columns: QuarterColumn[] };
  cashFlow: { rows: string[]; columns: QuarterColumn[] };
  ratios: { rows: string[]; columns: QuarterColumn[] };
  annualReports: Array<{ label: string; url: string }>;
  concalls: Array<{ label: string; transcriptUrl: string | null; pptUrl: string | null }>;
}

export interface Citation {
  /** e.g. "Q1 FY27 concall transcript" or "screener.in quarterly results". */
  document: string;
  /** Page for PDFs, quarter label for tables. */
  locator: string | null;
  url: string | null;
}

export interface ResearchSection {
  id: string;
  title: string;
  /** Markdown-ish prose. Numbers inside are copied from parsed tables. */
  body: string;
  citations: Citation[];
  /** Set when the section could not be produced, so one failure does not kill
   *  the whole sheet. */
  error?: string;
}

export interface GuidanceClaim {
  quarter: string;
  /** Management's own words. */
  quote: string;
  metric: string;
  /** What they said would happen, normalised for display. */
  promised: string;
  /** What the tables actually show. */
  delivered: string | null;
  verdict: "hit" | "miss" | "partial" | "unverifiable";
  reasoning: string;
  citation: Citation;
}

export interface AlertRule {
  volumeMultiple: number;
  priceMovePct: number;
  watchedCategories: Category[];
}

export interface TriggeredAlert {
  id: string;
  symbol: string;
  company: string;
  kind: "volume" | "price" | "category";
  summary: string;
  detail: string;
  date: string;
  magnitude: number;
}

/** What `npm run ingest` writes per ticker. */
export interface TickerSnapshot {
  symbol: string;
  company: string;
  fetchedAt: string;
  prices: PricePoint[];
  announcements: RawAnnouncement[];
  tables: ScreenerTables | null;
  /** Extracted transcript text, newest first. Capped by the ingest CLI. */
  transcripts: Array<{ label: string; url: string; pages: number; text: string }>;
}

export interface SnapshotIndex {
  generatedAt: string;
  portfolio: string[];
  adhoc: string[];
  companies: Record<string, { company: string; industry: string | null }>;
}
