"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Last-resort boundary. Individual research sections already degrade on their
 * own, so reaching this means something structural broke; the point is to
 * leave a way forward rather than a blank screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[finn]", error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div
        className="glass-tile grid h-14 w-14 place-items-center"
        style={{ background: "var(--down-soft)" }}
      >
        <TriangleAlert size={22} style={{ color: "var(--down)" }} />
      </div>

      <div>
        <h1 className="text-[17px] font-semibold tracking-display text-primary">
          Something broke on this screen
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          The rest of the app is unaffected. Retry, or head back to the Brief.
        </p>
      </div>

      {error.digest && (
        <code className="rounded-lg border border-hairline bg-surface-sunken px-2.5 py-1 text-[10.5px] tnum text-tertiary">
          {error.digest}
        </code>
      )}

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-4 py-2.5 text-[12.5px] font-semibold text-accent"
        >
          <RefreshCw size={13} />
          Try again
        </button>
        <a
          href="/"
          className="rounded-xl border border-hairline px-4 py-2.5 text-[12.5px] font-semibold text-secondary"
        >
          The Brief
        </a>
      </div>
    </div>
  );
}
