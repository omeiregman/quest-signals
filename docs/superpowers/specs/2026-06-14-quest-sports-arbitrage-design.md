# Quest — Sports Arbitrage Detection Engine: v1 Design Spec

**Date:** 2026-06-14
**Scope:** PRD Phases 1 + 2 (deterministic core + logging + full UI). Phase 3 (Betfair placement, LLM features) is explicitly out of scope and left as clean seams.
**Prerequisite:** Phase 0 research is complete — see [research.md](../../research.md). This spec encodes its findings.

---

## 1. Summary

A self-hosted web app that polls an odds API across many bookmakers and sports, runs a **deterministic** engine to detect **arbitrage** (Σ best-odds implied probability < 1) and **value bets** (edge vs a sharp reference), pre-computes stake splits with a **bidirectional calculator** (stake↔target-profit), and presents opportunities in a clean React UI where the user reviews, accepts, places (manually), and later settles each one. Every detected opportunity is logged with timestamps so the user can empirically measure how often real edges appear and how long they survive — the logging dataset is a first-class deliverable.

Key research outcomes baked into this design:
- **Provider:** The Odds API first, behind a swappable `OddsProvider` adapter.
- **Region = API-region param + a fundability allowlist.** Ship `eu` (default), `se`, `lt` profiles as config.
- **Default region `eu`** maximizes the validation dataset. LT-strict is value-bets-only (only Betsson overlaps API coverage); SE/EU is where arbs appear.
- **Build key-ready:** a `MockOddsProvider` (WC2026-shaped fixtures) makes the whole app run and test **without an API key**; it goes live when `ODDS_API_KEY` is set.

---

## 2. Goals & non-goals

**Goals (v1):** aggregate odds across books/sports; detect arbs + value bets deterministically with all math pre-computed (gross/odds only — tax never affects detection); bidirectional stake calculator with rounding realism plus a display-only net-after-tax annotation; opportunity lifecycle (new→accepted/bet_placed→skipped/archived) + settlement loop; first-class logging & analytics; region/provider pluggable via adapters; clean minimal data-dense UI.

**Non-goals (v1):** no automated bet placement; no LLM/AI (seam only); no multi-user/auth beyond single private user behind Cloudflare Tunnel; app never touches funds. Markets limited to match-winner / moneyline / 1X2 (`h2h`); totals/handicaps/props are structured-for but not built.

---

## 3. Architecture

```
[Odds API]──▶ Poller (interval) ──▶ Normalizer ──▶ Detection engine (arb + value)
   ▲ adapter                              │ (pure, packages/core)
   │ OddsProvider                         ▼
MockOddsProvider                      SQLite (snapshots, opportunities, legs,
   (fixtures)                          placements, settlements, poll_runs)
                                          │
                              Hono API ◀──┘──▶ React UI (list, filters, calculator,
                                                          lifecycle, settlement, stats)
```

### 3.1 Monorepo (Turborepo)
```
quest/
  apps/
    server/        # Hono API + in-process poller + provider impls + normalizer wiring
    web/           # React + Vite SPA
  packages/
    core/          # PURE: domain types, arb/value engines, bidirectional calculator,
                   #       normalization helpers, region profiles. No I/O, no clock, no random.
    db/            # Drizzle schema + migrations + typed repositories (SQLite)
  docs/
  Dockerfile, docker-compose.yml, turbo.json, package.json (workspaces), tsconfig.base.json
```
`packages/core` is consumed by **both** `apps/server` (detection) and `apps/web` (live calculator recompute) — identical math on both sides.

### 3.2 Stack decisions (approved)
- **Backend:** Hono (TS, lightweight, Workers-portable).
- **ORM/DB:** Drizzle + SQLite (`better-sqlite3`), Postgres-portable schema.
- **Poller:** same Node process as the API, internal scheduler (`setInterval`-based wrapper); splittable later.
- **Frontend:** React + Vite + TanStack Query (interval refetch → live indicator), Tailwind + minimal hand-rolled components.
- **Tests:** Vitest across packages.
- **Validation:** Zod (env + API request/response).

