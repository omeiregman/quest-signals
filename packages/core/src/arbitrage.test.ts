import { describe, expect, it } from 'vitest';
import { detectArbitrage } from './arbitrage';
import type { NormalizedMarket } from './types';

function market(outcomes: NormalizedMarket['outcomes']): NormalizedMarket {
  return {
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: '2026-06-20T18:00:00Z',
    marketType: 'h2h',
    outcomes,
  };
}

describe('detectArbitrage', () => {
  it('detects a 2-way arb and picks best odds per outcome', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.1 }, { book: 'B', price: 2.05 }] },
      { name: 'Away', books: [{ book: 'A', price: 1.9 }, { book: 'B', price: 2.1 }] },
    ]);
    const arb = detectArbitrage(m, { minMargin: 0.01 });
    expect(arb).not.toBeNull();
    // best: Home 2.1 (A), Away 2.1 (B) => implied 0.476+0.476=0.952
    expect(arb!.legs.find((l) => l.outcome === 'Home')!.book).toBe('A');
    expect(arb!.legs.find((l) => l.outcome === 'Away')!.book).toBe('B');
    expect(arb!.totalImplied).toBeCloseTo(0.95238, 4);
    expect(arb!.margin).toBeCloseTo(0.04762, 4);
  });

  it('returns null when no arb exists', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 1.8 }] },
      { name: 'Away', books: [{ book: 'A', price: 1.8 }] },
    ]);
    expect(detectArbitrage(m, { minMargin: 0.01 })).toBeNull();
  });

  it('returns null when margin is below threshold', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.02 }] },
      { name: 'Away', books: [{ book: 'B', price: 2.02 }] },
    ]);
    // implied 0.495*2 = 0.990, margin 0.0099 < 0.01
    expect(detectArbitrage(m, { minMargin: 0.01 })).toBeNull();
  });

  it('filters to the book allowlist and returns null if an outcome is uncovered', () => {
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 2.1 }] },
      { name: 'Away', books: [{ book: 'B', price: 2.1 }] },
    ]);
    expect(detectArbitrage(m, { minMargin: 0.01, bookAllowlist: ['A'] })).toBeNull();
  });

  it('returns null for markets with fewer than 2 outcomes', () => {
    const m = market([{ name: 'Home', books: [{ book: 'A', price: 1.5 }] }]);
    expect(detectArbitrage(m, { minMargin: 0 })).toBeNull();
  });

  it('maxOdds excludes longshot-priced legs (kills artifact arbs)', () => {
    // Home 1.5 + Away 34 => implied 0.667 + 0.029 = 0.696 < 1: a fat "arb" driven by the 34.0 longshot.
    const m = market([
      { name: 'Home', books: [{ book: 'A', price: 1.5 }] },
      { name: 'Away', books: [{ book: 'B', price: 34 }] },
    ]);
    expect(detectArbitrage(m, { minMargin: 0.01 })).not.toBeNull(); // without a cap it "exists"
    expect(detectArbitrage(m, { minMargin: 0.01, maxOdds: 20 })).toBeNull(); // 34.0 leg dropped => no arb
  });
});
