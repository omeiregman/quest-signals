import { fileURLToPath } from 'node:url';
import { loadSeasonCsv, MAIN_LEAGUES } from './download';
import { parseFootballDataCsv } from './football-data';
import type { HistoricalMatch } from './types';

/** Cache of downloaded football-data CSVs (gitignored via the root `data/` rule). */
export const DEFAULT_CACHE_DIR = fileURLToPath(new URL('../data/football-data', import.meta.url));

/** Every played match for the given seasons × leagues, sorted by kickoff. Downloads on first use. */
export async function loadMatches(
  seasons: string[],
  leagues: readonly string[] = MAIN_LEAGUES,
  cacheDir = DEFAULT_CACHE_DIR,
): Promise<HistoricalMatch[]> {
  const out: HistoricalMatch[] = [];
  for (const season of seasons) {
    for (const league of leagues) {
      const csv = await loadSeasonCsv(league, season, cacheDir);
      out.push(...parseFootballDataCsv(csv, league, season));
    }
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
}
