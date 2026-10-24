import type { SlateRules } from '@quest/core';
import type { CandidateConfig } from './candidates';
import { SOFT_BOOKS } from './strategies';

/**
 * The strategies the report replays week by week. Fixed BEFORE looking at their results (no
 * tuning on outcomes) so the replay is an honest "what would have happened".
 */
export interface Preset {
  id: string;
  name: string;
  summary: string;
  candidates: CandidateConfig;
  rules: SlateRules;
}

const liquidBfe = (books: string[]): CandidateConfig => ({
  reference: 'BFE',
  devig: 'power',
  books,
  markets: ['1x2', 'ou25'],
  referenceOverround: [-0.03, 0.03],
});

const slate = (minEdge: number, extra: Partial<SlateRules> = {}): SlateRules => ({
  minEdge,
  maxEdge: 0.3,
  minOdds: 1.5,
  maxOdds: 8,
  maxPicks: 8,
  minPicks: 1,
  staking: 'equal-return',
  maxCoverage: 1,
  rankBy: 'edge',
  ...extra,
});

export const PRESETS: Preset[] = [
  {
    id: 'strict',
    name: 'Strict value',
    summary:
      'Edge ≥ 2% against a liquid Betfair Exchange price, best of four bookmaker accounts, odds 1.5–8, up to 8 picks a week staked so any one winner returns the week’s budget.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0.02),
  },
  {
    id: 'loose',
    name: 'Loose value',
    summary: 'Same as Strict but accepts edges from 1%: more bets, thinner edges.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0.01),
  },
  {
    id: 'one-book',
    name: 'One account',
    summary:
      'Only Bet365 (stand-in for holding a single Lithuanian account), edge ≥ 1%. Closest to the real setup today.',
    candidates: liquidBfe(['B365']),
    rules: slate(0.01),
  },
  {
    id: 'thin',
    name: 'Thin markets allowed',
    summary:
      'Strict, but trusts exchange prices with up to 8% margin (lower leagues). More bets, but the reference is unreliable there: the longshot / fake-value trap.',
    candidates: { ...liquidBfe([...SOFT_BOOKS]), referenceOverround: [-0.03, 0.08] },
    rules: slate(0.02),
  },
  {
    id: 'fill',
    name: 'Fill the slate',
    summary:
      'Takes the best-priced bets each week right down to a 0% edge (near-fair odds), as many as the one-winner rule allows (at most 5). Shows the staking structure with almost no edge behind it.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0, { maxPicks: 5 }),
  },
];
