"use client";

import { ExternalLink, FileText, Table2 } from "lucide-react";

import type { Citation } from "@/lib/types";

/**
 * Provenance, rendered.
 *
 * The pull side is required to work from primary sources only, and a claim of
 * discipline is worth little without a way to check it. Every section carries
 * the documents it was built from, tappable through to the original PDF or
 * table -- so "grounded in the annual report and transcripts" is something the
 * reader can verify in one tap rather than take on trust.
 */
export function CitationChips({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {citations.map((citation, i) => {
        const isTable = /screener|table|financials/i.test(citation.document);
        const Icon = isTable ? Table2 : FileText;
        const body = (
          <>
            <Icon size={10.5} className="shrink-0 text-tertiary" />
            <span className="truncate">{citation.document}</span>
            {citation.locator && (
              <span className="shrink-0 tnum text-tertiary">· {citation.locator}</span>
            )}
            {citation.url && <ExternalLink size={9} className="shrink-0 text-tertiary" />}
          </>
        );

        const className =
          "inline-flex max-w-full items-center gap-1 rounded-full border border-hairline bg-surface-sunken px-2 py-[3px] text-[10px] font-medium text-secondary";

        return citation.url ? (
          <a
            key={`${citation.document}-${i}`}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${className} active:opacity-60`}
          >
            {body}
          </a>
        ) : (
          <span key={`${citation.document}-${i}`} className={className}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
