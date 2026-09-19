import { bullBear, businessNarrative, guidanceSummary, narrativeVsNumbers } from "@/lib/research/narrative";
import { buildPromisedVsDelivered } from "@/lib/research/guidance";
import { llmAvailable } from "@/lib/llm/router";
import { resolveTarget } from "@/lib/research/assemble";
import { sessionTotals } from "@/lib/llm/ledger";

/**
 * Streams the model-written half of a research sheet as newline-delimited JSON.
 *
 * Streaming is not decoration here. Promised vs Delivered reads four
 * transcripts through a strong model and takes tens of seconds; the
 * deterministic tables are already on screen by then, and each section appears
 * the moment it is ready rather than after the slowest one finishes.
 *
 * Every section is individually wrapped, so one failure degrades to a labelled
 * error in that card instead of an empty page.
 */
export const maxDuration = 120;

interface Chunk {
  id: string;
  status: "ready" | "error" | "unavailable";
  payload?: unknown;
  message?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: Chunk) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      };

      const target = await resolveTarget(symbol);

      if (!target) {
        send({
          id: "fatal",
          status: "error",
          message: `No data could be retrieved for ${symbol.toUpperCase()}. Check the NSE symbol, or run: npm run ingest -- --ticker ${symbol.toUpperCase()}`,
        });
        controller.close();
        return;
      }

      const { snapshot } = target;

      if (!llmAvailable()) {
        // Be explicit about which half is missing and why. The tables are
        // already rendered; only the written analysis needs a key.
        for (const id of SECTION_IDS) {
          send({
            id,
            status: "unavailable",
            message:
              "This section is written from primary sources by a language model. Add a GROQ_API_KEY (or OpenAI, Anthropic or Gemini key) to .env.local to enable it — every figure above is parsed from source tables and needs no key.",
          });
        }
        controller.close();
        return;
      }

      if (snapshot.transcripts.length === 0) {
        for (const id of SECTION_IDS) {
          send({
            id,
            status: "unavailable",
            message:
              "No concall transcripts were available for this company, and the pull side is restricted to primary sources — so there is nothing to ground a written analysis in.",
          });
        }
        controller.close();
        return;
      }

      // Ordered cheapest and most useful first, so the reader gets something
      // to read while the strong-model sections are still running.
      const tasks: Array<{ id: string; run: () => Promise<unknown | null> }> = [
        { id: "business", run: () => businessNarrative(snapshot) },
        { id: "guidance", run: () => guidanceSummary(snapshot) },
        { id: "promised", run: () => buildPromisedVsDelivered(snapshot) },
        { id: "narrative", run: () => narrativeVsNumbers(snapshot) },
        { id: "bullbear", run: () => bullBear(snapshot) },
      ];

      for (const task of tasks) {
        try {
          const payload = await task.run();
          if (payload === null) {
            send({
              id: task.id,
              status: "unavailable",
              message: "The model did not return a usable answer for this section.",
            });
          } else {
            send({ id: task.id, status: "ready", payload });
          }
        } catch (err) {
          send({ id: task.id, status: "error", message: (err as Error).message });
        }
      }

      // Cost of this sheet, for the efficiency story on /tune.
      const t = sessionTotals();
      send({
        id: "ledger",
        status: "ready",
        payload: {
          calls: t.calls,
          cacheHits: t.cacheHits,
          tokens: t.inputTokens + t.outputTokens,
          costUsd: t.costUsd,
        },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

const SECTION_IDS = ["business", "guidance", "promised", "narrative", "bullbear"] as const;
