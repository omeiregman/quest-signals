import type { BookMarkets, HistoricalMatch, MarketKey } from './types';

/**
 * football-data 1X2 book codes, matched by EXACT column name: pre-match `${code}H/D/A`, closing
 * `${code}CH/CD/CA`. (Exact lookups matter: e.g. Betfred closing `BFDCH` must never be read as
 * some `BF…` column.) Max/Avg are the market maximum/average across books.
 */
export const BOOK_CODES_1X2 = [
  'B365',
  'BFD',
  'BMGM',
  'BV',
  'BW',
  'CL',
  'LB',
  'PS',
  'PP',
  'SKB',
  'WH',
  'IW',
  'VC',
  '1XB',
  'BF',
  'BFE',
  'Max',
  'Avg',
] as const;

/**
 * Over/under 2.5 header prefix → book code. Pre-match `${prefix}>2.5` / `${prefix}<2.5`, closing
 * `${prefix}C>2.5` / `${prefix}C<2.5`. Pinnacle's prefix is plain `P` (book code PS). These are
 * the only O/U prefixes in the 2025/26 and 2026/27 files.
 */
export const OU25_PREFIXES: Readonly<Record<string, string>> = {
  B365: 'B365',
  P: 'PS',
  Max: 'Max',
  Avg: 'Avg',
  BFE: 'BFE',
};

/** One book-market-phase and the exact columns holding its prices, in MARKET_SELECTIONS order. */
interface PriceColumns {
  book: string;
  market: MarketKey;
  closing: boolean;
  columns: readonly string[];
}

const PRICE_COLUMNS: readonly PriceColumns[] = [
  ...BOOK_CODES_1X2.flatMap((code): PriceColumns[] => [
    { book: code, market: '1x2', closing: false, columns: [`${code}H`, `${code}D`, `${code}A`] },
    { book: code, market: '1x2', closing: true, columns: [`${code}CH`, `${code}CD`, `${code}CA`] },
  ]),
  ...Object.entries(OU25_PREFIXES).flatMap(([p, code]): PriceColumns[] => [
    { book: code, market: 'ou25', closing: false, columns: [`${p}>2.5`, `${p}<2.5`] },
    { book: code, market: 'ou25', closing: true, columns: [`${p}C>2.5`, `${p}C<2.5`] },
  ]),
  // Legacy (pre-2019/20) Betbrain max/average columns. Listed last, so they only fill Max/Avg when
  // the modern columns are absent or invalid for that row. They never had closing variants.
  { book: 'Max', market: '1x2', closing: false, columns: ['BbMxH', 'BbMxD', 'BbMxA'] },
  { book: 'Avg', market: '1x2', closing: false, columns: ['BbAvH', 'BbAvD', 'BbAvA'] },
  { book: 'Max', market: 'ou25', closing: false, columns: ['BbMx>2.5', 'BbMx<2.5'] },
  { book: 'Avg', market: 'ou25', closing: false, columns: ['BbAv>2.5', 'BbAv<2.5'] },
];

const REQUIRED_COLUMNS = ['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG'] as const;

