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

/**
 * football-data CSVs are UTF-8, but a few older files carry Windows-1252 bytes (e.g. the 0x92
 * apostrophe in "King’s Lynn"). Decode strictly as UTF-8 and fall back to Windows-1252, so no
 * character is silently replaced with U+FFFD.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Node's 'windows-1252' decoder behaves like Latin-1 for 0x80–0x9F, so map that block by hand.
    let out = '';
    for (const b of bytes)
      out += b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] ?? '') : String.fromCharCode(b);
    return out;
  }
}

/** Windows-1252 characters for bytes 0x80–0x9F (unassigned bytes keep their Latin-1 code point). */
const CP1252_HIGH = [
  '\u20ac',
  '\u0081',
  '\u201a',
  '\u0192',
  '\u201e',
  '\u2026',
  '\u2020',
  '\u2021',
  '\u02c6',
  '\u2030',
  '\u0160',
  '\u2039',
  '\u0152',
  '\u008d',
  '\u017d',
  '\u008f',
  '\u0090',
  '\u2018',
  '\u2019',
  '\u201c',
  '\u201d',
  '\u2022',
  '\u2013',
  '\u2014',
  '\u02dc',
  '\u2122',
  '\u0161',
  '\u203a',
  '\u0153',
  '\u009d',
  '\u017e',
  '\u0178',
];

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
  const text = decodeCsvBytes(new Uint8Array(await res.arrayBuffer()));
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
