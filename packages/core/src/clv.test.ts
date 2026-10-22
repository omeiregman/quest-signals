import { describe, expect, it } from 'vitest';
import { clvForLeg } from './clv';
import { detectArbitrage } from './arbitrage';
import { detectValue } from './value';
import type { NormalizedMarket } from './types';

describe('clvForLeg', () => {
  it('positive CLV when placed odds beat the de-vigged closing line', () => {
    // Closing ref 2.0 / 2.1 → devig prob for outcome 0 = .5 / (.5 + 1/2.1).
    expect(clvForLeg(2.1, [2.0, 2.1], 0)).toBeCloseTo(2.1 * (0.5 / (0.5 + 1 / 2.1)) - 1, 10);
  });

  it('zero CLV when placed odds equal fair closing odds', () => {
    // Vig-free closing 2.0/2.0 → prob .5 each; placed at 2.0 → CLV 0.
    expect(clvForLeg(2.0, [2.0, 2.0], 1)).toBeCloseTo(0, 10);
  });

  it('throws on out-of-range outcome index', () => {
    expect(() => clvForLeg(2.0, [2.0, 2.0], 5)).toThrow(RangeError);
  });
});

const marketWithLinks: NormalizedMarket = {
  sportKey: 'soccer',
  eventId: 'e1',
  commenceTime: '2026-07-10T18:00:00Z',
  marketType: 'h2h',
  outcomes: [
    { name: 'Home', books: [{ book: 'A', price: 2.2, link: 'https://a.example/e1' }] },
    { name: 'Away', books: [{ book: 'B', price: 2.2, link: 'https://b.example/e1' }] },
  ],
};

describe('deep-link propagation', () => {
  it('detectArbitrage carries the winning book link onto the leg', () => {
    const arb = detectArbitrage(marketWithLinks, { minMargin: 0 });
    expect(arb?.legs[0]?.link).toBe('https://a.example/e1');
    expect(arb?.legs[1]?.link).toBe('https://b.example/e1');
  });

  it('detectValue carries the soft book link', () => {
    const m: NormalizedMarket = {
      ...marketWithLinks,
      outcomes: [
        {
          name: 'Home',
          books: [
            { book: 'pinnacle', price: 2.0 },
            { book: 'soft', price: 2.3, link: 'https://soft.example/e1' },
          ],
        },
        { name: 'Away', books: [{ book: 'pinnacle', price: 2.0 }] },
      ],
    };
    const values = detectValue(m, { referenceBook: 'pinnacle', minEdge: 0.01 });
    expect(values[0]?.link).toBe('https://soft.example/e1');
  });
});
