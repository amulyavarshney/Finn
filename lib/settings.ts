"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_RULE } from "@/lib/analysis/alerts";
import type { AlertRule } from "@/lib/types";

/**
 * User settings live in localStorage.
 *
 * A prototype graded on a phone should not put a login between the reviewer and
 * the product, and every one of these values is a personal preference rather
 * than shared state, so there is nothing a server would add.
 */

export type WindowKey = "24h" | "3d" | "1w" | "custom";

export interface Settings {
  windowKey: WindowKey;
  customFrom: string | null;
  customTo: string | null;
  /** Materiality floor set by the dial. Anything below folds into the digest. */
  threshold: number;
  rule: AlertRule;
  /** Tickers on the Brief. Seeded from the demo portfolio, editable on Tune. */
  portfolio: string[] | null;
}

export const DEFAULT_SETTINGS: Settings = {
  windowKey: "24h",
  customFrom: null,
  customTo: null,
  threshold: 35,
  rule: DEFAULT_RULE,
  portfolio: null,
};

const KEY = "finn.settings.v1";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          rule: { ...DEFAULT_RULE, ...(parsed.rule ?? {}) },
        });
      }
    } catch {
      // Malformed storage should reset to defaults, not break the app.
    }
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private browsing can refuse writes; keep the in-memory value.
      }
      return next;
    });
  }, []);

  const updateRule = useCallback(
    (patch: Partial<AlertRule>) => {
      setSettings((prev) => {
        const next = { ...prev, rule: { ...prev.rule, ...patch } };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, loaded, update, updateRule, reset };
}

export const WINDOW_LABELS: Record<WindowKey, string> = {
  "24h": "24 hours",
  "3d": "3 days",
  "1w": "1 week",
  custom: "Custom",
};

/** Resolves a window choice to an ISO range. */
export function resolveWindow(settings: Settings, now: Date = new Date()): { from: string; to: string } {
  if (settings.windowKey === "custom" && settings.customFrom) {
    return {
      from: new Date(`${settings.customFrom}T00:00:00`).toISOString(),
      to: settings.customTo
        ? new Date(`${settings.customTo}T23:59:59`).toISOString()
        : now.toISOString(),
    };
  }

  const hours = settings.windowKey === "24h" ? 24 : settings.windowKey === "3d" ? 72 : 168;
  return {
    from: new Date(now.getTime() - hours * 3_600_000).toISOString(),
    to: now.toISOString(),
  };
}
