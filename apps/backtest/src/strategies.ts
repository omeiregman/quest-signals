import { DEVIG_METHODS, type SlateRules } from '@quest/core';
import type { CandidateConfig } from './candidates';
import type { MarketKey } from './types';

/** Soft books present in both 2025/26 and 2026/27 football-data files: stand-ins for LT books. */
export const SOFT_BOOKS = ['B365', 'BW', 'BV', 'BFD'] as const;

/** One account (B365 or BW stand in for an LT book) vs holding all four. */
export const BOOK_SETS: Record<string, string[]> = {
  B365: ['B365'],
  BW: ['BW'],
  all4: [...SOFT_BOOKS],
};

/** Max reference overround: 3% keeps only liquid markets (FINDINGS D3); 8% lets thin ones in. */
export const REF_OVERROUND_CAPS = [0.03, 0.08] as const;

export const MARKET_SETS: Record<string, MarketKey[]> = {
  '1x2': ['1x2'],
  ou25: ['ou25'],
  both: ['1x2', 'ou25'],
};

export interface CandidateVariant {
  key: string;
  cfg: CandidateConfig;
}

export function candidateGrid(references: string[]): CandidateVariant[] {
  const out: CandidateVariant[] = [];
  for (const reference of references)
    for (const devig of DEVIG_METHODS)
      for (const [booksKey, books] of Object.entries(BOOK_SETS))
        for (const [marketsKey, markets] of Object.entries(MARKET_SETS))
          for (const cap of REF_OVERROUND_CAPS)
            out.push({
              key: `${reference}/${devig}/${booksKey}/${marketsKey}/r${cap}`,
              cfg: { reference, devig, books, markets, referenceOverround: [-0.03, cap] },
            });
  return out;
}

export const ODDS_WINDOWS: [number, number][] = [
  [1.3, 2.6],
  [1.8, 4],
  [2.5, 6],
  [3.5, 10],
  [1.3, 10],
];

export function rulesGrid(): { key: string; rules: SlateRules }[] {
  const out: { key: string; rules: SlateRules }[] = [];
  for (const minEdge of [0.02, 0.03, 0.05, 0.08])
    for (const [minOdds, maxOdds] of ODDS_WINDOWS)
      for (const staking of ['equal-return', 'equal'] as const)
        for (const maxPicks of [3, 5, 8, 12])
          for (const rankBy of ['edge', 'sharpe'] as const)
            out.push({
              key: `e${minEdge}/o${minOdds}-${maxOdds}/${staking}/n${maxPicks}/${rankBy}`,
              rules: {
                minEdge,
                maxEdge: 0.3,
                minOdds,
                maxOdds,
                maxPicks,
                minPicks: 1,
                staking,
                maxCoverage: 1,
                rankBy,
              },
            });
  return out;
}
