# PRD — Sports Arbitrage Detection Engine ("Quest")

> Original product requirements, provided verbatim as the project's source of truth.
> Implementation status and decisions live in `docs/STATUS.md`; design in `docs/superpowers/specs/`.

## 1. One-line summary
A self-hosted web app that continuously aggregates sports betting odds from multiple bookmakers via an odds-data API, detects arbitrage opportunities (combined implied probability < 100%) and value bets, pre-calculates stake splits, and presents them in a clean UI where the user manually reviews, accepts, or dismisses each opportunity. The user places all bets manually (for now).

## 2. Goals & non-goals
**Goals**
- Aggregate odds across many bookmakers and many sports (not just World Cup — soccer, basketball, tennis, etc.).
- Detect arbitrage opportunities and surface them with all math pre-computed (stake split, guaranteed return %, profit on a given bankroll).
- Detect value bets (single-outcome edge vs. a sharp reference like Pinnacle) as a secondary signal.
- Let the user filter, review, and mark opportunities (accepted / bet placed / skipped / archived) so resolved items disappear from the active view.
- Log every detected opportunity with timestamps so the user can measure how often real edges appear and how long they survive. This logging dataset is a first-class deliverable, not an afterthought — it is how the user validates whether the strategy is worth scaling.
- Market-agnostic via an adapter pattern: start with Lithuania-licensed books, but make region/market pluggable (EU, Sweden, etc.).

**Non-goals (for v1)**
- No automated bet placement. User places bets manually in two browser windows.
- No LLM / AI integration in v1 (the logic is deterministic math). Leave a clean seam for adding it later.
- No multi-user / auth complexity beyond a single private user behind Cloudflare Tunnel.
- No real-money handling inside the app — it never touches funds, only displays opportunities.

## 3. Users & deployment context
- Single user, self-hosted on a home machine (Linux), exposed privately via Cloudflare Tunnel.
- No need for Cloudflare Workers/D1 since it's self-hosted. A single Node service + local DB is sufficient. (Keep deployment portable in case the user later moves it to Workers — see §8.)

## 4. Research phase (DO THIS FIRST)
Write findings into `/docs/research.md` before finalizing the data-source adapter. The intersection of these three determines viability.
- **4.1 Odds data source** — evaluate The Odds API, SportsGameOdds, OddsPapi, odds-api.io. Decision criteria: (1) covers bookmakers the user can open from Lithuania/EU (KEY FILTER); (2) decimal odds, normalized schema, sane rate limits; (3) has a sharp reference (Pinnacle/Betfair); (4) cost (<~$100/mo, prefer free to prototype). Start with The Odds API free tier; design adapter so swapping providers is a config change.
- **4.2 Lithuania/EU accessible bookmakers** — list books a LT resident can register with; cross-reference against API coverage. Note May-2025 LT payment-blocking of unlicensed operators. Investigate Betfair Exchange. Make region a selectable dimension.
- **4.3 Betting placement APIs (LATER phase)** — research Betfair Exchange API; note traditional books forbid automated betting. Do NOT build placement in v1.
- **4.4 Output** — `/docs/research.md`: chosen API + why, LT-accessible book list, the API∩books intersection, Betfair feasibility, rate-limit/cost constraints.

## 5. Core functional requirements
- **5.1 Odds polling service** — background worker polls on a configurable interval (default 60s), across configurable sports + regions; store raw + normalized snapshots with timestamps; respect rate limits.
- **5.2 Normalization layer** — convert to decimal; align team/selection naming (Draw vs Tie, team variants); normalize markets (start with match winner / moneyline / 1X2; structure for totals/handicaps/props later).
- **5.3 Arbitrage detection (deterministic)** — per market, pick best (highest) decimal odds per outcome; `implied_i = 1/best_i`; `total = Σ implied_i`; if `total < 1` → arb, `margin = 1 - total`. Stake split for total stake S: `stake_i = S × implied_i / total`, `guaranteed_return = S / total`, `profit = guaranteed_return - S`. Record which book holds each leg. Configurable min-margin threshold; configurable tax drag (LT ~20% net winnings) and rounding so displayed profit is realistic.
- **5.4 Value detection (secondary, deterministic)** — if a sharp reference exists, compute its de-vigged "true" probability; for each soft book, `edge = (true_prob × soft_odds) - 1`; flag positive edges above a threshold. Label clearly as distinct from arbitrage.
- **5.5 Stake/dutching helper — BIDIRECTIONAL calculator** — forward (stake → per-leg stakes, guaranteed return, net profit after rounding+tax) and reverse (target profit/return → required stake + per-leg). Same math, solved for different unknowns; recompute live. Respect rounding increment and recompute real profit. Copy-ready per-leg summary for fast manual placement.
- **5.6 Opportunity lifecycle + settlement** — statuses: `new` / `accepted`|`bet_placed` (record actual stakes & odds) / `skipped` / `archived`. Resolved items drop out of the active view (kept in DB). Settlement loop: record winning selection, per-leg settled/voided/rejected, realized vs predicted profit, free-text notes. Auto-populate winning selection from API where available.
- **5.7 Logging & analytics (first-class)** — log every detected opportunity (detection time, sport, event, event time, books, margin, status, last-seen time → survival). Stats view: arbs/day, average margin, average survival time, by sport.

