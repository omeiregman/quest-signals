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

**D3 — How sharp is each reference, by league? (median 1X2 overround, pre-match)**

| league group | BFE (exchange) | PS (Pinnacle, 25/26) | B365 | BW |
|---|---|---|---|---|
| Top 5 (E0, D1, I1, SP1, F1) | **0.7–1.1%** | 3.4–3.5% | 5.4–5.5% | 5.8–5.9% |
| 2nd tiers / mid leagues (E1, D2, I2, SP2, F2, N1, B1, P1, T1) | 1–3.7% | 4.3–5.3% | 5.6–11% | 5.8–10% |
| Lower (E2, E3, SC0) | 1.9–3.2% | 5.3–6.3% | 7.6–8.8% | 7.3–7.6% |
| Thin (EC, SC1, SC2, SC3, G1) | **4.7–10.2%**, p90 up to 42% | 5.8–8.5% | 7.7–11.5% | 7.1–12.3% |

- Exchange back prices are near-fair where liquid, but in thin leagues they are wide and stale:
  a BFE "true probability" there is unreliable. The sweep tests a reference-overround cap of
  **3% (liquid only) vs 8%**. Soft-book margins are also higher in lower leagues (B365 ~8–11%).
- O/U 2.5: BFE median 0.8–1.9% in top leagues; B365 O/U margin ≈ 5.3–6.2% everywhere.

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

**D4 — Data quality (loader run, 2026-10-24).** 7,646 played matches in 2025/26, 1,792 in 2026/27
(to 19 Oct). Earlier row counts (8,297 / 1,844) included blank CSV lines.
- **Pinnacle disappears mid-2025/26**: ~all matches Aug–Oct 2025, ~40% Nov–Dec, ~20% Jan, 0% from
  Feb 2026 (38% overall). PS is only a cross-check for Aug 2025 – Jan 2026.
- **BFE pre-match is sometimes junk**: ~19% of 1X2 markets have overround > 5%, 8% > 10%, worst 1%
  at 77–156% (e.g. Gent v St. Gilloise `[1.09, 4.2, 1.59]`). BFE *closing* is clean (worst 1%
  ≈ 3–4%). ⇒ the reference-overround cap is essential; CLV against BFE closing is trustworthy.
- `Max`/`Avg` columns contain bad values (e.g. Max `[1.62, 17, 251]`) → never treat Max as bettable.

**R1 — Value census: genuine value at UK soft books is rare (`pnpm … census`).** Flat €1 singles,
one bet per match (highest edge), power de-vig vs Betfair Exchange, 22 leagues.

2025/26 (45 weeks, 7,646 matches):

| setup | edge ≥ | bets | per week | avg odds | ROI ± SE | CLV ± SE |
|---|---|---|---|---|---|---|
| Bet365 only, 1X2, liquid ref (≤3%) | 1% | 40 | 0.9 | 3.85 | −22.5% ± 23.1% | −1.38% ± 1.00% |
| Bet365 only, 1X2, liquid ref | 3% | 8 | 0.2 | 4.31 | −55% ± 45% | +0.47% ± 2.21% |
| 4 books, 1X2+O/U, liquid ref | 0% | 534 | 11.9 | 3.06 | −6.5% ± 6.0% | −0.19% ± 0.26% |
| 4 books, 1X2+O/U, liquid ref | 1% | 168 | 3.7 | 3.47 | −2.0% ± 11.7% | +0.14% ± 0.44% |
| 4 books, 1X2+O/U, liquid ref | 2% | 74 | 1.6 | 3.90 | +0.2% ± 19.3% | +0.07% ± 0.74% |
| 4 books, 1X2+O/U, liquid ref | 3% | 27 | 0.6 | 4.19 | −13.1% ± 34.5% | +0.80% ± 1.30% |
| 4 books, thin refs allowed (≤8%) | 2% | 154 | 3.4 | 3.89 | −3.4% ± 12.3% | **−1.06% ± 0.67%** |
| 4 books, Pinnacle ref (Aug–Jan) | 2% | 167 | 3.7 | 4.68 | −4.8% ± 13.3% | +0.41% ± 0.68% |
| 4 books, Pinnacle ref | 5% | 58 | 1.3 | 5.72 | −19.0% ± 23.9% | +2.34% ± 1.48% |

