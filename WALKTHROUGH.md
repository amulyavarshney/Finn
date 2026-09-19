# Walkthrough script — ~5 minutes

Recorded on a phone-width window. Times are cumulative. Spoken words in plain text, actions in
_italics_.

---

## 0:00 — The thesis (30s)

_Open on The Brief, 24h window._

> The brief says the scarce skill isn't aggregating information, it's filtering it. So I built the
> filter, not the aggregator.
>
> This is FINN. It does two things: it tells me what changed across my portfolio and why I should
> care, and it researches any NSE company from primary sources on demand.
>
> I ingested 22 tickers — about 4,800 filings. Sixty-nine percent of them are routine. Four hundred
> of them are literally "Copy of Newspaper Publication". That ratio is the whole problem.

---

## 0:30 — The dial (45s)

_Drag the materiality dial slowly from 0 up to ~70. Cards leave the feed under the thumb._

> Most products would put this in a settings page. I made it a physical control.
>
> The counter is live — showing seven of forty-three. Everything below the line folds into one
> routine row rather than disappearing, so nothing is hidden from me, it's just demoted.
>
> This is the interaction the brief asked us to experiment with. One knob for "how much noise will
> I tolerate today."

_Expand the routine digest briefly, then collapse it._

---

## 1:15 — Showing the work (45s)

_Tap a critical filing. Scroll to "Why this ranked here"._

> Nothing here is a black box. Every score decomposes.
>
> Category weight, minus recency decay, plus what the market actually did that day — the price move
> and the volume against its twenty-day average.
>
> That last part matters. A press release that moved the stock six percent on triple volume was not
> a press release. No static category table knows that in advance, so the market's own reaction is
> an input to the ranking.

---

## 2:00 — The two deep enrichments (45s)

_Open a results filing, then a management-change filing._

> The reference doc gives two examples, so I built both properly rather than doing seventeen
> shallowly.
>
> Results: revenue, EBITDA, PBT and PAT, quarter on quarter and year on year. Every one of those
> numbers is arithmetic over screener's standardised table. No model touches a figure anywhere in
> this app, so hallucinated numbers aren't a bug class I can have.
>
> Management change: who's arriving or leaving, their role, and their background — and the card
> says where the background came from rather than implying it.

---

## 2:45 — Pull, and the grounding discipline (60s)

_Go to Ask, type a ticker, open the research sheet._

> The pull side is a command bar, not a chat. Chat was the obvious move and I think it's the wrong
> one — a conversation scrolls away. This returns an artifact I can scroll back through.
>
> Notice the split. _Scroll the numeric sections._ The numbers are already here — server-rendered,
> no model, no waiting. _Scroll to the streaming sections._ The written sections arrive separately
> over a stream, and if one fails it degrades to a labelled error in that card instead of killing
> the page.
>
> Every section carries citation chips — source document and page, tappable through to the original
> PDF. Only this company's transcripts, annual reports and financial statements are ever retrieved.
> No news, no broker notes. That's enforced in the retrieval layer, not just in the prompt.

---

## 3:45 — Promised vs Delivered (40s)

_Scroll to the scorecard._

> This is the one I'd point at. The brief distinguishes summarising management from analysing them.
>
> It's built around one asymmetry: the claim is language and needs a model, the outcome is a number
> and must not be. A model pulls management's verbatim guidance out of the concall transcripts. The
> verdict is then reached against the reported figure.
>
> And where something can't be checked arithmetically — a capex plan, a store count — it's marked
> unverifiable rather than guessed. A confident wrong call on whether management hit guidance is
> much worse than an honest "can't check".

---

## 4:25 — Cost, and the cuts (35s)

_Go to Tune, show the cost ledger._

> Efficiency was a grading criterion, so it's metered rather than asserted. Numbers never hit a
> model. Seventy-nine percent of filings are classified by rules for free. Transcripts are regex-
> prefiltered before the expensive model sees them, and responses are content-hash cached.
>
> It also runs with no API key at all — the whole Brief and every number on the research sheet work
> without one.
>
> Deliberate cuts: no intraday data, no OS push, no auth, no vector database. Four transcripts per
> company is not a retrieval problem, and a login between a reviewer and the product buys nothing.

---

## 5:00 — Close

> Where it goes next: the materiality weights are opinionated but hand-tuned. The honest next step
> is learning them from which filings actually moved price.

---

## Recording notes

- Run `npm run dev` and record at 390px width.
- Have a key in `.env.local` before recording, or the five written sections will correctly but
  undemonstratively report themselves unavailable.
- **Demo `INFY`, `TITAN` or `DIXON`.** Their written sections are already in `data/llm-cache/`, so
  they render instantly. Any other ticker generates cold, and on Groq's free tier the 8,000
  tokens-per-minute ceiling makes that take minutes. Warm more with `npm run warm -- <SYMBOL>`.
- `INFY` is the strongest Promised vs Delivered: eight extracted commitments, two scored against
  reported margin, and two correctly refused because the guidance was given in constant currency
  while screener reports INR.
- Pick a ticker whose transcripts ingested cleanly — check with `npx tsx scripts/inspect-snapshot.ts <SYMBOL>`.
- Show light and dark once each; the theme toggle is in the Brief header.
