"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { GlassPanel } from "@/components/glass/glass";

/**
 * A bottom sheet with drag-to-dismiss.
 *
 * On a phone, a sheet you can flick away is the native idiom for progressive
 * disclosure -- it keeps the feed's scroll position and reads as a layer over
 * the list rather than a navigation away from it. One of the four permitted
 * real-blur surfaces.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  // Freeze the page behind the sheet, otherwise the feed scrolls under it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.div
            className="relative w-full max-w-[430px]"
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 36 }}
            drag={reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Velocity as well as distance, so a quick flick dismisses.
              if (info.offset.y > 120 || info.velocity.y > 520) onClose();
            }}
          >
            <GlassPanel className="max-h-[86dvh] overflow-hidden rounded-t-[26px] border-t">
              <div className="flex justify-center pb-1 pt-2.5">
                <div className="h-1 w-9 rounded-full bg-hairline-strong" />
              </div>
              {title && (
                <div className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                  {title}
                </div>
              )}
              <div className="max-h-[78dvh] overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
                {children}
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
