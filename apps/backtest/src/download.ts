import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** football-data.co.uk's 22 main European divisions (all carry Betfair Exchange + closing odds). */
export const MAIN_LEAGUES = [
  'E0',
  'E1',
  'E2',
  'E3',
  'EC',
  'SC0',
  'SC1',
  'SC2',
  'SC3',
  'D1',
  'D2',
  'I1',
  'I2',
  'SP1',
  'SP2',
  'F1',
  'F2',
  'N1',
  'B1',
  'P1',
  'T1',
  'G1',
] as const;

export const FOOTBALL_DATA_BASE = 'https://football-data.co.uk/mmz4281';

/** Human-readable league names for reports. */
export const LEAGUE_NAMES: Record<string, string> = {
  E0: 'Premier League',
  E1: 'Championship',
  E2: 'League One',
  E3: 'League Two',
  EC: 'National League',
  SC0: 'Scottish Premiership',
  SC1: 'Scottish Championship',
  SC2: 'Scottish League One',
  SC3: 'Scottish League Two',
  D1: 'Bundesliga',
  D2: '2. Bundesliga',
  I1: 'Serie A',
  I2: 'Serie B',
  SP1: 'La Liga',
  SP2: 'Segunda División',
  F1: 'Ligue 1',
  F2: 'Ligue 2',
  N1: 'Eredivisie',
  B1: 'Belgian Pro League',
  P1: 'Primeira Liga',
  T1: 'Süper Lig',
  G1: 'Greek Super League',
};

const LEAGUE_RE = /^[A-Z0-9]{1,4}$/; // football-data division codes (also keeps paths safe)
const SEASON_RE = /^\d{4}$/; // '2526' = 2025/26
const FETCH_TIMEOUT_MS = 60_000;

function isNotFound(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'ENOENT';
}

/**
 * Return the CSV text for one league-season, downloading it into
 * `${cacheDir}/${season}/${league}.csv` on first use (pass `refresh` to re-download).
 *
 * Throws on a malformed league/season code, a non-OK HTTP status, or a body that isn't a
 * football-data CSV (must start with `Div,` after any BOM); nothing is cached in those cases.
 * The cache file is written via a temp file + rename, so it is never left half-written.
 */
export async function loadSeasonCsv(
  league: string,
  season: string,
  cacheDir: string,
  opts?: { refresh?: boolean; fetchImpl?: typeof fetch },
): Promise<string> {
  if (!LEAGUE_RE.test(league)) throw new Error(`invalid football-data league code '${league}'`);
  if (!SEASON_RE.test(season)) throw new Error(`invalid football-data season '${season}'`);
  const file = join(cacheDir, season, `${league}.csv`);

  if (!opts?.refresh) {
    try {
      return await readFile(file, 'utf8');
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  const url = `${FOOTBALL_DATA_BASE}/${season}/${league}.csv`;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`football-data ${league} ${season}: HTTP ${res.status} fetching ${url}`);
  }
  const text = await res.text();
  if (!text.replace(/^﻿/, '').startsWith('Div,')) {
    throw new Error(
      `football-data ${league} ${season}: ${url} is not a football-data CSV ` +
        `(starts ${JSON.stringify(text.slice(0, 40))})`,
    );
  }

  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
  return text;
}