---

## 4. The deterministic core (`packages/core`) — fully unit-tested

All functions are pure: inputs in, data out, no I/O, no `Date.now()`/random inside (callers pass timestamps). This is the heart; built test-first.

### 4.1 Domain types (representative)
```ts
type MarketType = 'h2h';                  // v1; enum extensible to 'totals' | 'spreads' | ...
type OpportunityType = 'arb' | 'value';
type OpportunityStatus = 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';

interface BookOdds { book: string; price: number; }            // price is decimal
interface NormalizedOutcome { name: string; books: BookOdds[]; } // name normalized: 'Home'|'Draw'|'Away' or team name
interface NormalizedMarket {
  sportKey: string; eventId: string;
  homeTeam?: string; awayTeam?: string;
  commenceTime: string;                   // ISO 8601
  marketType: MarketType;
  outcomes: NormalizedOutcome[];
}

interface ArbLeg { outcome: string; book: string; odds: number; impliedProb: number; }
interface ArbOpportunity {
  type: 'arb';
  sportKey: string; eventId: string; commenceTime: string; marketType: MarketType;
  legs: ArbLeg[];                         // best book per outcome
  totalImplied: number;                   // Σ 1/best_odds_i  (< 1 for an arb)
  margin: number;                         // 1 - totalImplied (gross, pre-tax/rounding)
}

interface StakeLeg { outcome: string; book: string; odds: number; stake: number; }
interface StakeOpts { rounding: number; }    // tax is NOT here — see §4.3
interface StakeSplitResult {                  // gross-only; tax never enters the math
  totalStake: number;                     // after per-leg rounding, this is Σ stakes
  requestedStake: number;                 // what the caller asked for (forward) / implied (reverse)
  legs: StakeLeg[];                       // post-rounding stakes
  guaranteedReturn: number;               // min over outcomes of (stake_k * odds_k)
  grossProfit: number;                    // guaranteedReturn - totalStake (worst case after rounding) — THE headline number
  perOutcome: { outcome: string; return: number; grossProfit: number; }[];
}
// Display-only helper, used by the UI for a small secondary annotation:
// netAfterTax(grossProfit, taxRate) => grossProfit > 0 ? grossProfit * (1 - taxRate) : grossProfit

interface ValueOpportunity {
  type: 'value';
  sportKey: string; eventId: string; commenceTime: string; marketType: MarketType;
  outcome: string; book: string; softOdds: number;
  referenceBook: string; trueProb: number;   // de-vigged sharp probability
  edge: number;                                // trueProb * softOdds - 1
}
```

### 4.2 Functions
- **Normalization:** `toDecimal(price, format)`; `aliasBook(name)` using an alias map (e.g. `Betsafe`→`Betsson`); `normalizeOutcomeName(name)` (e.g. `Tie`→`Draw`). Pure, table-driven.
- **`detectArbitrage(market, { minMargin, bookAllowlist? }) → ArbOpportunity | null`**
  For each outcome pick the **highest** decimal odds among allowlisted books; `impliedProb_i = 1/best_i`; `totalImplied = Σ impliedProb_i`; if `totalImplied < 1` and `margin = 1 - totalImplied ≥ minMargin`, return the opportunity recording which book holds each leg; else `null`. Requires every outcome to have ≥1 allowlisted book.
- **`calcStakeSplit(arb, totalStake, { rounding }) → StakeSplitResult`** (forward)
  Ideal `stake_i = totalStake × impliedProb_i / totalImplied`; round each to nearest `rounding` increment; recompute actual `totalStake = Σ rounded`; for each outcome compute `return_k = stake_k × odds_k`, `grossProfit_k = return_k − totalStake`; report worst-case (min) `guaranteedReturn`/`grossProfit` as the headline, plus `perOutcome`. **Gross only — this is the realistic post-rounding number. Tax never enters here.**
