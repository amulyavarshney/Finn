import { extractText, getDocumentProxy } from "unpdf";

import { browserFetch, retry } from "./http";

export interface ExtractedDoc {
  url: string;
  pages: number;
  text: string;
  /** Per-page text, so citations can name a page number. */
  pageTexts: string[];
}

/**
 * Downloads a filing or transcript PDF and pulls its text out.
 *
 * unpdf is used rather than pdf-parse because it ships a serverless-safe build
 * of pdfjs with no filesystem or worker assumptions, which matters for the
 * live-fetch path running on Vercel.
 */
export async function extractPdf(url: string, maxPages = 60): Promise<ExtractedDoc | null> {
  try {
    const buf = await retry(async () => {
      const res = await browserFetch(url, {
        referer: "https://www.bseindia.com/",
        accept: "application/pdf,*/*",
        timeoutMs: 60_000,
      });
      const type = res.headers.get("content-type") ?? "";
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Some BSE links answer 200 with an HTML interstitial instead of a PDF.
      const looksPdf = type.includes("pdf") || String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
      if (!looksPdf) throw new Error(`not a PDF: ${type}`);
      return bytes;
    });

    // verbosity 0 silences pdfjs's per-glyph font warnings. Exchange PDFs are
    // produced by a dozen different tools and throw hundreds of them; none
    // affect the extracted text, and they drown the ingest log.
    const pdf = await getDocumentProxy(buf, { verbosity: 0 });
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pageTexts = (Array.isArray(text) ? text : [text]).slice(0, maxPages).map(normalise);

    return {
      url,
      pages: totalPages,
      text: pageTexts.join("\n\n"),
      pageTexts,
    };
  } catch {
    return null;
  }
}

function normalise(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pre-filters a transcript down to guidance-bearing passages.
 *
 * A full transcript is ~12k tokens. The guidance extraction only needs the
 * sentences where management commits to a number, so this cuts the payload by
 * roughly 80% before the expensive model runs -- the single biggest lever on
 * cost for the research side.
 */
export function guidancePassages(text: string, contextChars = 420): Array<{ page: number; passage: string }> {
  const cues =
    /\b(guidance|we expect|we anticipate|we aim|we are targeting|we target|we should|we believe we|outlook|on track to|confident of|margin[s]? of|growth of|grow(?:th)? at|capex of|capex for|double[- ]digit|our endeavour)\b/gi;

  const out: Array<{ page: number; passage: string }> = [];
  const seen = new Set<string>();
  const pages = text.split("\n\n");

  pages.forEach((page, idx) => {
    for (const match of page.matchAll(cues)) {
      const at = match.index ?? 0;
      const from = Math.max(0, at - contextChars / 2);
      const passage = page.slice(from, at + contextChars).replace(/\s+/g, " ").trim();
      const key = passage.slice(0, 80);
      if (passage.length > 60 && !seen.has(key)) {
        seen.add(key);
        out.push({ page: idx + 1, passage });
      }
    }
  });

  return out;
}
