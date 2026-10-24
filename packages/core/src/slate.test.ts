import { describe, expect, it } from 'vitest';
import {
  buildSlate,
  expectedSlateReturn,
  probNoWinner,
  settlePick,
  slateCoverage,
  stakeSlate,
  summarizeSlate,
  type SlateCandidate,
  type SlateRules,
  type StakingMode,
} from './slate';

/** A candidate with the given price and edge; fairProb is derived so edge = fairProb × odds − 1. */
function cand(
  eventId: string,
  odds: number,
  edge: number,
  extra: Partial<SlateCandidate> = {},
): SlateCandidate {
  return {
    eventId,
    kickoff: '2026-10-24T15:00',
    league: 'EPL',
    market: '1x2',
    selection: 'Home',
    book: 'Soft',
    odds,
    fairProb: (1 + edge) / odds,
    edge,
    ...extra,
  };
}

const RULES: SlateRules = {
  minEdge: 0.02,
  minOdds: 1.5,
  maxOdds: 30,
  maxPicks: 10,
  minPicks: 1,
  staking: 'equal-return',
  maxCoverage: 1,
};

const ids = (picks: SlateCandidate[]) => picks.map((p) => p.eventId);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('slateCoverage', () => {
  it('equal-return: Σ 1/odds', () => {
    expect(slateCoverage([2, 4, 4], 'equal-return')).toBe(1);
    expect(slateCoverage([2.5, 3], 'equal-return')).toBeCloseTo(0.4 + 1 / 3, 12);
  });

  it('equal: n / min(odds)', () => {
    expect(slateCoverage([2, 4, 4], 'equal')).toBe(1.5);
    expect(slateCoverage([5, 4, 8], 'equal')).toBe(0.75);
  });

  it('empty slate → 0', () => {
    expect(slateCoverage([], 'equal-return')).toBe(0);
    expect(slateCoverage([], 'equal')).toBe(0);
  });
});

