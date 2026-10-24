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
  /** Seasons whose data carries this preset's reference prices. */
  seasons: string[];
}

/** Seasons with Pinnacle's live-API prices (pre-match + closing) in football-data. */
export const PINNACLE_SEASONS = ['1920', '2021', '2122', '2223', '2324', '2425'];
/** Seasons with Betfair Exchange prices (pre-match + closing). */
export const EXCHANGE_SEASONS = ['2425', '2526', '2627'];

/** Every UK/EU soft book football-data has carried since 2019/20 (1xBet left out). */
export const ALL_SOFT_BOOKS = [
  'B365',
  'BW',
  'IW',
  'WH',
  'VC',
  'BV',
  'BFD',
  'BMGM',
  'CL',
  'LB',
  'PP',
  'SKB',
];

const pinnacle = (books: string[]): CandidateConfig => ({
  reference: 'PS',
  devig: 'power',
  books,
  markets: ['1x2', 'ou25'],
  referenceOverround: [-0.03, 0.08],
});

/** The short-odds rule from Buchdahl's published record: edge 3–12%, odds 1.5–4. */
const SHORT_ODDS = {
  minEdge: 0.03,
  maxEdge: 0.12,
  minOdds: 1.5,
  maxOdds: 4,
  minPicks: 1,
  rankBy: 'edge' as const,
};

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
    id: 'pin-all',
    name: 'Pinnacle short odds',
    summary:
      'Price every match against Pinnacle. Bet any result at odds 1.5–4 that a bookmaker prices 3–12% above fair, at the best of the UK/EU bookmakers in the data. Every qualifying bet that week (up to 15), equal stakes, no one-winner rule.',
    candidates: pinnacle(ALL_SOFT_BOOKS),
    rules: { ...SHORT_ODDS, maxPicks: 15, staking: 'equal', maxCoverage: Infinity },
    seasons: PINNACLE_SEASONS,
  },
  {
    id: 'pin-b365',
    name: 'Pinnacle short odds, one account',
    summary:
      'The same rule with only Bet365, as if you held a single bookmaker account. About half as many bets.',
    candidates: pinnacle(['B365']),
    rules: { ...SHORT_ODDS, maxPicks: 15, staking: 'equal', maxCoverage: Infinity },
    seasons: PINNACLE_SEASONS,
  },
  {
    id: 'pin-onewin',
    name: 'Pinnacle short odds, one winner covers',
    summary:
      'The same bets, but staked your way: at most 8 a week, split so any one winner returns the week’s budget. At odds under 4 that usually means 2–3 picks.',
    candidates: pinnacle(ALL_SOFT_BOOKS),
    rules: { ...SHORT_ODDS, maxPicks: 8, staking: 'equal-return', maxCoverage: 1 },
    seasons: PINNACLE_SEASONS,
  },
  {
    id: 'strict',
    name: 'Strict value',
    summary:
      'Edge ≥ 2% against a liquid Betfair Exchange price, best of four bookmaker accounts, odds 1.5–8, up to 8 picks a week staked so any one winner returns the week’s budget.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0.02),
    seasons: EXCHANGE_SEASONS,
  },
  {
    id: 'short',
    name: 'Exchange short odds',
    summary:
      'Rule taken from published evidence, not from this data: edge 3–12% against a liquid Betfair Exchange price, odds 1.5–4 only (Buchdahl’s 20,380 live value bets made +4.4% under odds 4 and lost above it), best of four accounts, one winner covers the week.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0.03, { maxEdge: 0.12, maxOdds: 4 }),
    seasons: EXCHANGE_SEASONS,
  },
  {
    id: 'loose',
    name: 'Loose value',
    summary: 'Same as Strict but accepts edges from 1%: more bets, thinner edges.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0.01),
    seasons: EXCHANGE_SEASONS,
  },
  {
    id: 'one-book',
    name: 'One account',
    summary:
      'Only Bet365 (stand-in for holding a single Lithuanian account), edge ≥ 1%. Closest to the real setup today.',
    candidates: liquidBfe(['B365']),
    rules: slate(0.01),
    seasons: EXCHANGE_SEASONS,
  },
  {
    id: 'thin',
    name: 'Thin markets allowed',
    summary:
      'Strict, but trusts exchange prices with up to 8% margin (lower leagues). More bets, but the reference is unreliable there: the longshot / fake-value trap.',
    candidates: { ...liquidBfe([...SOFT_BOOKS]), referenceOverround: [-0.03, 0.08] },
    rules: slate(0.02),
    seasons: EXCHANGE_SEASONS,
  },
  {
    id: 'fill',
    name: 'Fill the slate',
    summary:
      'Takes the best-priced bets each week right down to a 0% edge (near-fair odds), as many as the one-winner rule allows (at most 5). Shows the staking structure with almost no edge behind it.',
    candidates: liquidBfe([...SOFT_BOOKS]),
    rules: slate(0, { maxPicks: 5 }),
    seasons: EXCHANGE_SEASONS,
  },
];