- **`calcStakeFromTarget(arb, { targetGrossProfit? | targetReturn? }, { rounding }) → StakeSplitResult`** (reverse)
  Back-solve the required `totalStake` from the target using the closed-form `return = totalStake / totalImplied` (`stake = targetReturn × f`) or `gross = stake × (1−f)/f` (`stake = targetGrossProfit × f/(1−f)`), then delegate to the forward calc so rounding is applied identically. Exactly one target field must be provided. **No net-profit target — net is display-only.**
- **`detectValue(market, { referenceBook, minEdge, bookAllowlist? }) → ValueOpportunity[]`**
  De-vig the reference book's prices across the market: `implied_i = 1/refOdds_i`, `trueProb_i = implied_i / Σ implied` (multiplicative/proportional de-vig). For each allowlisted soft book and outcome, `edge = trueProb_i × softOdds − 1`; emit those with `edge ≥ minEdge`. Labelled distinct from arbitrage (single-bet, non-guaranteed).

### 4.3 Tax model (display-only — NEVER affects detection or headline)
**Tax has zero influence on whether something is a valid/good arbitrage, on the margin, on ranking, or on the headline profit.** Detection and the stake calculator are pure gross/odds math. Tax is purely a *display annotation*: a single function `netAfterTax(grossProfit, taxRate) = grossProfit > 0 ? grossProfit × (1 − taxRate) : grossProfit`, which the UI surfaces as a small secondary line ("Net ≈ €X after Y%"). `TAX_RATE` stays configurable precisely because the rate differs by country/region where the tool is used. A more sophisticated (progressive/per-leg) net estimate can replace `netAfterTax` later without touching any detection or calculation code, because nothing upstream depends on it.

### 4.4 Region profiles (data in core)
```ts
interface RegionProfile { id: 'eu'|'se'|'lt'; apiRegions: string[]; bookAllowlist: string[]; referenceBook?: string; }
```
`eu` (default, broad allowlist + Pinnacle/Betfair as `referenceBook`), `se` (SE-licensed softs), `lt` (Betsson + local books that appear; value-focused). Allowlists are starting points to be confirmed against the live bookmaker endpoint (research §7) and are editable config, not hardcoded logic.

---

## 5. Persistence (`packages/db`, SQLite/Drizzle)

| Table | Key columns |
|---|---|
| `poll_runs` | id, provider, region_profile, started_at, finished_at, status, credits_used, error |
| `odds_snapshots` | id, poll_run_id, sport_key, event_id, commence_time, market_type, raw_json, normalized_json, captured_at |
| `opportunities` | id, type, sport_key, event_id, event_name, commence_time, market_type, region_profile, margin (arb), edge (value), reference_book (value), status, detected_at, **last_seen_at**, **dedupe_key**, default_bankroll_profit *(gross)* |
| `opportunity_legs` | id, opportunity_id, outcome, book, odds, implied_prob, recommended_stake |
| `placements` | id, opportunity_id, total_staked, predicted_profit *(gross)*, placed_at; + `placement_legs` (outcome, book, actual_stake, actual_odds) |
| `settlements` | id, opportunity_id, winning_selection, realized_profit, predicted_profit, notes, auto_filled, settled_at; + `settlement_legs` (outcome, result: settled\|voided\|rejected) |

- **`dedupe_key`** = stable hash of `(sport_key, event_id, market_type, type, sorted legs[outcome,book])`. On each poll, a still-qualifying opportunity **updates `last_seen_at`** instead of inserting a duplicate. **Edge survival = `last_seen_at − detected_at`.**
- Indexes: `status`, `sport_key`, `commence_time`, `dedupe_key`, `type`.
- Repositories expose typed functions (`upsertOpportunity`, `listOpportunities(filter)`, `setStatus`, `recordPlacement`, `recordSettlement`, `statsQuery`); no business logic in the DB layer.

