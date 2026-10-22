# Quest Profitability Pivot — Value-First Now, Paid Arb Layer Later

**Date:** 2026-07-03
**Status:** Approved by user (direction "A + B, phased")
**Context docs:** `docs/STATUS.md`, `docs/PRD.md`, `docs/research.md`

## 1. Why this pivot

Three weeks of live data (from `apps/server/data/quest.sqlite`) shows:

- **2 arbs found**, both genuine 7bet.lt ↔ Betsson crosses (structural thesis confirmed) — but margins were 1.3–1.45%, both were from stale/in-play odds (unplaceable), and €1 stake rounding ate 96% of one arb's profit (€0.05 realized on a 1.3% margin at €100 bankroll).
- **40 value bets** vs Pinnacle, 23 in the credible 2–5% edge band. The 10%+ "edges" are stale-line artifacts.
- Daily pre-match polling structurally cannot catch arbs (they live minutes); 5/6 of the OddsPapi credit budget went to sports where the fundable books have no real coverage.

**Conclusion:** with free data + 2 books, arbitrage is a lottery ticket; value betting vs Pinnacle is the statistically sound engine (edges persist hours, need one book, tolerate slow polling). Real arbitrage requires paid, minutes-fresh data. The pivot: run value-first on the free tier now, build the usability layer that a paid arb feed needs anyway, and gate the paid spend on proof.

## 2. Phases

### Phase 1 — free tier, build now
Credit refocus + notifications + placement usability + CLV proof loop. Detailed design in §3. All components are reused by Phase 3.

### Phase 2 — prove it (weeks 2–8, €0, no code)
- Place small flat-stake value bets from the 2–5% edge band; settle them in the app; watch CLV and realized P/L accumulate.
- Verify BreakingBet's LT-book coverage (Betsson/7bet/Optibet/Topsport/OlyBet) via its free tier.
- Get an OddsPapi paid quote from their pricing calculator: 3 bookmakers × soccer × ~20K req/mo.
- **Gate to Phase 3:** average CLV consistently positive (pipeline provably identifies real edge) AND a verified feed that covers the fundable pair at an acceptable price.

### Phase 3 — paid arb layer (design deferred until the gate passes)
- Chosen feed: OddsPapi high-volume REST or WebSocket push, or BreakingBet — whichever is verified + cheaper.
- Fast loop (2–5 min or push) on pinned soccer tournaments; instant Telegram alerts; €500–1,000+ bankroll so 1–1.5% margins pay meaningful amounts.
- Architecture note: this is a poller-cadence + provider change. Notifications, deep links, re-check, and CLV from Phase 1 are reused unchanged. Not designed further here.

## 3. Phase 1 design

### 3.1 Credit refocus (config only, no code except env plumbing)
- `.env`: `SPORTS=soccer` (drop the 5 sports with no fundable coverage), `POLL_INTERVAL_SECONDS=43200` (2×/day: soccer ≈ 4 req/poll → ~240 req/mo). That sits right at the 250 free cap once CLV captures and re-check clicks are added; acceptable because 429s are already retried and a few dropped polls are harmless at this cadence. If usage grows, drop to daily polling rather than trimming the proof loop.
- Expose existing `OddsPapiProvider` constructor options as env: `ODDSPAPI_TOURNAMENTS` (comma-separated pinned tournament ids — target tournaments BOTH books quote, e.g. Superettan/Allsvenskan/EPL per STATUS §8.1) and `ODDSPAPI_MAX_TOURNAMENTS` (default 5). Pinned ids take precedence over the busiest-tournaments heuristic.
- `STAKE_ROUNDING` default changes `1 → 0.1` (config default + `.env` + `.env.example`). Core calculator already parameterized; thin arb margins survive.

### 3.2 Telegram notifications
New module `apps/server/src/notify/telegram.ts`.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (both absent → notifier disabled, no-op), `NOTIFY_MIN_VALUE_EDGE` (default `0.03`).
- Interface: `createNotifier(config) => { notify(newOpportunities: Opportunity[]): Promise<void> }`. Called by `runDetection` with only the opportunities **inserted this run** (not re-seen ones — `upsertOpportunity` must report inserted-vs-updated).
- Sends: every new arb (always) and new value bets with `edge >= NOTIFY_MIN_VALUE_EDGE`. Message: event name, kickoff (local time), type, margin/edge %, per-leg book/odds/stake, deep links when present.
- Delivery via `fetch` to `https://api.telegram.org/bot<token>/sendMessage`. Failures are logged and swallowed — notification can never break or delay detection.

