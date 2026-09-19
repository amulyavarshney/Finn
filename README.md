# FINN

A mobile-first investment agent for Indian equities. It does two things: it tells you what changed
in your portfolio and why you should care, and it researches any NSE company from primary sources
on demand.

```bash
npm install
npm run ingest      # pulls EOD prices, filings, financials and transcripts
npm run dev         # http://localhost:3000
```

No API key is required to run it. More on that below.

---

## The point of view

The challenge brief argues that "the scarce skill is not aggregating information, it's filtering
it." FINN takes that literally, and two decisions follow from it.

**Filtering is a physical control, not a settings page.** The home screen is a single ranked feed
with a materiality dial at the top. Drag it and cards leave the feed under your thumb, with a live
`showing 7 of 43` counter. Of the 4,840 filings ingested here, **69% are routine** — 409 of them are
literally "Copy of Newspaper Publication". Being able to bury that, visibly and on demand, by feel,
*is* the product.

**Answers are artifacts, not transcripts.** Ask FINN is a command bar, not a chat. It returns a
structured, citable research sheet you scroll back through. Chat is the obvious move here, and it
is the wrong one — a conversation scrolls away, and a research sheet is something you re-read.

---

## Architecture

```
        ┌── local ingest (npm run ingest) ────────────┐
        │                                              │
  NSE announcements ─┐                                 │
  Yahoo Finance EOD ─┼─→ categorise → score → enrich ──┼─→ data/snapshot/*.json
  screener.in tables ┘                                 │        (committed)
  concall PDFs ──────┘                                 │
        └──────────────────────────────────────────────┘
                                 │
                          Next.js on Vercel
                          ┌──────┴───────┐
                    The Brief      Research sheet
                     (push)            (pull)
                                          │
                              unknown ticker → live fetch
```

### Why snapshots rather than fetching at request time

NSE and screener.in answer a residential IP far more reliably than a datacenter one. Scraping them
from a Vercel function is a coin flip, and a demo that does not run is the worst possible outcome.
So ingestion runs locally and commits JSON, and the deployed app reads what it committed.

This is not a workaround dressed up as a design. The underlying data is end-of-day, so a nightly
batch is the honest architecture regardless. Tickers outside the snapshot still get fetched live at
request time, which is how the pull side generalises to any NSE symbol; if that path is blocked in
production, the portfolio demo is unaffected.

### Layout

```
app/
  page.tsx                  The Brief
  ask/page.tsx              command bar
  c/[symbol]/page.tsx       research sheet (tables server-rendered)
  tune/page.tsx             thresholds, watchlist, portfolio, cost ledger
  api/research/[symbol]/    NDJSON stream of the written sections
lib/
  sources/                  yahoo · nse · screener · pdf
  analysis/                 categorize · materiality · headline · results · people · alerts
  research/                 tables · guidance · narrative · assemble
  llm/                      router · providers · limiter · cache · ledger
components/
  glass/                    GlassPanel · GlassCard · GlassTile · AuroraField · ThemeProvider
  brief/ research/ ask/ tune/
scripts/
  ingest.ts                 npm run ingest
  warm-research.ts          npm run warm — pre-generates the pull side's written sections
  check-sources.ts          npm run sources — upstream health check
  inspect-snapshot.ts       eyeball the ranking against real filings
  survey-descs.ts           the survey the categorisation rules are built from
```

### Warming the pull side

The research sheet's five written sections are generated on demand. On Groq's free tier the
8,000 tokens-per-minute ceiling makes a cold sheet take minutes — longer than the route's own
`maxDuration`. Responses are content-hash cached to `data/llm-cache/`, which is committed and
bundled into the deployment, so warming a ticker once makes it instant everywhere:

```bash
npm run warm                  # INFY, TITAN, DIXON
npm run warm -- RELIANCE LT   # any others
```

`INFY`, `TITAN` and `DIXON` are already warm in this repo.

### Deploying

Point Vercel at the repo and it builds with no configuration. One setting in
`next.config.ts` is load-bearing and easy to lose:

```ts
outputFileTracingIncludes: {
  "/**": ["./data/snapshot/**", "./data/llm-cache/**"],
}
```

The snapshots are read at runtime through `process.cwd()`, which Next's dependency tracing cannot
follow. Without that entry the build succeeds, deploys cleanly, and then every page reports no
ingested data — because the JSON never made it into the serverless bundle.

---

## Push — The Brief

Window chips for 24h (default), 3d, 1w and a custom range. A triggers strip for thresholds you set
yourself. Then the ranked feed, with everything below the dial folded into one expandable routine
row.

**Materiality score** = category weight × recency decay × the market's same-day reaction × language
signals in the filing. That last pair matters: a press release that moved the stock 6% on triple
volume was not a press release, and no category table can know that in advance.

