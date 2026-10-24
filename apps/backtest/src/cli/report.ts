/**
 * Build the Value Slate Replay page: replays every preset week by week on each season and
 * bakes the results (plus the census and margin tables) into a self-contained HTML file.
 *   pnpm --filter @quest/backtest report [--out <file>]
 * Default output: docs/value-slate/report.html (regenerate after new data or rule changes).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { overround } from '@quest/core';
import { bestPerEvent, flatByOddsBand, flatStats } from '../analysis';
import { buildCandidates, type BacktestCandidate, type CandidateConfig } from '../candidates';
import { CENSUS_SETUPS, censusBands, runCensus } from '../census';
import { LEAGUE_NAMES } from '../download';
import { loadMatches } from '../load';
import { ALL_SOFT_BOOKS, PINNACLE_SEASONS, PRESETS } from '../presets';
import { roundStarts, runRounds, strategyMetrics } from '../simulate';
import type { HistoricalMatch, MarketKey } from '../types';

const TEMPLATE = fileURLToPath(new URL('../report/template.html', import.meta.url));
const DEFAULT_OUT = fileURLToPath(
  new URL('../../../../docs/value-slate/report.html', import.meta.url),
);
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1]! : DEFAULT_OUT;

const PIN_ROLE = 'Pinnacle-era history: the short-odds rule was not tuned on it';
const SEASONS = [
  { id: '1920', label: '2019/20', role: `${PIN_ROLE} (spring 2020 paused by COVID)` },
  { id: '2021', label: '2020/21', role: PIN_ROLE },
  { id: '2122', label: '2021/22', role: PIN_ROLE },
  { id: '2223', label: '2022/23', role: PIN_ROLE },
  { id: '2324', label: '2023/24', role: PIN_ROLE },
  {
    id: '2425',
    label: '2024/25',
    role: 'Last season with both Pinnacle and Betfair Exchange prices',
  },
  { id: '2526', label: '2025/26', role: 'Full season, used to design the exchange strategies' },
  { id: '2627', label: '2026/27', role: 'Season so far, a check on rules set from 2025/26' },
];

/** The six-season Pinnacle check behind the "Six seasons with Pinnacle" section. */
const HISTORY_SETUPS = [
  { key: 'all', label: 'Best of all UK/EU bookmakers', books: ALL_SOFT_BOOKS },
  { key: 'b365', label: 'Bet365 only', books: ['B365'] },
];
const isShortOdds = (c: BacktestCandidate) =>
  c.edge >= 0.03 && c.edge <= 0.12 && c.odds >= 1.5 && c.odds <= 4;

const LEAGUE_GROUPS: { label: string; leagues: string[] }[] = [
  { label: 'Top five leagues', leagues: ['E0', 'D1', 'I1', 'SP1', 'F1'] },
  {
    label: 'Second tiers and mid-size leagues',
    leagues: ['E1', 'D2', 'I2', 'SP2', 'F2', 'N1', 'B1', 'P1', 'T1'],
  },
  { label: 'English L1/L2, Scottish Premiership', leagues: ['E2', 'E3', 'SC0'] },
  {
    label: 'Thin: National League, Scottish lower, Greece',
    leagues: ['EC', 'SC1', 'SC2', 'SC3', 'G1'],
  },
];

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

function medianOverround(ms: HistoricalMatch[], book: string, market: MarketKey): number | null {
  return median(
    ms.flatMap((m) => (m.prematch[book]?.[market] ? [overround(m.prematch[book]![market]!)] : [])),
  );
}

