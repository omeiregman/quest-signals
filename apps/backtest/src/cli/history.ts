/**
 * Multi-season test of the short-odds rule with Pinnacle as the sharp reference (2019/20–2024/25,
 * when football-data's Pinnacle prices came from Pinnacle's live API).
 *   pnpm --filter @quest/backtest history [seasons...]
 * Per season and pooled: flat-singles ROI and CLV (vs Pinnacle closing), bets per week, then the
 * weekly slate under the one-winner rule and as a flat-stake slate, and a bankroll run across all
 * seasons in order. Writes out/history.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SlateRules } from '@quest/core';
import { bestPerEvent, flatByOddsBand, flatStats, type FlatStats } from '../analysis';
import { buildCandidates, type BacktestCandidate, type CandidateConfig } from '../candidates';
import { loadMatches } from '../load';
import { ALL_SOFT_BOOKS } from '../presets';
import {
  roundStarts,
  runRounds,
  simulateBankroll,
  strategyMetrics,
  type BudgetPolicy,
  type RoundResult,
} from '../simulate';

const OUT_DIR = fileURLToPath(new URL('../../out', import.meta.url));
const argSeasons = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const SEASONS = argSeasons.length ? argSeasons : ['1920', '2021', '2122', '2223', '2324', '2425'];

const ALL_SOFT = ALL_SOFT_BOOKS;

const pinnacle = (books: string[]): CandidateConfig => ({
  reference: 'PS',
  devig: 'power',
  books,
  markets: ['1x2', 'ou25'],
  referenceOverround: [-0.03, 0.08],
});

const SETUPS: { key: string; label: string; cfg: CandidateConfig }[] = [
  { key: 'b365', label: 'Bet365 only', cfg: pinnacle(['B365']) },
  { key: 'all', label: 'All named soft books', cfg: pinnacle(ALL_SOFT) },
];

const SHORT = { minEdge: 0.03, maxEdge: 0.12, minOdds: 1.5, maxOdds: 4 };

const SLATES: { key: string; label: string; rules: SlateRules }[] = [
  {
    key: 'one-winner',
    label: 'Short odds, one winner covers (≤8 picks)',
    rules: { ...SHORT, maxPicks: 8, minPicks: 1, staking: 'equal-return', maxCoverage: 1 },
  },
  {
    key: 'flat',
    label: 'Short odds, flat stakes, every qualifying bet (≤15)',
    rules: { ...SHORT, maxPicks: 15, minPicks: 1, staking: 'equal', maxCoverage: Infinity },
  },
];

const BUDGETS: [string, BudgetPolicy][] = [
  ['€20/wk', { kind: 'fixed', amount: 20 }],
  ['2% of bank', { kind: 'fraction', fraction: 0.02 }],
  ['€50/wk', { kind: 'fixed', amount: 50 }],
  ['€100/wk', { kind: 'fixed', amount: 100 }],
];

const pct = (x: number | null, d = 1) => (x === null ? 'n/a' : `${(x * 100).toFixed(d)}%`);
const stat = (s: FlatStats) =>
  `n=${String(s.bets).padStart(5)} odds ${s.avgOdds.toFixed(2)} edge ${pct(s.avgEdge)} ROI ${pct(s.roi).padStart(6)} ±${pct(s.roiSe)} CLV ${pct(s.avgClv, 2).padStart(6)} ±${pct(s.clvSe, 2)}`;

function inShort(c: BacktestCandidate): boolean {
  return (
    c.edge >= SHORT.minEdge &&
    c.edge <= SHORT.maxEdge &&
    c.odds >= SHORT.minOdds &&
    c.odds <= SHORT.maxOdds
  );
}

async function main() {
  const out: Record<string, unknown> = { seasons: SEASONS, short: SHORT };
  const bySeason = new Map<string, Awaited<ReturnType<typeof loadMatches>>>();
  for (const s of SEASONS) bySeason.set(s, await loadMatches([s]));
  const all = SEASONS.flatMap((s) => bySeason.get(s)!);
  const allStarts = roundStarts(all.map((m) => m.date));
  console.log(
    `${all.length} matches, ${allStarts.length} weeks with matches, seasons ${SEASONS.join(' ')}`,
  );

  for (const setup of SETUPS) {
    console.log(
      `\n================ ${setup.label} vs Pinnacle (power de-vig, 1X2 + O/U 2.5) ================`,
    );
    const cands = buildCandidates(all, setup.cfg);
    const short = bestPerEvent(cands.filter(inShort));
    console.log('Flat €1 singles, short-odds rule (edge 3–12%, odds 1.5–4), one per match:');
    const perSeason: Record<string, FlatStats & { perWeek: number }> = {};
    for (const s of SEASONS) {
      const weeks = roundStarts(bySeason.get(s)!.map((m) => m.date)).length;
      const st = flatStats(
        s,
        short.filter((c) => c.season === s),
      );
      perSeason[s] = { ...st, perWeek: st.bets / weeks };
      console.log(`  ${s}  ${stat(st)}  ${(st.bets / weeks).toFixed(1)}/wk`);
    }
    const pooled = flatStats('all', short);
    console.log(`  ALL   ${stat(pooled)}  ${(pooled.bets / allStarts.length).toFixed(1)}/wk`);

    const anyOdds = bestPerEvent(cands.filter((c) => c.edge >= 0.03 && c.edge <= 0.12));
    console.log('Same edge band, any odds — by odds band (the long-shot check):');
    for (const b of flatByOddsBand(anyOdds))
      if (b.bets) console.log(`  ${b.label.padEnd(8)} ${stat(b)}`);
    const edgeBands: [number, number][] = [
      [0.01, 0.02],
      [0.02, 0.03],
      [0.03, 0.05],
      [0.05, 0.08],
      [0.08, 0.12],
      [0.12, 0.3],
    ];
    console.log('Odds 1.5–4, by edge band:');
    const shortAnyEdge = bestPerEvent(cands.filter((c) => c.odds >= 1.5 && c.odds <= 4));
    for (const [lo, hi] of edgeBands) {
      const st = flatStats(
        `${lo}-${hi}`,
        shortAnyEdge.filter((c) => c.edge >= lo && c.edge < hi),
      );
      console.log(`  edge ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%  ${stat(st)}`);
    }

    const slates: Record<string, unknown> = {};
    for (const slate of SLATES) {
      const rounds: RoundResult[] = runRounds(cands, slate.rules, allStarts);
      const m = strategyMetrics(rounds);
      const atLeast = (n: number) => rounds.filter((r) => r.picks.length >= n).length;
      console.log(
        `\n  ${slate.label}: weeks with a bet ${m.roundsPlayed}/${m.rounds}, ≥5 picks ${atLeast(5)}, ≥7 picks ${atLeast(7)}, avg ${m.avgPicks.toFixed(1)} picks, odds ${m.avgOdds.toFixed(2)}`,
      );
      console.log(
        `    per-week ROI ${pct(m.roi)} ±${pct(m.roiSe)} | CLV ${pct(m.avgClv, 2)} ±${pct(m.clvSe, 2)} | weeks with no winner ${pct(1 - m.roundsWithWinner, 0)} | weeks money back ${pct(m.roundsCovered, 0)}`,
      );
      const bank: Record<string, unknown> = {};
      for (const [k, b] of BUDGETS) {
        const path = simulateBankroll(rounds, 1000, b);
        const seasonEnds = SEASONS.map((s) => {
          const seasonWeeks = new Set(roundStarts(bySeason.get(s)!.map((x) => x.date)));
          const ws = path.weeks.filter((w) => seasonWeeks.has(w.start));
          return Math.round(ws[ws.length - 1]?.after ?? path.final);
        });
        bank[k] = { final: path.final, maxDrawdown: path.maxDrawdown, low: path.low, seasonEnds };
        console.log(
          `    €1,000 start, ${k.padEnd(10)} → €${Math.round(path.final)} after 6 seasons (low €${Math.round(path.low)}, worst drop ${pct(path.maxDrawdown, 0)}) | end of each season: ${seasonEnds.map((v) => '€' + v).join(' ')}`,
        );
      }
      slates[slate.key] = { metrics: m, bank };
    }
    out[setup.key] = { perSeason, pooled, slates };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/history.json`, JSON.stringify(out));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
