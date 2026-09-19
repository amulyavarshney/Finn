/**
 * Client-side rate limiting.
 *
 * Groq's free tier allows 30 requests per minute. Ingestion fans out over
 * thousands of filings, so without a governor the pipeline trips 429 within
 * seconds and every call after that degrades to its deterministic fallback --
 * which looks like the model is unavailable rather than rate limited.
 *
 * A rolling window rather than fixed spacing, so a short burst still runs at
 * full speed and only sustained load waits.
 */

const RPM = Number(process.env.FINN_LLM_RPM) || 25;
/** Tokens per minute. The tighter of the two limits in practice: Groq's free
    tier allows 8,000, which a few thousand-token prompts exhaust well before
    the request count matters. */
const TPM = Number(process.env.FINN_LLM_TPM) || 7_000;

interface Spend {
  at: number;
  tokens: number;
}

const window: Spend[] = [];

/** Serialises the check so two callers cannot claim the same free slot. */
let gate: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rough but adequate: the limit is enforced by the server anyway, and the
    retry path covers an underestimate. */
export function estimateTokens(system: string, user: string, maxTokens: number): number {
  return Math.ceil((system.length + user.length) / 4) + maxTokens;
}

export function reserveSlot(tokens: number): Promise<void> {
  const next = gate.then(async () => {
    for (;;) {
      const now = Date.now();
      while (window.length > 0 && now - window[0].at >= 60_000) window.shift();

      const spent = window.reduce((sum, s) => sum + s.tokens, 0);
      if (window.length < RPM && spent + tokens <= TPM) {
        window.push({ at: now, tokens });
        return;
      }

      // A single request larger than the whole budget can never fit; let it
      // through and let the provider's own 429 handling deal with it.
      if (window.length === 0) {
        window.push({ at: now, tokens });
        return;
      }

      await sleep(60_000 - (now - window[0].at) + 50);
    }
  });

  gate = next.catch(() => {});
  return next;
}
