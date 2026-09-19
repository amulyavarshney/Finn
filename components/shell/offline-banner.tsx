"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * Offline notice.
 *
 * The Brief is rendered from a snapshot that is already in the document, so
 * losing the network costs nothing on this screen -- but the research sheet
 * streams, and tapping into one offline would otherwise just hang. Saying
 * which half still works is more useful than a generic "you are offline".
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(8px,env(safe-area-inset-top))]"
        >
          <div className="flex max-w-[430px] items-center gap-2 rounded-full border border-hairline bg-surface-raised px-3.5 py-1.5 shadow-lg backdrop-blur-xl">
            <CloudOff size={12} className="shrink-0 text-tertiary" />
            <p className="text-[11px] font-medium text-secondary">
              Offline — showing the last snapshot. New research needs a connection.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
