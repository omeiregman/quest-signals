import { describe, expect, it } from 'vitest';
import { detectValue, devig } from './value';
import type { NormalizedMarket } from './types';

describe('devig', () => {
  it('removes the vig so probabilities sum to 1', () => {
    const probs = devig([1.9, 1.9]); // implied 0.526*2 = 1.052
    expect(probs[0]! + probs[1]!).toBeCloseTo(1, 10);
    expect(probs[0]!).toBeCloseTo(0.5, 10);
  });
});

describe('detectValue', () => {
  const m: NormalizedMarket = {
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: '2026-06-20T18:00:00Z',
    marketType: 'h2h',
    outcomes: [
      { name: 'Home', books: [{ book: 'Pinnacle', price: 2.0 }, { book: 'Soft', price: 2.3 }] },
      { name: 'Away', books: [{ book: 'Pinnacle', price: 2.0 }, { book: 'Soft', price: 1.7 }] },
    ],
  };

  it('flags a positive edge vs the sharp reference', () => {
    // true prob Home = 0.5; Soft 2.3 => edge = 0.5*2.3 - 1 = 0.15
    const out = detectValue(m, { referenceBook: 'Pinnacle', minEdge: 0.02 });
    const home = out.find((v) => v.outcome === 'Home' && v.book === 'Soft');
    expect(home).toBeDefined();
    expect(home!.edge).toBeCloseTo(0.15, 6);
    // Away Soft 1.7 => edge 0.5*1.7-1 = -0.15 (filtered out)
    expect(out.find((v) => v.outcome === 'Away' && v.book === 'Soft')).toBeUndefined();
  });

  it('never flags the reference book itself', () => {
    const out = detectValue(m, { referenceBook: 'Pinnacle', minEdge: -1 });
    expect(out.every((v) => v.book !== 'Pinnacle')).toBe(true);
  });

  it('returns empty when the reference book is missing an outcome', () => {
    const partial: NormalizedMarket = {
      ...m,
      outcomes: [
        { name: 'Home', books: [{ book: 'Soft', price: 2.3 }] },
        { name: 'Away', books: [{ book: 'Pinnacle', price: 2.0 }] },
      ],
    };
    expect(detectValue(partial, { referenceBook: 'Pinnacle', minEdge: 0 })).toEqual([]);
  });

  it('maxOdds skips longshot soft bets (kills artifact value like Curaçao @ 80)', () => {
    const longshot: NormalizedMarket = {
      ...m,
      outcomes: [
        { name: 'Home', books: [{ book: 'Pinnacle', price: 1.05 }, { book: 'Soft', price: 1.1 }] },
        { name: 'Away', books: [{ book: 'Pinnacle', price: 21 }, { book: 'Soft', price: 80 }] },
      ],
    };
    // Without a cap, the Away @ 80 soft price flags a huge "edge".
    const uncapped = detectValue(longshot, { referenceBook: 'Pinnacle', minEdge: 0.02 });
    expect(uncapped.some((v) => v.outcome === 'Away' && v.book === 'Soft')).toBe(true);
    // With maxOdds, the 80.0 longshot is not flagged.
    const capped = detectValue(longshot, { referenceBook: 'Pinnacle', minEdge: 0.02, maxOdds: 20 });
    expect(capped.some((v) => v.outcome === 'Away')).toBe(false);
  });
});