### 3.3 Per-leg deep links
- `packages/core`: `BookOdds` gains optional `link?: string`; carried through `NormalizedOutcome` → detection → opportunity legs.
- `apps/server` parser: capture OddsPapi `fixturePath` per book per fixture (present in `bookmakerOdds[slug]`), emit as `link`.
- `packages/db`: nullable `deep_link` column on `opportunity_legs` (+ migration).
- `apps/web`: leg's book name renders as an external link when `deepLink` present.

### 3.4 Re-check before placing
- `OddsProvider` gains optional capability `recheckEvent?(sportKey, eventId): Promise<NormalizedMarket | null>`. OddsPapi implements via `/v4/odds?fixtureId=&bookmakers=` (1 request) + reuse of the sport-market parsing; providers without it (mock returns fixture data; The Odds API optional) simply don't offer the button.
- `POST /api/opportunities/:id/recheck`: fetches fresh odds for that event, recomputes the arb margin / value edge on the fresh prices, updates the opportunity's legs + `lastSeenAt`, and returns `{ verdict: 'holds' | 'degraded' | 'gone', fresh: {...} }` (holds = still ≥ configured threshold; degraded = positive but below original; gone = no longer profitable or odds unavailable).
- UI: "Re-check" button on the expanded opportunity row; shows fresh legs + verdict inline. Costs 1 OddsPapi request per click — noted in the UI tooltip.

### 3.5 Lifecycle hygiene
- **Auto-archive:** at the end of each detection run, set `status='archived'` on `new`/`accepted` opportunities whose `commenceTime` is in the past (they're unplaceable). Keeps the default view honest.
- **One-off purge:** delete the pre-fix rows with empty `event_name`/`commence_time` (a one-time maintenance script, not a product feature).

### 3.6 CLV tracking (the proof loop)
- **Capture:** during each detection run, for every opportunity with status `bet_placed` whose event starts before the next scheduled poll (i.e. this is the last look before kickoff), fetch that fixture's current odds (reuses the re-check path, 1 req each) and store the reference book's (Pinnacle) prices as closing odds. Best-effort: with 2 polls/day the "closing" line may be hours old; recorded `capturedAt` makes the staleness visible. (Phase 3's fast polling upgrades CLV precision for free.)
- **Storage:** new table `closing_odds` (`opportunity_id`, `outcome`, `reference_book`, `closing_price`, `captured_at`). If an event is captured again on a later poll, the record is overwritten — the capture closest to kickoff wins.
- **Math (pure, in `packages/core`):** CLV per placed leg = `placed_odds / fair_closing_odds − 1`, where fair closing odds = de-vigged (multiplicative, same as `detectValue`) Pinnacle closing prices. Unit-tested.
- **Stats view:** average CLV %, count of tracked bets, and realized P/L vs predicted — the numbers that decide the Phase 2→3 gate.

### 3.7 Value-bet stake suggestion (display-only)
Value legs currently show no stake. UI shows a flat-stake suggestion = 1% of bankroll (client-side only, rounded per `STAKE_ROUNDING`). No Kelly, no engine change — YAGNI.

## 4. Error handling
- Notifier: log-and-swallow; disabled cleanly when unconfigured.
- Re-check/CLV fetches: per-event try/catch; a failed fetch marks nothing and is logged; API returns `verdict:'gone'` with an `error` note only when odds are truly unavailable.
- Credit safety: CLV capture and re-check are bounded (CLV: only bets placed, near kickoff; re-check: explicit user click). No new unbounded request loops.

## 5. Testing
- Unit: CLV math (core), notifier formatting + threshold + disabled mode (fetch mocked), parser `fixturePath` capture, auto-archive repository function, config parsing of new env vars.
- API: recheck endpoint against mock provider (holds/degraded/gone), sports/opportunities regressions stay green.
- Manual: one live re-check + one Telegram message end-to-end before calling Phase 1 done.

## 6. Out of scope (unchanged decisions)
- No auto-placement; manual betting only. Tax stays display-only. No LLM in the detection path.
- Nigeria (`ng-arb`) stays wired but dormant until the user revisits.
- Multi-source tabs UI: deferred until a second live source actually exists (Phase 3).
- Kelly staking, live/in-play betting, additional LT books via scraping: explicitly rejected for now.