describe('buildSlate', () => {
  it('filters on the edge band (inclusive) and maxEdge only when set', () => {
    const cs = [
      cand('lo', 10, 0.0199),
      cand('min', 10, 0.02),
      cand('mid', 10, 0.1),
      cand('hi', 10, 0.3),
    ];
    expect(ids(buildSlate(cs, RULES))).toEqual(['hi', 'mid', 'min']);
    expect(ids(buildSlate(cs, { ...RULES, maxEdge: 0.1 }))).toEqual(['mid', 'min']);
    expect(ids(buildSlate(cs, { ...RULES, maxEdge: 0.0999 }))).toEqual(['min']);
  });

  it('filters on the odds band (inclusive)', () => {
    const cs = [
      cand('a', 1.49, 0.05),
      cand('b', 1.5, 0.05),
      cand('c', 30, 0.05),
      cand('d', 30.5, 0.05),
    ];
    expect(ids(buildSlate(cs, { ...RULES, maxCoverage: 5 })).sort()).toEqual(['b', 'c']);
  });

  it('keeps only the best candidate per event (one pick per match)', () => {
    const cs = [
      cand('e1', 3.4, 0.04, { selection: 'Home' }),
      cand('e1', 3.6, 0.09, { selection: 'Draw' }),
      cand('e1', 2.4, 0.06, { selection: 'Away', book: 'Other' }),
      cand('e2', 5, 0.05),
    ];
    const slate = buildSlate(cs, RULES);
    expect(ids(slate)).toEqual(['e1', 'e2']);
    expect(slate[0]!.selection).toBe('Draw');
  });

  it('ranks by edge desc, ties by higher fairProb, then eventId|selection|book asc', () => {
    const cs = [
      cand('z', 8, 0.05), // tied edge, lower fairProb than 'y'
      cand('y', 6, 0.05),
      cand('b', 10, 0.03, { selection: 'Away' }), // full tie with 'a'/'b|Home' → key order
      cand('b', 10, 0.03, { selection: 'Home', book: 'A' }),
      cand('a', 10, 0.03),
      cand('top', 12, 0.2),
    ];
    // 'b' keeps 'b|Away|Soft' (key < 'b|Home|A').
    const slate = buildSlate(cs, { ...RULES, maxCoverage: 5 });
    expect(ids(slate)).toEqual(['top', 'y', 'z', 'a', 'b']);
    expect(slate[4]!.selection).toBe('Away');
  });

  it('is deterministic regardless of input order', () => {
    const cs = [
      cand('e1', 4, 0.05),
      cand('e2', 4, 0.05),
      cand('e3', 5, 0.08),
      cand('e3', 5, 0.08, { book: 'Alt' }),
      cand('e4', 2, 0.05),
      cand('e5', 9, 0.12),
    ];
    const expected = buildSlate(cs, RULES);
    const rotate = (xs: SlateCandidate[], k: number) => [...xs.slice(k), ...xs.slice(0, k)];
    for (const order of [[...cs].reverse(), rotate(cs, 2), rotate(cs, 5)]) {
      expect(buildSlate(order, RULES)).toEqual(expected);
    }
    expect(expected.find((p) => p.eventId === 'e3')!.book).toBe('Alt'); // 'e3|Home|Alt' < '…|Soft'
  });

  it('skips (does not stop at) a pick that would breach maxCoverage', () => {
    const cs = [
      cand('a', 2, 0.1), // S = 0.5
      cand('b', 2.2, 0.08), // S ≈ 0.9545
      cand('c', 2.5, 0.06), // +0.4 → 1.35 > 1: skipped
      cand('d', 6, 0.05), // +0.1667 → 1.12 > 1: skipped
      cand('e', 25, 0.04), // +0.04 → 0.9945: still fits
    ];
    const slate = buildSlate(cs, RULES);
    expect(ids(slate)).toEqual(['a', 'b', 'e']);
    expect(
      slateCoverage(
        slate.map((p) => p.odds),
        'equal-return',
      ),
    ).toBeLessThanOrEqual(1);
  });

  it('allows coverage of exactly maxCoverage despite float drift', () => {
    // Σ 1/9 over nine picks is 1.0000000000000002 in floating point.
    const cs = Array.from({ length: 9 }, (_, i) => cand(`e${i}`, 9, 0.05));
    expect(
      slateCoverage(
        cs.map((c) => c.odds),
        'equal-return',
      ),
    ).toBeGreaterThan(1);
    expect(buildSlate(cs, RULES)).toHaveLength(9);
    // 2 + 4 + 4 sums to exactly 1.
    expect(
      buildSlate([cand('a', 2, 0.1), cand('b', 4, 0.1), cand('c', 4, 0.1)], RULES),
    ).toHaveLength(3);
  });

  it('applies the coverage cap in the staking mode of the rules', () => {
    const cs = [cand('a', 3, 0.1), cand('b', 3, 0.09), cand('c', 3, 0.08), cand('d', 3.5, 0.07)];
    // equal: S = n / min(odds) → 1/3, 2/3, 3/3 = 1, then 4/3 > 1.
    expect(ids(buildSlate(cs, { ...RULES, staking: 'equal' }))).toEqual(['a', 'b', 'c']);
    // equal-return: 1/3·3 = 1, then + 1/3.5 > 1.
    expect(ids(buildSlate(cs, RULES))).toEqual(['a', 'b', 'c']);
    // equal mode is driven by min(odds): with a 1.5 pick, two picks already give S = 2/1.5 > 1,
    // while equal-return gives S = 1/1.5 + 1/3 = 1 and fits both.
    const withShort = [cand('s', 1.5, 0.2), cand('a', 3, 0.1)];
    expect(ids(buildSlate(withShort, { ...RULES, staking: 'equal' }))).toEqual(['s']);
    expect(ids(buildSlate(withShort, RULES))).toEqual(['s', 'a']);
  });

  it('stops at maxPicks', () => {
    const cs = Array.from({ length: 8 }, (_, i) => cand(`e${i}`, 20, 0.1 - i * 0.01));
    expect(ids(buildSlate(cs, { ...RULES, maxPicks: 3 }))).toEqual(['e0', 'e1', 'e2']);
  });

  it('returns [] when fewer than minPicks survive', () => {
    const cs = [cand('a', 2, 0.1), cand('b', 2, 0.08), cand('c', 2, 0.06)]; // only 2 fit S ≤ 1
    expect(buildSlate(cs, { ...RULES, minPicks: 2 })).toHaveLength(2);
    expect(buildSlate(cs, { ...RULES, minPicks: 3 })).toEqual([]);
    expect(buildSlate([], { ...RULES, minPicks: 0 })).toEqual([]);
  });

  it("'sharpe' prefers a short price over a longer one with slightly more edge", () => {
    const short = cand('e1', 2, 0.06, { selection: 'Home' }); // p 0.53: 0.06 / (2·√(.53·.47)) ≈ 0.060
    const long = cand('e2', 5, 0.07, { selection: 'Away' }); // p 0.214: 0.07 / (5·√(.214·.786)) ≈ 0.034
    expect(ids(buildSlate([short, long], RULES))).toEqual(['e2', 'e1']);
    expect(ids(buildSlate([short, long], { ...RULES, rankBy: 'sharpe' }))).toEqual(['e1', 'e2']);

    // The same score picks the per-event winner.
    const sameEvent = [short, { ...long, eventId: 'e1' }];
    expect(buildSlate(sameEvent, RULES)[0]!.selection).toBe('Away');
    expect(buildSlate(sameEvent, { ...RULES, rankBy: 'sharpe' })[0]!.selection).toBe('Home');
  });

  it('returns the original input objects, extra fields intact', () => {
    const cs = [
      { ...cand('a', 3, 0.1), won: true, clv: 0.04, home: 'Arsenal', away: 'Spurs' },
      { ...cand('b', 4, 0.08), won: false, clv: -0.01, home: 'Leeds', away: 'Hull' },
    ];
    const slate = buildSlate(cs, RULES);
    expect(slate).toHaveLength(2);
    expect(slate[0]).toBe(cs[0]); // same reference, not a copy
    expect(slate[1]).toBe(cs[1]);

    const staked = stakeSlate(slate, 100, 'equal-return');
    expect(staked[0]!.home).toBe('Arsenal');
    expect(staked[0]!.won).toBe(true);
    expect(staked[1]!.clv).toBe(-0.01);
    const settled = settlePick(staked[0]!, staked[0]!.won);
    expect(settled.away).toBe('Spurs');
    expect(settled.returned).toBeCloseTo(staked[0]!.returnIfWin, 12);
  });
});

