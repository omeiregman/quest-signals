import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFootballDataCsv } from './football-data';
import { MARKET_SELECTIONS, type HistoricalMatch, type MarketKey } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
// Real football-data files (header + a few rows each, copied byte-for-byte: UTF-8 BOM + CRLF).
const CSV_2526 = readFileSync(join(HERE, 'fixtures/E0_2526_sample.csv'), 'utf8');
const CSV_2627 = readFileSync(join(HERE, 'fixtures/E0_2627_sample.csv'), 'utf8');

/** CSV as LF-only lines with the BOM removed. */
function lines(csv: string): string[] {
  return csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l !== '');
}

/** The raw text of `column` in data row `row` (0-based) of a fixture. */
function cell(csv: string, row: number, column: string): string {
  const [header, ...rows] = lines(csv);
  const i = header!.split(',').indexOf(column);
  if (i === -1) throw new Error(`no column ${column}`);
  return rows[row]!.split(',')[i]!;
}

/** Copy of `csv` with `column` of data row `row` set to `value`. */
function withCell(csv: string, row: number, column: string, value: string): string {
  const [header, ...rows] = lines(csv);
  const i = header!.split(',').indexOf(column);
  if (i === -1) throw new Error(`no column ${column}`);
  const fields = rows[row]!.split(',');
  fields[i] = value;
  rows[row] = fields.join(',');
  return [header, ...rows].join('\n');
}

function byTeams(matches: HistoricalMatch[], home: string): HistoricalMatch {
  const m = matches.find((x) => x.homeTeam === home);
  if (!m) throw new Error(`no match with home team ${home}`);
  return m;
}

