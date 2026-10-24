import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOOTBALL_DATA_BASE,
  LEAGUE_NAMES,
  MAIN_LEAGUES,
  decodeCsvBytes,
  loadSeasonCsv,
} from './download';

const CSV = '﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\r\nE0,15/08/2025,20:00,A,B,1,0\r\n';

/** A fake fetch answering every request with `body` / `status`; records the URLs it saw. */
function fakeFetch(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}
const noFetch = vi.fn<typeof fetch>(async () => {
  throw new Error('network must not be used');
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fd-cache-'));
  noFetch.mockClear();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadSeasonCsv', () => {
  it('downloads on a cache miss and writes ${cacheDir}/${season}/${league}.csv', async () => {
    const f = fakeFetch(CSV);
    const text = await loadSeasonCsv('E0', '2526', dir, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe(`${FOOTBALL_DATA_BASE}/2526/E0.csv`);
    expect(f.mock.calls[0]![0]).toBe('https://football-data.co.uk/mmz4281/2526/E0.csv');
    expect(text).toContain('Div,Date');
    expect(await readFile(join(dir, '2526', 'E0.csv'), 'utf8')).toBe(text);
    expect(await readdir(join(dir, '2526'))).toEqual(['E0.csv']); // no temp file left behind
  });

  it('returns the cached text without fetching', async () => {
    await mkdir(join(dir, '2627'), { recursive: true });
    await writeFile(join(dir, '2627', 'SC0.csv'), 'Div,cached\n');
    expect(await loadSeasonCsv('SC0', '2627', dir, { fetchImpl: noFetch })).toBe('Div,cached\n');
    expect(noFetch).not.toHaveBeenCalled();

    const f = fakeFetch(CSV);
    await loadSeasonCsv('E1', '2526', dir, { fetchImpl: f });
    await loadSeasonCsv('E1', '2526', dir, { fetchImpl: noFetch });
    expect(f).toHaveBeenCalledTimes(1);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('re-downloads and overwrites the cache with refresh', async () => {
    await mkdir(join(dir, '2526'), { recursive: true });
    await writeFile(join(dir, '2526', 'E0.csv'), 'Div,old\n');
    const f = fakeFetch('Div,new\n');
    expect(await loadSeasonCsv('E0', '2526', dir, { refresh: true, fetchImpl: f })).toBe(
      'Div,new\n',
    );
    expect(f).toHaveBeenCalledTimes(1);
    expect(await readFile(join(dir, '2526', 'E0.csv'), 'utf8')).toBe('Div,new\n');
  });

  it('throws on a non-OK status and caches nothing', async () => {
    await expect(
      loadSeasonCsv('E0', '2526', dir, { fetchImpl: fakeFetch('', 404) }),
    ).rejects.toThrow(
      'football-data E0 2526: HTTP 404 fetching https://football-data.co.uk/mmz4281/2526/E0.csv',
    );
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  it('throws when the body is not a football-data CSV and caches nothing', async () => {
    const html = '<!DOCTYPE html><html><body>Moved</body></html>';
    await expect(loadSeasonCsv('E0', '2526', dir, { fetchImpl: fakeFetch(html) })).rejects.toThrow(
      /not a football-data CSV \(starts "<!DOCTYPE html>/,
    );
    await expect(loadSeasonCsv('E0', '2526', dir, { fetchImpl: fakeFetch('') })).rejects.toThrow(
      /not a football-data CSV/,
    );
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  it('a failed refresh keeps the existing cache file', async () => {
    await mkdir(join(dir, '2526'), { recursive: true });
    await writeFile(join(dir, '2526', 'E0.csv'), 'Div,old\n');
    await expect(
      loadSeasonCsv('E0', '2526', dir, { refresh: true, fetchImpl: fakeFetch('oops', 500) }),
    ).rejects.toThrow(/HTTP 500/);
    expect(await readFile(join(dir, '2526', 'E0.csv'), 'utf8')).toBe('Div,old\n');
  });

  it('rejects malformed league/season codes before touching disk or network', async () => {
    for (const [league, season] of [
      ['../E0', '2526'],
      ['E0', '../x'],
      ['e0', '2526'],
      ['E0', '25/26'],
      ['', '2526'],
    ]) {
      await expect(loadSeasonCsv(league!, season!, dir, { fetchImpl: noFetch })).rejects.toThrow(
        /invalid football-data/,
      );
    }
    expect(noFetch).not.toHaveBeenCalled();
  });
});

describe('LEAGUE_NAMES', () => {
  it('names every main league', () => {
    for (const l of MAIN_LEAGUES) expect(LEAGUE_NAMES[l], l).toBeTruthy();
    expect(Object.keys(LEAGUE_NAMES).sort()).toEqual([...MAIN_LEAGUES].sort());
    expect(LEAGUE_NAMES.E0).toBe('Premier League');
    expect(LEAGUE_NAMES.SP2).toBe('Segunda División');
    expect(LEAGUE_NAMES.T1).toBe('Süper Lig');
  });
});

describe('decodeCsvBytes', () => {
  it('keeps UTF-8 as is and falls back to Windows-1252 instead of inserting U+FFFD', () => {
    const utf8 = new TextEncoder().encode('Div,HomeTeam\nEC,Bayern München\n');
    expect(decodeCsvBytes(utf8)).toContain('München');
    const cp1252 = Uint8Array.from([
      ...new TextEncoder().encode('EC,King'),
      0x92,
      ...new TextEncoder().encode('s Lynn'),
    ]);
    const text = decodeCsvBytes(cp1252);
    expect(text).toBe('EC,King\u2019s Lynn');
    expect(text).not.toContain('\ufffd');
  });
});
