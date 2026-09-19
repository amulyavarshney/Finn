"use client";

import { useEffect, useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { CitationChips } from "./citation-chip";
import { GlassCard } from "@/components/glass/glass";
import { PromisedVsDelivered } from "./promised-vs-delivered";
import type { BullBear, ProseSection } from "@/lib/research/narrative";
import type { PromisedVsDelivered as PvdData } from "@/lib/research/guidance";

/**
 * Consumes the NDJSON research stream and renders each section as it lands.
 *
 * Sections arrive with a blur-to-sharp reveal, which ties the motion back to
 * the glass language rather than being a generic fade.
 */

type Status = "pending" | "ready" | "error" | "unavailable";

interface SectionState {
  status: Status;
  payload?: unknown;
  message?: string;
}

const SECTIONS = [
  { id: "promised", title: "Promised vs delivered", lead: true },
  { id: "business", title: "Business snapshot" },
  { id: "guidance", title: "Guidance" },
  { id: "narrative", title: "Narrative vs numbers" },
  { id: "bullbear", title: "Bull vs bear" },
] as const;

export function SectionStream({ symbol }: { symbol: string }) {
  const [sections, setSections] = useState<Record<string, SectionState>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, { status: "pending" as Status }])),
  );
  // No "already started" guard here on purpose. Under StrictMode the effect
  // runs, is cleaned up, and runs again; a guard would let the cleanup abort
  // the only fetch that was ever issued. The AbortController already makes a
  // re-run correct on its own.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/research/${encodeURIComponent(symbol)}`, {
          signal: controller.signal,
        });
        if (!res.body) throw new Error("No stream returned");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // NDJSON: everything up to the last newline is complete.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = JSON.parse(line) as { id: string; status: Status; payload?: unknown; message?: string };

            if (chunk.id === "fatal") {
              setSections((prev) =>
                Object.fromEntries(
                  Object.keys(prev).map((k) => [k, { status: "error" as Status, message: chunk.message }]),
                ),
              );
              continue;
            }
            if (chunk.id === "ledger") continue;

            setSections((prev) => ({
              ...prev,
              [chunk.id]: { status: chunk.status, payload: chunk.payload, message: chunk.message },
            }));
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSections((prev) =>
          Object.fromEntries(
            Object.keys(prev).map((k) => [
              k,
              prev[k].status === "pending"
                ? { status: "error" as Status, message: (err as Error).message }
                : prev[k],
            ]),
          ),
        );
      }
    })();

    return () => controller.abort();
  }, [symbol]);

  return (
    <div className="space-y-6">
      {SECTIONS.map(({ id, title }) => (
        <Section key={id} id={id} title={title} state={sections[id]} />
      ))}
    </div>
  );
}

function Section({ id, title, state }: { id: string; title: string; state: SectionState }) {
  const reduced = useReducedMotion();

  return (
    <section id={id} className="scroll-mt-[var(--scroll-offset)] space-y-2.5">
      <h2 className="px-1 text-[15px] font-semibold tracking-display text-primary">{title}</h2>

      {state.status === "pending" && <SectionSkeleton />}

      {state.status === "unavailable" && <NeedsKey message={state.message} />}

      {state.status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-hairline bg-down-soft px-3 py-2.5">
          <TriangleAlert size={13} className="mt-px shrink-0" style={{ color: "var(--down)" }} />
          <p className="text-[12px] leading-relaxed text-secondary">
            {state.message ?? "This section could not be produced."}
          </p>
        </div>
      )}

      {state.status === "ready" && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionBody id={id} payload={state.payload} />
        </motion.div>
      )}
    </section>
  );
}

function SectionBody({ id, payload }: { id: string; payload: unknown }) {
  if (id === "promised") return <PromisedVsDelivered data={payload as PvdData} />;

  if (id === "bullbear") {
    const data = payload as BullBear;
    return (
      <div className="space-y-2.5">
        <div className="grid gap-2.5">
          <CasePanel title="Bull case" points={data.bull} tone="up" />
          <CasePanel title="Bear case" points={data.bear} tone="down" />
        </div>
        <CitationChips citations={data.citations} />
      </div>
    );
  }

  const data = payload as ProseSection;
  return (
    <div className="space-y-2.5">
      <GlassCard className="px-3.5 py-3">
        <Prose body={data.body} />
      </GlassCard>
      <CitationChips citations={data.citations} />
    </div>
  );
}

/**
 * Renders the model's prose. AGREE/DIVERGE labels get promoted to headings, and
 * line-per-item output is kept as a list rather than a wall of text.
 */
function Prose({ body }: { body: string }) {
  const blocks = body.split(/\n+/).filter((l) => l.trim());

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const labelled = block.match(/^\s*(AGREE|DIVERGE)\s*:\s*(.*)$/is);
        if (labelled) {
          const agree = labelled[1].toUpperCase() === "AGREE";
          return (
            <div key={i}>
              <p
                className="mb-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: agree ? "var(--up)" : "var(--down)" }}
              >
                {agree ? "Where they agree" : "Where they diverge"}
              </p>
              <p className="text-[13px] leading-relaxed text-secondary">{labelled[2]}</p>
            </div>
          );
        }

        const bullet = block.match(/^\s*[-•*]\s*(.*)$/);
        if (bullet) {
          return (
            <p key={i} className="flex gap-1.5 text-[13px] leading-relaxed text-secondary">
              <span className="text-tertiary">·</span>
              <span>{bullet[1]}</span>
            </p>
          );
        }

        return (
          <p key={i} className="text-[13px] leading-relaxed text-secondary">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function CasePanel({
  title,
  points,
  tone,
}: {
  title: string;
  points: string[];
  tone: "up" | "down";
}) {
  const color = tone === "up" ? "var(--up)" : "var(--down)";

  return (
    <GlassCard className="overflow-hidden">
      <div
        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ background: tone === "up" ? "var(--up-soft)" : "var(--down-soft)", color }}
      >
        {title}
      </div>
      <ul className="space-y-2 px-3.5 py-3">
        {points.map((point, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-secondary">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: color }} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function NeedsKey({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-hairline px-3.5 py-3">
      <KeyRound size={14} className="mt-0.5 shrink-0 text-tertiary" />
      <p className="text-[12px] leading-relaxed text-secondary">{message}</p>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-[74px] rounded-[18px]" />
      <div className="flex gap-1.5">
        <div className="skeleton h-[18px] w-28 rounded-full" />
        <div className="skeleton h-[18px] w-20 rounded-full" />
      </div>
    </div>
  );
}