---

## 6. Poller (`apps/server`)

1. Scheduler fires every `POLL_INTERVAL_SECONDS` (default 300). A `POST /api/poll` triggers an immediate run ("search now").
2. For each configured `(sport, apiRegion)` in the active region profile(s): `provider.fetchOdds()` → normalize (decimal, alias, outcome-align) → **filter legs to `bookAllowlist`** → `detectArbitrage` + `detectValue` → upsert opportunities (dedupe + `last_seen_at`) → persist `odds_snapshots` + close `poll_runs` with credits used.
3. Reads remaining-credits header (The Odds API) into `poll_runs.credits_used`; logs and backs off on rate-limit/error without crashing.
4. `MockOddsProvider` serves fixtures so the loop runs end-to-end with no key.

---

## 7. API (Hono, zod-validated)

| Method/Path | Purpose |
|---|---|
| `GET /api/opportunities` | List; filters: `status,type,sport,region,minMargin`; sorts incl. `timeToEvent`. Default returns `status=new`. |
| `GET /api/opportunities/:id` | Detail + legs. |
| `POST /api/opportunities/:id/status` | Set lifecycle status; `bet_placed` body carries actual per-leg stakes/odds → creates a `placement`. |
| `POST /api/opportunities/:id/settlement` | Record settlement (winning selection, per-leg result, realized profit, notes). |
| `GET /api/stats` | arbs/day, avg margin, avg survival, realized-vs-predicted, hit rate, slippage; grouped by sport/book. |
| `POST /api/poll` | Trigger immediate poll. |
| `GET /api/meta` | Last poll time, poller status, config (default bankroll, tax, rounding), region profiles. |
| `GET /api/sports` | Available sports/regions for filter UI. |

`GET /api/opportunities/:id/calc?stake=` and `?targetProfit=` are optional server mirrors of the core calculator (the client computes live via core regardless).

---

## 8. Frontend (`apps/web`, clean & minimal)

- **Main table** of active (`new`) opportunities: sport · event/teams · commence + **time-to-kickoff** · market · **arb|value badge** · margin% (arb) / edge% (value) · **gross profit @ default bankroll** · quick actions **Accept · Bet placed · Skip · Archive**. Columns sortable (esp. time-to-event); filters for sport, region, type, min margin, and a "prefer further-from-kickoff" sort/toggle. (Net-after-tax is *not* a headline column.)
- **Expandable row → bidirectional calculator (centerpiece):** forward (stake→per-leg→guaranteed return→**gross profit**) and reverse (target gross profit or return→stakes), **live recompute client-side via `packages/core`**, honoring rounding. Gross is the headline; a **small secondary line** shows `netAfterTax(gross, TAX_RATE)` ("Net ≈ €X after Y%") so the user sees the realistic take-home without tax ever coloring whether the bet is worth placing. **Copy-ready per-leg summary** (book, outcome, odds, exact stake) for fast two-window manual placement.
- **Global default-bankroll** input; **per-opportunity override** in the calculator.
- **Settlement view** for `bet_placed` items: winning selection, leg-by-leg settled/voided/rejected, realized vs predicted, notes; auto-fill winning selection from API results where available, user confirms/overrides.
- **Stats page:** arbs/day, avg margin, avg edge-survival time, realized-vs-predicted, hit rate, slippage — broken down by sport and book; charts + tables.
- **Live UX:** last-poll indicator, "search now" button, auto-refresh via TanStack Query interval.
- Aesthetic: clean typography, minimal chrome, data-dense but never busy. Built with the frontend-design skill; optional visual-companion mockups before coding.

---

## 9. Configuration (env, zod-validated)

`ODDS_PROVIDER` (default `theoddsapi`) · `ODDS_API_KEY` (optional → MockProvider if unset) · `POLL_INTERVAL_SECONDS` (300) · `SPORTS` (csv) · `REGIONS` (default `eu`) · `MIN_ARB_MARGIN` (0.01) · `MIN_VALUE_EDGE` (0.02) · `TAX_RATE` (0.20) · `DEFAULT_BANKROLL` · `STAKE_ROUNDING`. A `.env.example` documents all.

