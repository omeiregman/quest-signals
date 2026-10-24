# Quest — Project Status & Continuity Doc

**Last updated:** 2026-10-24
**Purpose:** Single source of truth for "what's built, what's decided, what's next" so any new session can continue without re-deriving context. Read this first, then `docs/PRD.md`, `docs/research.md`, the spec, and the plans.

---

## 000. VALUE SLATE — 2026-10-24 (newest work; read `docs/value-slate/FINDINGS.md`)

**User's new direction:** arbitrage is too rare → weekly **value slate**: N value singles (one per
match) staked so any ONE winner returns the week's capital; backtest on real recent data with a
€1,000 bankroll and different weekly budgets, month by month.

**Built (branch `claude/value-bet-simulation-ofb8cw`):**
- `packages/core/src/devig.ts` — multiplicative / additive / power / Shin de-vig (+ tests).
- `packages/core/src/slate.ts` — slate selection under the one-winner rule (Σ1/odds ≤ 1),
  equal-return vs equal staking, settlement, P(no winner) (+ tests).
- `apps/backtest` (`@quest/backtest`) — football-data.co.uk loader (22 leagues, pre-match +
  closing odds, cached in `apps/backtest/data/`), candidate builder, weekly replay, bankroll sim,
  census / sweep / margins / report CLIs:
  `pnpm --filter @quest/backtest download | census | sweep | margins | report`.
- `docs/value-slate/report.html` — the interactive **Value Slate Replay** page (also published
  as a claude.ai artifact). `docs/value-slate/guide.html` — plain-language **Value Slate Guide**
  (glossary, strategies, calculator; artifact RqFF7KXzQWmQVZQiDRw2WG). `docs/value-slate/FINDINGS.md` — every finding with numbers.
  `docs/value-slate/research.md` — literature review.

**UPDATE 2026-10-24 (later): six-season Pinnacle test (FINDINGS R7).** Short-odds rule (odds 1.5–4,
edge 3–12% vs de-vigged Pinnacle, best of soft books, one bet per match) over 2019/20–2024/25
(45,684 matches): 1,619 bets (~6/wk), CLV +3.3% ± 0.24%, positive every season, ROI +6.4% ± 3.5%;
Bet365 alone 826 bets (~3/wk), CLV +2.3%. €10/bet from €1,000 → €1,832 over six seasons. The
strategy to build live is "Pinnacle short odds" with per-bet flat stakes; it needs a live Pinnacle
feed (OddsPapi) and LT prices.

**Verdict before the six-season test:** the staking rule works as designed, but against a liquid Betfair Exchange
price the big UK books offer only ~1–2 real value bets (edge ≥2%) per week across 22 leagues
(~0.4 with one account) and no edge is proven overall (CLV ≈ 0). One hopeful sign: the "Strict"
strategy (edge ≥2%, odds ≤8, liquid ref, best of 4 books) shows CLV +1.45% ± 0.69% (25/26) and
+6.1% ± 2.7% (26/27) on 76 bets. **Decisive open question: are Lithuanian books (7bet, Betsson
LT, Topsport, Optibet) softer?** Next step: put `ODDSPAPI_API_KEY` in the environment and pull
`/v4/historical-odds` for 7bet.lt + betsson + pinnacle to rerun the census on LT prices.

