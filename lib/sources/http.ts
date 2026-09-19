/**
 * Shared fetch helpers for the three upstream sources.
 *
 * NSE and screener.in both reject requests that do not look like a browser, and
 * NSE additionally requires a cookie handshake before its JSON endpoints answer.
 * That handshake is stateful, so we keep a per-host cookie jar for the life of
 * the process.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const jars = new Map<string, Map<string, string>>();

function jarFor(host: string) {
  let jar = jars.get(host);
  if (!jar) {
    jar = new Map();
    jars.set(host, jar);
  }
  return jar;
}

function absorbCookies(host: string, res: Response) {
  const jar = jarFor(host);
  // getSetCookie preserves multiple Set-Cookie headers; a plain get() would
  // collapse them into one comma-joined string and corrupt expiry dates.
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(host: string) {
  const jar = jarFor(host);
  if (jar.size === 0) return undefined;
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export interface FetchOpts {
  referer?: string;
  accept?: string;
  timeoutMs?: number;
  /** Treat non-2xx as success and return the body anyway. */
  tolerant?: boolean;
}

export async function browserFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const host = new URL(url).host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        ...(opts.referer ? { Referer: opts.referer } : {}),
        ...(cookieHeader(host) ? { Cookie: cookieHeader(host)! } : {}),
      },
    });
    absorbCookies(host, res);
    if (!res.ok && !opts.tolerant) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function clearCookies(host: string): void {
  jars.delete(host);
}

/** NSE's JSON endpoints 401/403 until the jar holds cookies from an HTML page. */
export async function primeNseSession(): Promise<void> {
  if (cookieHeader("www.nseindia.com")) return;
  // The warm-up itself often returns 403 behind their CDN while still setting
  // the cookies we need, so failures here are expected and ignored.
  await browserFetch("https://www.nseindia.com/", { tolerant: true }).catch(() => undefined);
}

export async function retry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 700 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}

/** Indian digit grouping ("4,26,004"), percent suffixes and blank cells. */
export function parseIndianNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/\u00a0/g, " ")
    .replace(/[,₹%]/g, "")
    .replace(/Cr\.?/gi, "")
    .trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
