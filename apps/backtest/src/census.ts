import { bestPerEvent, flatByOddsBand, flatStats, type FlatStats } from './analysis';
import { buildCandidates, type CandidateConfig } from './candidates';
import { SOFT_BOOKS } from './strategies';
import type { HistoricalMatch } from './types';

export const CENSUS_THRESHOLDS = [0, 0.01, 0.02, 0.03, 0.05];

const liquid: [number, number] = [-0.03, 0.03];

/** Who we price against and where we can bet. CLV is always graded on Betfair Exchange closing. */
export const CENSUS_SETUPS: { key: string; label: string; cfg: CandidateConfig }[] = [
  {
    key: 'b365-1x2',
    label: 'Bet365 only · 1X2 · liquid exchange ref',
    cfg: {
      reference: 'BFE',
      devig: 'power',
      books: ['B365'],
      markets: ['1x2'],
      referenceOverround: liquid,
    },
  },
  {
    key: 'b365-both',
    label: 'Bet365 only · 1X2 + O/U 2.5 · liquid exchange ref',
    cfg: {
      reference: 'BFE',
      devig: 'power',
      books: ['B365'],
      markets: ['1x2', 'ou25'],
      referenceOverround: liquid,
    },
  },
  {
    key: 'all4-liquid',
    label: '4 books · 1X2 + O/U 2.5 · liquid exchange ref',
    cfg: {
      reference: 'BFE',
      devig: 'power',
      books: [...SOFT_BOOKS],
      markets: ['1x2', 'ou25'],
      referenceOverround: liquid,
    },
  },
  {
    key: 'all4-thin',
    label: '4 books · thin exchange markets allowed (≤8%)',
    cfg: {
      reference: 'BFE',
      devig: 'power',
      books: [...SOFT_BOOKS],
      markets: ['1x2', 'ou25'],
      referenceOverround: [-0.03, 0.08],
    },
  },
  {
    key: 'all4-avg',
    label: '4 books · market average as reference',
    cfg: {
      reference: 'Avg',
      clvReference: 'BFE',
      devig: 'power',
      books: [...SOFT_BOOKS],
      markets: ['1x2', 'ou25'],
      referenceOverround: [-0.03, 0.12],
    },
  },
  {
    key: 'all4-ps',
    label: '4 books · Pinnacle as reference (Aug–Jan only)',
    cfg: {
      reference: 'PS',
      clvReference: 'BFE',
      devig: 'power',
      books: [...SOFT_BOOKS],
      markets: ['1x2', 'ou25'],
      referenceOverround: [-0.03, 0.08],
    },
  },
];

export interface CensusRow extends FlatStats {
  setup: string;
  threshold: number;
  perWeek: number;
}

/** Flat-singles results (one bet per match) for every setup × edge threshold. */
export function runCensus(matches: HistoricalMatch[], weeks: number): CensusRow[] {
  const rows: CensusRow[] = [];
  for (const setup of CENSUS_SETUPS) {
    const cands = buildCandidates(matches, setup.cfg);
    if (cands.length === 0) continue;
    for (const threshold of CENSUS_THRESHOLDS) {
      const s = flatStats(setup.label, bestPerEvent(cands.filter((c) => c.edge >= threshold)));
      rows.push({ ...s, setup: setup.key, threshold, perWeek: s.bets / weeks });
    }
  }
  return rows;
}

/** Odds-band breakdown for one setup at one threshold: where "value" holds up and where it doesn't. */
export function censusBands(
  matches: HistoricalMatch[],
  setupKey: string,
  threshold: number,
): FlatStats[] {
  const setup = CENSUS_SETUPS.find((s) => s.key === setupKey);
  if (!setup) throw new RangeError(`unknown census setup ${setupKey}`);
  return flatByOddsBand(
    bestPerEvent(buildCandidates(matches, setup.cfg).filter((c) => c.edge >= threshold)),
  );
}