**Cloud-session gotchas:** `pnpm install` must go through the proxy (unset registry from
NO_PROXY); Node fetch needs `NODE_USE_ENV_PROXY=1`; a GitHub push 403 ("Claude doesn't have
GitHub access") is fixed by the user reconnecting GitHub at claude.ai/connect-github (done 2026-10-24).

---

## 00. CRITICAL REVIEW — 2026-09-20 (read this before anything else)

**What actually happened after Phase 1 shipped (2026-07-03):** nothing. The server only ever ran inside a Claude preview session; when the session ended the process died. **Zero polls, zero alerts, zero bets, zero CLV for 11 weeks.** The "it now polls twice a day" claim was false because nothing kept the process alive. This is fixed: the server runs as a macOS launchd service (below).

### Assumption register (verified against live data 2026-09-20)
| Assumption (July) | Status | Evidence / consequence |
|---|---|---|
| The server keeps polling after the session | **FALSE** | No process, no Docker, no launchd. Now: `~/Library/LaunchAgents/com.quest.server.plist` (RunAtLoad + KeepAlive, logs at `~/Library/Logs/quest-server.log`). Still stops when the Mac sleeps/powers off — a VPS is the real fix (see §00 next steps). |
| Feed prices are current | **FALSE (now guarded)** | OddsPapi reports `changedAt`, `active`, `marketActive`, `suspended`, `bookmakerIsActive` per price — all were ignored. June sample: 7bet prices 50–98h old, 3 inactive markets. Phantom arbs/value came from these. Now: parser drops suspended/inactive; `MAX_PRICE_AGE_HOURS` (48) drops stale prices; price age shown in UI + Telegram; legs persist `price_updated_at`. |
| "betsson" on OddsPapi = betsson.lt | **UNVERIFIED — links say betsson.com** | Deep links go to `www.betsson.com` (international site). No `betsson.lt` slug exists (only `betsson`, `betsson.it`; `betsafe` is a clone of betsson). Betsson Group shares a central sportsbook so prices are *probably* the same at betsson.lt, but the user must confirm on the first alert by comparing the price on betsson.lt. |
| betsson feed is live | **FALSE right now** | Since 2026-09-16 every betsson fixture arrives `suspended:true`, `bookmakerIsActive:false`, outcomes `active:false`. The parser now rejects them (correct) → **the 7bet↔betsson arb pair is blind until OddsPapi's betsson feed recovers**. A FEED WARNING is Telegram'd (rate-limited 12h) whenever a fundable book returns 0 active markets. Check `\| books:` in the poll log line. |
| 7bet.lt is an independent book | **CHANGED** | `/v4/bookmakers` now lists `7bet.lt cloneOf:"lottoland"` (June: null). Still independent of betsson, so the pair remains valid; 7bet prices today: median 4.9h old, 20/20 markets active. |
| Busiest-first tournaments give coverage | **FALSE** | Picks U20/friendly noise the LT books don't carry. Autumn discovery (`scratchpad discover-v3.mjs` pattern, ~5 req): both books quote Serie A(23), LaLiga(8), Allsvenskan(40), Eliteserien(20), Super League(185), Eredivisie(37), Ekstraklasa(202), Superliga(152), Pro League(38). Pinned `23,8,40,37,202` (1 chunk/book/poll). Re-run at season changes. |
| Multiplicative de-vig is fine | **PARTIALLY** | Overstates longshot probability → fake "value" on 8–12 odds. Mitigated by `MAX_LEG_ODDS=6`. Proper fix (power/Shin de-vig) is future work. |
| compose deploy is correct | **BUG (fixed)** | `.env`'s `DATABASE_URL=./data/quest.sqlite` overrode the container path → DB outside the volume. Compose now pins `DATABASE_URL`/`WEB_DIST`. Docker Desktop was not running on this Mac, so launchd is the active deploy. |

### Operating state (2026-09-20)
- Service: launchd `com.quest.server` → http://localhost:8787 (API + built web app). Restart after code changes: `launchctl kickstart -k gui/$(id -u)/com.quest.server` (rebuild web first: `pnpm --filter @quest/web build`). Stop: `launchctl bootout gui/$(id -u)/com.quest.server`.
- DB: `apps/server/data/quest.sqlite` (dev path, used by launchd since cwd=apps/server). `./data/` is the Docker volume copy.
- Poll log line now includes per-book coverage, e.g. `| books: 7bet.lt=20 betsson=0 pinnacle=20`.
- Credits: essentially unused since July; today ≈ 20 (discovery + polls). 2 polls/day × 4 req ≈ 240/mo.

### Next steps (priority)
1. **Watch the betsson feed** — if it stays dark >1 week, ask OddsPapi support, or evaluate BreakingBet (needs account) / a second aggregator for Betsson LT. Until then the system is a 7bet-vs-Pinnacle value scanner.
2. **First alert = verify betsson.com vs betsson.lt pricing** (and 7bet.lt link → placeable price).
3. **Hosting**: a tiny VPS (Hetzner ~€4/mo) + `docker compose up -d` removes the "Mac must be awake" dependency. Cloudflare Tunnel per PRD.
4. Then the Phase-2 loop as before: place 1% stakes, settle, watch Avg CLV.

---

## 0. CURRENT PHASE — Profitability pivot (2026-07-03): value-first, arb-later

**Strategy re-evaluation** (evidence-based, see `docs/superpowers/specs/2026-07-03-quest-profitability-pivot-design.md`):
3 weeks of live data showed daily pre-match polling structurally cannot catch arbs (2 found, both stale/unplaceable, €0.05–0.60 at €100 bankroll), while value bets vs Pinnacle appeared consistently (23 in the credible 2–5% band). Decision (user-approved): **A+B phased** — value betting as the profit engine on the free tier NOW; paid real-time arb layer LATER, gated on proof.

**Phase 1 — SHIPPED 2026-07-03** (plan: `docs/superpowers/plans/2026-07-03-quest-phase1-value-first.md`, 159 tests green, live-verified):
- Credit refocus: `SPORTS=soccer`, 2 polls/day (~240 req/mo ≤ 250 free); `ODDSPAPI_TOURNAMENTS`/`ODDSPAPI_MAX_TOURNAMENTS` env-exposed for pinning; `STAKE_ROUNDING` default 0.1.
- Telegram notifier (`apps/server/src/notify/telegram.ts`): new arbs always, new values ≥ `NOTIFY_MIN_VALUE_EDGE` (0.03); disabled when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` unset; never breaks detection.
- Per-leg deep links: OddsPapi `fixturePath` → `BookOdds.link` → `opportunity_legs.deep_link` → UI book names are external links (http-prefixed only).
- Re-check before placing: `OddsProvider.recheckEvent` capability (OddsPapi `/v4/odds?fixtureId=`, 1 req) → `POST /api/opportunities/:id/recheck` → verdict `holds|degraded|gone` + fresh legs persisted; UI button in expanded row (`meta.config.supportsRecheck` gates it).
- Lifecycle hygiene: auto-archive of past-kickoff new/accepted opps each run; one-off purge removed 33 pre-fix nameless rows from the live DB.
- **CLV proof loop** (THE Phase-2 gate metric): last poll before kickoff captures Pinnacle prices for `bet_placed` events into `closing_odds` (overwrite, latest wins); `clvForLeg` in core (de-vig); `stats.clv` (avg CLV + tracked legs) on the Stats page.
- Value stake suggestion: flat 1% bankroll in the value calculator.

**Tournament pinning — DONE 2026-07-03 (critical coverage fix):** the busiest-first heuristic picked U20/friendly noise that 7bet.lt doesn't carry at all (0 quotes in the first Phase-1 polls → arbs structurally impossible). One-off discovery (~11 requests) found the pair's real intersection; `.env` now pins `ODDSPAPI_TOURNAMENTS=40,46,16,42291,19712` (Allsvenskan, Superettan, World Cup, Ykkonen, Copa Simon Bolivar). Verified live: 5/13 polled markets now carry BOTH 7bet.lt and betsson with diverging lines (e.g. Halmstads Draw 3.10 vs 3.40). Re-run discovery (`scratchpad discover-v2.mjs` pattern) when seasons change — Swedish summer leagues end ~Nov.
**Credit note:** July spend ≈ 24 (polls + discovery); 2 polls/day × 4 req uses ~248/250 by month-end — near-zero headroom, so drop to daily polls (86400) if re-check gets used regularly.

**Phase 2 — IN PROGRESS (user actions, €0, weeks 2–8):**
1. Set up Telegram bot (@BotFather) → fill `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in `.env`.
2. Place small flat-stake (1% bankroll) value bets from the 2–5% edge band; mark `bet_placed` with actual odds; settle in-app.
3. Watch **Avg CLV** on Stats: consistently positive over 30+ bets = pipeline provably finds real edge.
4. Verify BreakingBet LT coverage (Betsson/7bet/Optibet/Topsport) via its free tier (~€22.49/mo prematch if it covers them) — needs an account; their bookmaker list isn't public (checked 2026-07-03).
5. Get OddsPapi paid quote (interactive pricing calculator at oddspapi.io/pricing — no published tiers, checked 2026-07-03): 3 bookmakers × soccer × ~20K req/mo.

**Phase 3 — GATED** (needs: positive CLV + verified feed + €500–1,000 bankroll): paid fast feed (OddsPapi WebSocket/high-volume or BreakingBet), 2–5 min polling on pinned tournaments. Notifications/deep-links/re-check/CLV from Phase 1 are reused unchanged.

---

## 1. What Quest is
Self-hosted web app that aggregates bookmaker odds, detects **arbitrage** (guaranteed-profit cross-book) and **value bets** (edge vs a sharp reference), pre-computes stake splits with a bidirectional calculator, and logs every opportunity so the user can measure whether real edges exist. Single user, manual bet placement, no LLM in the detection path. **The user's primary goal is ARBITRAGE.** Value is a secondary/fallback signal.

User context: resident in **Lithuania**, also **Nigerian** (has a SportyBet account, can open multiple NG accounts).

---

## 2. Current status — v1 COMPLETE (merged to `main`)
Built via superpowers (spec → plan → execute) in 3 plans, each adversarially reviewed and merged:
- **Plan 1 — Foundation:** `packages/core` (pure deterministic engine: arbitrage, value/de-vig, bidirectional stake calculator, normalization, dedupe, region profiles; zero deps, fully unit-tested) + `packages/db` (Drizzle + better-sqlite3 schema & repositories).
- **Plan 2 — Backend:** `apps/server` — Hono REST API + in-process poller; `OddsProvider` adapter with `TheOddsApiProvider` (live) + `MockOddsProvider` (keyless fixtures). 10 review findings fixed.
- **Plan 3 — Frontend + Ship:** `apps/web` — React+Vite SPA (clean, minimal, dark/light), opportunities table + filters + bidirectional calculator + settlement + stats; multi-stage Docker (Hono serves the built SPA on one port). 12 review findings fixed.
- **Verification:** 116 tests pass · typecheck + lint clean · keyless mock + live The-Odds-API + Docker container all verified running. UI render-verified.

**Post-v1 tuning (also merged):** poll defaults to once/day (free-tier-safe); repo-root `.env` loading via `process.loadEnvFile`; detection filters — `MAX_LEG_ODDS` (longshot-artifact cap), `MIN_TIME_TO_EVENT_MINUTES` (skip in-play/near-kickoff), and dropping arbs with ≤0 realized profit at the default bankroll.

---

## 3. Repo layout
```
packages/core   pure engine + types (arbitrage, value, stake calc, regions, dedupe)
packages/db     Drizzle/sqlite schema + repositories
apps/server     Hono API + poller + providers (TheOddsApi, Mock)
apps/web        React/Vite SPA
docs/           PRD.md, research.md, STATUS.md (this), superpowers/{specs,plans}
Dockerfile, docker-compose.yml
```

## 4. How to run
```bash
pnpm install && pnpm test           # 116 tests
# keyless (mock fixtures):
pnpm --filter @quest/server start   # API+poller :8787
pnpm --filter @quest/web dev        # UI :5173 (proxies /api)
# live: put keys in .env (gitignored; see .env.example), then start
# single-port (serves built UI + API): WEB_DIST=<abs>/apps/web/dist pnpm --filter @quest/server start
docker compose up --build           # full app on :8787 (note: cold start ~40s, pnpm+tsx)
```
Config: see `.env.example`. `.env` is gitignored (holds API keys — never commit).

---

## 5. Data sources
### The Odds API — WIRED (`TheOddsApiProvider`)
- Key in `.env` (`ODDS_API_KEY`). Free tier 500 credits/mo; `credits = markets × regions` per poll.
- Covers ~24 EU books. **Of the user's LT-fundable books, only Betsson** is carried → cannot arb on this API alone.
- Base `https://api.the-odds-api.com/v4`; `/sports` + `/events` are free; `/sports/{key}/odds` and `/events/{id}/odds` cost credits. World Cup key `soccer_fifa_world_cup`. Pinnacle present on free tier (so value works).

### OddsPapi — WIRED (`OddsPapiProvider`) — the arbitrage data source
- Key obtained (in conversation; put in `.env` as e.g. `ODDSPAPI_API_KEY` when building the adapter). Free tier 250 req/mo, **pre-match REST** (live odds = Pro tier).
- Base `https://api.oddspapi.io`; auth = `?apiKey=` query param. Endpoints: `/v4/bookmakers`, `/v4/sports`, `/v4/fixtures?sportId=&from=&to=` (dates <10 days apart, ISO), `/v4/odds?fixtureId=&bookmakers=a,b,c&oddsFormat=decimal`, `/v4/odds-by-tournaments?bookmaker=&tournamentIds=` (most credit-efficient: one call returns all events in a tournament for one book).
- **Carries the user's fundable books:** `7bet.lt` (LT, `cloneOf:null`, live), `betsson` (LT, independent, live), `sportybet` (NG, independent, live), `msport` (NG, independent), `pinnacle` (sharp ref). `cloneOf` field flags books that share an odds source (can't arb against each other) — all of the above are independent.
- **Odds response:** `bookmakerOdds[slug].markets[marketId].outcomes[outcomeId].players[0].price` (decimal). **Market `101` = 1X2 match-winner; outcome `101`=Home, `102`=Draw, `103`=Away.** Each book entry has `fixturePath` = deep link to that book's event page (useful for placement).
- **Verified 2026-06-14:** 7bet.lt vs Betsson lines genuinely diverge (e.g. Superettan match: Home 2.286/2.25, Draw 3.75/3.60, Away 2.667/2.82) — that sample was NOT an arb (~5.9% fundable margin), but confirms independent pricing + working data. Sister test pair for NG = SportyBet ↔ MSport.

