# Research scripts (Python, pandas)

The "own computation" numbers in `docs/value-slate/research.md` come from these scripts, written
during the 2026-10-24 research pass. They are exploratory and unreviewed; the TypeScript backtester
in `../src` is the maintained code.

| script | input | what it computes |
|---|---|---|
| `woc_analysis.py <Wisdom_of_crowd_bets.xlsx>` | Buchdahl's archive, `https://www.football-data.co.uk/Wisdom_of_crowd_bets.xlsx` | value-bet yield by season, odds band, edge band, league, bookmaker |
| `fd_analysis.py <dir>` | flat directory of football-data CSVs named `{season}_{league}.csv` (e.g. `2425_E0.csv`, seasons 1920…2627) | favourite–longshot bias, de-vig calibration, Friday-vs-close CLV simulation |
| `fd_analysis2.py <dir>` | same | reference accuracy (log-loss) for Pinnacle / BFE / bet365, Friday vs close |
| `clv_sd.py <dir>` | same | per-bet CLV spread → bets needed to detect an edge |
| `ou.py <dir>` | same | over/under 2.5 returns by odds band |
| `staking_math.py` | none | Kelly sizing and ruin/drawdown Monte Carlo for N picks at odds N |

Run with `python3 -I <script> <input>` (needs `pandas`, `openpyxl` for the xlsx).
