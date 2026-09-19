"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Inbox } from "lucide-react";

import { DEFAULT_RULE, evaluateAlerts, rankAlerts } from "@/lib/analysis/alerts";
import { FilingCard } from "./filing-card";
import { FilingSheet } from "./filing-sheet";
import { GlassPanel } from "@/components/glass/glass";
import { MaterialityDial } from "./materiality-dial";
import { RoutineDigest } from "./routine-digest";
import { TriggerStrip } from "./trigger-strip";
import { WindowChips } from "./window-chips";
import { WINDOW_LABELS, resolveWindow, useSettings } from "@/lib/settings";
import { BriefHeader } from "./brief-header";
import type { BriefPayload } from "@/lib/server/brief";
import type { Filing } from "@/lib/types";

/**
 * The Brief: push mode.
 *
 * Everything user-specific is resolved here rather than on the server, because
 * the window, the materiality floor and the alert thresholds all live in
 * localStorage. That keeps the page itself static and cacheable while the
 * filtering still feels immediate under the thumb.
 */
export function BriefFeed({ payload }: { payload: BriefPayload }) {
  const { settings, loaded, update } = useSettings();
  const [selected, setSelected] = useState<Filing | null>(null);

  // A fixed "now" per render pass, so cards cannot disagree about ages.
  const now = useMemo(() => new Date(payload.generatedAt), [payload.generatedAt]);

  const priceTails = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const t of payload.tickers) {
      map.set(t.symbol, t.prices.slice(-24).map((p) => p.close));
    }
    return map;
  }, [payload.tickers]);

  const allFilings = useMemo(
    () => payload.tickers.flatMap((t) => t.filings),
    [payload.tickers],
  );

  const windowRange = useMemo(() => resolveWindow(settings, now), [settings, now]);

  const inWindow = useMemo(
    () =>
      allFilings.filter((f) => f.filedAt >= windowRange.from && f.filedAt <= windowRange.to),
    [allFilings, windowRange],
  );

  const { surfaced, routine } = useMemo(() => {
    const above = inWindow
      .filter((f) => f.materiality.score >= settings.threshold)
      .sort((a, b) => b.materiality.score - a.materiality.score);
    const below = inWindow
      .filter((f) => f.materiality.score < settings.threshold)
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    return { surfaced: above, routine: below };
  }, [inWindow, settings.threshold]);

  const alerts = useMemo(() => {
    const rule = settings.rule ?? DEFAULT_RULE;
    return rankAlerts(
      payload.tickers.flatMap((t) =>
        evaluateAlerts(t.symbol, t.company, t.prices, t.filings, rule),
      ),
    ).slice(0, 12);
  }, [payload.tickers, settings.rule]);

  // Hold the shell until settings load, otherwise the feed visibly re-filters
  // as localStorage arrives.
  if (!loaded) return <FeedSkeleton />;

  return (
    <>
      <BriefHeader
        dataAsOf={payload.dataAsOf}
        tickerCount={payload.tickers.length}
        windowLabel={WINDOW_LABELS[settings.windowKey]}
      />

      <div className="space-y-4 px-4">
        <GlassPanel className="space-y-3 rounded-[20px] border p-3">
          <WindowChips
            active={settings.windowKey}
            customFrom={settings.customFrom}
            customTo={settings.customTo}
            onSelect={(windowKey) => update({ windowKey })}
            onCustom={(customFrom, customTo) =>
              update({ windowKey: "custom", customFrom, customTo })
            }
          />
          <MaterialityDial
            value={settings.threshold}
            onChange={(threshold) => update({ threshold })}
            surfaced={surfaced.length}
            total={inWindow.length}
          />
        </GlassPanel>

        <TriggerStrip alerts={alerts} />

        {inWindow.length === 0 ? (
          <QuietWindow
            windowLabel={WINDOW_LABELS[settings.windowKey]}
            onWiden={() => update({ windowKey: "1w" })}
          />
        ) : (
          <div className="space-y-2.5">
            {surfaced.map((filing, i) => (
              <FilingCard
                key={filing.id}
                filing={filing}
                index={i}
                prices={priceTails.get(filing.symbol) ?? []}
                onOpen={setSelected}
              />
            ))}

            {surfaced.length === 0 && (
              <AllRoutine onLower={() => update({ threshold: 0 })} count={routine.length} />
            )}

            <RoutineDigest filings={routine} onOpen={setSelected} />
          </div>
        )}
      </div>

      <FilingSheet filing={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/**
 * A quiet window is a success, not an error -- the whole point is that most
 * days most of this does not matter. It still offers one tap out, because a
 * dead end is a worse outcome than an honest empty state.
 */
function QuietWindow({ windowLabel, onWiden }: { windowLabel: string; onWiden: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-hairline px-6 py-12 text-center">
      <div className="glass-tile grid h-12 w-12 place-items-center" style={{ background: "var(--surface-sunken)" }}>
        <Inbox size={20} className="text-tertiary" />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-primary">Nothing filed in the last {windowLabel.toLowerCase()}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-secondary">
          No company in the book has told the exchange anything. That is the normal state.
        </p>
      </div>
      <button
        onClick={onWiden}
        className="flex items-center gap-1.5 rounded-full bg-accent-soft px-4 py-2 text-[12px] font-semibold text-accent"
      >
        <CalendarClock size={13} />
        Widen to a week
      </button>
    </div>
  );
}

function AllRoutine({ count, onLower }: { count: number; onLower: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed border-hairline px-5 py-7 text-center">
      <p className="text-[13.5px] font-semibold text-primary">Nothing material got through</p>
      <p className="mt-1 text-[12px] leading-relaxed text-secondary">
        All {count} {count === 1 ? "filing" : "filings"} in this window scored below your floor.
      </p>
      <button onClick={onLower} className="mt-3 text-[12px] font-semibold text-accent">
        Drop the floor to zero
      </button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="skeleton h-[104px] rounded-[20px]" />
      <div className="skeleton h-[46px] rounded-xl" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-[92px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}