describe('parseFootballDataCsv — 2025/26 format (with Pinnacle)', () => {
  const matches = parseFootballDataCsv(CSV_2526, 'E0', '2526');

  it('parses every played row with labels, date, kickoff, score and id', () => {
    expect(matches).toHaveLength(4);
    const m = matches[0]!;
    expect(m).toMatchObject({
      id: 'E0:2025-08-15:Liverpool:Bournemouth',
      league: 'E0',
      season: '2526',
      date: '2025-08-15',
      kickoff: '2025-08-15T20:00',
      homeTeam: 'Liverpool',
      awayTeam: 'Bournemouth',
      homeGoals: 4,
      awayGoals: 2,
    });
    expect(matches.map((x) => x.id)).toEqual([
      'E0:2025-08-15:Liverpool:Bournemouth',
      'E0:2025-08-16:Aston Villa:Newcastle',
      'E0:2025-08-16:Brighton:Fulham',
      'E0:2026-02-01:Tottenham:Man City',
    ]);
  });

  it('reads exact prices for one row (Liverpool v Bournemouth)', () => {
    const m = byTeams(matches, 'Liverpool');
    expect(m.prematch.PS).toEqual({ '1x2': [1.28, 6.56, 9.07], ou25: [1.37, 3.26] });
    expect(m.closing.PS).toEqual({ '1x2': [1.29, 6.55, 9.75], ou25: [1.41, 2.95] });
    expect(m.prematch.BFE).toEqual({ '1x2': [1.34, 6.6, 9.4], ou25: [1.4, 3.4] });
    expect(m.closing.BFE).toEqual({ '1x2': [1.32, 6.8, 10], ou25: [1.41, 3.4] });
    expect(m.prematch.B365).toEqual({ '1x2': [1.3, 6, 8.5], ou25: [1.36, 3.2] });
    expect(m.closing.B365).toEqual({ '1x2': [1.29, 6.25, 9], ou25: [1.36, 3.2] });
    expect(Object.keys(m.prematch).sort()).toEqual(
      ['Avg', 'B365', 'BFD', 'BFE', 'BMGM', 'BV', 'BW', 'CL', 'LB', 'Max', 'PS'].sort(),
    );
    expect(Object.keys(m.closing).sort()).toEqual(Object.keys(m.prematch).sort());
  });

  it('matches the CSV text column-for-column for every 1x2 book in that row', () => {
    const m = byTeams(matches, 'Liverpool');
    const books = ['B365', 'BFD', 'BMGM', 'BV', 'BW', 'CL', 'LB', 'PS', 'Max', 'Avg', 'BFE'];
    for (const b of books) {
      const pre = ['H', 'D', 'A'].map((s) => Number(cell(CSV_2526, 0, `${b}${s}`)));
      const close = ['H', 'D', 'A'].map((s) => Number(cell(CSV_2526, 0, `${b}C${s}`)));
      expect(m.prematch[b]?.['1x2'], `${b} prematch`).toEqual(pre);
      expect(m.closing[b]?.['1x2'], `${b} closing`).toEqual(close);
    }
    for (const [p, code] of [
      ['B365', 'B365'],
      ['P', 'PS'],
      ['Max', 'Max'],
      ['Avg', 'Avg'],
      ['BFE', 'BFE'],
    ] as const) {
      const pre = ['>2.5', '<2.5'].map((s) => Number(cell(CSV_2526, 0, `${p}${s}`)));
      const close = ['>2.5', '<2.5'].map((s) => Number(cell(CSV_2526, 0, `${p}C${s}`)));
      expect(m.prematch[code]?.ou25, `${p} O/U prematch`).toEqual(pre);
      expect(m.closing[code]?.ou25, `${p} O/U closing`).toEqual(close);
    }
  });

  it('keeps pre-match and closing apart (Aston Villa v Newcastle, where they differ)', () => {
    const m = byTeams(matches, 'Aston Villa');
    expect(m.prematch.B365?.['1x2']).toEqual([2.25, 3.5, 2.9]);
    expect(m.closing.B365?.['1x2']).toEqual([2.45, 3.4, 2.8]);
    expect(m.prematch.PS?.['1x2']).toEqual([2.24, 3.72, 3.13]);
    expect(m.closing.PS?.['1x2']).toEqual([2.32, 3.63, 3.07]);
    expect(m.prematch.B365?.ou25).toEqual([1.62, 2.3]);
    expect(m.closing.B365?.ou25).toEqual([1.83, 2.03]);
    expect(m.prematch.BFE?.ou25).toEqual([1.72, 2.36]);
    expect(m.closing.BFE?.ou25).toEqual([1.87, 2.12]);
  });

  it('omits books whose cells are empty in a real row, per phase (Tottenham v Man City)', () => {
    // Feb 2026: Pinnacle columns are empty; Coral has pre-match prices but no closing ones.
    const m = byTeams(matches, 'Tottenham');
    expect(m.prematch.PS).toBeUndefined();
    expect(m.closing.PS).toBeUndefined();
    expect(m.prematch.CL).toEqual({ '1x2': [4.2, 4, 1.75] });
    expect(m.closing.CL).toBeUndefined();
    expect(m.closing.BFE).toEqual({ '1x2': [5.4, 4.2, 1.72], ou25: [1.68, 2.44] });
  });
});

describe('parseFootballDataCsv — 2026/27 format (no Pinnacle)', () => {
  const matches = parseFootballDataCsv(CSV_2627, 'E0', '2627');

  it('parses rows and has no Pinnacle in either phase', () => {
    expect(matches).toHaveLength(4);
    for (const m of matches) {
      expect(m.prematch.PS).toBeUndefined();
      expect(m.closing.PS).toBeUndefined();
    }
  });

  it('reads Betfair Exchange and the new soft books exactly', () => {
    const m = byTeams(matches, 'Arsenal');
    expect(m.id).toBe('E0:2026-08-21:Arsenal:Coventry');
    expect(m.kickoff).toBe('2026-08-21T20:00');
    expect(m.prematch.BFE).toEqual({ '1x2': [1.23, 7.4, 18], ou25: [1.64, 2.54] });
    expect(m.closing.BFE).toEqual({ '1x2': [1.23, 7.4, 18], ou25: [1.63, 2.56] });
    for (const b of ['PP', 'SKB', 'B365', 'BFD', 'BV', 'BW']) {
      const pre = ['H', 'D', 'A'].map((s) => Number(cell(CSV_2627, 0, `${b}${s}`)));
      const close = ['H', 'D', 'A'].map((s) => Number(cell(CSV_2627, 0, `${b}C${s}`)));
      expect(m.prematch[b]?.['1x2'], `${b} prematch`).toEqual(pre);
      expect(m.closing[b]?.['1x2'], `${b} closing`).toEqual(close);
    }
    expect(m.prematch.BMGM).toBeUndefined(); // 2025/26-only book
  });

  it('drops empty closing columns only (Liverpool v Nottm Forest: BFDC*/BVC* blank)', () => {
    const m = byTeams(matches, 'Liverpool');
    expect(m.prematch.BFD?.['1x2']).toHaveLength(3);
    expect(m.prematch.BV?.['1x2']).toHaveLength(3);
    expect(m.closing.BFD).toBeUndefined();
    expect(m.closing.BV).toBeUndefined();
    expect(m.closing.B365?.['1x2']).toEqual([1.48, 4.5, 6]);
  });
});