// Strict number shapes: plain decimals only (rejects '', '1e3', '0x10', 'Infinity', '-0.25').
const PRICE_RE = /^\d+(?:\.\d+)?$/;
const GOALS_RE = /^\d+$/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** Split one CSV line on commas, honouring simple double-quoted fields ("a,b" and "" escapes). */
function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 'DD/MM/YYYY' or 'DD/MM/YY' (→ 20YY) → 'YYYY-MM-DD'; undefined unless a real calendar date. */
function parseDate(raw: string): string | undefined {
  const m = DATE_RE.exec(raw);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'HH:MM' (or 'H:MM') → 'HH:MM'; undefined when missing or malformed. */
function parseTime(raw: string): string | undefined {
  const m = TIME_RE.exec(raw);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** A decimal price, or undefined unless it is a finite number > 1. */
function parsePrice(raw: string): number | undefined {
  if (!PRICE_RE.test(raw)) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) && v > 1 ? v : undefined;
}

/**
 * Parse one football-data.co.uk season CSV (one league, one season) into played matches.
 * `league` and `season` label the rows (the file's own Div column must agree with `league`
 * when present). Rows without a full-time score are skipped. A book's market is included only
 * when every selection's price is a finite number > 1.
 *
 * Details:
 * - Accepts a UTF-8 BOM and LF / CRLF line endings; blank (or all-empty-field) lines are skipped.
 * - Throws if the header lacks any of Date, HomeTeam, AwayTeam, FTHG, FTAG (not a results file).
 * - Throws if a row's non-empty Div differs from `league` (a mislabelled file is a caller bug;
 *   skipping would silently yield an empty or partial season).
 * - Skips rows with no Home/AwayTeam, an unparseable Date (DD/MM/YYYY or DD/MM/YY → 20YY), or
 *   non-integer FTHG/FTAG (unplayed, postponed, abandoned).
 * - kickoff = `${date}T${Time}`, or `${date}T00:00` when Time is missing/malformed.
 * - Prices come only from the explicit column names in BOOK_CODES_1X2 / OU25_PREFIXES (+ legacy
 *   BbMx/BbAv → Max/Avg); books with no valid market in a phase are omitted from that phase.
 */
export function parseFootballDataCsv(
  csv: string,
  league: string,
  season: string,
): HistoricalMatch[] {
  const lines = csv.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const headerIdx = lines.findIndex((l) => l.trim() !== '');
  const header = headerIdx === -1 ? [] : splitCsvLine(lines[headerIdx]!).map((h) => h.trim());

  const col = new Map<string, number>();
  header.forEach((name, i) => {
    if (name && !col.has(name)) col.set(name, i); // first occurrence wins; ignore '' names
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !col.has(c));
  if (missing.length > 0) {
    throw new Error(
      `football-data ${league} ${season}: header is missing column(s) ${missing.join(', ')}`,
    );
  }

  // Resolve the price column sets this header actually carries (all columns present).
  const priceCols = PRICE_COLUMNS.flatMap((pc) => {
    const idx = pc.columns.map((c) => col.get(c));
    return idx.every((i) => i !== undefined) ? [{ ...pc, idx: idx as number[] }] : [];
  });

  const matches: HistoricalMatch[] = [];
  for (let li = headerIdx + 1; li < lines.length; li++) {
    const line = lines[li]!;
    if (line.trim() === '') continue;
    const fields = splitCsvLine(line).map((f) => f.trim());
    if (fields.every((f) => f === '')) continue;
    const get = (name: string): string => {
      const i = col.get(name);
      return i === undefined ? '' : (fields[i] ?? '');
    };

    const div = get('Div');
    if (div !== '' && div !== league) {
      throw new Error(
        `football-data ${league} ${season}: line ${li + 1} has Div '${div}', expected '${league}'`,
      );
    }

    const date = parseDate(get('Date'));
    const homeTeam = get('HomeTeam');
    const awayTeam = get('AwayTeam');
    const fthg = get('FTHG');
    const ftag = get('FTAG');
    if (!date || !homeTeam || !awayTeam || !GOALS_RE.test(fthg) || !GOALS_RE.test(ftag)) continue;

    const prematch: Record<string, BookMarkets> = {};
    const closing: Record<string, BookMarkets> = {};
    for (const pc of priceCols) {
      const target = pc.closing ? closing : prematch;
      if (target[pc.book]?.[pc.market] !== undefined) continue; // an earlier column set won
      const prices: number[] = [];
      for (const i of pc.idx) {
        const p = parsePrice(fields[i] ?? '');
        if (p === undefined) break;
        prices.push(p);
      }
      if (prices.length !== pc.idx.length) continue;
      (target[pc.book] ??= {})[pc.market] = prices;
    }

    matches.push({
      id: `${league}:${date}:${homeTeam}:${awayTeam}`,
      league,
      season,
      date,
      kickoff: `${date}T${parseTime(get('Time')) ?? '00:00'}`,
      homeTeam,
      awayTeam,
      homeGoals: Number(fthg),
      awayGoals: Number(ftag),
      prematch,
      closing,
    });
  }
  return matches;
}