2026/27 (13 weeks to 19 Oct, 1,792 matches) — small samples:

| setup | edge ≥ | bets | per week | ROI ± SE | CLV ± SE |
|---|---|---|---|---|---|
| 4 books, liquid ref | 1% | 52 | 4.0 | +16.5% ± 21.9% | +1.35% ± 1.36% |
| 4 books, liquid ref | 2% | 24 | 1.8 | +38.5% ± 35.3% | +4.96% ± 2.07% |
| 4 books, thin refs allowed | 2% | 44 | 3.4 | +37.4% ± 24.1% | +2.93% ± 1.88% |

What this says:
1. **Volume is the binding constraint.** Against a sharp, liquid reference, the big UK books'
   Friday prices beat fair odds by ≥2% only ~1–2 times a week *across all 22 leagues and four
   books*; with ONE account it's ~0.4/week. A 5–8-pick weekly slate of real value bets cannot be
   filled from these books.
2. **No proven edge in 2025/26.** Every ROI is within ~1 SE of zero or negative, and CLV is ≈ 0
   (±0.3–1%). The flagged "edges" (avg 2–4%) did not show up as closing-line value: they are mostly
   noise in the Friday snapshot, not mispricing.
3. **The longshot trap is real in this data.** Odds 8–15 lost every bet in most setups and CLV
   there is −4.7% to −9.5%. Letting thin reference markets in (≤8%) adds volume but turns CLV
   **negative** (−1.06% ± 0.67% at ≥2%) — fake value, exactly as feared in F4.
4. **2026/27 looks better (CLV +5% ± 2% at ≥2%) but on 24 bets** — encouraging, not evidence.
   It is the out-of-sample period, so it stays on watch as more weeks arrive.
5. UK books are the most efficient soft books in Europe. Whether **Lithuanian books** (7bet,
   Betsson LT, Topsport, Optibet, OlyBet) are softer — more and larger mispricings — is now the
   decisive open question. July live polling (STATUS.md) saw ~23 credible 2–5% value bets in 3
   weeks on a handful of tournaments at 7bet/Betsson vs Pinnacle, which hints they are; it must be
   verified with historical LT odds + CLV (OddsPapi `/v4/historical-odds`).

**R1b — Other references don't rescue it (CLV always graded on BFE closing).**
- *Market average* (Kaunitz-style consensus) as reference, 4 books: edge ≥0% → 368 bets
  (8.2/wk), CLV **−0.94% ± 0.43%**; ≥2% → 33 bets, CLV +2.3% ± 2.6% (noise). 2026/27: CLV −2.3%.
- *Pinnacle* as reference: CLV vs PS's own closing looked ≈ +0.4%, but **vs BFE closing it is
  −3.2% ± 0.8% at ≥2% and −5.3% at ≥5%**. Pinnacle's 2025/26 football-data prices look stale
  (its public API closed Jul 2025, and coverage fades out by Feb 2026) → "value" vs PS there is
  largely PS lag. Do not trust PS in this data.

**R2 — Slate sweep (`pnpm … sweep`).** 46,080 configs (144 candidate setups × 320 slate rules) ran
in 32 s, but with ≥150 picks + ≥25 played weeks required, **zero configs were eligible** — a direct
consequence of R1's volume problem. Ranking thousands of configs on a few dozen bets would be
curve-fitting noise, so no "best formula" is reported from it.

**R3 — Week-by-week replay, €1,000 start (`pnpm … report` → `docs/value-slate/report.html`).**
Five strategies, set by hand from the 2025/26 census (not tuned on profit). All use equal-return
staking with the one-winner rule (Σ1/odds ≤ 1), one pick per match, Mon–Sun weeks, picks added
best-edge-first. Liquid ref = BFE with overround ≤ 3%, power de-vig, 1X2 + O/U 2.5.