Every score is auditable. Open any filing and **Why this ranked here** lists each contribution with
its sign and reason:

```
Results filing        +92   Quarterly or annual results and the board meeting approving them
Age                   −20   Filed 18 days ago
Price reacted         +12   +4.8% on 2026-05-08
Volume spiked         +14   2.9x the 20-day average
                    ─────
                       98   critical
```

Two enrichments are built properly, matching the brief's own examples:

- **Results** — Revenue, EBITDA, PBT, PAT with QoQ and YoY, computed from screener's standardised
  quarterly table. Margins are shown in percentage points, not percent of a percent.
- **Management change** — who is arriving or leaving, their role, and their background where the
  filing itself supplies one. The card says where the background came from rather than implying it.

## Pull — The research sheet

`/c/[SYMBOL]` for any NSE ticker. The sheet splits in two:

- **Numbers render immediately, server-side.** At a glance, financial snapshot, trajectory, balance
  sheet and cash quality are arithmetic over tables we parsed. No model, no waiting, nothing to get
  wrong.
- **Language streams in afterwards.** Promised vs Delivered, business snapshot, guidance, narrative
  vs numbers, and bull vs bear arrive over NDJSON as each completes. One section failing degrades to
  a labelled error in that card rather than an empty page.

Every section carries citation chips naming the source document and page, tappable through to the
original PDF.

### Promised vs Delivered

The brief calls this the difference between summarising management and analysing them, so it leads
the sheet.

The pipeline is built around one asymmetry: **the claim is language and needs a model, the outcome
is a number and must not be.** A strong model extracts management's verbatim guidance from the last
four concall transcripts and states what each commits to. The verdict is then reached against
figures read from screener's quarterly table.

Anything that cannot be checked arithmetically — capex plans, store counts — is marked
*unverifiable* rather than guessed at. A confident wrong call on whether management hit guidance is
much worse than an honest "can't check".

### Grounding

Only this company's concall transcripts, annual reports and standardised financial statements are
ever retrieved. No news, no broker notes, no price targets. That is enforced twice: the retrieval
layer never fetches anything else, and the prompts instruct the model to work only from the supplied
excerpts and to say so when they do not support a point.

It is not a guarantee — a model can still reach for something it memorised — but withholding
secondary sources removes the easy path to one, and visible citations make an unsupported claim
easy to spot.

---

## Cost discipline

Efficiency is an explicit grading criterion, so the routing is deliberate rather than incidental.

**Numbers never touch a model.** Revenue, EBITDA, PBT, PAT, QoQ, YoY, margins, D/E, cash conversion
— all parsed from screener's tables. Zero tokens, and the entire class of hallucinated-figure bugs
simply does not exist.

**Most filings never touch a model.** NSE publishes its own subject line, so a rules table built
from a survey of 102 distinct `desc` values across eight tickers resolves the large majority for
free. Measured over the 22 ingested tickers:

| Resolved by | Filings | Share |
|---|---|---|
| `desc` rules + keyword scoring over the body | 3,823 | 79.0% |
| Routed to the fast model, on the inline text only | 128 | 2.6% |
| Ambiguous but outside the Brief's window, so left to rules | 889 | 18.4% |

That is measured across all 4,840 ingested filings, not estimated. The ambiguous cases are dominated
by the "Updates" / "General Updates" family, which is genuinely uninformative by design. Even those
use NSE's inline `attchmntText` rather than downloading the attached PDF.

**The third row is the point.** The Brief only ever renders a trailing 60-day window, so paying to
disambiguate a filing from fourteen months ago buys nothing anyone can see. Ingestion therefore
sends only filings inside that window to a model — 130 calls instead of roughly a thousand, for
identical rendered output. Inside the window the coverage is effectively complete: 128 of 130
resolved, the other two falling back after the model returned nothing parseable. The window is
`--model-days`, defaulted to match the Brief's retention.

A full ingest of all 22 tickers costs **$0.0055** and 231 model calls, 138 of which were served from
the on-disk cache.

**Written headlines are rationed by tier.** A "so what" line is generated only for filings that
cleared the materiality floor. The routine long tail gets a deterministic cleanup, so a quiet day
costs nothing.

**Transcripts are prefiltered.** A full concall transcript is ~48,000 characters, about 12k tokens.
A regex pass narrows it to guidance-bearing passages first — 15 passages for the Titan Q1 FY27 call,
roughly an 85% cut — before the strong model sees anything.

**Tiered routing.** `openai/gpt-oss-20b` for classification and summaries; `openai/gpt-oss-120b`
for guidance matching, narrative divergence and the bull/bear case. Both ids are env-overridable
(`FINN_GROQ_FAST` / `FINN_GROQ_STRONG`), which matters because Groq retires model names periodically
— the Llama 3.x ids this originally used now 404.

