/**
 * How sharp is each book, league by league? Median (p10/p90 for BFE) 1X2 overround, pre-match.
 *   pnpm --filter @quest/backtest margins [seasons...]
 * Source of FINDINGS.md D3: a wide reference market makes a poor "true probability".
 */
import { overround } from '@quest/core';
import { LEAGUE_NAMES, MAIN_LEAGUES } from '../download';
import { loadMatches } from '../load';
import type { HistoricalMatch, MarketKey } from '../types';

const seasons = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));

function quantile(xs: number[], q: number): number | undefined {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))];
}

const fmt = (x: number | undefined) =>
  x === undefined ? '  n/a' : (x * 100).toFixed(1).padStart(5);

function margins(ms: HistoricalMatch[], book: string, market: MarketKey): number[] {
  return ms.flatMap((m) => {
    const prices = m.prematch[book]?.[market];
    return prices ? [overround(prices)] : [];
  });
}

async function main() {
  for (const season of seasons.length ? seasons : ['2526', '2627']) {
    const all = await loadMatches([season]);
    console.log(
      `\n== ${season} ==  league                  n   BFE p10   p50   p90 |    PS |  B365 |    BW | BFEou | B365ou`,
    );
    for (const league of MAIN_LEAGUES) {
      const ms = all.filter((m) => m.league === league);
      const bfe = margins(ms, 'BFE', '1x2');
      const med = (b: string, mk: MarketKey) => fmt(quantile(margins(ms, b, mk), 0.5));
      console.log(
        `${league.padEnd(4)} ${(LEAGUE_NAMES[league] ?? '').padEnd(22)} ${String(ms.length).padStart(4)}  ${fmt(quantile(bfe, 0.1))} ${fmt(quantile(bfe, 0.5))} ${fmt(quantile(bfe, 0.9))} | ${med('PS', '1x2')} | ${med('B365', '1x2')} | ${med('BW', '1x2')} | ${med('BFE', 'ou25')} | ${med('B365', 'ou25')}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