| strategy | rules | 25/26 weeks bet | bets | CLV ± SE | €50/wk | €100/wk | €200/wk | 10% of bank |
|---|---|---|---|---|---|---|---|---|
| Strict value | 4 books, edge ≥2%, odds 1.5–8, ≤8 picks | 31/45 | 59 | **+1.45% ± 0.69%** | €1,374 | **€1,749** | €2,497 | €1,518 |
| Loose value | as Strict, edge ≥1% | 38/45 | 93 | +0.75% ± 0.58% | €911 | €821 | €643 | €718 |
| One account | Bet365 only, edge ≥1% | 27/45 | 39 | −0.99% ± 0.97% | €765 | €530 | €59 | €503 |
| Thin markets allowed | Strict but ref ≤ 8% | 35/45 | 81 | −0.68% ± 0.92% | €845 | €690 | €223 | €606 |
| Fill the slate | edge ≥0%, ≤5 picks | 42/45 | 114 | +0.77% ± 0.60% | €817 | €635 | €270 | €604 |

2026/27 so far (13 weeks, final bankroll at €100/wk): Strict €1,024 (17 bets, CLV +6.1% ± 2.7%),
Loose €1,338 (CLV +3.1% ± 2.3%), One account €786, Thin €1,308, Fill €977.

Strict, €100/wk, bankroll at each month end (by week start): Aug €1,155 · Sep €1,060 · Oct €1,391 ·
Nov €1,466 · Dec €1,383 · Jan €1,412 · Feb €1,884 · Mar €1,904 · Apr €1,704 · May €1,749.

What this says:
1. **Slates are tiny**: 1.4–2.7 bets per week played, and 7–18 of 45 weeks have no qualifying bet
   at all. So weeks with no winner are far more common than F2's table: 38–67% of weeks played
   lost every bet (one pick at odds ~3.7 loses ~73% of the time).
2. **Profit is mostly luck at this sample size.** Strict's +€749 (2025/26, €100/wk) is a per-week
   ROI of +24% ± 29% — within one SE of zero. Re-running the same bets 1,500 times at the
   estimated fair odds gives only ~52% chance of finishing the season up, even if the edges are real.
3. **The one hopeful signal is CLV on Strict**: odds capped at 8 + liquid reference + edge ≥2%
   beat the closing price by +1.45% ± 0.69% (≈2.1 SE) in 2025/26 and +6.1% ± 2.7% in 2026/27
   (76 bets total). Caveat: the odds cap of 8 was chosen after seeing that odds 8–15 lost in the
   2025/26 census, and 2026/27 headline census numbers had been seen too — a lightly used check,
   not a clean holdout. Every week from 2026-10-24 on is genuinely out of sample.
4. **What clearly fails**: a single UK account (CLV −1%, worst bankroll), trusting thin exchange
   markets (CLV −0.7%), and any longshot-heavy selection.
5. **Bigger weekly budgets magnify whatever happens** (€200/wk: Strict €2,497, One account €59,
   Thin €223 with a 92% drawdown). % of bankroll staking softens busts but not the sign.

**R4 — Research cross-check (`docs/value-slate/research.md`; key number re-verified 2026-10-24).**
- Buchdahl's public archive of 20,380 live value bets (≥2% vs de-vigged Pinnacle, Aug 2015 –
  Jun 2025; `football-data.co.uk/Wisdom_of_crowd_bets.xlsx`), re-computed independently:
  odds <4 **+4.36%** (n=15,385, exp +3.64%); odds ≥4 **−0.68%** (n=4,995, exp +5.35%);
  since Jul 2022: odds <4 **+4.17%** (n=3,147), odds ≥4 **−13.1%** (n=1,084). Profit column checks
  out against level-stake results. ⇒ the edge that exists is at **short odds**; the one-winner rule's
  pull toward odds 4–10 points straight at where value has historically failed.
- Edge size: 2–3% edges ≈ break-even (+0.1%), 3–8% best, >8% lose (longshots/stale). Cap ≈ 12–15%.
- De-vig: additive ≡ Buchdahl's margin-proportional-to-odds; additive/power calibrate far better
  than multiplicative in the tails (our code defaults to power).
