import { describe, expect, it } from 'vitest';
import { buildCandidates, candidatesForMatch, type CandidateConfig } from './candidates';
import type { HistoricalMatch } from './types';

const match: HistoricalMatch = {
  id: 'E0:2025-08-16:Alpha:Beta',
  league: 'E0',
  season: '2526',
  date: '2025-08-16',
  kickoff: '2025-08-16T15:00',
  homeTeam: 'Alpha',
  awayTeam: 'Beta',
  homeGoals: 2,
  awayGoals: 1,
  prematch: {
    // Exchange: no margin, so fair = 1/odds exactly: 0.5 / 0.25 / 0.25.
    BFE: { '1x2': [2, 4, 4], ou25: [2, 2] },
    B365: { '1x2': [2.2, 3.6, 4.4], ou25: [1.9, 2.1] },
    BW: { '1x2': [1.9, 4.2, 3.9] },
  },
  closing: { BFE: { '1x2': [2.5, 4, 20 / 7] } }, // fair 0.4 / 0.25 / 0.35
};

const cfg: CandidateConfig = {
  reference: 'BFE',
  books: ['B365', 'BW'],
  markets: ['1x2', 'ou25'],
  devig: 'multiplicative',
};

describe('candidatesForMatch', () => {
  const out = candidatesForMatch(match, cfg);
  const find = (book: string, sel: string) =>
    out.find((c) => c.book === book && c.selection === sel);

  it('keeps only positive-edge selections, priced against the de-vigged reference', () => {
    // B365 Home 2.2 × 0.5 = 1.10 → +10%; B365 Away 4.4 × 0.25 → +10%; BW Draw 4.2 × 0.25 → +5%.
    expect(find('B365', 'Home')!.edge).toBeCloseTo(0.1, 10);
    expect(find('B365', 'Away')!.edge).toBeCloseTo(0.1, 10);
    expect(find('BW', 'Draw')!.edge).toBeCloseTo(0.05, 10);
    // B365 Draw 3.6 × 0.25 = 0.9 and BW Home 1.9 × 0.5 = 0.95 are negative edges.
    expect(find('B365', 'Draw')).toBeUndefined();
    expect(find('BW', 'Home')).toBeUndefined();
    // Under 2.1 × 0.5 → +5%; Over 1.9 → negative.
    expect(find('B365', 'Under')!.edge).toBeCloseTo(0.05, 10);
    expect(find('B365', 'Over')).toBeUndefined();
  });

  it('settles from the score and grades against the closing line', () => {
    const home = find('B365', 'Home')!;
    expect(home.won).toBe(true); // 2-1
    expect(home.score).toBe('2-1');
    expect(home.closingFairProb).toBeCloseTo(0.4, 10);
    expect(home.clv).toBeCloseTo(2.2 * 0.4 - 1, 10); // the line moved against us
    expect(find('B365', 'Under')!.won).toBe(false); // 3 goals
    expect(find('B365', 'Under')!.clv).toBeUndefined(); // no closing ou25 reference
  });

  it('skips markets whose reference overround is implausible', () => {
    const thin: HistoricalMatch = { ...match, prematch: { ...match.prematch, BFE: { '1x2': [1.6, 3, 3] } } };
    // Σ1/o = 0.625 + 0.333 + 0.333 ≈ 1.29 → a 29% overround, outside the default band.
    expect(candidatesForMatch(thin, cfg).filter((c) => c.market === '1x2')).toEqual([]);
  });

  it('never prices the reference against itself and skips books missing the market', () => {
    const all = buildCandidates([match], { ...cfg, books: ['BFE', 'B365', 'BW', 'BV'] });
    expect(all.every((c) => c.book !== 'BFE' && c.book !== 'BV')).toBe(true);
  });
});