**Rate limits are treated as a wait, not a failure.** Groq's free tier allows 30 requests and 8,000
tokens per minute, and ingestion fans out over thousands of filings. `lib/llm/limiter.ts` holds a
rolling-window budget over both, and 429s retry against the provider's own `retry-after` hint.
Without this the first thirty calls succeed and everything after silently degrades to the
deterministic fallback — which looks identical to having no key at all. Tune with `FINN_LLM_RPM`
and `FINN_LLM_TPM` if your tier is more generous.

**Content-hash cache** keyed on `sha256(provider + model + prompt)`, written to `data/llm-cache/`
and committed, so re-running the demo costs nothing and produces identical output.

**Everything is metered.** `lib/llm/ledger.ts` records tokens and cost per call, broken down by
task, surfaced on the Tune screen and persisted to `data/llm-ledger.json`.

### It runs without an API key

This is a design property, not a fallback. Without any key configured:

- The Brief works completely — categories resolve through rules, headlines through deterministic
  text cleanup, and every number is parsed as usual.
- The research sheet's numeric sections render in full.
- Only the five written sections report themselves unavailable, and they say exactly which key
  would enable them.

Add a key to `.env.local` to light up the rest:

```bash
GROQ_API_KEY=...          # default
# OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY also supported
```

The router picks whichever key is present, preferring Groq. Every model id is env-overridable.

---

## Design

**Liquid glass over an ambient field.** A fixed `AuroraField` of slowly drifting radial gradients
sits behind everything, because `backdrop-filter` only reads as glass when there is luminance behind
it to refract.

**Two glass tiers, and the split is a performance decision.** `GlassPanel` uses real
`backdrop-filter` and is reserved for the four fixed surfaces — header, tab bar, section nav, sheets
— because each blur layer costs a full-viewport readback per frame. `GlassCard` has no blur at all:
a translucent fill, a gradient hairline that runs light at the top and dark at the bottom, and an
inset specular highlight. It reads as the same material and keeps a long feed at 60fps.

**Dark mode is not black.** `#000` gives glass nothing to refract and flattens the whole effect, so
the dark canvas is a deep slate-indigo. Fixed chrome in dark mode uses a translucent *dark* fill
rather than translucent white, which hazes instead of occluding.

**Seventeen category glyphs.** Every reference-document category gets a `GlassTile` — a tinted
squircle deriving its fill, glyph and ring colour from a single OKLCH hue, so the set stays tonally
consistent.

**Colour never carries meaning alone.** Green is up and red is down per Indian convention, but every
delta also renders an arrow and an explicit sign.

All figures use `tabular-nums slashed-zero` so columns align and count-up animations do not jitter.
`prefers-reduced-motion` collapses every animation to a crossfade.

---

## Data sources

| What | Source | Notes |
|---|---|---|
| EOD price and volume | `yahoo-finance2` v4 | Must be instantiated; v4 dropped the v2 default-export call style |
| Corporate announcements | NSE `/api/corporate-announcements` | Needs a cookie handshake and a browser UA; serves the body text inline |
| Financial statements | screener.in | `#quarters`, `#profit-loss`, `#balance-sheet`, `#cash-flow`, `#ratios` |
| Annual reports, transcripts | screener.in `#documents` + Concalls | PDFs extracted with `unpdf` |

`npx tsx scripts/check-sources.ts TITAN` exercises all four end to end. These are scrapes, not
contracted APIs, so they will eventually change shape — that script turns "the app is broken" into
"screener changed its table markup" in about ten seconds.

---

## Deliberate cuts

Called out because they were decisions, not oversights:

- **Real-time intraday data.** Everything is end-of-day. It makes the nightly batch honest and the
  "same-day reaction" signal well-defined.
- **OS push notifications and background sync.** The push/pull distinction here is about interaction
  model, not delivery channel.
- **Auth and multi-user.** Every setting is a personal preference in `localStorage`. A login between
  a reviewer and the product buys nothing.
- **Full annual-report parsing.** 400-page PDFs are narrowed to the management-discussion section by
  text search. The pull side leans on transcripts, which carry far more signal per token.
- **A vector database.** With four transcripts per company, regex prefiltering plus whole-document
  context is both cheaper and more accurate than chunk retrieval.

## Known limits

- Materiality weights are a judgment call, tuned by inspecting real filings with
  `scripts/inspect-snapshot.ts`. They are opinionated, which is the point, but they are not learned.
- Guidance verdicts only cover metrics present in screener's standardised tables. Everything else is
  honestly marked unverifiable.
- The live path for non-portfolio tickers depends on NSE and screener accepting the request. It
  works locally; from a hosted IP it may not, and the UI says so plainly when it fails.
- Symbols change. Zomato is now `ETERNAL` and Tata Motors demerged into `TMPV` — both caught by the
  source health check.

---

Not investment advice. A prototype built for a challenge.