describe('parseFootballDataCsv — rules', () => {
  it('BFE is present in both seasons, pre-match and closing, both markets', () => {
    for (const [csv, season] of [
      [CSV_2526, '2526'],
      [CSV_2627, '2627'],
    ] as const) {
      for (const m of parseFootballDataCsv(csv, 'E0', season)) {
        for (const phase of [m.prematch, m.closing]) {
          expect(phase.BFE?.['1x2']).toHaveLength(3);
          expect(phase.BFE?.ou25).toHaveLength(2);
        }
      }
    }
  });

  it.each(['', '1', '0', '1.0', 'abc', '-2.5', '1e3', 'Infinity'])(
    'an invalid price (%j) drops only that book-market-phase',
    (bad) => {
      const csv = withCell(CSV_2526, 0, 'BFED', bad);
      const m = parseFootballDataCsv(csv, 'E0', '2526')[0]!;
      expect(m.prematch.BFE).toEqual({ ou25: [1.4, 3.4] }); // 1x2 gone, O/U kept
      expect(m.closing.BFE).toEqual({ '1x2': [1.32, 6.8, 10], ou25: [1.41, 3.4] });
      expect(m.prematch.PS?.['1x2']).toEqual([1.28, 6.56, 9.07]);
    },
  );

  it('omits a book entirely when it has no valid market in a phase', () => {
    let csv = withCell(CSV_2526, 0, 'P>2.5', '');
    csv = withCell(csv, 0, 'PSA', '0');
    const m = parseFootballDataCsv(csv, 'E0', '2526')[0]!;
    expect(m.prematch.PS).toBeUndefined();
    expect('PS' in m.prematch).toBe(false);
    expect(m.closing.PS).toEqual({ '1x2': [1.29, 6.55, 9.75], ou25: [1.41, 2.95] });
  });

  it('skips unplayed rows (no full-time score) and keeps the rest', () => {
    let csv = withCell(CSV_2526, 1, 'FTHG', '');
    csv = withCell(csv, 1, 'FTAG', '');
    const ids = parseFootballDataCsv(csv, 'E0', '2526').map((m) => m.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('E0:2025-08-16:Aston Villa:Newcastle');
    const halfOnly = withCell(CSV_2526, 1, 'FTAG', '');
    expect(parseFootballDataCsv(halfOnly, 'E0', '2526')).toHaveLength(3);
  });

  it('skips rows lacking teams or a valid date', () => {
    let csv = withCell(CSV_2526, 0, 'HomeTeam', '');
    csv = withCell(csv, 1, 'Date', '31/02/2025');
    csv = withCell(csv, 2, 'Date', '');
    const ids = parseFootballDataCsv(csv, 'E0', '2526').map((m) => m.id);
    expect(ids).toEqual(['E0:2026-02-01:Tottenham:Man City']);
  });

  it('accepts DD/MM/YY (→ 20YY) and single-digit day/month', () => {
    let csv = withCell(CSV_2526, 0, 'Date', '15/08/25');
    csv = withCell(csv, 1, 'Date', '6/8/2025');
    const [a, b] = parseFootballDataCsv(csv, 'E0', '2526');
    expect(a!.date).toBe('2025-08-15');
    expect(a!.kickoff).toBe('2025-08-15T20:00');
    expect(a!.id).toBe('E0:2025-08-15:Liverpool:Bournemouth');
    expect(b!.date).toBe('2025-08-06');
  });

  it('uses T00:00 when Time is missing, blank or malformed', () => {
    const csv = [
      'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A',
      'E0,15/08/2025,A,B,1,0,2.1,3.4,3.5',
    ].join('\n');
    expect(parseFootballDataCsv(csv, 'E0', '2526')[0]!.kickoff).toBe('2025-08-15T00:00');
    const blank = withCell(CSV_2526, 0, 'Time', '');
    expect(parseFootballDataCsv(blank, 'E0', '2526')[0]!.kickoff).toBe('2025-08-15T00:00');
    const bad = withCell(CSV_2526, 0, 'Time', '25:99');
    expect(parseFootballDataCsv(bad, 'E0', '2526')[0]!.kickoff).toBe('2025-08-15T00:00');
    const short = withCell(CSV_2526, 0, 'Time', '9:05');
    expect(parseFootballDataCsv(short, 'E0', '2526')[0]!.kickoff).toBe('2025-08-15T09:05');
  });

  it('handles a BOM and CRLF identically to plain LF', () => {
    const lf = lines(CSV_2526).join('\n');
    const bomCrlf = `﻿${lines(CSV_2526).join('\r\n')}\r\n\r\n`;
    expect(CSV_2526.startsWith('﻿')).toBe(true); // the real file carries both
    expect(CSV_2526).toContain('\r\n');
    const expected = parseFootballDataCsv(lf, 'E0', '2526');
    expect(expected).toHaveLength(4);
    expect(parseFootballDataCsv(bomCrlf, 'E0', '2526')).toEqual(expected);
    expect(parseFootballDataCsv(CSV_2526, 'E0', '2526')).toEqual(expected);
    // The BOM must not hide the Div column: a mislabelled BOM'd file is still caught.
    expect(() => parseFootballDataCsv(bomCrlf, 'E1', '2526')).toThrow(/Div 'E0'/);
  });

  it('skips blank and all-comma lines', () => {
    const [header, ...rows] = lines(CSV_2627);
    const commas = ','.repeat(header!.split(',').length - 1);
    const csv = ['', header, rows[0], '', '   ', commas, rows[1], commas].join('\n');
    expect(parseFootballDataCsv(csv, 'E0', '2627')).toHaveLength(2);
  });

  it('throws when Div disagrees with the league label', () => {
    expect(() => parseFootballDataCsv(CSV_2526, 'E1', '2526')).toThrow(
      /E1 2526: line 2 has Div 'E0', expected 'E1'/,
    );
    const oneBad = withCell(CSV_2526, 3, 'Div', 'SC0');
    expect(() => parseFootballDataCsv(oneBad, 'E0', '2526')).toThrow(/line 5 has Div 'SC0'/);
    // No Div column (or a blank Div cell) is fine.
    const noDiv = withCell(CSV_2526, 0, 'Div', '');
    expect(parseFootballDataCsv(noDiv, 'E0', '2526')).toHaveLength(4);
  });

  it('throws on a file without the result columns', () => {
    expect(() => parseFootballDataCsv('', 'E0', '2526')).toThrow(/missing column/);
    expect(() => parseFootballDataCsv('<html><body>Not found</body></html>', 'E0', '2526')).toThrow(
      /missing column\(s\) Date, HomeTeam, AwayTeam, FTHG, FTAG/,
    );
  });

  it('supports simple double-quoted fields', () => {
    const csv = [
      'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A',
      'E0,15/08/2025,15:00,"Brighton, Hove","Say ""Hi"" FC","1","1","2.1",3.4,"3.5"',
    ].join('\n');
    const [m] = parseFootballDataCsv(csv, 'E0', '2526');
    expect(m!.homeTeam).toBe('Brighton, Hove');
    expect(m!.awayTeam).toBe('Say "Hi" FC');
    expect(m!.id).toBe('E0:2025-08-15:Brighton, Hove:Say "Hi" FC');
    expect(m!.prematch.B365).toEqual({ '1x2': [2.1, 3.4, 3.5] });
  });

  it('uses exact column names only (BFDC* is Betfred closing, never a BF book)', () => {
    const csv = [
      'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,BFDCH,BFDCD,BFDCA,BFEC>2.5,BFEC<2.5,PSH,PSD',
      'E0,15/08/2025,A,B,1,0,2.1,3.4,3.5,1.9,1.95,2.2,3.3',
    ].join('\n');
    const [m] = parseFootballDataCsv(csv, 'E0', '2526');
    expect(m!.prematch).toEqual({}); // PS lacks PSA; nothing else is pre-match
    expect(m!.closing).toEqual({ BFD: { '1x2': [2.1, 3.4, 3.5] }, BFE: { ou25: [1.9, 1.95] } });
  });

  it('maps legacy BbMx/BbAv columns to Max/Avg', () => {
    const csv = [
      'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,BbMxH,BbMxD,BbMxA,BbAvH,BbAvD,BbAvA,BbMx>2.5,BbMx<2.5,BbAv>2.5,BbAv<2.5',
      'E0,13/08/16,Burnley,Swansea,0,1,2.5,3.5,3.4,2.37,3.24,3.12,2.2,1.8,2.06,1.75',
    ].join('\r\n');
    const [m] = parseFootballDataCsv(csv, 'E0', '1617');
    expect(m!.date).toBe('2016-08-13');
    expect(m!.prematch).toEqual({
      Max: { '1x2': [2.5, 3.5, 3.4], ou25: [2.2, 1.8] },
      Avg: { '1x2': [2.37, 3.24, 3.12], ou25: [2.06, 1.75] },
    });
    expect(m!.closing).toEqual({});
  });
});

// Every real downloaded file we can find: the session scratchpad copy (flat `${league}_${season}.csv`,
// override with FOOTBALL_DATA_CSV_DIR) and the CLI cache (`data/football-data/${season}/${league}.csv`).
const SCRATCH_DIR =
  process.env.FOOTBALL_DATA_CSV_DIR ??
  '/tmp/claude-0/-home-user-quest-signals/d678a001-642a-573a-953e-06f1ed1526fb/scratchpad/fd';
const CACHE_DIR = join(HERE, '..', 'data', 'football-data');

function realFiles(): { path: string; league: string; season: string }[] {
  const out: { path: string; league: string; season: string }[] = [];
  if (existsSync(SCRATCH_DIR)) {
    for (const f of readdirSync(SCRATCH_DIR)) {
      const m = /^([A-Z0-9]+)_(\d{4})\.csv$/.exec(f);
      if (m) out.push({ path: join(SCRATCH_DIR, f), league: m[1]!, season: m[2]! });
    }
  }
  if (existsSync(CACHE_DIR)) {
    for (const season of readdirSync(CACHE_DIR).filter((s) => /^\d{4}$/.test(s))) {
      for (const f of readdirSync(join(CACHE_DIR, season))) {
        const m = /^([A-Z0-9]+)\.csv$/.exec(f);
        if (m) out.push({ path: join(CACHE_DIR, season, f), league: m[1]!, season });
      }
    }
  }
  return out;
}

describe('parseFootballDataCsv — real files (skipped when none are on disk)', () => {
  const files = realFiles();

  it.skipIf(files.length === 0)('parses each with >0 matches and only valid numbers', () => {
    const problems: string[] = []; // collected, then asserted once (per-value expects are slow)
    for (const { path, league, season } of files) {
      const matches = parseFootballDataCsv(readFileSync(path, 'utf8'), league, season);
      if (matches.length === 0) problems.push(`${path}: no matches`);
      const ids = new Set<string>();
      for (const m of matches) {
        if (m.league !== league || m.season !== season) problems.push(`${m.id}: labels`);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(m.kickoff) || !m.kickoff.startsWith(m.date)) {
          problems.push(`${m.id}: kickoff ${m.kickoff}`);
        }
        if (m.id !== `${league}:${m.date}:${m.homeTeam}:${m.awayTeam}`) problems.push(`id ${m.id}`);
        if (!Number.isInteger(m.homeGoals) || !Number.isInteger(m.awayGoals)) {
          problems.push(`${m.id}: goals`);
        }
        if (ids.has(m.id)) problems.push(`${m.id}: duplicate id`);
        ids.add(m.id);
        for (const phase of [m.prematch, m.closing]) {
          for (const [book, markets] of Object.entries(phase)) {
            const keys = Object.keys(markets) as MarketKey[];
            if (keys.length === 0) problems.push(`${m.id} ${book}: empty book`);
            for (const k of keys) {
              const prices = markets[k] ?? [];
              const ok =
                prices.length === MARKET_SELECTIONS[k].length &&
                prices.every((p) => Number.isFinite(p) && p > 1);
              if (!ok) problems.push(`${m.id} ${book} ${k}: ${JSON.stringify(prices)}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
