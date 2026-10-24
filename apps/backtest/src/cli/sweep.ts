/**
 * Tune on one season, test on another:
 *   pnpm --filter @quest/backtest sweep [--tune 2526] [--test 2627]
 * 1. Flat-singles value check by odds band (does the flagged edge show up at all?).
 * 2. Weekly-slate grid on the tune season; the top configs by CLV are then run, unchanged,
 *    on the test season. Writes out/sweep-<tune>-<test>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bestPerEvent, flatByOddsBand, flatStats } from '../analysis';
import { buildCandidates, type BacktestCandidate } from '../candidates';
import { loadMatches } from '../load';
import { roundStarts, runRounds, strategyMetrics, type StrategyMetrics } from '../simulate';
import { candidateGrid, rulesGrid } from '../strategies';
import type { HistoricalMatch } from '../types';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const tuneSeason = arg('--tune', '2526');
const testSeason = arg('--test', '2627');
const OUT_DIR = fileURLToPath(new URL('../../out', import.meta.url));

const pct = (x: number | null, d = 1) => (x === null ? '   n/a' : `${(x * 100).toFixed(d)}%`);

function hasRef(matches: HistoricalMatch[], ref: string): boolean {
  return matches.some((m) => m.prematch[ref]?.['1x2']);
}

async function main() {
  const tune = await loadMatches([tuneSeason]);
  const test = await loadMatches([testSeason]);
  console.log(`tune ${tuneSeason}: ${tune.length} matches · test ${testSeason}: ${test.length}`);
  const references = ['BFE', 'PS'].filter((r) => hasRef(tune, r));
  const grid = candidateGrid(references);

  // 1. Flat singles by odds band, edge ≥ 3%, best bet per match.
  const valueCheck: Record<string, unknown> = {};
  console.log('\n== Flat €1 singles, edge ≥ 3%, best per match (ROI ± SE | CLV ± SE) ==');
  for (const v of grid.filter((g) => g.key.endsWith('/all4/both') || g.key.endsWith('/B365/1x2'))) {
    for (const [season, matches] of [
      [tuneSeason, tune],
      [testSeason, test],
    ] as const) {
      if (!hasRef(matches, v.cfg.reference)) continue;
      const bets = bestPerEvent(buildCandidates(matches, v.cfg).filter((c) => c.edge >= 0.03));
      const total = flatStats('all', bets);
      const bands = flatByOddsBand(bets);
      valueCheck[`${season}/${v.key}`] = { total, bands };
      console.log(
        `${season} ${v.key.padEnd(34)} n=${String(total.bets).padStart(5)} ROI ${pct(total.roi)} ±${pct(total.roiSe)} | CLV ${pct(total.avgClv, 2)} ±${pct(total.clvSe, 2)}`,
      );
    }
  }

  // 2. Slate grid on the tune season.
  const tuneStarts = roundStarts(tune.map((m) => m.date));
  const testStarts = roundStarts(test.map((m) => m.date));
  const rules = rulesGrid();
  const results: { candidates: string; rules: string; metrics: StrategyMetrics }[] = [];
  const tuneCands = new Map<string, BacktestCandidate[]>();
  for (const v of grid) {
    const cands = buildCandidates(tune, v.cfg);
    tuneCands.set(v.key, cands);
    for (const r of rules) {
      const metrics = strategyMetrics(runRounds(cands, r.rules, tuneStarts));
      results.push({ candidates: v.key, rules: r.key, metrics });
    }
  }
  console.log(`\nran ${results.length} slate configs on ${tuneSeason}`);

  const eligible = results.filter((r) => r.metrics.picks >= 150 && r.metrics.roundsPlayed >= 25);
  const byClv = [...eligible].sort((a, b) => (b.metrics.avgClv ?? -1) - (a.metrics.avgClv ?? -1));
  const byRoi = [...eligible].sort((a, b) => b.metrics.roi - a.metrics.roi);

  // Test the top tune-season configs (by CLV, BFE reference only — the test season has no PS).
  const testable = byClv.filter((r) => r.candidates.startsWith('BFE/')).slice(0, 25);
  const grid2 = new Map(grid.map((g) => [g.key, g.cfg]));
  const rules2 = new Map(rules.map((r) => [r.key, r.rules]));
  const tested = testable.map((r) => {
    const cands = buildCandidates(test, grid2.get(r.candidates)!);
    return { ...r, test: strategyMetrics(runRounds(cands, rules2.get(r.rules)!, testStarts)) };
  });

  const line = (r: { candidates: string; rules: string; metrics: StrategyMetrics }) =>
    `${(r.candidates + ' ' + r.rules).padEnd(80)} rounds ${String(r.metrics.roundsPlayed).padStart(2)} picks ${String(r.metrics.picks).padStart(4)} odds ${r.metrics.avgOdds.toFixed(2)} ROI ${pct(r.metrics.roi)} ±${pct(r.metrics.roiSe)} CLV ${pct(r.metrics.avgClv, 2)} wipe ${pct(1 - r.metrics.roundsWithWinner, 0)}`;
  console.log(`\n== Top 15 by CLV on ${tuneSeason} (eligible ${eligible.length}) ==`);
  byClv.slice(0, 15).forEach((r) => console.log(line(r)));
  console.log(`\n== Top 15 by ROI on ${tuneSeason} (beware: best-of-${eligible.length} luck) ==`);
  byRoi.slice(0, 15).forEach((r) => console.log(line(r)));
  console.log(`\n== Top 25 BFE-by-CLV configs re-run unchanged on ${testSeason} ==`);
  tested.forEach((r) => console.log(line({ ...r, metrics: r.test })));

  mkdirSync(OUT_DIR, { recursive: true });
  const file = `${OUT_DIR}/sweep-${tuneSeason}-${testSeason}.json`;
  writeFileSync(file, JSON.stringify({ tuneSeason, testSeason, valueCheck, results, tested }));
  console.log(`\nwrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
