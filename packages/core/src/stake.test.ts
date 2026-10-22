import { describe, expect, it } from 'vitest';
import { calcStakeFromTarget, calcStakeSplit, netAfterTax, roundToIncrement } from './stake';
import type { ArbOpportunity } from './types';

const arb: ArbOpportunity = {
  type: 'arb',
  sportKey: 'soccer',
  eventId: 'evt1',
  commenceTime: '2026-06-20T18:00:00Z',
  marketType: 'h2h',
  legs: [
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 1 / 2.1 },
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 1 / 2.1 },
  ],
  totalImplied: 2 / 2.1,
  margin: 1 - 2 / 2.1,
};

describe('roundToIncrement', () => {
  it('rounds to the nearest increment', () => {
    expect(roundToIncrement(47.6, 1)).toBe(48);
    expect(roundToIncrement(47.4, 1)).toBe(47);
    expect(roundToIncrement(47.6, 5)).toBe(50);
    expect(roundToIncrement(12.3, 0.5)).toBe(12.5);
  });

  it('returns the value unchanged when increment <= 0', () => {
    expect(roundToIncrement(47.62, 0)).toBe(47.62);
  });
});

describe('netAfterTax (display-only)', () => {
  it('taxes positive profit only', () => {
    expect(netAfterTax(100, 0.2)).toBeCloseTo(80, 10);
  });

  it('does not tax zero or negative profit', () => {
    expect(netAfterTax(0, 0.2)).toBe(0);
    expect(netAfterTax(-10, 0.2)).toBe(-10);
  });
});

describe('calcStakeSplit (forward, gross-only)', () => {
  it('splits stake proportionally with no rounding', () => {
    const r = calcStakeSplit(arb, 100, { rounding: 0 });
    expect(r.legs.map((l) => l.stake)).toEqual([50, 50]); // symmetric arb
    expect(r.totalStake).toBeCloseTo(100, 6);
    expect(r.guaranteedReturn).toBeCloseTo(105, 6); // 50 * 2.1
    expect(r.grossProfit).toBeCloseTo(5, 6);
  });

  it('exposes gross profit; net is a separate display concern', () => {
    const r = calcStakeSplit(arb, 100, { rounding: 0 });
    // Detection/headline never sees tax; the UI derives net from gross when desired.
    expect(netAfterTax(r.grossProfit, 0.2)).toBeCloseTo(4, 6); // 5 * 0.8
  });

  it('recomputes the real worst-case gross profit after rounding', () => {
    const skew: ArbOpportunity = {
      ...arb,
      legs: [
        { outcome: 'Home', book: 'A', odds: 2.5, impliedProb: 1 / 2.5 },
        { outcome: 'Away', book: 'B', odds: 1.75, impliedProb: 1 / 1.75 },
      ],
      totalImplied: 1 / 2.5 + 1 / 1.75,
      margin: 1 - (1 / 2.5 + 1 / 1.75),
    };
    const r = calcStakeSplit(skew, 100, { rounding: 1 });
    const minReturn = Math.min(...r.perOutcome.map((p) => p.return));
    expect(r.guaranteedReturn).toBeCloseTo(minReturn, 6);
    expect(r.grossProfit).toBeCloseTo(minReturn - r.totalStake, 6);
    r.legs.forEach((l) => expect(Number.isInteger(l.stake)).toBe(true));
  });
});

describe('calcStakeFromTarget (reverse, gross-only)', () => {
  it('back-solves stake from a target return (round-trips with forward)', () => {
    const r = calcStakeFromTarget(arb, { targetReturn: 105 }, { rounding: 0 });
    expect(r.requestedStake).toBeCloseTo(100, 6); // 105 * totalImplied
    expect(r.guaranteedReturn).toBeCloseTo(105, 6);
  });

  it('back-solves stake from a target gross profit', () => {
    const r = calcStakeFromTarget(arb, { targetGrossProfit: 5 }, { rounding: 0 });
    expect(r.requestedStake).toBeCloseTo(100, 4);
    expect(r.grossProfit).toBeCloseTo(5, 4);
  });

  it('throws when not exactly one target is provided', () => {
    expect(() => calcStakeFromTarget(arb, {}, { rounding: 0 })).toThrow();
    expect(() =>
      calcStakeFromTarget(arb, { targetReturn: 1, targetGrossProfit: 1 }, { rounding: 0 }),
    ).toThrow();
  });
});