---

## 6. Key product decisions (do not regress)
- **Tax is display-only** — never affects detection, margin, ranking, or headline (gross) profit. See `[[tax-is-display-only]]` memory + spec §4.3.
- **Region/source = API-region param + fundability allowlist** (`packages/core/src/regions.ts`). Only surface opportunities across books the user can actually fund.
- **Arbitrage is the goal.** Value betting is a fallback (relevant when only one fundable book exists, e.g. LT via The Odds API).

---

## 7. Arbitrage viability — research conclusions (see `docs/research.md` + recon)
- **LT books run on 5 INDEPENDENT odds engines** → lines diverge → intra-LT arb is structurally possible:
  Optibet=in-house(Entain) · Topsport=EveryMatrix · OlyBet=BetConstruct · 7bet=Altenar · Betsson=proprietary.
- **The Odds API covers only Betsson** of these → can't arb via it alone. **OddsPapi covers 7bet.lt + Betsson** → a real fundable, independent arb pair (verified).
- **Cross-border accounts (SE / UK / US / global) from Lithuania = DEAD END** — residency-locked KYC + the May-2025 LT payment-blocking law. bet365 left LT; Pinnacle bans LT; 1xBet blocked. Do NOT pursue; no VPN/proxy workarounds (account closure/confiscation risk).
- **Nigeria = LIMITED but real** — SportyBet (in-house), Bet9ja (in-house), BetKing (Genius), 1xBet (own) price independently → arbs exist. Data: NOT The Odds API; OddsPapi has SportyBet + MSport; otherwise BreakingBet (~$40/mo, lists SportyBet+Bet9ja+1xBet) or free `NaijaBet_Api` (Bet9ja+BetKing+NairaBet, no SportyBet). Caveats: aggressive account limiting/closure of winners, "palpable error" voids, withdrawal delays, thin 0.5–2% edges, NGN↔EUR repatriation friction.
- **Betfair Exchange** — genuine public API (£499 one-off), available in LT (funding under the payment law unverified); could be one independent leg vs a soft book. Secondary option.

