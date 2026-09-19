"use client";

import { useEffect, useRef, useState } from "react";

import { GlassPanel } from "@/components/glass/glass";
import { cn } from "@/lib/cn";

/**
 * Sticky section nav for the research sheet.
 *
 * The sheet is long by design -- it is an artifact to scroll back through, not
 * a chat transcript that scrolls away. This keeps the structure visible and
 * tracks position with an observer rather than a scroll handler, so it costs
 * nothing per frame.
 */
export function SectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;

    // Deferred a frame so StickyChrome has published its measured height.
    const frame = requestAnimationFrame(() => {
      const offset =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--scroll-offset"),
          10,
        ) || 112;

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (visible) setActive(visible.target.id);
        },
        // Band just below the sticky chrome, so a section counts as "current"
        // once its heading reaches the top of the readable area.
        { rootMargin: `-${offset}px 0px -68% 0px`, threshold: 0 },
      );

      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [items]);

  // Keep the active chip in view as the reader scrolls the page.
  useEffect(() => {
    const chip = railRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);

  return (
    <GlassPanel className="border-y">
      <div ref={railRef} className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
        {items.map(({ id, label }) => (
          <button
            key={id}
            data-id={id}
            onClick={() =>
              document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              active === id ? "bg-accent-soft text-accent" : "text-tertiary",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </GlassPanel>
  );
}
