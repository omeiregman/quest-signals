# Value Slate — Findings Log

**Started:** 2026-10-24 (cloud session) · **Owner:** user + Claude · **Status:** in progress

This is the running record of everything we learn while building and backtesting the **value
slate** strategy. Append to it; never silently rewrite a finding — if one turns out wrong, strike
it and say why. Read this before continuing the work in a new session (local or cloud).

Related: `docs/value-slate/research.md` (literature review), `docs/STATUS.md` (project state),
`apps/backtest/` (the backtester), `packages/core/src/{devig,slate}.ts` (the math).

---

## 1. The strategy (user's concept, 2026-10-24)

- Arbitrage is too rare with the data we can afford → pivot to **value bets**, across every game.
- Each **week** (a round), pick N value bets — single bets, **one per match** — and stake them so
  that **any one winner returns the whole week's capital**. Every extra winner is profit.
- User is aware value flags can lean toward likely losers (longshots) — we must guard against it.
- Must be **backtested on real, recent data**: odds as they were *before* kickoff, settled against
  the real results, to find a formula that holds up. Bankroll for the simulation: **€1,000**;
  compare weekly budgets (e.g. €50/€100/€200 per week) and see month-by-month outcomes.
- User can only fund **Lithuania-licensed** books (see `docs/research.md` §2: Topsport, Optibet,
  7bet, Betsson LT, OlyBet, …). Only 7bet.lt and Betsson appear on any odds API we've found.

## 2. The math (established before any data)

**F1 — "One winner covers the round" has an exact condition.** With capital C split across picks
at decimal odds o₁…oₙ:
- *Equal-return staking* (stake ∝ 1/odds): every winner returns C / Σ(1/oᵢ). One winner covers
  C ⇔ **Σ 1/oᵢ ≤ 1**. Odds can be mixed (e.g. 2.0 + 3.0 + 6.0 → Σ = 1).
- *Equal staking*: the worst winner returns C·min(o)/n. One winner covers C ⇔ **every odds ≥ n**
  (5 picks need odds ≥ 5.0 each).
- We call S = Σ1/oᵢ (equal-return) or n/min(o) (equal) the slate's **coverage**; the code enforces
  S ≤ `maxCoverage` (1 = the user's rule).

**F2 — Adding picks does not make a wiped-out week rare.** Keeping S ≤ 1 forces longer odds as n
grows, so P(no winner) = Π(1 − pᵢ) ≈ e^(−Σpᵢ) ≈ e^(−1) ≈ 37% at the limit:

| picks | odds each | P(all lose) |
|---|---|---|
| 2 | 2.0 | 25% |
| 3 | 3.0 | 30% |
| 5 | 5.0 | 33% |
| 8 | 8.0 | 34% |
| 10 | 10.0 | 35% |

Expect to lose a whole week's stake roughly **1 week in 3**, with runs of 3–4 in a row happening
over a season. The weekly stake must be a small slice of the bankroll.

**F3 — The staking structure does not create profit.** Expected return of a slate =
Σ stakeᵢ·oddsᵢ·pᵢ = capital × (1 + stake-weighted average edge). The "one winner covers" rule
only shapes *how* you win/lose (variance). All long-run profit comes from the edges being real.

**F4 — Longshot trap.** The cover rule pushes picks into the odds 4–10 zone, which is exactly
where the favourite–longshot bias lives (books overprice longshots) and where the
**multiplicative de-vig overstates the longshot's true probability** → fake "value". This was
already observed live (STATUS.md: "fake value on 8–12 odds", patched with `MAX_LEG_ODDS=6`).
Mitigations to test: power / Shin / additive de-vig, odds-band caps, and a `sharpe` ranking
(edge per unit of variance) that prefers shorter prices.

**F5 — Results alone can't prove an edge quickly.** At odds ~5 a single bet's return has SD ≈
odds·√(p(1−p)) ≈ 2 stake units, so detecting a 3% ROI from P/L needs thousands of bets.
**Closing-line value (CLV)** — did we beat the sharp price at kickoff? — converges in hundreds.
The backtest reports both, with standard errors.

**F6 — Overfitting guard.** Tune on 2025/26, test the chosen rules *unchanged* on 2026/27.
Picking the best ROI out of thousands of configs is luck; we select by CLV and require minimum
sample sizes, then check out-of-sample.

## 3. Data (verified 2026-10-24)

**D1 — football-data.co.uk is the free historical source.** `https://football-data.co.uk/mmz4281/{season}/{league}.csv`
(www redirects to the bare domain). 22 main European divisions. Per match: result, pre-match odds
(collected **Friday afternoon for weekend games, Tuesday for midweek**) and **closing** odds.
- 2025/26: 22 leagues, **8,297 matches**, 1X2 from B365, BFD (Betfair Sportsbook), BMGM, BV
  (BetVictor), BW (bwin), CL (Coral), LB (Ladbrokes), **PS (Pinnacle)**, **BFE (Betfair Exchange)**,
  Max, Avg; O/U 2.5 from B365, P (Pinnacle), Max, Avg, BFE; Asian handicap; all with closing versions.
- 2026/27 (to 2026-10-19): **1,844 matches**. **Pinnacle columns are gone** (Pinnacle shut its
  public API in Jul 2025; football-data dropped it this season). New books PP (Paddy Power), SKB
  (Sky Bet). **Betfair Exchange (BFE) remains** for 1X2 + O/U, pre-match and closing.
- ⇒ The sharp reference must be **BFE** to test on 2026/27; Pinnacle is a cross-check on 2025/26.
- Soft books in both seasons: **B365, BW, BV, BFD** → our stand-ins for an LT book. No Lithuanian
  book is in this data; LT validation needs OddsPapi historical (7bet.lt + betsson + pinnacle).

**D2 — LT-specific history.** OddsPapi advertises `/v4/historical-odds` on the free tier (3 books
per call — exactly 7bet.lt + betsson + pinnacle; 250 req/mo ⇒ ~200 matches/month). Unverified
until we have `ODDSPAPI_API_KEY` in the environment. Note: OddsPapi's betsson feed has been
suspended since 2026-09-16 (STATUS.md). The Odds API free tier has **no** historical endpoint
(paid only; historical costs 10 credits per market per region).

## 4. Environment notes (cloud session)

- `pnpm install` fails if `registry.npmjs.org` is reached directly (DNS fails); route it through
  the agent proxy: `NO_PROXY=localhost,127.0.0.1,::1 no_proxy=… npm_config_noproxy=… pnpm install`.
- Node's `fetch` only uses the HTTPS proxy with `NODE_USE_ENV_PROXY=1` (the `download` script sets it).
- Hosts that must be allowed: `football-data.co.uk` (+ `www.`), `api.oddspapi.io`, `api.the-odds-api.com`.

## 5. Backtest results

_Pending — filled in as runs complete._

## 6. Decisions & open questions

- Defaults chosen while the user's answers are pending (2026-10-24): football 1X2 + O/U 2.5; one
  pick per match; weekly Mon–Sun rounds; BFE reference; single-book (B365/BW/…) vs four-book
  scenarios; equal-return vs equal staking both tested.
- Open (user): which LT books they hold; weekly budget/bankroll beyond the €1,000 simulation;
  other sports.
