"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Radio, Search } from "lucide-react";
import { motion } from "motion/react";

import { GlassCard, GlassPanel } from "@/components/glass/glass";
import { cn } from "@/lib/cn";
import type { Holding } from "@/lib/portfolio";

/**
 * Ask FINN.
 *
 * Deliberately not a chat. The brief asks us to experiment with the
 * interaction model, and chat is the obvious move: it turns a dense, citable
 * research sheet into a stream of bubbles that scrolls away. A command bar that
 * returns an artifact is denser, re-readable, and survives the session.
 *
 * Any NSE symbol is accepted, not just the ones in the book -- the pull side
 * has to generalise, so the affordance should say so.
 */
export function AskBar({
  inBook,
  beyond,
  companies,
}: {
  inBook: Holding[];
  beyond: Holding[];
  companies: Record<string, { company: string; industry: string | null }>;
}) {
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().toUpperCase();

  const matches = useMemo(() => {
    if (!trimmed) return [];
    const pool = [...inBook, ...beyond];
    return pool
      .filter(
        (h) =>
          h.symbol.includes(trimmed) ||
          h.name.toUpperCase().includes(trimmed) ||
          h.sector.toUpperCase().includes(trimmed),
      )
      .slice(0, 6);
  }, [trimmed, inBook, beyond]);

  const go = (symbol: string) => {
    setSubmitting(true);
    router.push(`/c/${symbol.toUpperCase()}`);
  };

  // A symbol we do not hold is still valid -- it just takes the live path.
  const isKnown = [...inBook, ...beyond].some((h) => h.symbol === trimmed);
  const offerLive = trimmed.length >= 2 && !isKnown && /^[A-Z&-]{2,20}$/.test(trimmed);

  return (
    <div className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <h1 className="text-[22px] font-bold tracking-display text-primary">Ask FINN</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
        Name any NSE company. You get a research sheet built from its transcripts, annual reports
        and financial statements — not a chat.
      </p>

      <GlassPanel className="mt-4 rounded-[18px] border p-1.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (matches[0]) go(matches[0].symbol);
            else if (offerLive) go(trimmed);
          }}
          className="flex items-center gap-2"
        >
          <Search size={16} className="ml-2 shrink-0 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="RELIANCE, Titan, cables…"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Company or NSE symbol"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] text-primary outline-none placeholder:text-tertiary"
          />
          {(matches.length > 0 || offerLive) && (
            <button
              type="submit"
              disabled={submitting}
              aria-label="Open research sheet"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft active:scale-95 disabled:opacity-50"
            >
              <ArrowRight size={16} className="text-accent" />
            </button>
          )}
        </form>
      </GlassPanel>

      {/* Suggestions */}
      {trimmed && (
        <div className="mt-2 space-y-1.5">
          {matches.map((h) => (
            <SuggestionRow
              key={h.symbol}
              symbol={h.symbol}
              name={h.name}
              detail={h.sector}
              onClick={() => go(h.symbol)}
            />
          ))}

          {offerLive && (
            <button
              onClick={() => go(trimmed)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-hairline px-3 py-2.5 text-left active:opacity-70"
            >
              <Radio size={14} className="shrink-0 text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-primary">
                  Fetch {trimmed} live
                </p>
                <p className="text-[11px] text-tertiary">
                  Not in the book — FINN will pull it from NSE and screener.in now
                </p>
              </div>
              <ArrowRight size={14} className="shrink-0 text-tertiary" />
            </button>
          )}

          {matches.length === 0 && !offerLive && (
            <p className="px-1 py-3 text-[12px] text-tertiary">
              No match. Enter a valid NSE symbol, such as INFY or DIXON.
            </p>
          )}
        </div>
      )}

      {/* Browse */}
      {!trimmed && (
        <div className="mt-6 space-y-5">
          <Group
            title="In your book"
            caption={`${inBook.length} holdings, already ingested`}
            holdings={inBook}
            companies={companies}
          />
          <Group
            title="Beyond the book"
            caption="Proof the pull side is not wired to your holdings"
            holdings={beyond}
            companies={companies}
          />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  caption,
  holdings,
  companies,
}: {
  title: string;
  caption: string;
  holdings: Holding[];
  companies: Record<string, { company: string; industry: string | null }>;
}) {
  if (holdings.length === 0) return null;

  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{title}</h2>
        <p className="text-[10.5px] text-tertiary">{caption}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {holdings.map((h, i) => (
          <motion.div
            key={h.symbol}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3), type: "spring", stiffness: 400, damping: 34 }}
          >
            <Link href={`/c/${h.symbol}`}>
              <GlassCard className="h-full px-3 py-2.5 active:opacity-70">
                <p className="text-[12.5px] font-bold text-primary">{h.symbol}</p>
                <p className="truncate text-[10.5px] text-secondary">
                  {companies[h.symbol]?.company ?? h.name}
                </p>
                <p className="mt-0.5 truncate text-[9.5px] text-tertiary">{h.sector}</p>
              </GlassCard>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SuggestionRow({
  symbol,
  name,
  detail,
  onClick,
}: {
  symbol: string;
  name: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left active:opacity-70",
      )}
    >
      <span className="w-[76px] shrink-0 truncate text-[12.5px] font-bold text-primary">{symbol}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-primary">{name}</span>
        <span className="block truncate text-[10.5px] text-tertiary">{detail}</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-tertiary" />
    </button>
  );
}
