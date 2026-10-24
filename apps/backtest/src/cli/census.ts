/**
 * Value census: how many value bets does each setup find, per week, at each edge threshold —
 * and did they beat the closing line and make money as flat €1 singles?
 *   pnpm --filter @quest/backtest census [seasons...]
 */
import type { FlatStats } from '../analysis';
import { CENSUS_SETUPS, censusBands, runCensus } from '../census';
import { loadMatches } from '../load';
import { roundStarts } from '../simulate';

const seasons = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));

const pct = (x: number | null, d = 1) => (x === null ? '  n/a' : `${(x * 100).toFixed(d)}%`);
const row = (s: FlatStats, weeks: number) =>
  `n=${String(s.bets).padStart(5)} (${(s.bets / weeks).toFixed(1).padStart(5)}/wk) odds ${s.avgOdds.toFixed(2)} edge ${pct(s.avgEdge)} ROI ${pct(s.roi).padStart(7)} ±${pct(s.roiSe)} CLV ${pct(s.avgClv, 2).padStart(7)} ±${pct(s.clvSe, 2)}`;

async function main() {
  for (const season of seasons.length ? seasons : ['2526', '2627']) {
    const matches = await loadMatches([season]);
    const weeks = roundStarts(matches.map((m) => m.date)).length;
    console.log(`\n==== ${season}: ${matches.length} matches, ${weeks} weeks ====`);
    const rows = runCensus(matches, weeks);
    for (const setup of CENSUS_SETUPS) {
      const mine = rows.filter((r) => r.setup === setup.key);
      if (mine.length === 0) continue;
      console.log(`\n-- ${setup.label}`);
      for (const r of mine)
        console.log(`  edge ≥${String(r.threshold * 100).padStart(2)}%  ${row(r, weeks)}`);
      console.log('  by odds band (edge ≥1%):');
      for (const b of censusBands(matches, setup.key, 0.01))
        if (b.bets) console.log(`    ${b.label.padEnd(7)} ${row(b, weeks)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
