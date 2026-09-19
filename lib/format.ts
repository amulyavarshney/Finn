/** Indian-market display conventions: crore, lakh, rupee, and IST filing times. */

export function formatCrore(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  if (abs >= 100_000) return `${sign(value)}₹${(abs / 100_000).toFixed(2)} L cr`;
  if (abs >= 1_000) return `${sign(value)}₹${(abs / 1_000).toFixed(2)}k cr`;
  return `${sign(value)}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/** Margins move in percentage points, not percent of a percent. */
export function formatPoints(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)} pp`;
}

function sign(value: number): string {
  return value < 0 ? "−" : "";
}

/** Compact relative time: "14m", "3h", "2d", then a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 8) return `${days}d`;

  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Exchange filings are timestamped IST; showing them in UTC would mislead. */
export function formatFilingTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Share counts in crore/lakh, as an Indian investor reads them. */
export function formatVolumeShort(volume: number): string {
  if (volume >= 10_000_000) return `${(volume / 10_000_000).toFixed(2)} cr shares`;
  if (volume >= 100_000) return `${(volume / 100_000).toFixed(2)} lakh shares`;
  return `${volume.toLocaleString("en-IN")} shares`;
}
