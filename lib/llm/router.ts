import type { z } from "zod";

import { cacheKey, readCache, writeCache } from "./cache";
import { record } from "./ledger";
import { estimateTokens, reserveSlot } from "./limiter";
import {
  ProviderError,
  resolveProvider,
  type ChatRequest,
  type ChatResponse,
  type ProviderSpec,
  type Tier,
} from "./providers";

/**
 * The single entry point for every model call in FINN.
 *
 * Responsibilities, in order: serve from cache, pick the tier's model, call the
 * resolved provider, validate the shape, and log tokens to the ledger.
 *
 * It never throws for want of a key. When no provider is configured `complete`
 * returns null and every caller has a deterministic fallback, so the whole app
 * — feed, scoring, tables, QoQ/YoY — still runs with zero API access. Only the
 * genuinely language-dependent parts degrade.
 */

export interface CompleteOptions {
  /** Ledger label, e.g. "categorize" or "guidance-match". */
  task: string;
  tier: Tier;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export function llmAvailable(): boolean {
  return resolveProvider() !== null;
}

export function activeProviderLabel(): string | null {
  const p = resolveProvider();
  return p ? `${p.name}:${p.models.fast} / ${p.models.strong}` : null;
}

const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rate limits are a wait, not a failure. Treating a 429 as "model unavailable"
 * silently downgrades the whole run to its deterministic fallback, so those are
 * retried against the provider's own hint. Genuine errors -- a bad key, an
 * unknown model -- fail on the first attempt rather than stalling the pipeline.
 */
async function callWithRetry(
  provider: ProviderSpec,
  model: string,
  req: ChatRequest,
  task: string,
): Promise<ChatResponse | null> {
  const apiKey = process.env[provider.envKey]!.trim();
  const cost = estimateTokens(req.system, req.user, req.maxTokens);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await reserveSlot(cost);

    try {
      return await provider.call(apiKey, model, req);
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : 0;
      const retryable = status === 429 || status >= 500 || status === 0;

      if (!retryable || attempt === MAX_ATTEMPTS) {
        console.warn(`[llm] ${task} failed: ${(err as Error).message}`);
        return null;
      }

      const hinted = err instanceof ProviderError ? err.retryAfterMs : null;
      await sleep(hinted ?? Math.min(8000, 500 * 2 ** attempt));
    }
  }

  return null;
}

export async function complete(opts: CompleteOptions): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider) return null;

  const model = provider.models[opts.tier];
  const req = {
    system: opts.system,
    user: opts.user,
    json: opts.json ?? false,
    maxTokens: opts.maxTokens ?? 900,
    temperature: opts.temperature ?? 0.2,
  };

  const key = cacheKey({ p: provider.name, model, ...req });

  const hit = readCache(key);
  if (hit !== null) {
    record({
      task: opts.task,
      provider: provider.name,
      model,
      tier: opts.tier,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      cached: true,
    });
    return hit;
  }

  const res = await callWithRetry(provider, model, req, opts.task);
  if (res === null) return null;

  const price = provider.price[opts.tier];
  record({
    task: opts.task,
    provider: provider.name,
    model,
    tier: opts.tier,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    costUsd: (res.inputTokens * price.input + res.outputTokens * price.output) / 1_000_000,
    cached: false,
  });

  writeCache(key, res.text, { task: opts.task, provider: provider.name, model });
  return res.text;
}

/**
 * Structured output with schema validation.
 *
 * Small models wrap JSON in prose or fences often enough that tolerating it is
 * cheaper than a retry, so the extractor salvages the first balanced object or
 * array before validating. A genuine schema failure buys exactly one repair
 * attempt with the validation error fed back.
 */
export async function completeJson<T>(
  opts: CompleteOptions & { schema: z.ZodType<T> },
): Promise<T | null> {
  const ask = async (extra?: string) =>
    complete({
      ...opts,
      json: true,
      user: extra ? `${opts.user}\n\n${extra}` : opts.user,
    });

  const first = await ask();
  if (first === null) return null;

  const parsed = tryParse(first, opts.schema);
  if (parsed.ok) return parsed.value;

  const repaired = await ask(
    `Your previous reply did not match the required schema (${parsed.error}). Reply with only the corrected JSON, no commentary.`,
  );
  if (repaired === null) return null;

  const second = tryParse(repaired, opts.schema);
  return second.ok ? second.value : null;
}

function tryParse<T>(
  raw: string,
  schema: z.ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  const candidate = extractJson(raw);
  if (candidate === null) return { ok: false, error: "no JSON found in reply" };

  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }

  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** Pulls the first balanced {...} or [...] out of a reply, ignoring fences and prose. */
function extractJson(raw: string): string | null {
  const text = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }

  return null;
}