---

## 8. Next steps (prioritized)
1. **`OddsPapiProvider` — DONE** (`apps/server/src/providers/oddspapi.ts` + `parse-oddspapi.ts`; profiles `lt-arb`/`ng-arb` in core). Flow: `/v4/fixtures?sportId=10&from&to` → pick busiest tournaments (capped `maxTournaments`, default **5** = free-tier-safe) → **chunk to ≤5 ids/call** → `/v4/odds-by-tournaments` per book (spaced ~800ms for rate limit) → merge market `101` (1X2). Run via `.env`: `ODDS_PROVIDER=oddspapi`, `ODDSPAPI_API_KEY=…`, `SPORTS=soccer`, `REGIONS=lt-arb`. Live-verified: detects real value bets (Betsson vs Pinnacle).
   - **Tuning lesson / to surface 7bet↔Betsson ARBS:** the default "5 busiest tournaments" tends to be World-Cup/SRL-heavy where **7bet.lt has thin coverage**, so arbs (which need BOTH 7bet + Betsson on the same match) rarely appear. To hunt them, monitor tournaments **both** books cover — pin them via the provider's `tournamentIds` option (e.g. Superettan id 46, Allsvenskan, EPL, where both were observed to quote) and/or raise `maxTournaments` (watch the 250/mo credit budget: ≈ `ceil(tournaments/5) × books` calls per poll). `tournamentIds`/`maxTournaments` are constructor options on `OddsPapiProvider` (not yet exposed as env — small follow-up: add `ODDSPAPI_TOURNAMENTS` / `ODDSPAPI_MAX_TOURNAMENTS`).
   - **Multi-sport — DONE.** `SPORT_MARKETS` (ids verified from `/v4/markets`): soccer=101 (1X2), basketball=111, tennis=121, baseball=131, american-football=141, ice-hockey=151 (2-way "Winner incl. overtime"). Set `SPORTS=soccer,basketball,tennis,…` (provider-specific keys). Each sport ≈ 4 OddsPapi req/poll → ~2 sports daily is free-tier-safe; more → trim, poll less often, use "Search now", or upgrade.
   - **Resilience — DONE.** A book that doesn't cover a tournament (OddsPapi 404 `FIXTURE_NOT_FOUND`) is skipped per book/chunk (doesn't fail the sport); 429 rate-limits retry with backoff. `DetectionSummary.errors` counts sport-level fetch failures; `/api/poll` returns a `PollOutcome` the UI reports.
   - **Coverage finding:** betsson/7bet (the fundable LT books) mostly cover **soccer**; their basketball/tennis coverage on the busiest tournaments is thin → non-soccer yielded no fundable opps in testing. Soccer is where LT arbs will appear. `fixturePath` deep links are in the raw response but not yet surfaced on legs (follow-up). Constructor opts `tournamentIds`/`maxTournaments` still not env-exposed (follow-up: `ODDSPAPI_TOURNAMENTS`/`ODDSPAPI_MAX_TOURNAMENTS`).
