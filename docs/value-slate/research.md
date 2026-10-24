# Value Slate: Literature & Evidence Review

**Date:** 2026-10-24 · **Scope:** the evidence behind the weekly "value slate" (soft-book odds above a de-vigged sharp price; equal-return staking so any single winner returns the week's stake, i.e. Σ1/oᵢ ≤ 1).

**Tags:**
- [peer-reviewed]: journal article.
- [independent analysis]: work not produced by a bookmaker, or our own computation.
- [official/regulator].
- [industry/marketing — treat with caution]: operator, vendor, affiliate or tipster material.

**Source notes.**
- Joseph Buchdahl (football-data.co.uk) is tagged [independent analysis] because his archives are public. He has conflicts: his site's revenue comes from "losses accrued by customers of banner-advertised bookmakers", and he writes for Pinnacle.
- **Own computation** means our own analysis (2026-10-24) on football-data CSVs (22 leagues, 2019/20–2026/27, 55,122 matches) and on Buchdahl's bet archive. It can be re-run but is unreviewed.

---

## Key takeaways for our system

1. **Cap pick odds below 4.0, and never above 5.0.** Buchdahl publishes his picks before kick-off. His record covers 20,380 bets from 2015 to 2025, each with ≥2% value against de-vigged Pinnacle.
   - Odds <4: **+4.36%** realised (n=15,385; +3.64% expected).
   - Odds ≥4: **−0.68%** (n=4,995) against **+5.35%** expected.
   - Odds ≥4 in 2022–25 alone: **−13.1%** (n=1,084).

   *(own computation on [the archive](https://www.football-data.co.uk/Wisdom_of_crowd_bets.xlsx))* [independent analysis]
2. **The cover rule doesn't need longshots.** Σ1/o ≤ 1 is met by 2×2.0, 3×3.0 or 2.5+3.5+6.0.
   - With four soft books, the median week has 8 eligible value picks (one per match) with Σ1/o ≈ 2.2, so a short-odds slate is feasible.
   - Whatever the odds, P(no winner) is 25–34% per week *(own computation)*.
3. **De-vig method:**
   - Use **additive or power** on Pinnacle and on soft books. Buchdahl's "margin proportional to odds" *is* additive: 1/O_fair = 1/O − M/n.
   - Multiplicative overstates longshot probability. Fair odds were tested against results on 48,593 Pinnacle-closing matches (2019–26); 0 would mean correctly priced. Multiplicative returned −2.5% at odds 4–6, −5.6% at 6–10 and −23.9% at ≥10. Additive returned −0.5%, +0.2% and −9.5%.
   - On Betfair-exchange back prices with a large overround, use multiplicative: additive and power break down there.

   *(own computation)*
4. **Edge threshold: 3% ≤ EV ≤ about 8%, measured against the Friday sharp price.** By EV band in Buchdahl's archive:
   - 2–3%: +0.11% realised against +2.45% expected (n=8,614).
   - 3–5%: +4.77% (n=7,548).
   - 5–8%: +7.24% (n=2,954).
   - 8–12%: **−3.49%** against +9.50% expected (n=898, average odds 6.4).

   Treat EV above about 15% as a data error or stale price. In a replication of a published tennis betting study, [Clegg & Cartlidge](https://arxiv.org/abs/2306.01740) found that one bet at mispriced odds produced most of the reported profit [independent analysis].
5. **Expect about a third of Friday EV to survive to kick-off.** Our simulation took the best Friday price across four soft books (B365/BW/BV/BFD).
   - Average EV on Friday: +4.41%.
   - Closing-line value (CLV) against Pinnacle's close: only +1.49%.
   - At odds 4–10, mean log-CLV (the average of log(odds taken ÷ fair closing odds)) was **−0.7%** *(own computation)*.
   - Value found more than 24h before kick-off kept between −1% and 26% of its EV ([Buchdahl/ValueBetFactory, Oct 2026](https://www.football-data.co.uk/blog/pinnacle_limit.php)).
6. **Choice of sharp reference.** BFE below is Betfair Exchange.
   - At the close, BFE and Pinnacle are equally accurate (log-loss 0.99921 vs 0.99927, n=10,513).
   - On Friday, outside the top-5 leagues, BFE back prices are *less* accurate than bet365 (1.0241 vs 1.0159).
   - So use BFE only when its 1X2 overround is ≤1.03. Otherwise fall back to Pinnacle or the market average *(own computation)*.
7. **Stake size.**
   - The growth-optimal (Kelly) total weekly stake is about **1.1–1.5× the edge**. For example, 5 picks at odds 5 with a 3% edge gives 3.75% of bankroll per week. Staking twice that gives about zero expected growth.
   - Flat €100/week on a €1,000 bankroll carries a 17.6% chance of losing the whole bankroll within 3 seasons, even with a true 2% edge.
   - Recommended: **≤ half Kelly, about 1.5–2% of bankroll per week in total** *(own computation; see [Baker & McHale 2013](https://ideas.repec.org/a/inm/ordeca/v10y2013i3p189-199.html) on scaling Kelly down when the edge is uncertain)*.
8. **Judge by CLV, not P/L.**
   - Proving a 3% edge from profit and loss takes 8,700–21,900 bets at odds 3–6.
   - CLV needs about **75 bets** at odds <4, and about 700 for a mixed-odds slate.
   - Go/no-go rule: at least 300 bets with mean CLV > 0 at p < 0.05.
9. **Expect stake limits within weeks to months.**
   - Kaunitz et al. were capped below $50 within 5 months (265 real bets).
   - UK regulator data: restricted accounts were **1.8×** as likely to be in profit as other active accounts. Among accounts with a reduced stake limit, 58.6% could stake ≤9% of the normal maximum ([UKGC 2025](https://www.gamblingcommission.gov.uk/blog/post/commercial-restrictions-by-betting-operators)) [official/regulator].
   - With about 7 LT-licensed books, how long accounts last is the real limit on capacity.
10. **football-data coverage.**
    - Pinnacle 2025/26 runs only from **25 Jul 2025 to 15 Jan 2026** (38% of matches).
    - BFE starts in **2024/25**.
    - **2024/25 is the only season with both Pinnacle and BFE ≥99%**, so use it to calibrate BFE.
    - "Pre-closing" odds are snapshots taken Friday afternoon for weekend games and Tuesday afternoon for midweek ([notes.txt](https://www.football-data.co.uk/notes.txt)) [data-provider documentation].

---

## 1. Is betting soft books above a sharp/consensus price profitable?

**Kaunitz, Zhong & Kreiner (2017), [arXiv 1710.02824](https://arxiv.org/abs/1710.02824)** [independent analysis; preprint, no journal version found].
- **Method.** Consensus probability p_cons = 1/(mean odds across up to 32 bookmakers). A regression on 479,440 games found consensus odds well calibrated after a small intercept (α = 0.034 home, 0.057 draw, 0.037 away).
- **Bet rule.** Bet when the best price > 1/(p_cons − 0.05). This is an *absolute* 5-percentage-point gap, so the required relative edge is far bigger on longshots: at p=0.5 the minimum price is 2.22, at p=0.2 it is 6.67.
- **What it bet on.** Picks averaged odds **2.30**: 59.5% home bets, 38.4% away and only 2.1% draws.
- **Results:**

| Test | Bets | Return |
|---|---|---|
| Backtest at closing odds, 2005–15 | 56,435 | +3.5% |
| Odds 1–5 hours before kick-off | 6,994 | +9.9% |
| Real money, $50 stakes | 265 | +8.5% |
| Paper + real combined | 672 | +6.2% (p=0.089, not significant) |

- **Execution and limits.** About 30% of on-screen prices had already changed at the bookmaker. Bookmakers then "began to severely limit our accounts" (the paper says both "a few weeks" and "a few months" in), ending the experiment. I found no independent replication or critique.

**Buchdahl, "Wisdom of the (Pinnacle) Crowd"** ([PDF](https://www.football-data.co.uk/The_Wisdom_of_the_Crowd_updated.pdf); from *Squares & Sharps*, 2016) [independent analysis].
- **Pinnacle's close is a fair benchmark.** He de-vigged Pinnacle's closing odds and level-staked every outcome (410,628 prices, 2007–16). Yield by de-vig method:
  - equal-margin: −0.56%;
  - margin-proportional-to-odds: +0.10%;
  - odds-ratio: −0.20%;
  - logarithmic: +0.07%.
- **UK books are the less efficient side.** Expected return of bet365, BetVictor, Ladbrokes and William Hill prices, measured against Pinnacle-fair odds, matches realised return about 1:1. Fair prices built from those UK books do not predict returns at Pinnacle.
- **Best market price against Pinnacle-fair, at >2% value (2012–17):**
  - margin-proportional model: 14,967 bets, +5.71% realised vs +4.23% expected, average odds 3.82;
  - equal-margin model: +3.34% vs +5.16%, average odds 5.31. Without an FLB correction, longshots slip through.
- **Fair odds at bet time vs at the close** (26,960 bets): +4.90% realised, against +4.13% expected at bet-time fair odds and only +2.88% at closing fair odds. "As much as a third" of value bets lose all their value by the close ([source](https://www.football-data.co.uk/blog/wisdom_of_crowd_betting_system_closing_odds.php)).
- **Our recomputation of the full archive:** +3.12% realised vs +4.06% expected; **2022–25: −0.25% vs +4.10%** (n=4,231; z = −1.73 against expected). Publication stopped in 2025/26 when Pinnacle's free API ended ([page](https://www.football-data.co.uk/wisdom_of_crowd_bets)).

**Supporting peer-reviewed work:**
- [Franck, Verbeek & Nüesch 2010](https://www.zora.uzh.ch/entities/publication/a1b0f975-143f-4cfb-90df-42de610bf5c9): Betfair's implied probabilities forecast better than bookmakers'. Betting bookmaker odds above the exchange's gave "above average, and in some cases even positive returns" [peer-reviewed].
- [Angelini & De Angelis 2019](https://cris.unibo.it/handle/11585/646980): taking the best odds, 3 of 11 leagues were exploitable [peer-reviewed].
- [Elaad, Reade & Singleton 2020](https://ideas.repec.org/a/eee/finlet/v35y2020ics1544612319306440.html): the market as a whole is unbiased, but individual books don't fully use rivals' prices, which is the premise of value betting [peer-reviewed].

## 2. Favourite–longshot bias (FLB)

- **Size of the effect.** [Hegarty & Whelan, IJF 2025](https://mpra.ub.uni-muenchen.de/116925/) studied 84,230 matches in the same 22 leagues, 2011/12–2021/22, at average closing odds.
  - Lowest-probability decile (p≈14%, odds ≈7): **−17%**.
  - Top decile (p≈63%): **−2%**.
  - The fall is strongly nonlinear and survives league and season controls.
  - Draws do slightly *better* than other bets of the same probability. Asian handicap odds show no FLB.

  [peer-reviewed]. Their [2025 working paper](https://www.karlwhelan.com/Papers/OEP.pdf) (150k+ games) attributes FLB to imperfect competition among retail books [independent analysis].
- **Recent seasons** *(own computation; level-stakes return at raw closing odds; SE = standard error)*:

| Odds | Pinnacle 2019–22 | Pinnacle 2022–26 | bet365 2022–26 | BFE 2024–26 |
|---|---|---|---|---|
| 1–2 | −2.1% | −1.4% | −3.8% | −0.8% |
| 4–6 | −4.2% | −7.2% | −11.3% | −3.2% |
| 6–10 | −10.0% | −13.1% | −21.3% | −0.7% (SE 4.7) |
| ≥10 | −12.2% | −34.0% (SE 7.3) | −43.3% | −18.0% (SE 10) |

  FLB is **not shrinking** and is steepest at soft books. The exchange shows little of it below odds 10 (compare [Smith, Paton & Vaughan Williams 2006](https://ideas.repec.org/a/bla/econom/v73y2006i292p673-689.html) [peer-reviewed]).
- **Over/under 2.5** *(own computation, Pinnacle close, n=48,507)*.
  - Returns by odds band: −2.4% (<1.6), −2.9% (1.6–2.0), −4.2% (2.0–2.5), −5.9% (2.5–3.5). Odds above 3.5 are rare (n=487).
  - Overs lose slightly less than unders (−3.2% vs −4.2%). This is despite overs taking about 62% of bets at Pinnacle ([Buchdahl, n=200](https://www.football-data.co.uk/blog/betshare.php)).
  - O/U can't fill a 4–10 odds slot.
- **What it means for longshot flags.** At long odds two errors stack:
  - the soft book's extra margin on longshots;
  - the de-vig error at the sharp book.

  So "value" flagged at odds 4–10 is mostly noise (Takeaway 1).

## 3. De-vig accuracy

- **[Štrumbelj 2014, IJF 30(4)](https://www.sciencedirect.com/science/article/abs/pii/S0169207014000533):** Shin's model beats basic normalisation and regression. Some bookmakers are significantly better probability sources than others. Exchange odds are "not always the best source, especially in smaller markets". Read via the abstract only ([summary](https://scispace.com/papers/on-determining-probability-forecasts-from-betting-odds-kq2uakq5ha)) [peer-reviewed].
- **[Clarke, Kovalchik & Ingram 2017](https://doi.org/10.11648/j.ajss.20170506.12):** the power method beats multiplicative on all three datasets and beats or matches Shin. The data come from three sports, and football's inclusion is unconfirmed [peer-reviewed, low-tier venue].
- **Buchdahl 2017:** margin-proportional-to-odds and logarithmic (= power) slightly over-correct FLB; odds-ratio slightly under-corrects. The R [`implied`](https://cran.r-project.org/web/packages/implied/vignettes/introduction.html) package outputs identical numbers for `wpo` and `additive`, confirming the identity [independent analysis].
- **Our calibration test** *(own computation; return at fair odds; 0 = calibrated; negative = probability overstated)*:

| Pinnacle close, n=48,593 | 1–2 | 4–6 | 6–10 | ≥10 | log-loss |
|---|---|---|---|---|---|
| multiplicative | +2.0 | −2.5 | −5.6 | −23.9 | 0.9987 |
| additive (=WPO) | +0.3 | −0.5 | +0.2 | −9.5 | 0.9985 |
| power | +0.2 | −0.5 | +0.7 | −10.5 | 0.9985 |
| Shin | +0.7 | −1.1 | −0.6 | −14.9 | 0.9985 |
| odds-ratio | +0.9 | −1.2 | −0.8 | −17.2 | 0.9985 |

  Log-loss can't tell the methods apart; the difference is in the tails, where our picks fall. Pinnacle's Friday prices show the same ranking: multiplicative −11.3% vs additive −2.4% at odds 6–10. On BFE closing prices (overround about 1%) all methods agree within about 1 point below odds 10.

## 4. Betfair Exchange vs Pinnacle as the true-probability reference

- **Exchange accuracy.** [Whelan 2025](https://mpra.ub.uni-muenchen.de/126351/) used 200,622 Betfair soccer matches (2022–24) [independent analysis; working paper using data supplied by Betfair].
  - Last-traded pre-match prices are **unbiased**, with an average overround of 0.003.
  - Typical big-match books: back overround about 101%, lay about 99%.
  - The paper's model implies that 1/back overstates and 1/lay understates the true probability. A slight *reverse* FLB was found on EPL ([Angelini, De Angelis & Singleton 2022](https://research.reading.ac.uk/football-research/new-journal-article-informational-efficiency-and-behaviour-within-in-play-prediction-markets/)) [peer-reviewed].
- **What football-data's BFE columns contain.** football-data does **not document** whether BFE is a back, lay or last-traded price. The Friday BFE overround suggests best *back* prices in thin order books:
  - 1.006–1.013 in top leagues;
  - **1.165** National League, **1.237–1.245** Scottish League One/Two, **1.223** Greece, 1.095 Turkey.

  The closing BFE overround is 1.005–1.027 *(own computation; inference)*.
- **Lower-division gap.** Mean absolute gap between BFE and Pinnacle Friday probabilities:
  - top 5: 0.5–0.6 percentage points;
  - National League (EC) 2.5, Scottish League Two (SC3) 3.5, Greece (G1) **4.9**;
  - the 10% of matches with BFE overround ≥1.10: 8.8.

| Log-loss, n=10,513 (2024–26) | Top 5 | Other 17 | EC/E3/SC1–3/G1/T1 |
|---|---|---|---|
| Pinnacle Friday | 0.96327 | 1.01490 | 1.01871 |
| BFE Friday | **0.96261** | 1.02412 | 1.03031 |
| bet365 Friday | 0.96422 | 1.01587 | 1.01985 |
| Pinnacle close | 0.96178 | **1.01191** | **1.01539** |
| BFE close | **0.96077** | 1.01217 | 1.01572 |

- **Other points.** I found no independent matched-volume data by league; trading-guide figures disagree tenfold [industry/marketing — treat with caution]. Pinnacle is weaker in small leagues too (Friday overround 1.050–1.067 in SC1–SC3/EC vs 1.03 in the top 5).
- **Answer.** Back-only prices are fine at the close but biased on Friday in thin leagues. Filter on BFE overround ≤1.03, or blend with Pinnacle or the market average.

## 5. Staking simultaneous independent bets

- **Theory.**
  - Simultaneous Kelly (sizing several bets on independent events at once) is solved in [Whitrow 2007, JRSS-C](https://ideas.repec.org/a/bla/jorssc/v56y2007i5p607-623.html) [peer-reviewed].
  - Shrinking Kelly when the edge is uncertain: [Baker & McHale 2013](https://ideas.repec.org/a/inm/ordeca/v10y2013i3p189-199.html) [peer-reviewed].
  - Overestimating the edge 2× turns Kelly into roughly a coin toss with an 8% chance of losing ≥90% of the bankroll ([Buchdahl](https://www.football-data.co.uk/blog/kelly_staking.php)) [independent analysis].
- **"Cover the stake" across independent events.** I found **no academic treatment**; "dutching" literature concerns outcomes of a single event. This is fixed-return staking (stake ∝ 1/odds). It reshapes variance, not expected value.
- **Our numbers** *(own computation; 20,000-path Monte Carlo; N picks at odds N)*:
  - P(no winner): 31.6% at N=4, 32.8% at N=5.
  - Kelly weekly total for N=5: 2.5% / 3.75% / 6.2% of bankroll at a 2% / 3% / 5% edge.
  - With a 2% edge on a €1,000 bankroll:

| Flat weekly stake | P(down 50% at some point) | P(bust within 3 seasons) | P(behind after season 1) |
|---|---|---|---|
| €50 | 21% | 2.0% | 41% |
| €100 | 51% | 17.6% | 41.5% |

## 6. Significance and CLV

- **Bets needed to prove an edge from P/L** (2 standard errors; ×1.6 for 80% power):

| Odds | 2% edge | 3% edge | 5% edge |
|---|---|---|---|
| 3 | 19,400 | 8,700 | 3,150 |
| 4 | 29,200 | 13,100 | 4,800 |
| 6 | 48,800 | 21,900 | 8,000 |

- **Evidence for CLV.**
  - The ratio of Pinnacle's earlier price to its closing price predicts realised yield with slope ≈1.00 (87,960 prices; [Buchdahl](https://www.football-data.co.uk/blog/pinnacle_efficiency.php)) [independent analysis].
  - On 61,979 value bets chosen by a commercial value-betting tool (not random), the share of logged EV still present at the close depended on Pinnacle's stake limit when the bet was logged ([Buchdahl/ValueBetFactory](https://www.football-data.co.uk/blog/pinnacle_limit.php)):
    - limit < $500: 28–30%;
    - limit > $2,000: about 75%.

    [independent analysis of tool data]
  - Operators' stake limits track players' CLV ([Massachusetts Gaming Commission, 30 Sep 2025](https://massgaming.com/wp-content/uploads/Meeting-Minutes-9.30.25-OPEN.pdf)) [official/regulator]. Bookmakers themselves use CLV to identify winners.
  - Our numbers: log-CLV per bet has SD 8.1% at odds <4 (mean +1.8%). That gives n≈75.
- **Caveats.**
  - CLV inherits the de-vig bias: odds 6–10 picks show +2.3% CLV under multiplicative but −0.2% under additive.
  - Buchdahl argues arbitrage traffic distorts Pinnacle's close on value matches. 48.8% of his ≥2% value matches were arbitrage-able, vs 19.0% overall.

## 7. Lithuania specifics

- **Licensed books.** Per the Phase-0 mapping in `docs/research.md` §2:
  - Topsport (UAB "Top Sport")
  - Optibet (UAB "Baltic Bet")
  - 7bet (UAB "Amber Gaming")
  - Betsson LT (ex-Betsafe)
  - OlyBet
  - Cbet (UAB "Tete-a-tete kazino")
  - Twinsbet (UAB "Nesė")

  There are about 10 remote licensees. The [LPT register](https://lpt.lrv.lt/lt/losimu-organizatoriai/leidimu-zurnalas/nuotoliniai-losimai/) blocks automated access, so this list **could not be re-verified today** [official/regulator]. Since May 2025 the payment block on unlicensed operators means Pinnacle and Betfair are **reference prices only**.
- **Sportsbook platforms (the odds source at each book)** [all industry sources — treat with caution]:
  - 7bet: **Altenar** ([vendor case study](https://altenar.com/es/cases/7bet/)); OddsPapi flags `7bet.lt` as a Lottoland price clone (`docs/STATUS.md`).
  - OlyBet: **BetConstruct** ([Intergame, undated, may be stale](https://www.intergameonline.com/igaming/news/olybet-relaunches-affiliate-programme-with-income-access)).
  - Optibet: **in-house** ([iGB 2019](https://igamingbusiness.com/casino-games/enlabs-launches-optibet-branded-sportsbook-in-lithuania/)).
  - TOPsport (about 50% of LT online): 70% acquired by Fortuna Entertainment Group, Aug 2026 ([iGB](https://igamingbusiness.com/strategy/fortuna-entertainment-completes-acquisition-of-topsport/)). **Platform unverified**; no source found for the earlier "EveryMatrix" note.
  - Betsson replaced Betsafe in LT in 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Betsafe)). Cbet, Twinsbet: unknown.
- **Margins.**
  - **No independent measurement found.** LT ranking sites score "odds & margin" out of 5 and are affiliates (e.g. [statymuzona.lt](https://statymuzona.lt/)) [industry/marketing — treat with caution].
  - An anecdotal OddsPapi sample (3–4 Superettan matches) gave overrounds of 7bet.lt 8.0–9.0%, Betsson 7.3–7.8% and Pinnacle 4.9–6.0%.
  - For comparison, bet365 in our data runs 5.5% (top 5) to 9.9% (Scottish League Two) *(own computation)*.
- **Limits on winners at LT books.** **No independent or regulator evidence.** Forum posts on statymai.com contain both operator denials and user complaints (anecdotal).
- **Historical LT odds.**
  - football-data has none.
  - OddsPapi offers `/v4/historical-odds`, free tier limited to 3 books per call [industry/marketing — treat with caution]. The `7bet.lt` and `betsson` slugs exist, but the Betsson feed has been suspended since 2026-09-16.
  - Oddsportal's coverage of LT books is **unverified**.
- **Tax on winnings.** Sources conflict: some say winnings are untaxed, one affiliate claims 15% on net winnings. **Unverified; check with VMI (the Lithuanian tax authority).**

## 8. Execution constraints

- **Limits and "gubbing"** (accounts restricted for winning). UK Gambling Commission data on 14.9M active accounts in 2024 ([UKGC](https://www.gamblingcommission.gov.uk/blog/post/commercial-restrictions-by-betting-operators)) [official/regulator]:
  - 4.31% of accounts were restricted: 2.68% of all accounts had a reduced maximum stake and 2.23% were closed.
  - Among accounts with a reduced maximum stake, 36.22% could stake 1–9% of the normal maximum and 22.41% ≤1%.
  - 46.78% of restricted accounts were in lifetime profit, vs 25.42% of all accounts.
  - Regulator's position: "Being a successful bettor is not a protected characteristic."
- **Obvious-error ("palpable error") voids.** Each LT book's LPT-approved rulebook defines when bets are voided, but I could not retrieve them (bot wall). Foreign cases (Australia NT, Massachusetts) show that voiding obvious-error bets is contested, though I saw these only via press summaries (unverified). In the backtest, book EV above 15% as void risk.
- **Price movement from Friday to close** *(own computation, bet365 2019–26)*:
  - Median absolute move: home 4.9%, away 6.2%, draw 2.9%.
  - Share of prices moving more than 5%: home 50%, away 59%.
  - Together with Kaunitz's 30% stale prices and Buchdahl's third of value lost by the close: our simulation keeps about 34% of EV overall and **none at odds ≥6**.

---

### Evidence that contradicts the strategy's premise
- **Profitable versions bet short odds** (Kaunitz average 2.30; Buchdahl's profit is all at odds <4). The 4–10 band is where flagged value has been zero or negative.
- **The edge may be decaying.** Buchdahl's picks returned −0.25% in 2022–25 vs +4.1% expected (z = −1.73). [Clegg & Cartlidge](https://arxiv.org/abs/2306.01740) saw similar post-2020 decay in tennis.
- **Limits target positive-CLV accounts** (UKGC, Massachusetts), so the edge is short-lived at each book.
- **The backtest's books are UK/EU stand-ins**, not Lithuanian. Any edge needs LT validation via CLV logging on live 7bet/Betsson prices.