describe('stakeSlate', () => {
  const picks = [cand('a', 2.1, 0.05), cand('b', 3.4, 0.06), cand('c', 7.5, 0.04)];

  it('equal-return: stakes sum to capital and every winner returns capital / S', () => {
    const S = slateCoverage(
      picks.map((p) => p.odds),
      'equal-return',
    );
    const staked = stakeSlate(picks, 250, 'equal-return');
    expect(sum(staked.map((s) => s.stake))).toBeCloseTo(250, 9);
    staked.forEach((s, i) => {
      expect(s.stake).toBeCloseTo((250 * (1 / picks[i]!.odds)) / S, 9);
      expect(s.returnIfWin).toBeCloseTo(s.stake * s.odds, 12);
      expect(s.returnIfWin).toBeCloseTo(250 / S, 9);
    });
  });

  it('equal: every stake is capital / n', () => {
    const staked = stakeSlate(picks, 90, 'equal');
    for (const s of staked) {
      expect(s.stake).toBe(30);
      expect(s.returnIfWin).toBeCloseTo(30 * s.odds, 12);
    }
    expect(sum(staked.map((s) => s.stake))).toBe(90);
  });

  it('empty input → []', () => {
    expect(stakeSlate([], 100, 'equal-return')).toEqual([]);
    expect(stakeSlate([], 100, 'equal')).toEqual([]);
  });

  it('with coverage ≤ 1, any single winner returns at least the capital', () => {
    // Deterministic pseudo-random candidate pools (32-bit LCG), both staking modes.
    let seed = 12345;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const modes: StakingMode[] = ['equal-return', 'equal'];
    let checked = 0;
    for (let round = 0; round < 25; round++) {
      const pool = Array.from({ length: 12 }, (_, i) =>
        cand(`r${round}e${i}`, 1.5 + rand() * 14, 0.02 + rand() * 0.1),
      );
      for (const staking of modes) {
        const slate = buildSlate(pool, { ...RULES, staking });
        expect(
          slateCoverage(
            slate.map((p) => p.odds),
            staking,
          ),
        ).toBeLessThanOrEqual(1 + 1e-9);
        const capital = 100;
        const staked = stakeSlate(slate, capital, staking);
        for (let w = 0; w < staked.length; w++) {
          const outcome = summarizeSlate(staked.map((s, i) => settlePick(s, i === w)));
          expect(outcome.returned).toBeGreaterThanOrEqual(capital - 1e-9);
          expect(outcome.profit).toBeGreaterThanOrEqual(-1e-9);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('settlePick / summarizeSlate', () => {
  it('settles winners at returnIfWin and losers at 0', () => {
    const [p] = stakeSlate([cand('a', 2.5, 0.05)], 40, 'equal');
    expect(settlePick(p!, true).returned).toBe(100);
    expect(settlePick(p!, false).returned).toBe(0);
    expect(settlePick(p!, true).won).toBe(true);
  });

  it('sums picks, winners, staked, returned and profit', () => {
    // equal staking, capital 90 → 30 each; returns 60 / 90 / 180.
    const staked = stakeSlate(
      [cand('a', 2, 0.05), cand('b', 3, 0.05), cand('c', 6, 0.05)],
      90,
      'equal',
    );
    const settled = staked.map((s, i) => settlePick(s, i > 0));
    expect(summarizeSlate(settled)).toEqual({
      picks: 3,
      winners: 2,
      staked: 90,
      returned: 270,
      profit: 180,
    });

    // equal-return on S = 1: 50 / 25 / 25, one winner returns exactly the capital.
    const flat = stakeSlate(
      [cand('a', 2, 0.05), cand('b', 4, 0.05), cand('c', 4, 0.05)],
      100,
      'equal-return',
    );
    expect(flat.map((s) => s.stake)).toEqual([50, 25, 25]);
    const out = summarizeSlate(flat.map((s, i) => settlePick(s, i === 2)));
    expect(out).toEqual({ picks: 3, winners: 1, staked: 100, returned: 100, profit: 0 });
  });

  it('an empty slate summarizes to zeros', () => {
    expect(summarizeSlate([])).toEqual({ picks: 0, winners: 0, staked: 0, returned: 0, profit: 0 });
  });
});

describe('probNoWinner', () => {
  it('is Π (1 − fairProb)', () => {
    expect(probNoWinner([{ fairProb: 0.5 }, { fairProb: 0.4 }, { fairProb: 0.2 }])).toBeCloseTo(
      0.5 * 0.6 * 0.8,
      12,
    );
    expect(probNoWinner([{ fairProb: 0.25 }])).toBe(0.75);
  });

  it('empty → 1', () => {
    expect(probNoWinner([])).toBe(1);
  });
});

describe('expectedSlateReturn', () => {
  it('is Σ stake·odds·fairProb', () => {
    // 30 each @ 2 / 3 / 6 with fairProb .55 / .36 / .18 → 33 + 32.4 + 32.4 = 97.8.
    const staked = stakeSlate(
      [
        { ...cand('a', 2, 0), fairProb: 0.55, edge: 0.1 },
        { ...cand('b', 3, 0), fairProb: 0.36, edge: 0.08 },
        { ...cand('c', 6, 0), fairProb: 0.18, edge: 0.08 },
      ],
      90,
      'equal',
    );
    expect(expectedSlateReturn(staked)).toBeCloseTo(97.8, 9);
    // Equivalently Σ stake·(1 + edge) when edge = fairProb·odds − 1.
    expect(expectedSlateReturn(staked)).toBeCloseTo(
      sum(staked.map((s) => s.stake * (1 + s.edge))),
      9,
    );
  });

  it('empty → 0', () => {
    expect(expectedSlateReturn([])).toBe(0);
  });
});