2. **"Re-check before I place" button** — per-opportunity re-fetch of just that event's fresh odds (OddsPapi `/v4/odds?fixtureId=`) → confirm the arb/edge still holds before placing. (Discussed, not built.)
3. **Multi-source / tabs UI** — the user wants browser-tab-like workspaces per data source. Maps to the existing `OddsProvider` + region-profile design; likely ONE new provider (OddsPapi spans LT + NG) rather than 3. Design after coverage is proven.
4. **Optional Nigeria expansion** — add a Nigeria source (OddsPapi SportyBet+MSport now; BreakingBet or NaijaBet_Api for more NG books later).
5. **Credit discipline** — OddsPapi free 250 req/mo is tight; use tournament-batch calls + once/day polling; "Search now" + "Re-check" sparingly. If scaling, OddsPapi Pro (WebSocket) or a paid tier.

## 9. Known follow-ups (non-blocking)
- Docker cold start ~40s (pnpm + tsx at runtime; pre-building server to JS would speed restarts).
- Stats page: realized-vs-predicted / hit-rate / slippage panels stubbed until settlement data accrues (seam in `StatsView`).
- LLM `OpportunityPostProcessor` seam + Betfair Phase-3 placement remain future work.
- `.env` now runs OddsPapi: `ODDS_PROVIDER=oddspapi`, `REGIONS=lt-arb`, `SPORTS=soccer,basketball,tennis`.
- UX (DONE this session): "Search now" reports its outcome (Updated — N arbs, M values / rate-limited / failed / can't-reach-server); the topbar shows the active provider ("via oddspapi"). The earlier "Search now 500" was the server being down with no UI signal — now surfaced.

## 10. Doc map
- `docs/PRD.md` — original product requirements (verbatim).
- `docs/research.md` — Phase-0 research (API choice, LT books, intersection, Betfair, rate limits).
- `docs/superpowers/specs/2026-06-14-quest-sports-arbitrage-design.md` — v1 design spec.
- `docs/superpowers/plans/2026-06-14-quest-{foundation,backend,frontend}.md` — implementation plans.
- `docs/STATUS.md` — this file. **Keep it updated as the project evolves.**