async function main() {
  const bySeason = new Map<string, HistoricalMatch[]>();
  for (const s of SEASONS) bySeason.set(s.id, await loadMatches([s.id]));

  const seasons = SEASONS.map((s) => {
    const ms = bySeason.get(s.id)!;
    const weeks = roundStarts(ms.map((m) => m.date));
    return {
      ...s,
      matches: ms.length,
      weeks: weeks.length,
      firstDate: ms[0]!.date,
      lastDate: ms[ms.length - 1]!.date,
      leagues: new Set(ms.map((m) => m.league)).size,
    };
  });

  // Week-by-week replays. Picks are packed as arrays to keep the page small:
  // [date, league, home, away, market, selection, book, odds, fairProb, edge, share, won, score, clv]
  const runs: Record<string, Record<string, unknown>> = {};
  for (const preset of PRESETS) {
    runs[preset.id] = {};
    for (const s of SEASONS.filter((x) => preset.seasons.includes(x.id))) {
      const ms = bySeason.get(s.id)!;
      const rounds = runRounds(
        buildCandidates(ms, preset.candidates),
        preset.rules,
        roundStarts(ms.map((m) => m.date)),
      );
      runs[preset.id]![s.id] = {
        metrics: strategyMetrics(rounds),
        rounds: rounds.map((r) => ({
          s: r.start,
          a: r.available,
          p: r.picks.map((p) => [
            p.date,
            p.league,
            p.homeTeam,
            p.awayTeam,
            p.market,
            p.selection,
            p.book,
            p.odds,
            r4(p.fairProb),
            r4(p.edge),
            r4(p.share),
            p.won ? 1 : 0,
            p.score,
            p.clv === undefined ? null : r4(p.clv),
          ]),
        })),
      };
    }
  }

  const pinMatches = PINNACLE_SEASONS.flatMap((id) => bySeason.get(id)!);
  const pinCfg = (books: string[], clvReference?: string): CandidateConfig => ({
    reference: 'PS',
    devig: 'power',
    books,
    markets: ['1x2', 'ou25'],
    referenceOverround: [-0.03, 0.08],
    ...(clvReference ? { clvReference } : {}),
  });
  const history = HISTORY_SETUPS.map((h) => {
    const bets = bestPerEvent(buildCandidates(pinMatches, pinCfg(h.books)).filter(isShortOdds));
    const perSeason = PINNACLE_SEASONS.map((id) => {
      const weeks = roundStarts(bySeason.get(id)!.map((m) => m.date)).length;
      const st = flatStats(
        id,
        bets.filter((b) => b.season === id),
      );
      return { ...st, season: id, perWeek: st.bets / weeks };
    });
    const weeks = roundStarts(pinMatches.map((m) => m.date)).length;
    const pooled = flatStats('all', bets);
    return {
      key: h.key,
      label: h.label,
      perSeason,
      pooled: { ...pooled, perWeek: pooled.bets / weeks },
    };
  });
  const allBets = bestPerEvent(
    buildCandidates(pinMatches, pinCfg(ALL_SOFT_BOOKS)).filter(isShortOdds),
  );
  const m2425 = bySeason.get('2425')!;
  const historyChecks = {
    bfeGraded2425: flatStats(
      'BFE',
      bestPerEvent(buildCandidates(m2425, pinCfg(ALL_SOFT_BOOKS, 'BFE')).filter(isShortOdds)),
    ),
    groups: LEAGUE_GROUPS.map((g) => ({
      ...flatStats(
        g.label,
        allBets.filter((b) => g.leagues.includes(b.league)),
      ),
    })),
    oddsBands: flatByOddsBand(
      bestPerEvent(
        buildCandidates(pinMatches, pinCfg(ALL_SOFT_BOOKS)).filter(
          (c) => c.edge >= 0.03 && c.edge <= 0.12,
        ),
      ),
    ),
  };

  const census = SEASONS.filter((s) => ['2526', '2627'].includes(s.id)).map((s) => {
    const ms = bySeason.get(s.id)!;
    const weeks = roundStarts(ms.map((m) => m.date)).length;
    return {
      season: s.id,
      rows: runCensus(ms, weeks),
      bands: censusBands(ms, 'all4-thin', 0.01),
    };
  });

  const ms2526 = bySeason.get('2526')!;
  const margins = LEAGUE_GROUPS.map((g) => {
    const ms = ms2526.filter((m) => g.leagues.includes(m.league));
    return {
      label: g.label,
      leagues: g.leagues.map((l) => LEAGUE_NAMES[l] ?? l),
      bfe: medianOverround(ms, 'BFE', '1x2'),
      ps: medianOverround(ms, 'PS', '1x2'),
      b365: medianOverround(ms, 'B365', '1x2'),
      bw: medianOverround(ms, 'BW', '1x2'),
    };
  });

  const data = {
    generatedAt: new Date().toISOString(),
    seasons,
    presets: PRESETS,
    censusSetups: CENSUS_SETUPS.map(({ key, label }) => ({ key, label })),
    runs,
    history,
    historyChecks,
    census,
    margins,
    leagues: LEAGUE_NAMES,
  };

  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // The template holds the string literal '__REPORT_DATA__' (either quote style survives prettier).
  const template = readFileSync(TEMPLATE, 'utf8');
  const placeholder = /(['"])__REPORT_DATA__\1/;
  if (!placeholder.test(template)) throw new Error(`no __REPORT_DATA__ placeholder in ${TEMPLATE}`);
  const html = template.replace(placeholder, () => json);
  writeFileSync(outFile, html);
  console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
  for (const p of PRESETS)
    for (const s of SEASONS.filter((x) => p.seasons.includes(x.id))) {
      const m = (runs[p.id]![s.id] as { metrics: ReturnType<typeof strategyMetrics> }).metrics;
      console.log(
        `${p.id.padEnd(10)} ${s.id} weeks ${m.roundsPlayed}/${m.rounds} picks ${m.picks} (${m.avgPicks.toFixed(1)}/wk) odds ${m.avgOdds.toFixed(2)} hit ${(m.pickHitRate * 100).toFixed(0)}% ROI ${(m.roi * 100).toFixed(1)}% ±${(m.roiSe * 100).toFixed(1)} exp ${(m.expectedRoi * 100).toFixed(1)}% CLV ${m.avgClv === null ? 'n/a' : (m.avgClv * 100).toFixed(2) + '%'} wipe ${((1 - m.roundsWithWinner) * 100).toFixed(0)}% covered ${(m.roundsCovered * 100).toFixed(0)}%`,
      );
    }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
