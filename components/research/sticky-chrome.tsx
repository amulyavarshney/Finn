"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Holds the research sheet's header and section nav as a single sticky block,
 * and publishes its measured height as --scroll-offset for anchor scrolling.
 *
 * The height is not knowable ahead of time: a long company name wraps the
 * subtitle onto a second line, and the safe-area inset varies by device. A
 * constant here either hides the nav behind the header or leaves a gap.
 */
export function StickyChrome({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--scroll-offset", `${h + 10}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--scroll-offset");
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-30 mb-4">
      {children}
    </div>
  );
}
