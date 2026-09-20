/**
 * Provider definitions.
 *
 * Two tiers, because the work splits cleanly: bulk classification and
 * one-line summaries go to the cheapest model that can follow a schema, and
 * only genuine reasoning (guidance matching, bull/bear, narrative divergence)
 * pays for the strong one.
 *
 * Every model id is env-overridable so the routing can be retuned without a
 * code change.
 */

export type Tier = "fast" | "strong";

export type ProviderName = "groq" | "openai" | "anthropic" | "gemini";

export interface ChatRequest {
  system: string;
  user: string;
  /** Ask the provider for strict JSON where it supports it. */
  json: boolean;
  maxTokens: number;
  temperature: number;
}

export interface ChatResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderSpec {
  name: ProviderName;
  envKey: string;
  models: Record<Tier, string>;
  /** USD per million tokens, used by the ledger. */
  price: Record<Tier, { input: number; output: number }>;
  call: (apiKey: string, model: string, req: ChatRequest) => Promise<ChatResponse>;
}

function env(key: string, fallback: string) {
  return process.env[key]?.trim() || fallback;
}

/** Token allowance for a reasoning model's hidden deliberation. Only a cap,
    so unused headroom is never billed. */
const REASONING_HEADROOM = 512;

function isReasoningModel(model: string): boolean {
  return /gpt-oss|^o[134]|qwen3/i.test(model);
}

/**
 * Ceiling on a single completion.
 *
 * A stalled connection is otherwise indistinguishable from a slow model and
 * blocks forever: one warm run saw a single section sit for 41 minutes against
 * a 60-second norm. The router treats an abort as retryable, so capping it
 * turns an indefinite hang into a retry.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.FINN_LLM_TIMEOUT_MS) || 120_000;

/** Carries the status so the router can tell "slow down" from "give up". */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function providerError(model: string, status: number, headers: Headers, body: string) {
  const header = headers.get("retry-after");
  // Groq puts the wait in the message ("Please try again in 2.5s") more often
  // than in a header.
  const inBody = body.match(/try again in ([\d.]+)s/i);

  const retryAfterMs = header
    ? Number(header) * 1000
    : inBody
      ? Number(inBody[1]) * 1000
      : null;

  return new ProviderError(
    `${model}: ${status} ${body.slice(0, 300)}`,
    status,
    Number.isFinite(retryAfterMs as number) ? retryAfterMs : null,
  );
}

/** Groq and OpenAI both speak the OpenAI chat-completions shape. */
async function openAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  req: ChatRequest,
  extra: Record<string, unknown> = {},
): Promise<ChatResponse> {
  // Both Groq and OpenAI reject response_format: json_object outright unless
  // the word "json" appears somewhere in the messages.
  const mentionsJson = /json/i.test(req.system) || /json/i.test(req.user);
  const system =
    req.json && !mentionsJson ? `${req.system}\n\nRespond with JSON only.` : req.system;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
      ...extra,
    }),
  });

  if (!res.ok) throw providerError(model, res.status, res.headers, await res.text());

  const body = await res.json();
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
  };
}

export const PROVIDERS: Record<ProviderName, ProviderSpec> = {
  groq: {
    name: "groq",
    envKey: "GROQ_API_KEY",
    // Groq retired the Llama 3.x ids these tiers originally used; both now 404.
    models: {
      fast: env("FINN_GROQ_FAST", "openai/gpt-oss-20b"),
      strong: env("FINN_GROQ_STRONG", "openai/gpt-oss-120b"),
    },
    price: {
      fast: { input: 0.1, output: 0.5 },
      strong: { input: 0.15, output: 0.75 },
    },
    call: (key, model, req) =>
      openAiCompatible(
        "https://api.groq.com/openai/v1",
        key,
        model,
        req,
        // gpt-oss burns completion tokens on reasoning before it emits any
        // content. Left alone, a 60-token classification budget is spent
        // thinking and comes back empty, so cap the effort and let the
        // caller's budget cover the answer rather than the deliberation.
        // Guarded on the model id because Groq rejects reasoning_effort
        // outright on models that do not reason, and the ids are overridable.
        isReasoningModel(model)
          ? { reasoning_effort: "low", max_tokens: req.maxTokens + REASONING_HEADROOM }
          : {},
      ),
  },

  openai: {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    models: {
      fast: env("FINN_OPENAI_FAST", "gpt-4o-mini"),
      strong: env("FINN_OPENAI_STRONG", "gpt-4o"),
    },
    price: {
      fast: { input: 0.15, output: 0.6 },
      strong: { input: 2.5, output: 10 },
    },
    call: (key, model, req) => openAiCompatible("https://api.openai.com/v1", key, model, req),
  },

  anthropic: {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    models: {
      fast: env("FINN_ANTHROPIC_FAST", "claude-3-5-haiku-latest"),
      strong: env("FINN_ANTHROPIC_STRONG", "claude-sonnet-4-5"),
    },
    price: {
      fast: { input: 0.8, output: 4 },
      strong: { input: 3, output: 15 },
    },
    call: async (key, model, req) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system: req.system,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          messages: [{ role: "user", content: req.user }],
        }),
      });
      if (!res.ok) throw providerError(model, res.status, res.headers, await res.text());
      const body = await res.json();
      return {
        text: body.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "",
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      };
    },
  },

  gemini: {
    name: "gemini",
    envKey: "GEMINI_API_KEY",
    models: {
      fast: env("FINN_GEMINI_FAST", "gemini-2.0-flash-lite"),
      strong: env("FINN_GEMINI_STRONG", "gemini-2.0-flash"),
    },
    price: {
      fast: { input: 0.075, output: 0.3 },
      strong: { input: 0.1, output: 0.4 },
    },
    call: async (key, model, req) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            generationConfig: {
              temperature: req.temperature,
              maxOutputTokens: req.maxTokens,
              ...(req.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
        },
      );
      if (!res.ok) throw providerError(model, res.status, res.headers, await res.text());
      const body = await res.json();
      return {
        text:
          body.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? "")
            .join("") ?? "",
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  },
};

/** Preference order: explicit override, then whichever key is present. */
export function resolveProvider(): ProviderSpec | null {
  const forced = process.env.FINN_LLM_PROVIDER?.trim() as ProviderName | undefined;
  if (forced && PROVIDERS[forced] && process.env[PROVIDERS[forced].envKey]) {
    return PROVIDERS[forced];
  }
  for (const name of ["groq", "openai", "anthropic", "gemini"] as const) {
    if (process.env[PROVIDERS[name].envKey]?.trim()) return PROVIDERS[name];
  }
  return null;
}
