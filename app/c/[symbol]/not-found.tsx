import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Reached when a symbol has no snapshot and the live fetch came back empty --
 * either the ticker does not exist, or the upstreams refused this server's IP.
 * Both are worth saying out loud rather than showing a bare 404.
 */
export default function ResearchNotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div
        className="glass-tile grid h-14 w-14 place-items-center"
        style={{ background: "var(--surface-sunken)" }}
      >
        <SearchX size={22} className="text-tertiary" />
      </div>

      <div>
        <h1 className="text-[17px] font-semibold tracking-display text-primary">
          Couldn&rsquo;t reach that company
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          Either the NSE symbol doesn&rsquo;t exist, or NSE and screener.in declined this
          server&rsquo;s request — they answer a residential IP far more readily than a hosted one.
        </p>
      </div>

      <p className="max-w-[300px] text-[11.5px] leading-relaxed text-tertiary">
        Ingesting it locally sidesteps the problem entirely:
      </p>
      <code className="rounded-xl border border-hairline bg-surface-sunken px-3.5 py-2 text-[11.5px] tnum text-primary">
        npm run ingest -- --ticker SYMBOL
      </code>

      <Link href="/ask" className="mt-1 text-[12.5px] font-semibold text-accent">
        Back to Ask
      </Link>
    </div>
  );
}
