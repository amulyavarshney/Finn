import { AskBar } from "@/components/ask/ask-bar";
import { availableSymbols, readIndex } from "@/lib/snapshot";
import { ADHOC, PORTFOLIO } from "@/lib/portfolio";

/**
 * Pull mode's entry point.
 *
 * A command bar rather than a chat window. The output of a research request is
 * an artifact you scroll back through and cite, not a message that scrolls
 * away, so the input should feel like addressing a system rather than starting
 * a conversation.
 */
export const dynamic = "force-dynamic";

export default function AskPage() {
  const present = new Set(availableSymbols());
  const index = readIndex();

  const inBook = PORTFOLIO.filter((h) => present.has(h.symbol));
  const beyond = ADHOC.filter((h) => present.has(h.symbol));

  return (
    <AskBar
      inBook={inBook}
      beyond={beyond}
      companies={index?.companies ?? {}}
    />
  );
}
