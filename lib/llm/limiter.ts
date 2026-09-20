/**
 * Client-side rate limiting.
 *
 * Groq's free tier allows 30 requests and 8,000 tokens per minute. Ingestion
 * fans out over thousands of filings, so without a governor the pipeline trips
 * 429 within seconds and every call after that degrades to its deterministic
 * fallback -- which looks like the model is unavailable rather than rate
 * limited.
 *
 * Modelled as two continuously-refilling buckets rather than a fixed window,
 * because that is what the provider actually does: `x-ratelimit-reset-tokens`
 * comes back in milliseconds, not at the top of each minute. A fixed window is
 * not merely approximate here, it is quadratically worse -- it holds a whole
 * request's cost for the full sixty seconds, so any call larger than half the
 * budget serialises the pipeline to one call per minute no matter how small
 * its neighbours are.
 */

const RPM = Number(process.env.FINN_LLM_RPM) || 25;
const TPM = Number(process.env.FINN_LLM_TPM) || 7_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Bucket {
  /** Units available right now. */
  available: number;
  capacity: number;
  lastRefill: number;
}

const tokens: Bucket = { available: TPM, capacity: TPM, lastRefill: Date.now() };
const requests: Bucket = { available: RPM, capacity: RPM, lastRefill: Date.now() };

function refill(b: Bucket, now: number) {
  const elapsed = now - b.lastRefill;
  if (elapsed <= 0) return;
  b.available = Math.min(b.capacity, b.available + (elapsed / 60_000) * b.capacity);
  b.lastRefill = now;
}

/** Milliseconds until the bucket holds `need`, given its refill rate. */
function waitFor(b: Bucket, need: number): number {
  if (b.available >= need) return 0;
  return Math.ceil(((need - b.available) / b.capacity) * 60_000);
}

/** Serialises admission so two callers cannot spend the same headroom. */
let gate: Promise<void> = Promise.resolve();

/**
 * Transcript prose thick with figures tokenises far worse than ordinary
 * English: Groq priced a 13.8k-character prompt at 7.5k tokens, under two
 * characters each. Estimating at the usual four called it 3.4k, sailed past
 * the ceiling, and earned a 413.
 */
const CHARS_PER_TOKEN = 2;

/**
 * Reasoning models are handed extra completion budget on top of `maxTokens`,
 * and the provider charges that to the same ceiling.
 */
const COMPLETION_SLACK = 512;

/** Rough but deliberately pessimistic: an overestimate only costs throughput,
    while an underestimate costs the whole call. */
export function estimateTokens(system: string, user: string, maxTokens: number): number {
  return (
    Math.ceil((system.length + user.length) / CHARS_PER_TOKEN) + maxTokens + COMPLETION_SLACK
  );
}

/**
 * Shrink `user` until the whole call fits under the ceiling.
 *
 * A request bigger than the per-minute budget is refused outright rather than
 * throttled, so no amount of waiting redeems it. Callers already hand us
 * excerpts clipped to a character budget, so trimming further is that same
 * degradation applied one step later — and a shorter grounded answer beats no
 * answer at all.
 */
export function fitToCeiling(system: string, user: string, maxTokens: number): string {
  const over = estimateTokens(system, user, maxTokens) - TPM;
  if (over <= 0) return user;

  return user.slice(0, Math.max(0, user.length - over * CHARS_PER_TOKEN));
}

export function reserveSlot(cost: number): Promise<void> {
  // A request larger than the entire budget can never be afforded; charge it
  // the whole bucket and let the provider's own 429 handling take it from
  // there, rather than waiting forever for headroom that cannot exist.
  const need = Math.min(cost, TPM);

  const next = gate.then(async () => {
    for (;;) {
      const now = Date.now();
      refill(tokens, now);
      refill(requests, now);

      const wait = Math.max(waitFor(tokens, need), waitFor(requests, 1));
      if (wait === 0) {
        tokens.available -= need;
        requests.available -= 1;
        return;
      }

      await sleep(wait + 25);
    }
  });

  gate = next.catch(() => {});
  return next;
}
