# Value Slate: Literature & Evidence Review

**Date:** 2026-10-24 · **Scope:** the evidence behind the weekly "value slate" (soft-book odds above a de-vigged sharp price; equal-return staking so any single winner returns the week's stake, i.e. Σ1/oᵢ ≤ 1).
**Tags:** [peer-reviewed] journal article · [independent analysis] non-journal work with no bookmaker affiliation, or our own computation · [official/regulator] · [industry/marketing — treat with caution] operator, vendor, affiliate or tipster material.
**Source notes.** Joseph Buchdahl (football-data.co.uk) is cited a lot. His work is reproducible and his archives are public, so it is tagged [independent analysis]. He does have conflicts. His site states that *"Football-Data's revenues come from losses accrued by customers of banner-advertised bookmakers"*. He writes for Pinnacle's Betting Resources, and he links a paid odds-dropper service. Rows marked **own computation** were run on 2026-10-24 on football-data.co.uk CSVs (22 leagues, 2019/20 to 2026/27, 55,122 matches) and on Buchdahl's published bet archive. They can be reproduced but have not been peer-reviewed.

---

## Key takeaways for our system

1. **Cap the odds band at under 4.0, and at most 5.0.** In Buchdahl's live, forward-published record (20,380 bets, Aug 2015 to Jun 2025, ≥2% value against de-vigged Pinnacle) the two bands behave very differently. Picks at odds <4 returned **+4.36%** (n=15,385; expected +3.64%). Picks at odds ≥4 returned **−0.68%** (n=4,995) although **+5.35%** was expected. In 2022–25 the odds ≥4 picks returned **−13.1%** (n=1,084). *(own computation on [Buchdahl's archive](https://www.football-data.co.uk/Wisdom_of_crowd_bets.xlsx))* [independent analysis]
2. **The cover rule does not force longshots, so don't let it.** Σ1/o ≤ 1 holds with 2×2.0, 3×3.0 or 2.5+3.5+6.0. With four soft books, the median week offers 8 one-per-match value picks with Σ1/o ≈ 2.2, so a short-priced slate is feasible *(own computation)*. Whatever you pick, P(no winner) is about 25–34% per week.
3. **De-vig method:**
   - Use **additive** or **power** on Pinnacle and on bookmaker prices. Buchdahl's "margin proportional to odds" is algebraically **identical to additive**: 1/O_fair = 1/O − M/n.
   - Multiplicative de-vig overstates longshot probability. Against Pinnacle closing odds (48,593 matches, 2019–26), the return at multiplicative fair odds was −2.5% at odds 4–6, −5.6% at 6–10 and −23.9% at ≥10. Additive gave −0.5%, +0.2% and −9.5% *(own computation)*.
   - On the exchange (overround about 1%) the method barely matters. For exchange back prices with a large overround, use multiplicative: additive and power break down there.
4. **Edge threshold: 3% ≤ EV ≤ about 8%, measured against the Friday sharp price.** In Buchdahl's archive the bands came out as follows:
   - EV 2–3%: +0.11% realised against +2.45% expected (n=8,614).
   - EV 3–5%: +4.77% (n=7,548).
   - EV 5–8%: +7.24% (n=2,954).
   - EV 8–12%: **−3.49%** against +9.50% expected (n=898, average odds 6.4).

   Treat EV above 12–15% as a probable data error or stale price ([Clegg & Cartlidge](https://arxiv.org/abs/2306.01740) show a single bad-odds bet manufacturing most of a published profit).
5. **Plan on keeping only about one third of the Friday EV.** In our Friday-to-close simulation the four soft books' best price (B365/BW/BV/BFD) showed +4.41% EV, but closing-line value (CLV) against Pinnacle's close was only +1.49%. At odds 4–10, mean log-CLV was **−0.7%** *(own computation)*. Value found more than 24 hours before kick-off kept only 6–26% of its EV by the close ([Buchdahl/ValueBetFactory, Oct 2026](https://www.football-data.co.uk/blog/pinnacle_limit.php)).
6. **Reference price:**
   - At the close, Betfair Exchange (BFE) and Pinnacle are equally accurate: log-loss 0.99921 vs 0.99927 (n=10,513, 2024–26).
   - On Friday, BFE back prices are worse than bet365 outside the top-5 leagues (log-loss 1.0241 vs 1.0159), so only use BFE when its 1X2 overround is ≤1.03. Otherwise fall back to Pinnacle (2024/25, and 2025/26 up to 15 Jan 2026) or to the market average *(own computation)*.
7. **Stakes:**
   - The growth-optimal (Kelly) total weekly stake for N picks at odds≈N is about **1.25 × edge**. At a 3% edge with 5 picks at odds 5 that is 3.75% of bankroll per week, and staking 2× that leaves zero expected growth.
   - On €1,000, a €100/week slate (10%) gives a 17.6% chance of going bust within 3 seasons even with a true 2% edge (24.4% with no edge).
   - Use **≤ half Kelly, about 1.5–2% of bankroll per week** *(own computation; [Baker & McHale 2013](https://ideas.repec.org/a/inm/ordeca/v10y2013i3p189-199.html) on shrinking Kelly under estimation error)*.
8. **Judge the edge by CLV, not P/L.** Showing a 3% edge from profit and loss needs 8,700–21,900 bets at odds 3–6 (2 SE). CLV needs about **75 bets** at odds <4 (log-CLV mean 1.8%, SD 8.1%) and about 700 bets for a mixed-odds slate *(own computation)*. Go/no-go rule: ≥300 bets with mean CLV > 0 at p < 0.05 against the BFE or Pinnacle close.
9. **Expect soft-book limits within weeks to months.**
   - Kaunitz et al. were cut to below their $50 stake inside 5 months and 265 real bets.
   - The UK regulator found restricted accounts **1.8×** as likely to be in profit as active accounts (46.78% vs 25.42%). Of the accounts given reduced stake limits, 58.6% were cut to ≤9% of the normal maximum stake ([UKGC 2025](https://www.gamblingcommission.gov.uk/blog/post/commercial-restrictions-by-betting-operators)).
   - Massachusetts operators' stake limits track CLV.
   - With about 7 LT-licensed books, account life (how long accounts stay unrestricted) is the real limit on how much can be staked.
10. **Football-data quirks:**
    - Pinnacle 2025/26 covers only **25 Jul 2025 to 15 Jan 2026** (38% of matches).
    - BFE starts in **2024/25**.
    - **2024/25 is the only full season with both Pinnacle and BFE at ≥99% coverage**, so use it to calibrate BFE as the reference.
    - Pre-closing odds are Friday or Tuesday afternoon snapshots ([notes.txt](https://www.football-data.co.uk/notes.txt)) [official/regulator-equivalent: data provider's own documentation].

---

## 1. Does betting soft books above a sharp or consensus price make money?

**Kaunitz, Zhong & Kreiner (2017), [arXiv 1710.02824](https://arxiv.org/abs/1710.02824)** [independent analysis; preprint, and I found no peer-reviewed journal version]. Code: [GitHub](https://github.com/Lisandro79/BeatTheBookie).
- **Method.** Consensus probability p_cons = 1/mean(odds across up to 32 books). A regression on 479,440 games found intercepts α = 0.034 (home), 0.057 (draw) and 0.037 (away), with slopes ≈1.
- **Bet rule.** Bet when max(odds) > 1/(p_cons − 0.05). This is an *absolute* 5-percentage-point gap, which demands a far larger relative edge on longshots: at p=0.5 the bar is odds 2.22, at p=0.2 it is 6.67. The rule's picks therefore averaged odds **2.30**: 59.5% home bets, 38.4% away and only 2.1% draws.
- **Backtest, closing odds 2005–15.** 56,435 bets, +3.5%, 10.8 SD above random picks.
- **Odds 1–5 hours before kick-off.** 6,994 bets, +9.9%.
- **Paper trading.** 407 bets, +5.5%.
- **Real money.** 265 bets at $50, +8.5%. Paper and real combined: 672 bets, +6.2%, p = 0.089, *not significant*.
- **Execution.** About 30% of displayed odds had already changed at the bookmaker.
- **Limiting.** Bookmakers "began to severely limit our accounts", with stake caps below $50 and "manual inspection" of bets, and the experiment ended. The paper says this began "a few weeks after" (introduction) and "a few months after" (results) real betting started.
- **Replications.** I found no independent peer-reviewed replication or rebuttal (searched 2026-10).

**Buchdahl's "Wisdom of the (Pinnacle) Crowd"** ([PDF, 2017 update](https://www.football-data.co.uk/The_Wisdom_of_the_Crowd_updated.pdf); also in *Squares & Sharps, Suckers & Sharks*, 2016) [independent analysis].
- **Benchmark test.** De-vigged Pinnacle closing odds over 410,628 prices (2007–16) betted blind: equal-margin removal −0.56%, margin-proportional-to-odds +0.10%, odds-ratio −0.20%, logarithmic +0.07%. All except equal-margin come out at about zero, as they should if Pinnacle's close is fair.
- **Soft books against Pinnacle.** For bet365, BetVictor, Ladbrokes and William Hill, the expected return against Pinnacle-fair odds maps about 1:1 onto realised return. The reverse fails: UK-book "fair" prices do not predict returns at Pinnacle, so Pinnacle is the more efficient side.
- **Best price against Pinnacle-fair, 2012–17** (margin-proportional model): >2% value gave 14,967 bets, +5.71% actual vs +4.23% expected, average odds 3.82. The equal-margin (≈multiplicative) model gave **avg odds 5.31 and +3.34% vs +5.16% expected**: it lets longshots through.
- **Live record.** In Aug 2018 the record stood at 6,562 picks, +3.79% vs +4.19% expected ([model testing](https://www.football-data.co.uk/blog/model_testing.php)). By about 2022: 26,960 bets back to 2012/13, +4.90% actual. Expected was +4.13% using the price when the bet was found and only +2.88% using closing odds. "As much as a third of the bets… lose all of [their value] by closing" ([closing-odds analysis](https://www.football-data.co.uk/blog/wisdom_of_crowd_betting_system_closing_odds.php)).
- **Our recomputation of the full archive (2015–25):** +3.12% realised vs +4.06% expected (z=2.61 against zero). **But 2022/23–2024/25 returned −0.25% vs +4.10% expected (n=4,231, z = −1.73 against expectation)**, and 2024/25 alone returned −2.81%. Buchdahl stopped publishing picks in 2025/26 when Pinnacle's free API ended ([page](https://www.football-data.co.uk/wisdom_of_crowd_bets)).

**Corroborating peer-reviewed work.**
- [Franck, Verbeek & Nüesch 2010, IJF](https://www.zora.uzh.ch/entities/publication/a1b0f975-143f-4cfb-90df-42de610bf5c9): 5,478 Big-5 matches. Betfair forecasts beat bookmakers', and betting bookmaker odds that exceed exchange-implied odds gave "above average, and in some cases even positive returns" [peer-reviewed].
- [Angelini & De Angelis 2019, IJF](https://cris.unibo.it/handle/11585/646980): 41 books, 11 leagues, 11 years. At best odds 8 markets were efficient and 3 exploitable [peer-reviewed].
- [Elaad, Reade & Singleton 2020, FRL](https://ideas.repec.org/a/eee/finlet/v35y2020ics1544612319306440.html): 51 books, 16,000+ English matches. The market as a whole was unbiased, but individual books do not use competitors' information, which is the premise of value betting [peer-reviewed].

## 2. Favourite–longshot bias (FLB)

- **Magnitude in 1X2.** [Hegarty & Whelan, IJF 2025 41(2)](https://mpra.ub.uni-muenchen.de/116925/) used 84,230 matches, 22 football-data leagues, 2011/12–2021/22, and average closing odds.
  - Lowest-probability decile (p≈14%, odds ≈7): payout **$0.83 per $1, i.e. −17%**.
  - Top decile (p≈63%): **−2%**.
  - The fall is strongly nonlinear, appears after league and season fixed effects, and draws do slightly *better* than other bets of the same probability. Asian handicap odds show no FLB [peer-reviewed].
- **Why it exists.** [Hegarty & Whelan, Aug 2025 revision](https://www.karlwhelan.com/Papers/OEP.pdf) analyse 150,000+ games. FLB arises from imperfect competition among retail books; in deciles at p=0.26 vs 0.47 the 1X2 loss rates are 10.8% vs 5.1% [independent analysis; academic working paper].
- **Persistence in recent seasons** *(own computation; level-stakes return on raw closing odds)*:

| Odds band | Pinnacle 2019–22 | Pinnacle 2022–26 | bet365 2022–26 | BFE 2024–26 |
|---|---|---|---|---|
| 1–2 | −2.1% | −1.4% | −3.8% | −0.8% |
| 4–6 | −4.2% | −7.2% | −11.3% | −3.2% |
| 6–10 | −10.0% | −13.1% | −21.3% | −0.7% (SE 4.7) |
| ≥10 | −12.2% | −34.0% (SE 7.3) | −43.3% | −18.0% (SE 10) |

  FLB is **not** shrinking, and it is steepest at the soft books. The exchange shows almost none below odds 10, in line with [Smith, Paton & Vaughan Williams 2006, Economica](https://ideas.repec.org/a/bla/econom/v73y2006i292p673-689.html) [peer-reviewed] and with the 200,622-match Betfair test discussed in §4.
- **Over/under 2.5** *(own computation, Pinnacle close, n=48,507)*: −2.4% (<1.6), −2.9% (1.6–2.0), −4.2% (2.0–2.5), −5.9% (2.5–3.5). This is mild FLB, and odds above 3.5 are rare (n=487). Overs lose less than unders (−3.2% vs −4.2%). That is despite the public taking about 62% of bets on overs ([Buchdahl, n=200](https://www.football-data.co.uk/blog/betshare.php)) [independent analysis]. O/U cannot supply the 4–10 band.
- **Implication.** Two things combine in the 4–10 band. The soft book's margin weight is largest there, so a price can look generous against a mis-de-vigged sharp. And Pinnacle itself is less efficient at long odds; Buchdahl's tables show actual returns tracking expected returns poorly as odds rise. The longshot value flags in §Key-1 are the result.

## 3. Which de-vig method recovers true probabilities?

- **[Štrumbelj 2014, IJF 30(4):934–943](https://www.sciencedirect.com/science/article/abs/pii/S0169207014000533):** Shin's probabilities beat basic normalisation and regression models. Bookmakers differ significantly in accuracy, and *"betting exchange odds are not always the best source, especially in smaller markets"*. Shin's advantage shrinks in bigger markets. Read via the abstract only ([scispace summary](https://scispace.com/papers/on-determining-probability-forecasts-from-betting-odds-kq2uakq5ha)) [peer-reviewed].
- **[Clarke, Kovalchik & Ingram 2017](https://doi.org/10.11648/j.ajss.20170506.12):** the power method beats multiplicative on all three datasets and beats or matches Shin. Additive can produce negative probabilities. The datasets come from three sports, and I could not confirm that football is one of them. Low-tier open-access journal [peer-reviewed, weak venue].
- **Buchdahl 2017** ([PDF](https://www.football-data.co.uk/The_Wisdom_of_the_Crowd_updated.pdf)): on Pinnacle's close, the equal-margin method is clearly worst. Margin-proportional-to-odds and logarithmic (= power) slightly *over*-correct FLB, and odds-ratio slightly under-corrects. He uses margin-proportional-to-odds live [independent analysis].
- **Algebraic identity.** Buchdahl's formula O_f = nO/(n − M·O) gives 1/O_f = 1/O − M/n, which is the additive method. The [`implied` R package](https://cran.r-project.org/web/packages/implied/vignettes/introduction.html) prints identical numbers for its `wpo` and `additive` methods [independent analysis].
- **Our calibration test** *(own computation)*. Return at fair odds by fair-odds band, where 0 means calibrated and a negative value means the probability is overstated:

| Pinnacle close, n=48,593 | 1–2 | 4–6 | 6–10 | ≥10 | log-loss |
|---|---|---|---|---|---|
| multiplicative | +2.0 | −2.5 | −5.6 | −23.9 | 0.99868 |
| additive (=WPO) | +0.3 | −0.5 | +0.2 | −9.5 | 0.99849 |
| power | +0.2 | −0.5 | +0.7 | −10.5 | 0.99851 |
| Shin | +0.7 | −1.1 | −0.6 | −14.9 | 0.99851 |
| odds-ratio | +0.9 | −1.2 | −0.8 | −17.2 | 0.99852 |

  Log-loss barely separates the methods. The difference shows up in the tails, which is where our picks fall. Recommendation: use additive or power on Pinnacle and on soft books. For Pinnacle's Friday prices the ranking is the same: multiplicative gives −11.3% at odds 6–10 against −2.4% for additive. For BFE closing prices (overround 1.0097) all methods are within about 1 point below odds 10. For BFE Friday back prices, use multiplicative only.

## 4. Betfair Exchange vs Pinnacle as the "true probability"

- **Efficiency.** [Whelan 2025](https://mpra.ub.uni-muenchen.de/126351/) uses Betfair's own data: 200,622 soccer matches, 2022–24.
  - Last-traded pre-kick-off prices are **unbiased** (Mincer–Zarnowitz F-test cannot reject).
  - The average overround of last-traded prices is only 0.003.
  - Back overround is about 101% in high-profile games, and lay about 99%.
  - The model implies 1/back overstates and 1/lay understates the true probability, while their average is unbiased.
  - [independent analysis; academic working paper, data supplied by Betfair]
- **Counterpoint.** [Angelini, De Angelis & Singleton 2022, IJF](https://research.reading.ac.uk/football-research/new-journal-article-informational-efficiency-and-behaviour-within-in-play-prediction-markets/) find a slight *reverse* FLB in Betfair's pre-match EPL odds [peer-reviewed].
- **What football-data's BFE columns are.** football-data does **not** document whether BFE is a back, lay or last-traded price ([notes.txt](https://www.football-data.co.uk/notes.txt)). Empirically the Friday BFE overround is >1: 1.006–1.013 in top leagues, and **1.165 in the National League, 1.237–1.245 in Scottish League One and League Two, 1.223 in Greece and 1.095 in Turkey**. That matches best *back* prices in thin order books. The closing BFE overround is only 1.005–1.027 *(own computation; inference, not documented)*.
- **Liquidity in lower divisions** (2024/25–2025/26). Mean absolute gap between BFE and Pinnacle Friday fair probabilities: 0.53–0.63 percentage points in the top 5 leagues, against EC 2.46, SC2 2.67, SC3 3.52 and G1 **4.86**. 10% of matches have a Friday BFE overround ≥1.10, and their gap to Pinnacle's close is 8.8 points.

| Log-loss, common sample n=10,513 | Top 5 | Other 17 | EC/E3/SC1–3/G1/T1 |
|---|---|---|---|
| Pinnacle Friday | 0.96327 | 1.01490 | 1.01871 |
| BFE Friday (back) | **0.96261** | 1.02412 | 1.03031 |
| bet365 Friday | 0.96422 | 1.01587 | 1.01985 |
| Pinnacle close | 0.96178 | **1.01191** | **1.01539** |
| BFE close | **0.96077** | 1.01217 | 1.01572 |

  Matched-volume figures by league were not found in any independent source. Trading-guide figures, such as "£200k–£600k matched in League One and below", vary tenfold and are [industry/marketing — treat with caution].
- **Answer to "do back prices bias the estimate?"** At the close, no. On Friday, yes, badly, in thin leagues. Apply a BFE overround filter of ≤1.03, or blend with Pinnacle or the market average. Pinnacle is also weaker in small leagues: its overround is 1.050–1.067 in SC1–SC3 and EC against 1.03 in the top 5.

## 5. Staking a weekly portfolio of independent bets

- **Theory.** Simultaneous Kelly over many independent events is solved in [Whitrow 2007, JRSS-C](https://ideas.repec.org/a/bla/jorssc/v56y2007i5p607-623.html) [peer-reviewed]. With estimation error, Kelly should be shrunk ([Baker & McHale 2013](https://ideas.repec.org/a/inm/ordeca/v10y2013i3p189-199.html)) [peer-reviewed]. Buchdahl shows that overestimating the edge by 2× turns Kelly into roughly a coin toss, with an 8% chance of losing ≥90% of the bank ([Kelly pitfalls](https://www.football-data.co.uk/blog/kelly_staking.php)) [independent analysis].
- **"Cover the stake" across independent events.** I found **no academic treatment**; retail "dutching" material covers outcomes of a *single* event. Mathematically it is fixed-return staking (stake ∝ 1/odds). It changes variance, not expected value; expected return = Σ stakeᵢ·edgeᵢ (FINDINGS F3).
- **Our numbers** (N picks at odds N, any winner returns the week stake F):
  - P(no winner) is 31.6% for N=4 and 32.8% for N=5.
  - Kelly-optimal F* = 2.5% (2% edge), 3.75% (3%) or 6.2% (5%) of bankroll per week for N=5. Expected growth at 2F* is about zero.
  - Flat €50/week on €1,000 with a 2% edge: P(touching −50%) 21%, P(bust within 3 seasons) 2.0%, P(still down after season 1) 41%.
  - €100/week: 51%, 17.6% and 42% respectively.
  - *(own computation; 20,000-path Monte Carlo)*

## 6. Statistical significance and CLV

- **P/L sample sizes** (2 SE, level stakes; SD per bet ≈ o·√(p(1−p))):

| Odds | 2% edge | 3% edge | 5% edge |
|---|---|---|---|
| 3 | 19,400 | 8,700 | 3,150 |
| 4 | 29,200 | 13,100 | 4,800 |
| 6 | 48,800 | 21,900 | 8,000 |

  For 80% power these rise by about 1.6×. At 4–8 bets per week, P/L cannot validate a 2–5% edge within a decade.
- **CLV as the faster yardstick.**
  - Pinnacle's pre-closing/closing odds ratio predicts realised yield with a slope ≈1.00 (87,960 prices, 2012–16; [Buchdahl](https://www.football-data.co.uk/blog/pinnacle_efficiency.php)) [independent analysis].
  - On 61,979 value bets (May 2025 to Oct 2026; tool-selected, not random), only 28–30% of logged EV survived to the close when Pinnacle's limit was below $500, against about 75% above $2,000 ([Buchdahl/ValueBetFactory](https://www.football-data.co.uk/blog/pinnacle_limit.php)) [independent analysis of data from a commercial tool].
  - The Massachusetts regulator found operators' stake factors correlate with players' CLV ([MGC minutes, 30 Sep 2025](https://massgaming.com/wp-content/uploads/Meeting-Minutes-9.30.25-OPEN.pdf)) [official/regulator]. The books themselves treat CLV as the signature of a winner.
- **Caveats.**
  - CLV inherits the de-vig bias. With multiplicative de-vig, odds 6–10 picks show +2.3% "CLV". With additive they show −0.2%.
  - Buchdahl argues arbitrage flow can push Pinnacle's close away from fair on exactly the matches value-bettors target: 48.8% of his ≥2% value matches were arb-able, against 19.0% overall.

## 7. Lithuania specifics

- **Licensed books.** LPT licenses legal entities. The project's Phase-0 mapping (`docs/research.md` §2) is: Topsport (UAB "Top Sport"), Optibet (UAB "Baltic Bet"), 7bet (UAB "Amber Gaming"), Betsson LT (UAB "Lošimų strateginė grupė"), OlyBet, Cbet (UAB "Tete-a-tete kazino") and Twinsbet (UAB "Nesė"), about 10 remote licensees. The [LPT register](https://lpt.lrv.lt/lt/losimu-organizatoriai/leidimu-zurnalas/nuotoliniai-losimai/) is behind a bot wall and **could not be re-verified today** [official/regulator]. Since 1 May 2025, payments to unlicensed operators are blocked, so Pinnacle and Betfair serve as **reference prices only**.
- **Platforms and odds sources:**
  - 7bet uses **Altenar** ([vendor case study](https://altenar.com/es/cases/7bet/)) [industry/marketing — treat with caution]. OddsPapi now flags `7bet.lt` as `cloneOf: lottoland`, i.e. the same price feed (`docs/STATUS.md`).
  - OlyBet uses **BetConstruct** per [Intergame, undated](https://www.intergameonline.com/igaming/news/olybet-relaunches-affiliate-programme-with-income-access) [industry; may be stale].
  - Optibet's sportsbook was built **in-house** ([iGB 2019](https://igamingbusiness.com/casino-games/enlabs-launches-optibet-branded-sportsbook-in-lithuania/)) [industry].
  - TOPsport has about 50% LT online share and was 70% acquired by **Fortuna Entertainment Group** (completed Aug 2026, [iGB](https://igamingbusiness.com/strategy/fortuna-entertainment-completes-acquisition-of-topsport/)) [industry]. **Its platform is unverified**: the earlier project note "EveryMatrix" has no source I could find.
  - Betsson replaced the Betsafe brand in LT in 2025 ([Wikipedia](https://en.wikipedia.org/wiki/Betsafe)); its platform is group-proprietary (unverified for LT).
  - Cbet and Twinsbet: unknown.
- **Margins.** **No independent measurement found.** LT ranking sites, such as [statymuzona.lt](https://statymuzona.lt/), score "odds & margin" out of 5 and are affiliates [industry/marketing — treat with caution]. A tiny OddsPapi sample (3–4 Superettan matches, Jun 2026) put 1X2 overround at 8.0–9.0% for 7bet.lt, 7.3–7.8% for Betsson and 4.9–6.0% for Pinnacle (anecdotal). For comparison, the backtest's stand-in, bet365, runs 5.5% (top 5) to 9.9% (SC3) *(own computation)*.
- **Restricting winners.** **No independent or regulator evidence for LT books.** Forum threads on statymai.com contain operator denials and user claims; both are anecdotal and unverified. Assume UK-like behaviour (§8).
- **Historical LT odds.** football-data has none. OddsPapi advertises `/v4/historical-odds` (3 books per call on the free tier) [industry/marketing — treat with caution]. The project found `7bet.lt` and `betsson` slugs, and the Betsson feed has been suspended since 2026-09-16. Oddsportal coverage of LT books: **unverified**.
- **Tax on winnings.** Sources conflict: some say no player tax, one affiliate guide claims 15% on net winnings. **Unverified; check with VMI** before modelling net ROI.

## 8. Practical execution constraints

- **Limits and "gubbing"** (accounts restricted for winning). The UK Gambling Commission requested data on 14.9M active accounts (2024) ([blog, Jul 2025](https://www.gamblingcommission.gov.uk/blog/post/commercial-restrictions-by-betting-operators)) [official/regulator]:
  - 4.31% of accounts were restricted; 2.68% of all accounts were stake-factored and 2.23% closed.
  - Of stake-factored accounts, 36.22% were cut to 1–9% of the normal maximum stake and 22.41% to ≤1%.
  - 46.78% of restricted accounts were in lifetime profit, against 25.42% of all accounts.
  - Regulator's position: "Being a successful bettor is not a protected characteristic." Massachusetts voted in Dec 2025 to advance a notice-of-limit rule (press reports; the memo itself was not read).
- **Palpable-error voids.** Every LT book's LPT-approved *reglamentas* contains void and annulment rules, but these could not be retrieved (bot wall). Foreign regulator cases (Australia NT, Massachusetts) show that voids of "obvious error" bets are contested, sometimes overturned, and sometimes compensated. I only saw these through press summaries, so they are unverified. **Backtest implication:** treat implausible EV (>15%) as void risk, not profit.
- **Price movement from Friday to kick-off** *(own computation, bet365, 2019–26)*. Median absolute move to close was 4.9% for home prices, 6.2% away and 2.9% draw; 50% of home and 59% of away prices moved more than 5%. Kaunitz found 30% of displayed prices were already gone when the bettor tried to place them. Buchdahl puts value lost by the close at about one third of bets. Our simulation keeps about 34% of EV overall and **less than 0% at odds ≥6**.

---

### Evidence that contradicts the strategy's premise
- **The best-documented positive version of this method is a short-odds strategy** (Kaunitz average odds 2.30; Buchdahl's profits come from odds <4). The cover rule's pull toward 4–10 lands on the band where flagged value has historically been **zero or negative**.
- **Recent decay.** The public reference implementation returned −0.25% from 2022 to 2025 against +4.1% expected. This may be variance (z = −1.73), but it may also mean the market has become more efficient (compare [Clegg & Cartlidge](https://arxiv.org/abs/2306.01740) on post-2020 decay in tennis).
- **Restrictions end the edge.** Restrictions fall on exactly the accounts with positive CLV (UKGC, MGC), so the edge is time-limited for each book.
- **Proxy books.** The backtest's soft books (B365/BW/BV/BFD) are UK/EU books, not LT ones. LT pricing (Altenar, BetConstruct, in-house) may deviate from the sharp price differently, so any edge found needs LT-specific validation.
