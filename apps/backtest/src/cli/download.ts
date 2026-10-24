/**
 * Download (or refresh) football-data.co.uk season CSVs for the main leagues into the local cache
 * and print per-season price coverage.
 *
 *   pnpm --filter @quest/backtest download [seasons...] [--refresh]
 *
 * Seasons are football-data codes ('2526' = 2025/26); default 2526 2627. Files land in
 * apps/backtest/data/football-data/${season}/${league}.csv (gitignored).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUE_NAMES, MAIN_LEAGUES, loadSeasonCsv } from '../download';
import { parseFootballDataCsv } from '../football-data';
import type { HistoricalMatch, MarketKey } from '../types';

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = resolve(PKG_DIR, 'data', 'football-data');
const DEFAULT_SEASONS = ['2526', '2627'];

/** Coverage columns: share of matches with a complete market for that book/phase. */
const COVERAGE: { label: string; book: string; market: MarketKey; closing: boolean }[] = [
  { label: 'BFE1x2', book: 'BFE', market: '1x2', closing: false },
  { label: 'BFE1x2C', book: 'BFE', market: '1x2', closing: true },
  { label: 'BFEou', book: 'BFE', market: 'ou25', closing: false },
  { label: 'BFEouC', book: 'BFE', market: 'ou25', closing: true },
  { label: 'PS1x2', book: 'PS', market: '1x2', closing: false },
  { label: 'PS1x2C', book: 'PS', market: '1x2', closing: true },
  { label: 'B365', book: 'B365', market: '1x2', closing: false },
  { label: 'BW', book: 'BW', market: '1x2', closing: false },
  { label: 'BV', book: 'BV', market: '1x2', closing: false },
  { label: 'BFD', book: 'BFD', market: '1x2', closing: false },
  { label: 'B365ou', book: 'B365', market: 'ou25', closing: false },
];

function has(m: HistoricalMatch, c: (typeof COVERAGE)[number]): boolean {
  return (c.closing ? m.closing : m.prematch)[c.book]?.[c.market] !== undefined;
}

function pct(n: number, total: number): string {
  return total === 0 ? '-' : `${Math.round((100 * n) / total)}%`;
}

function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
}

function usage(): never {
  console.error(
    'usage: download [seasons...] [--refresh]   (seasons like 2526; default 2526 2627)',
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  if (args.includes('--help') || args.includes('-h')) usage();
  const unknown = args.filter((a) => a.startsWith('-') && a !== '--refresh');
  const seasons = args.filter((a) => !a.startsWith('-'));
  if (unknown.length > 0 || seasons.some((s) => !/^\d{4}$/.test(s))) usage();
  if (seasons.length === 0) seasons.push(...DEFAULT_SEASONS);

  console.log(`cache: ${CACHE_DIR}${refresh ? ' (refresh)' : ''}`);
  let failures = 0;
  for (const season of seasons) {
    const perLeague: { league: string; matches: HistoricalMatch[] }[] = [];
    for (const league of MAIN_LEAGUES) {
      try {
        const csv = await loadSeasonCsv(league, season, CACHE_DIR, { refresh });
        perLeague.push({ league, matches: parseFootballDataCsv(csv, league, season) });
      } catch (err) {
        failures++;
        console.error(`  ${league} ${season}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const all = perLeague.flatMap((p) => p.matches);
    console.log(
      `\nseason ${season}: ${perLeague.length}/${MAIN_LEAGUES.length} files, ${all.length} matches`,
    );
    const head = ['league', 'name', 'matches', ...COVERAGE.map((c) => c.label)];
    const lines = [
      ...perLeague.map(({ league, matches }) => [
        league,
        LEAGUE_NAMES[league] ?? league,
        String(matches.length),
        ...COVERAGE.map((c) => pct(matches.filter((m) => has(m, c)).length, matches.length)),
      ]),
      [
        'ALL',
        '',
        String(all.length),
        ...COVERAGE.map((c) => pct(all.filter((m) => has(m, c)).length, all.length)),
      ],
    ];
    const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i]!.length)));
    console.log(row(head, widths));
    for (const l of lines) console.log(row(l, widths));
  }
  console.log('\n(C = closing; others pre-match. ou = over/under 2.5. PS = Pinnacle.)');
  if (failures > 0) {
    console.error(`${failures} file(s) failed`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
