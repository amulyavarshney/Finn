import { completeJson } from "@/lib/llm/router";
import type { PersonEnrichment, RawAnnouncement } from "@/lib/types";
import { z } from "zod";

/**
 * Management-change enrichment.
 *
 * The brief's example: don't just say "CFO resigned" -- say who is arriving and
 * where they came from, so the investor knows instantly whether it matters.
 *
 * This is the one place FINN is allowed to reach beyond primary sources. The
 * grounding discipline applies to the pull side's analysis of a company; a
 * person's professional background is explicitly called out as different, and
 * the UI labels where it came from so the distinction stays visible.
 */

const PersonSchema = z.object({
  movement: z.enum(["appointment", "resignation", "both", "unknown"]),
  people: z
    .array(
      z.object({
        name: z.string().min(2).max(80),
        role: z.string().max(120).nullable(),
        direction: z.enum(["incoming", "outgoing"]),
        background: z.string().max(400).nullable(),
      }),
    )
    .max(4),
});

export async function buildPersonEnrichment(
  announcement: RawAnnouncement,
): Promise<PersonEnrichment | null> {
  const extracted = await completeJson({
    task: "management-change",
    tier: "fast",
    schema: PersonSchema,
    maxTokens: 550,
    temperature: 0.1,
    system: [
      "You read Indian stock-exchange filings about changes in management and extract who moved.",
      "",
      'Reply with JSON: {"movement": "appointment"|"resignation"|"both"|"unknown", "people": [{"name", "role", "direction", "background"}]}.',
      "",
      "- direction is 'incoming' for someone joining or being promoted, 'outgoing' for someone leaving.",
      "- role is their title at this company, verbatim from the filing where possible.",
      "- background: two or three sentences on the person's professional history, but ONLY if the",
      "  filing itself supplies it. Filings announcing an appointment frequently include a short bio.",
      "  If the filing gives no background, set it to null. Never invent a career history and never",
      "  fill it from your own knowledge of the person.",
    ].join("\n"),
    user: `Subject: ${announcement.desc}\n\nFiling text:\n${announcement.text.slice(0, 3000)}`,
  });

  if (!extracted || extracted.people.length === 0) return fallbackFromText(announcement);

  return {
    kind: "management_change",
    movement: extracted.movement,
    people: extracted.people.map((p) => ({
      name: p.name,
      role: p.role,
      direction: p.direction,
      background: p.background,
      // Labelled so the UI can be honest that the bio came out of the filing
      // itself rather than somewhere unvetted.
      backgroundSource: p.background ? "Stated in the filing" : null,
    })),
  };
}

/**
 * Without a model key we can still usually name the person and direction --
 * exchange filings are formulaic enough for a pattern to catch them.
 */
function fallbackFromText(announcement: RawAnnouncement): PersonEnrichment | null {
  const text = announcement.text.replace(/''/g, "'");

  const patterns: Array<{ re: RegExp; direction: "incoming" | "outgoing" }> = [
    { re: /\b(?:appointment|appointed)\s+of\s+((?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Shri|Smt\.?)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/i, direction: "incoming" },
    { re: /\b(?:resignation|retirement|cessation)\s+of\s+((?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Shri|Smt\.?)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/i, direction: "outgoing" },
    { re: /((?:Mr\.?|Ms\.?|Mrs\.?|Dr\.?|Shri|Smt\.?)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}),?\s+has\s+(?:ceased to be|resigned|tendered)/i, direction: "outgoing" },
  ];

  for (const { re, direction } of patterns) {
    const m = text.match(re);
    if (m) {
      const roleMatch = text.match(
        /\bas\s+(?:the\s+)?((?:Chief[\w\s]*Officer|Managing Director|Whole[-\s]?time Director|Independent Director|Non[-\s]?Executive Director|Director|Chairperson|Chairman|Company Secretary|CEO|CFO|CTO)[^,.()]{0,40})/i,
      );
      return {
        kind: "management_change",
        movement: direction === "incoming" ? "appointment" : "resignation",
        people: [
          {
            name: m[1].replace(/\s+/g, " ").trim(),
            role: roleMatch ? roleMatch[1].replace(/\s+/g, " ").trim() : null,
            direction,
            background: null,
            backgroundSource: null,
          },
        ],
      };
    }
  }

  return null;
}