- Staking: growth-optimal weekly total ≈ 1.25 × edge (2.5% of bankroll at a 2% edge); use
  ~half: **1.5–2% of bankroll per week** (€15–20 on €1,000). At a true 2% edge, €100/wk from
  €1,000 → ~18% chance of ruin within 3 seasons; €50/wk → ~2% (agent's Monte Carlo).
- Limits: UKGC — restricted accounts 1.8× as likely to be in profit; most cut to <10% of normal
  max stake. Kaunitz et al. limited within ~5 months. No evidence either way for LT books.
- **Volume discrepancy to keep in mind:** the research agent, using *Pinnacle* Friday fair odds
  (additive, 2019–26) with the same four books, found a median of ~8 eligible ≥2% picks per week;
  our *BFE ≤3% overround* reference gives ~1.6/week. The reference filter drives volume. Pinnacle
  is gone from football-data after Jan 2026, but OddsPapi still carries a `pinnacle` feed for
  live use — compare both references on live data.

**R5 — "Short odds" strategy (added after R4; rules from Buchdahl's evidence, not our data).**
Edge 3–12%, odds 1.5–4, liquid BFE ref, 4 books, one-winner rule. 2025/26: 21 bets in 13 of 45
weeks, CLV **+2.27%**; 2026/27: 7 bets, CLV **+5.07%**. Right direction, far too few bets — real
short-odds value at UK books appears about once every two weeks.

**R6 — Where volume comes from (2026-10-24, after the user asked for 7+ games a week).**
Short-odds rule (1X2, edge 3–12%, odds ≤ 4, BFE ≤3% overround, power de-vig), bets per week:

| bookmakers you can bet at | 2025/26 | 2026/27 |
|---|---|---|
| 1 (Bet365) | 0.2 | 0.2 |
| 4 (B365, BW, BV, BFD) | 0.5 | 0.5 |
| 9 named UK books | 1.5 | 0.7 |
| market best price ("Max", ~all books; upper bound, has bad values) | 3.0 | 1.2 |

- **Buchdahl's archive averaged ~46 value bets per week** (median 46, 448 weeks), and the price came
  from **96 different bookmakers** (Interwetten 20%, bet365 15%, Coolbet 10%, EFbet 6%, BetVictor
  5%, …). The volume of a working value system comes from **how many books you can bet at** (and a
  sharp reference that covers every league — Pinnacle), not from how many games exist.
- **16 extra football leagues** (football-data `/new/{ARG,AUT,BRA,CHN,DNK,FIN,IRL,JPN,MEX,NOR,POL,
  ROU,RUS,SWE,SWZ,USA}.csv`; closing prices only; ~89 matches/week since Jul 2025, many in the
  European summer): B365 closing vs BFE closing gives 0.6 value bets/week; best market price 4.4.
- **The one-winner rule and "7+ games" conflict.** To keep Σ1/odds ≤ 1 with 7 picks, the average
  pick needs odds ≈ 7 — the longshot zone where value has historically failed (R4). With 7 picks at
  odds ~2.5 instead (equal stakes), P(every bet loses) falls to 2.8% (vs ~34% under the rule), but
  one winner returns only 36% of the stake; ~3 winners are needed to break even (58% chance at
  fair odds). More short-odds picks reduce wipe-outs; they don't change the average result.
- Other sports with far more fixtures (tennis, basketball, ice hockey) need other data: tennis-data
  .co.uk (host currently blocked by the environment network policy) or OddsPapi historical (all
  sports, includes 7bet.lt + betsson + pinnacle; needs `ODDSPAPI_API_KEY`).

**R7 — Six seasons with Pinnacle as referee: the short-odds rule holds (2026-10-24, `pnpm … history`).**
Data: 2019/20–2024/25, 22 leagues, **45,684 matches**, Pinnacle pre-match + closing on ~99–100% of
matches (from Pinnacle's live API, before it closed in Jul 2025). Rule fixed in advance from
Buchdahl's record: power de-vig of Pinnacle (skip if Pinnacle overround > 8%), bet odds 1.5–4 that
a soft book prices 3–12% above fair, best book per match, one bet per match, 1X2 + O/U 2.5. Graded
on Pinnacle closing.

| setup | bets | per week | ROI per bet ± SE | CLV ± SE | seasons with CLV > 0 |
|---|---|---|---|---|---|
| best of 12 UK/EU books (B365, BW, IW, WH, VC, BV, BFD, BMGM, CL, LB, PP, SKB) | **1,619** | **6.0** | **+6.4% ± 3.5%** | **+3.32% ± 0.24%** | 6/6 (1.45% … 4.42%) |
| Bet365 only | 826 | 3.0 | +8.4% ± 5.3% | +2.34% ± 0.33% | 6/6 (0.77% … 4.22%) |

Per season (12 books): 19/20 CLV +4.42% (327 bets), 20/21 +1.45% (317), 21/22 +4.02% (383),
22/23 +3.24% (224), 23/24 +3.32% (204), 24/25 +3.22% (164). ROI per season +5.2, +4.3, +16.6,
+11.0, −7.4, −0.4% (each ± 7–11%). Volume falls from ~8/wk (2020–22) to ~4/wk (2023–25).

Robustness (12 books unless noted):
- **Independent referee:** 2024/25 graded on *Betfair Exchange* closing instead: CLV **+2.54% ± 0.66%**
  (vs +3.22% on Pinnacle closing). Not an artifact of Pinnacle's own data.
- League groups: top 5 +2.80%, 2nd tiers/mid +2.88%, E2/E3/SC0 +3.05%, thin (EC/SC1–3/G1) +4.14%.
- Markets: 1X2 +3.34% (1,533 bets), O/U 2.5 +3.04% (86). Selections: Home +4.67%, Draw +1.96%,
  Away +4.10%, Over +2.20%, Under +3.73%.
- By the book that had the best price: B365 +2.31% (798), WH +5.27% (410), IW +3.97%, VC +1.03%,
  BW +5.04%. All positive.
- Edge bands (odds 1.5–4): 1–2% → CLV +0.78%, 2–3% +1.19%, 3–5% +2.17%, 5–8% +4.36%, 8–12% +8.26%,
  12–30% +11.2% (likely stale/error prices). Stricter **5–12%**: 615 bets (2.3/wk), CLV +5.28% ±
  0.47%, ROI +15.4% ± 5.9% — chosen after seeing this table, so treat as a hypothesis.
- Odds bands (edge 3–12%, any odds): CLV positive up to ~15 (+1.4% at 8–15) but ROI far noisier;
  unlike Buchdahl's record, long odds don't turn CLV negative here. Odds cap 4 kept (his evidence).

Weekly slates, €1,000 start, all six seasons in a row (272 weeks):
- **Flat, every qualifying bet (≤15/wk), 12 books:** 6.2 picks per week played, ≥5 picks in 152
  weeks, ≥7 in 105; 17% of weeks lost every bet. **€10 per bet → €1,832** (staked €15,810, +5.3%,
  low €945, worst drop 20%); €5/bet → €1,416; 1% of bankroll per bet → €2,019 (worst drop 22%).
  Fixed weekly budgets weight thin weeks too heavily: €20/wk → €1,059, €100/wk → €1,297.
- **Flat, Bet365 only:** €10/bet → €1,705 (staked €8,250, +8.5%); 1%/bet → €1,839.
- **One-winner rule, 12 books:** 2.3 picks/wk, CLV +4.5%, 35% of weeks lost every bet; €100/wk →
  €1,652 (worst drop 45%).

What this says:
1. **The rule works on history when the referee covers every league.** Pinnacle prices every match
   reliably; Betfair Exchange (≤3% overround) doesn't — that alone explains ~15× more bets for Bet365
   (3.0/wk vs 0.2/wk). The 2025/26–2026/27 exchange results were a referee problem, not a rule problem.
2. **Per-bet flat staking** (same € on every bet) fits this rule better than a weekly budget.
3. **Caveats:** the rule comes from Buchdahl's record over the same years (a re-check with different
   books and code, not a blind test); football-data prices may not all have been bettable at the
   quoted stake; soft books limit winners; LT books untested; Pinnacle's free API is gone, so live
   use needs a Pinnacle feed (OddsPapi lists `pinnacle`) or another sharp reference.
4. **Tennis:** tennis-data.co.uk refuses automated downloads (site-side 403). Not worked around;
   needs the user to download the files manually, or OddsPapi.

**R8 — Half-season test and scaling to €10k–€20k (2026-10-24). User's frame: judge over half a
season; goal €10–20k profit; moderate exposure; "can I dump this idea?"**
Pinnacle short-odds rule, flat €1 per bet, actual half-seasons (H1 = Aug–Dec, H2 = Jan–May):

| half | 12 books: bets, profit | Bet365 only: bets, profit |
|---|---|---|
| Aug–Dec 2019 | 190, +6.4% | 129, −1.1% |
| Jan–May 2020 | 121, +2.7% | 79, +12.3% |
| Aug–Dec 2020 | 145, −5.4% | 76, +6.1% |
| Jan–May 2021 | 188, +12.1% | 81, +23.6% |
| Aug–Dec 2021 | 177, +14.8% | 91, +13.1% |
| Jan–May 2022 | 206, +18.2% | 81, +32.1% |
| Aug–Dec 2022 | 100, +0.8% | 51, +3.8% |
| Jan–May 2023 | 124, +19.3% | 53, +28.5% |
| Aug–Dec 2023 | 91, −1.3% | 38, −11.0% |
| Jan–May 2024 | 113, −12.3% | 54, +0.2% |
| Aug–Dec 2024 | 95, +7.2% | 48, +13.1% |
| Jan–May 2025 | 69, −10.9% | 45, −43.7% |
| **in profit** | **8 of 12** | **9 of 12** |

The last four halves (2023–25) were profitable only once with 12 books, even though CLV stayed
positive (+3.3%) — luck, a shrinking edge, or both (Buchdahl's record also decayed after 2022).

Monte Carlo of one half-season (bets resampled from history, true edge = measured CLV):
- 12 books, ~135 bets, edge 3.3%: P(losing money) **39%**; to *expect* €10,000 needs **€2,140 per bet**
  (≈ €290,000 turnover), worst 1-in-20 half-season **−€47,000**; for €20,000: €4,290/bet, worst
  1-in-20 −€94,000. Even at a 5% edge: €1,440/bet for €10k, P(loss) 34%, worst 1-in-20 −€29,000.
- Bet365 only, ~69 bets, edge 2.3%: €6,040/bet for €10k, P(loss) 45%, worst 1-in-20 −€112,000.

**Verdict on the user's goal: dump it as a way to make €10–20k a half-season.**
1. Half a season is too short for this edge: even if the edge is real, roughly 4 halves in 10 lose.
2. The stakes needed (€1.5k–6k per bet, €200k–400k turnover per half) are far beyond what soft
   bookmakers accept from winning accounts. UKGC data: winners are 1.8× more likely to be
   restricted, and most restricted accounts are cut to <10% of the normal maximum. LT books will
   behave the same or worse (unverified, but there is no reason to expect otherwise), and there are
   only ~7 of them.
3. No staking formula fixes this: the expected value of any staking plan is the sum of the bets'
   expected values (optional stopping), so no system turns a small edge into a large, safe profit.
4. Everything with a real edge in this space — value betting against a sharp price (this work),
   arbitrage (STATUS §7), bonus/promotion extraction, or a model that beats the sharpest prices —
   is limited by how much soft bookmakers let a winner stake, or needs sharp books/exchanges that
   can't be funded from Lithuania under the 2025 payment-blocking law. None meets "€10–20k per half
   season with limited exposure" from LT-licensed books.
5. What remains true: the edge looks real at small stakes (CLV +3.3% over 1,619 bets). Viable only
   as a small side activity, at stakes the books will take, until accounts get limited.

**R9 — Compounding bankroll scenarios, accumulators, automation (2026-10-24).** Monte Carlo, bets
resampled from the 1,619 Pinnacle short-odds bets (12 books, ~135 per half, ~270 per season),
win chance at a true edge of 3.3% (measured CLV), stake a fixed % of the current bankroll per bet:
- 1% per bet: half-season median ×1.032 (10th–90th pct ×0.84–×1.27), P(loss) 42%; season median
  ×1.062 (×0.80–×1.42), P(loss) 39%; three seasons ×1.21 (×0.73–×2.03), P(loss) 32%.
- 2% per bet: season median ×1.068 (×0.61–×1.92), P(loss) 44% — barely more typical profit, twice
  the swings (above Kelly ≈ 1.6% per bet at odds ~3).
- At a 2% true edge, 2% per bet has median ×1.00 per season: no growth.
- Reinvesting from €1k to €10k at the median rate: ~35–39 seasons. Typical €10k profit in one season
  needs ~€160k in play (≈ €1,600 per bet); €20k needs ~€320k.
- Value accumulators (legs drawn from the same bets, 3.3% edge each): 3 legs odds ~26, wins 5.3%
  of tickets, edge ~10%; 5 legs odds ~223, wins 0.8%, edge ~18%; 8 legs odds ~5,700, wins 0.04%,
  edge ~30%. The edge compounds only if every leg has one; ordinary legs compound the bookmaker's
  margin against you. Same capacity limits; far more lottery-like.
- Automation: LT soft books offer no betting API and forbid automated betting; we declined to build
  automation disguised to evade detection. Legitimate path: the system finds bets and alerts, the
  user places them by hand. Unlicensed foreign books are blocked by LT's 2025 payment law — not
  pursued.

**R10 — Ceiling by hit rate, last full Pinnacle season 2024/25 (2026-10-24).** Pinnacle short odds,
12 books: 164 bets, average odds 3.12, actual hit rate 33.5%, break-even ≈ 32%.
€1,000 start, flat €10/bet profit (vs compounding 1% of bankroll per bet, end bankroll):
100% won +€3,471 (€30,929) · 90% +€2,960 (€18,830) · 80% +€2,449 (€11,117) · 60% +€1,426
(€4,001) · 50% +€915 (€2,438) · 40% +€404 (€1,487) · **actual −€7 (€976)**. €2,000 doubles every
figure. At odds ~3 the bets are meant to win ~1 in 3; the edge lives between 32% and ~35%.
User floated betting via non-LT payment routes / Nigerian identity while living in LT: noted that
gambling rules and bookmaker KYC follow residence; not pursued, and it wouldn't fix soft-book
limits anyway (sharp books that take big stakes are the reference this method can't beat).

**Published page:** https://claude.ai/artifact/Mn9pnZ8tzUpUHgwCjAp1oP (private to the user;
source `docs/value-slate/report.html`, regenerate with `pnpm --filter @quest/backtest report`
then republish).

**Plain-language guide:** https://claude.ai/artifact/RqFF7KXzQWmQVZQiDRw2WG (source
`docs/value-slate/guide.html`, hand-written; numbers copied from R3–R6 — update by hand if they
change). Glossary, the six strategies, a games×odds×edge calculator, volume levers, next steps.

## 6. Decisions & open questions

- Defaults chosen while the user's answers are pending (2026-10-24): football 1X2 + O/U 2.5; one
  pick per match; weekly Mon–Sun rounds; BFE reference; single-book (B365/BW/…) vs four-book
  scenarios; equal-return vs equal staking both tested.
- Open (user): which LT books they hold; weekly budget/bankroll beyond the €1,000 simulation;
  other sports.

## 7. Next steps (in order)

User decision pending (2026-10-24): the user wants ≥5, ideally 7+ games per week. Explained (guide +
R6) that 7+ picks and the one-winner rule conflict (forces odds ≈7); recommended 7+ short-odds picks
with flat ~2%-of-bankroll weekly stakes and no one-winner rule, if volume allows.

1. **LT prices.** Add `ODDSPAPI_API_KEY` to the environment → pull `/v4/historical-odds` for
   recent fixtures with `7bet.lt,betsson,pinnacle` (3 books = 1 request per fixture, ~200
   fixtures/month on the free tier) → add an OddsPapi loader that emits `HistoricalMatch` (results
   from football-data by team/date) → rerun `census` on LT books. This decides whether the plan
   can work at all.
2. **Short-odds rule as the default**: odds ≤ 4, edge 3–12%, additive/power de-vig, liquid sharp
   reference, one pick per match; weekly total stake ≈ 2% of bankroll.
3. **Wire it live**: reuse the existing poller + CLV capture; generate a weekly slate from
   live LT prices; log every placed bet's CLV. Gate: ≥300 bets with mean CLV > 0 at p < 0.05
   before raising stakes.
4. **Poll more often** if the budget allows: Friday snapshots keep only ~a third of the edge.
5. Expect account limits; spread across the LT books the user can fund.
