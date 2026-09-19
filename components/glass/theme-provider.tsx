"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "finn.theme";

interface ThemeContextValue {
  pref: ThemePref;
  resolved: Resolved;
  setPref: (next: ThemePref) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemScheme(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Keep the phone's status bar in step with the canvas, otherwise a standalone
  // PWA shows a light bar above a dark app.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#181c26" : "#f7f8fb");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
    const initial: ThemePref = stored ?? "system";
    setPrefState(initial);
    const next = initial === "system" ? systemScheme() : initial;
    setResolved(next);
    apply(next);
  }, []);

  // Only follow the OS while the user has not expressed a preference.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolved(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    localStorage.setItem(STORAGE_KEY, next);
    const r = next === "system" ? systemScheme() : next;
    setResolved(r);
    apply(r);
  }, []);

  const cycle = useCallback(() => {
    setPref(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPref]);

  const value = useMemo(() => ({ pref, resolved, setPref, cycle }), [pref, resolved, setPref, cycle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Inlined before paint so the first frame is already in the right scheme. */
export const themeBootstrapScript = `
(function(){try{
  var p = localStorage.getItem("${STORAGE_KEY}") || "system";
  var d = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (d) document.documentElement.classList.add("dark");
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", d ? "#181c26" : "#f7f8fb");
}catch(e){}})();
`;