---

## 10. Future seams (interfaces only in v1)

- **`OddsProvider`** — already the active adapter; OddsPapi/odds-api.io plug in by config.
- **`LLMProvider` / `OpportunityPostProcessor`** — a no-op default; invoked on settlement events and on a schedule. `KimiProvider` is the intended later implementation (PRD Appendix A: settlement parsing, name reconciliation fallback, weekly analytics digest, mistake-pattern flags). Advisory/logged only — never decides stakes. Not built in v1.
- **Betfair placement (Phase 3)** — documented in research.md §4; not built.

---

## 11. Testing strategy

- **`packages/core`: exhaustive unit tests (TDD).** Arb detection (incl. no-arb, equal-odds, missing-outcome, allowlist filtering); forward calc (gross-only, rounding skew, worst-case selection); reverse calc (both target modes — return & gross profit — round-trip vs forward); `netAfterTax` display helper (positive-only taxation); value/de-vig (vig removal sums to 1, edge sign); normalization/aliasing; dedupe key stability. This is the money math — coverage is the priority.
- **`packages/db`:** repository tests against in-memory SQLite (upsert/dedupe/last_seen, lifecycle transitions, stats queries).
- **providers/normalizer:** `TheOddsApiProvider` parsing against recorded fixtures; `MockOddsProvider` shape parity.
- **API:** a handful of Hono integration tests (filters, lifecycle, settlement) on a seeded mock DB.
- **web:** component tests for the calculator (forward/reverse parity with core) and a smoke render of the table.

---

## 12. Deployment

Multi-stage `Dockerfile` (build TS → slim runtime), `docker-compose.yml` mounting a SQLite volume; single service runs API + poller; `web` built to static assets served by the server. Cloudflare Tunnel is the user's existing exposure pattern — documented in README, not configured by the app.

---

## 13. Build milestones (drives the plan)

- **M0 — Bootstrap:** Turborepo, TS project refs, Vitest, lint/format, `git init`, `.gitignore`, base configs, `.env.example`.
- **M1 — Core (TDD):** types + arb/value engines + bidirectional calculator + normalization + region profiles, fully unit-tested. ← the heart.
- **M2 — DB:** Drizzle schema + migrations + typed repositories + tests.
- **M3 — Providers:** `OddsProvider`, `TheOddsApiProvider`, `MockOddsProvider`, normalizer wiring, WC2026 fixtures, parsing tests.
- **M4 — Server:** Hono API + poller (on MockProvider) wired end-to-end; logging; integration tests; runs with no key.
- **M5 — Web:** table, filters, bidirectional calculator, lifecycle actions, settlement view, stats page; clean UI.
- **M6 — Ship:** Docker + compose, README (config, run, tunnel), run/verify on mock data; live smoke test when a key is added.

---

## 14. Acceptance criteria (v1 done)

1. `pnpm test` green; `packages/core` covers all detection + calculator paths.
2. With no API key, `docker compose up` runs API + poller against fixtures; opportunities appear in the UI.
3. Arbitrage and value opportunities are detected, deduped across polls, and survival time is recorded.
4. The bidirectional calculator recomputes live in both directions on gross profit with rounding realism (net-after-tax shown only as a small secondary annotation) and produces a copy-ready summary.
5. Full lifecycle (new→accepted/bet_placed→skipped/archived) and settlement recording work end-to-end.
6. Stats page shows arbs/day, avg margin, survival time, realized-vs-predicted, by sport/book.
7. Switching `REGIONS`/`ODDS_PROVIDER` in env changes behavior without code edits; adding `ODDS_API_KEY` switches to live data.
8. No automated placement, no LLM calls, no fund handling exist in the running system.
