"use client";

import { useState } from "react";
import { Check, KeyRound, Plus, RotateCcw, X } from "lucide-react";

import { CATEGORIES, type Category } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import { GlassCard, GlassTile } from "@/components/glass/glass";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { useTheme, type ThemePref } from "@/components/glass/theme-provider";
import type { LedgerTotals } from "@/lib/llm/ledger";

export function TunePanel({
  available,
  companies,
  defaultPortfolio,
  generatedAt,
  ledger,
  provider,
}: {
  available: string[];
  companies: Record<string, { company: string; industry: string | null }>;
  defaultPortfolio: string[];
  generatedAt: string | null;
  ledger: LedgerTotals | null;
  provider: string | null;
}) {
  const { settings, loaded, update, updateRule, reset } = useSettings();
  const { pref, setPref } = useTheme();
  const [adding, setAdding] = useState(false);

  if (!loaded) return <div className="px-4 pt-6 text-[13px] text-tertiary">Loading…</div>;

  const portfolio = settings.portfolio ?? defaultPortfolio;
  const watched = new Set(settings.rule.watchedCategories);

  const toggleCategory = (category: Category) => {
    const next = watched.has(category)
      ? settings.rule.watchedCategories.filter((c) => c !== category)
      : [...settings.rule.watchedCategories, category];
    updateRule({ watchedCategories: next });
  };

  return (
    <div className="space-y-7 px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
      <header>
        <h1 className="text-[22px] font-bold tracking-display text-primary">Tune</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
          You decide what counts as unusual. Everything here is stored on this device — no account,
          no server.
        </p>
      </header>

      {/* Thresholds */}
      <Section title="Alert thresholds" caption="Evaluated over the end-of-day series">
        <GlassCard className="space-y-4 px-4 py-4">
          <SliderRow
            label="Volume above average"
            value={settings.rule.volumeMultiple}
            min={1.2}
            max={6}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            hint="Compared against the 20-day average volume on the same day"
            onChange={(volumeMultiple) => updateRule({ volumeMultiple })}
          />
          <SliderRow
            label="Price move in a day"
            value={settings.rule.priceMovePct}
            min={1}
            max={15}
            step={0.5}
            format={(v) => `±${v.toFixed(1)}%`}
            hint="Absolute close-to-close change that counts as a move"
            onChange={(priceMovePct) => updateRule({ priceMovePct })}
          />
        </GlassCard>
      </Section>

      {/* Category watchlist */}
      <Section
        title="Category watchlist"
        caption={`${watched.size} of ${CATEGORIES.length} categories raise an alert`}
      >
        <div className="space-y-1.5">
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category];
            const on = watched.has(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                aria-pressed={on}
                className="flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-surface px-2.5 py-2 text-left active:opacity-70"
              >
                <GlassTile category={category} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-primary">
                    {meta.label}
                  </span>
                  <span className="block truncate text-[10px] leading-snug text-tertiary">
                    {meta.gloss}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                    on ? "border-transparent bg-accent" : "border-hairline-strong",
                  )}
                >
                  {on && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Portfolio */}
      <Section
        title="Portfolio"
        caption={`${portfolio.length} holdings drive the Brief`}
      >
        <div className="flex flex-wrap gap-1.5">
          {portfolio.map((symbol) => (
            <span
              key={symbol}
              className="flex items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-primary"
            >
              {symbol}
              <button
                onClick={() => update({ portfolio: portfolio.filter((s) => s !== symbol) })}
                aria-label={`Remove ${symbol}`}
                className="text-tertiary active:text-down"
              >
                <X size={11} />
              </button>
            </span>
          ))}

          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-full border border-dashed border-hairline px-2.5 py-1 text-[11.5px] font-semibold text-accent"
          >
            <Plus size={11} />
            Add
          </button>
        </div>

        {adding && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl border border-hairline bg-surface-sunken p-2">
            {available.filter((s) => !portfolio.includes(s)).length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-tertiary">
                Everything ingested is already in the book. Run{" "}
                <code className="tnum">npm run ingest -- --ticker SYMBOL</code> to add another.
              </p>
            ) : (
              available
                .filter((s) => !portfolio.includes(s))
                .map((symbol) => (
                  <button
                    key={symbol}
                    onClick={() => update({ portfolio: [...portfolio, symbol] })}
                    className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-secondary active:opacity-70"
                    title={companies[symbol]?.company}
                  >
                    + {symbol}
                  </button>
                ))
            )}
          </div>
        )}
      </Section>

      {/* Appearance */}
      <Section title="Appearance" caption="Follows the system unless you override it">
        <div className="flex gap-1.5">
          {(["light", "dark", "system"] as ThemePref[]).map((option) => (
            <button
              key={option}
              onClick={() => setPref(option)}
              aria-pressed={pref === option}
              className={cn(
                "flex-1 rounded-xl border px-3 py-2 text-[12px] font-semibold capitalize transition-colors",
                pref === option
                  ? "border-transparent bg-accent-soft text-accent"
                  : "border-hairline bg-surface text-secondary",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </Section>

      {/* Cost ledger */}
      <Section
        title="Model usage"
        caption="Every call is metered, so the efficiency claim is a number"
      >
        <GlassCard className="space-y-2.5 px-4 py-3.5">
          {provider ? (
            <p className="text-[11px] text-secondary">
              Routing to <span className="font-semibold text-primary">{provider}</span>
            </p>
          ) : (
            <div className="flex items-start gap-1.5">
              <KeyRound size={12} className="mt-1 shrink-0 text-tertiary" />
              <p className="text-[11px] leading-relaxed text-secondary">
                No API key configured. Categories and summaries are falling back to deterministic
                rules, and every figure in the app is parsed rather than generated — so the Brief
                works exactly as shown. Add <code className="tnum">GROQ_API_KEY</code> to enable
                the written analysis.
              </p>
            </div>
          )}

          {ledger && ledger.calls > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Calls" value={ledger.calls.toLocaleString()} />
                <Stat
                  label="Tokens"
                  value={(ledger.inputTokens + ledger.outputTokens).toLocaleString()}
                />
                <Stat label="Cost" value={`$${ledger.costUsd.toFixed(4)}`} />
              </div>
              <p className="text-[10px] text-tertiary">
                {ledger.cacheHits} of {ledger.calls} calls served from the content-hash cache, so
                re-running the demo costs nothing.
              </p>
            </>
          ) : (
            <p className="text-[10.5px] text-tertiary">
              No model calls recorded yet.
            </p>
          )}
        </GlassCard>
      </Section>

      {/* Data */}
      <Section title="Data" caption="Committed end-of-day snapshots">
        <GlassCard className="space-y-1.5 px-4 py-3.5">
          <p className="text-[11.5px] text-secondary">
            {available.length} tickers ingested
            {generatedAt ? ` · last run ${formatDate(generatedAt)}` : ""}
          </p>
          <p className="text-[10.5px] leading-relaxed text-tertiary">
            NSE and screener.in answer a residential IP far more reliably than a datacenter one, so
            ingestion runs locally and the app reads what it committed. Tickers outside the
            snapshot are fetched live on demand.
          </p>
          <code className="mt-1 block rounded-lg border border-hairline bg-surface-sunken px-2.5 py-1.5 text-[11px] tnum text-secondary">
            npm run ingest
          </code>
        </GlassCard>
      </Section>

      <button
        onClick={reset}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-hairline py-2.5 text-[12px] font-semibold text-tertiary active:opacity-70"
      >
        <RotateCcw size={12} />
        Reset all settings
      </button>
    </div>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">{title}</h2>
        <p className="text-[10.5px] text-tertiary">{caption}</p>
      </div>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-primary">{label}</span>
        <span className="text-[14px] font-bold tnum text-accent">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-sunken accent-[var(--accent)]"
      />
      <p className="mt-1 text-[10px] leading-snug text-tertiary">{hint}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-sunken px-2 py-1.5 text-center">
      <p className="text-[13px] font-bold tnum text-primary">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-tertiary">{label}</p>
    </div>
  );
}