## 6. UI requirements (clean, minimal, RICH & interactive)
- Main view: list/table of active (`new`) opportunities — sport, event/teams, event date/time + time-to-kickoff, market, margin% + profit on default bankroll, the legs (outcome → book → odds → stake), quick actions (Accept/Bet placed, Skip, Archive).
- Expandable row → interactive bidirectional calculator (centerpiece), live-updating, with copy-ready summary.
- Filters: by sport, region/market, min margin; sort/prefer events further from kickoff; time-to-event sortable/filterable.
- Search/refresh: manual "search now" + background poller; show last-poll time + live indicator.
- Bankroll input (global default + per-opportunity override).
- Settlement view for `bet_placed` items.
- Stats/analytics page (evidence layer).
- Fast to scan, clean typography, minimal chrome, interactive where it helps.

## 7. Suggested tech stack
Monorepo (Turborepo); React (Vite) frontend; Node + TypeScript backend (Hono or Express/Fastify) + polling worker; shared package with TS types + arb/value math (pure, unit-tested); SQLite (Drizzle/Prisma), Postgres-portable; `OddsProvider` adapter (`TheOddsApiProvider` first); Dockerized, behind Cloudflare Tunnel.

## 8. Architecture
```
[Odds API] → Poller → Normalizer → Detection engine (arb + value)
                                          ↓
                                   SQLite (snapshots, opportunities, status, logs)
                                          ↓
                            API service ← React UI (list, filters, lifecycle, stats)
```
Seams: `OddsProvider` interface isolates the data source; pure engine functions in the shared package; AI seam (future) as an optional post-processor over detected/settled opportunities.

## Appendix A — Where LLMs fit later (do not build in v1)
Keep the engine LLM-free. LLMs only at the edges: (1) settlement/result auto-population & anomaly notes; (2) name/market reconciliation fallback (cached, off the hot path); (3) periodic analytics digest; (4) settlement/notes → improvement suggestions. All batch/async/low-frequency. Default LLM provider Kimi K2.6 via an `LLMProvider` interface (`KimiProvider`), configured via env. Outputs advisory and logged; the money math stays deterministic.

## 9. Configuration (env)
`ODDS_PROVIDER`, `ODDS_API_KEY`, `POLL_INTERVAL_SECONDS` (default 60), `SPORTS`, `REGIONS` (default lt-relevant), `MIN_ARB_MARGIN` (e.g. 0.01), `MIN_VALUE_EDGE`, `TAX_RATE` (default 0.20), `DEFAULT_BANKROLL`, `STAKE_ROUNDING`.

## 10. Build phases
- Phase 0 — Research (§4) → `/docs/research.md`. Gate everything on this.
- Phase 1 — Core + logging: monorepo, `OddsProvider` adapter, poller, normalizer, arb + value engine (unit-tested), SQLite persistence, logging.
- Phase 2 — UI: list view, filters (incl. time-to-event), bankroll + stake splits, lifecycle, stats page.
- Phase 3 (later): Betfair placement spike; LLM features; additional markets.

## 11. Explicit constraints / notes
- One account per book per person (multiple accounts at one book = KYC fraud). Spreading across different books, one account each, is legitimate.
- Stick to Lithuania-licensed books for deposits (payment providers block unlicensed since May 2025).
- Tax: LT taxes net gambling winnings (~20%, progressive). Bake a tax drag into displayed profit. The app must NOT implement tax-avoidance routing.
- No automated placement in v1. Manual only.
- Keep the deterministic math isolated and fully unit-tested — it is the heart of the product.
