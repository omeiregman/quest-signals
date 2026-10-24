import { describe, expect, it } from 'vitest';
import type { SlateRules } from '@quest/core';
import type { BacktestCandidate } from './candidates';
import {
  roundStarts,
  runRounds,
  simulateBankroll,
  strategyMetrics,
  weekStart,
  type RoundResult,
} from './simulate';

function cand(
  eventId: string,
  date: string,
  odds: number,
  edge: number,
  won: boolean,
  clv?: number,
): BacktestCandidate {
  return {
    eventId,
    kickoff: `${date}T15:00`,
    league: 'E0',
    market: '1x2',
    selection: 'Away',
    book: 'B365',
    odds,
    fairProb: (1 + edge) / odds,
    edge,
    season: '2526',
    date,
    homeTeam: `${eventId}-h`,
    awayTeam: `${eventId}-a`,
    score: '0-1',
    won,
    ...(clv !== undefined ? { clv } : {}),
  };
}

const rules: SlateRules = {
  minEdge: 0.02,
  minOdds: 1.5,
  maxOdds: 10,
  maxPicks: 5,
  minPicks: 1,
  staking: 'equal-return',
  maxCoverage: 1,
};

describe('weekStart / roundStarts', () => {
  it('maps any day to the Monday of its ISO week', () => {
    expect(weekStart('2025-08-18')).toBe('2025-08-18'); // Monday
    expect(weekStart('2025-08-24')).toBe('2025-08-18'); // Sunday
    expect(weekStart('2025-08-25')).toBe('2025-08-25');
    expect(weekStart('2026-01-01')).toBe('2025-12-29'); // across the year boundary
  });

  it('lists each week with a match once, ascending', () => {
    expect(roundStarts(['2025-08-24', '2025-08-16', '2025-08-23'])).toEqual([
      '2025-08-11',
      '2025-08-18',
    ]);
  });
});

describe('runRounds', () => {
  // Week 1: four 4.0 shots → Σ1/o = 1 exactly; one wins → the round returns exactly 1×.
  const week1 = ['a', 'b', 'c', 'd'].map((id, i) => cand(id, '2025-08-16', 4, 0.05, i === 0, 0.02));
  // Week 2: a below-threshold edge only → no slate. Week 3: nothing at all.
  const week2 = [cand('e', '2025-08-23', 3, 0.01, true)];
  const starts = ['2025-08-11', '2025-08-18', '2025-08-25'];
  const rounds = runRounds([...week1, ...week2], rules, starts);

  it('emits one round per week, including weeks with no slate', () => {
    expect(rounds.map((r) => r.start)).toEqual(starts);
    expect(rounds[1]!.picks).toEqual([]);
    expect(rounds[1]!.available).toBe(0);
    expect(rounds[2]!.picks).toEqual([]);
  });

  it('stakes 1 unit with equal-return shares and settles the winners', () => {
    const r = rounds[0]!;
    expect(r.available).toBe(4);
    expect(r.picks).toHaveLength(4);
    expect(r.picks.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1, 10);
    expect(r.coverage).toBeCloseTo(1, 10);
    expect(r.winners).toBe(1);
    expect(r.multiple).toBeCloseTo(1, 10); // one winner covers the capital, nothing more
    expect(r.probNoWinner).toBeCloseTo((1 - 1.05 / 4) ** 4, 10);
    expect(r.expectedMultiple).toBeCloseTo(1.05, 10);
    expect(r.picks[0]!.homeTeam).toBe('a-h'); // candidate fields survive staking
  });
});

function round(start: string, multiple: number, winners: number, picks = 1): RoundResult {
  return {
    start,
    available: picks,
    picks: Array.from({ length: picks }, (_, i) => ({
      ...cand(`${start}-${i}`, start, 4, 0.05, i < winners),
      share: 1 / picks,
      returned: 0,
    })),
    coverage: 1,
    winners,
    multiple,
    probNoWinner: 0.3,
    expectedMultiple: 1.05,
  };
}

describe('simulateBankroll', () => {
  const rounds = [
    round('2025-08-11', 0, 0), // lose the stake
    round('2025-08-18', 2, 2), // double it
    { ...round('2025-08-25', 0, 0), picks: [] }, // sit out
  ];

  it('fixed budget: stakes the amount each played week', () => {
    const path = simulateBankroll(rounds, 1000, { kind: 'fixed', amount: 200 });
    expect(path.weeks.map((w) => w.after)).toEqual([800, 1000, 1000]);
    expect(path.weeks[2]!.staked).toBe(0);
    expect(path.maxDrawdown).toBeCloseTo(0.2, 10);
    expect(path.low).toBe(800);
    expect(path.busted).toBe(false);
  });

  it('fraction budget: stakes a share of the current bankroll', () => {
    const path = simulateBankroll(rounds, 1000, { kind: 'fraction', fraction: 0.1 });
    expect(path.weeks[0]!.staked).toBe(100);
    expect(path.weeks[1]!.staked).toBeCloseTo(90, 10);
    expect(path.final).toBeCloseTo(990, 10);
  });

  it('never stakes more than is left, and flags a bust', () => {
    const losing = [round('2025-08-11', 0, 0), round('2025-08-18', 0, 0), round('2025-08-25', 0, 0)];
    const path = simulateBankroll(losing, 300, { kind: 'fixed', amount: 200 });
    expect(path.weeks.map((w) => w.staked)).toEqual([200, 100, 0]);
    expect(path.final).toBe(0);
    expect(path.busted).toBe(true);
  });
});

describe('strategyMetrics', () => {
  it('summarises played rounds only and tracks losing/wipeout runs', () => {
    const rounds = [
      round('w1', 0, 0, 4),
      round('w2', 0.5, 1, 4),
      { ...round('w3', 0, 0), picks: [] },
      round('w4', 1.5, 2, 4),
      round('w5', 0, 0, 4),
    ];
    const m = strategyMetrics(rounds);
    expect(m.rounds).toBe(5);
    expect(m.roundsPlayed).toBe(4);
    expect(m.picks).toBe(16);
    expect(m.roi).toBeCloseTo((-1 - 0.5 + 0.5 - 1) / 4, 10);
    expect(m.roundsWithWinner).toBeCloseTo(0.5, 10);
    expect(m.roundsCovered).toBeCloseTo(0.25, 10);
    expect(m.longestLosingRun).toBe(2); // w1, w2
    expect(m.longestWipeoutRun).toBe(1);
    expect(m.pickHitRate).toBeCloseTo(3 / 16, 10);
  });
});
