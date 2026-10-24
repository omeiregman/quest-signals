import { describe, expect, it } from 'vitest';
import { DEVIG_METHODS, devigOdds, overround } from './devig';
import { devig } from './value';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Index of the longest price in a book (the longshot). */
const longshot = (odds: number[]) => odds.indexOf(Math.max(...odds));

// Football 1X2 (home/draw/away) books carrying an ordinary bookmaker margin (~3–7%).
const BOOKS: number[][] = [
  [1.2, 7, 13],
  [2.6, 3.3, 2.9],
  [1.45, 4.5, 7],
  [4.2, 3.6, 1.9],
];

// An exchange-style 3-way whose back prices sum to < 100% (asserted in the tests that use it).
const UNDER_ROUND_3WAY = [2.1, 3.6, 4.4];

describe('overround', () => {
  it('is Σ 1/odds − 1', () => {
    expect(overround([1.9, 1.9])).toBeCloseTo(2 / 1.9 - 1, 12); // ≈ 5.26% margin
    expect(overround([2, 2])).toBe(0);
    expect(overround([1.45, 4.5, 7])).toBeCloseTo(1 / 1.45 + 1 / 4.5 + 1 / 7 - 1, 12);
  });

  it('is negative for an under-round book', () => {
    expect(overround([2.04, 2.04])).toBeCloseTo(2 / 2.04 - 1, 12);
    expect(overround([2.04, 2.04])).toBeLessThan(0);
  });
});

describe('devigOdds (all methods)', () => {
  it('returns probabilities in (0,1) that sum to 1 on real 1X2 books', () => {
    for (const book of BOOKS) {
      for (const method of DEVIG_METHODS) {
        const p = devigOdds(book, method);
        expect(p).toHaveLength(book.length);
        expect(sum(p)).toBeCloseTo(1, 12);
        for (const x of p) {
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(1);
        }
      }
    }
  });

  it('keeps input order: shorter price ⇒ higher fair probability', () => {
    for (const book of BOOKS) {
      for (const method of DEVIG_METHODS) {
        const p = devigOdds(book, method);
        for (let i = 0; i < book.length; i++) {
          for (let j = 0; j < book.length; j++) {
            if (book[i]! < book[j]!) expect(p[i]!).toBeGreaterThan(p[j]!);
          }
        }
      }
    }
  });

  it('a symmetric 2-way market de-vigs to 50/50', () => {
    for (const method of DEVIG_METHODS) {
      const p = devigOdds([1.9, 1.9], method);
      expect(p[0]!).toBeCloseTo(0.5, 12);
      expect(p[1]!).toBeCloseTo(0.5, 12);
    }
  });

  it('multiplicative is bit-identical to value.ts devig', () => {
    for (const book of [...BOOKS, [1.9, 1.9], [2.04, 2.04], UNDER_ROUND_3WAY]) {
      expect(devigOdds(book, 'multiplicative')).toEqual(devig(book));
    }
  });

  it('power and shin shrink the longshot vs multiplicative (favourite–longshot correction)', () => {
    for (const book of BOOKS) {
      expect(overround(book)).toBeGreaterThan(0);
      const l = longshot(book);
      const fav = book.indexOf(Math.min(...book));
      const mult = devigOdds(book, 'multiplicative');
      for (const method of ['power', 'shin'] as const) {
        const p = devigOdds(book, method);
        expect(p[l]!).toBeLessThan(mult[l]!);
        expect(p[fav]!).toBeGreaterThan(mult[fav]!); // the mass moves to the favourite
      }
    }
  });

  it('under-round books still sum to 1 without throwing', () => {
    expect(overround(UNDER_ROUND_3WAY)).toBeLessThan(0);
    for (const method of DEVIG_METHODS) {
      const two = devigOdds([2.04, 2.04], method);
      expect(two[0]!).toBeCloseTo(0.5, 12);
      expect(two[1]!).toBeCloseTo(0.5, 12);
      const three = devigOdds(UNDER_ROUND_3WAY, method);
      expect(sum(three)).toBeCloseTo(1, 12);
      for (const x of three) expect(x).toBeGreaterThan(0);
    }
  });

  it('throws RangeError for < 2 outcomes or odds that are non-finite or ≤ 1', () => {
    const bad: number[][] = [
      [],
      [2],
      [1, 3],
      [0.5, 3],
      [-2, 3],
      [2, Number.NaN],
      [2, Number.POSITIVE_INFINITY],
    ];
    for (const method of DEVIG_METHODS) {
      for (const odds of bad) expect(() => devigOdds(odds, method)).toThrow(RangeError);
    }
  });
});

describe('devigOdds additive', () => {
  it('removes an equal share of the margin from every outcome (round trip)', () => {
    // Build a book from known fair probs by adding margin/n to each implied prob.
    const fair = [0.55, 0.27, 0.18];
    const margin = 0.06;
    const odds = fair.map((p) => 1 / (p + margin / fair.length));
    const p = devigOdds(odds, 'additive');
    fair.forEach((f, i) => expect(p[i]!).toBeCloseTo(f, 12));
  });

  it('floors an outcome driven ≤ 0 at 1e-6, then renormalizes', () => {
    // Heavy margin on an extreme favourite: the 60.0 longshot's share of the margin exceeds 1/60.
    const odds = [1.01, 15, 60];
    const implied = odds.map((o) => 1 / o);
    const share = (sum(implied) - 1) / 3;
    const raw = implied.map((pi) => pi - share);
    expect(raw[2]!).toBeLessThan(0); // the case this test is about
    const floored = [raw[0]!, raw[1]!, 1e-6];
    const total = sum(floored);

    const p = devigOdds(odds, 'additive');
    expect(sum(p)).toBeCloseTo(1, 12);
    expect(p[2]!).toBeGreaterThan(0);
    floored.forEach((f, i) => expect(p[i]!).toBeCloseTo(f / total, 12));
  });
});

describe('devigOdds power', () => {
  it('recovers fair probs from a book priced as π_i = p_i^(1/k)', () => {
    const fair = [0.62, 0.24, 0.14];
    for (const k of [1.07, 0.96]) {
      // k > 1 ⇒ margin, k < 1 ⇒ under-round.
      const odds = fair.map((p) => 1 / p ** (1 / k));
      expect(Math.sign(overround(odds))).toBe(k > 1 ? 1 : -1);
      const p = devigOdds(odds, 'power');
      fair.forEach((f, i) => expect(p[i]!).toBeCloseTo(f, 10));
    }
  });

  it('every outcome implies the same exponent k, and Σ π_i^k = 1', () => {
    for (const book of [...BOOKS, UNDER_ROUND_3WAY]) {
      const implied = book.map((o) => 1 / o);
      const p = devigOdds(book, 'power');
      const ks = p.map((pi, i) => Math.log(pi) / Math.log(implied[i]!));
      const k = ks[0]!;
      for (const ki of ks) expect(ki).toBeCloseTo(k, 9);
      expect(sum(implied.map((pi) => pi ** k))).toBeCloseTo(1, 10);
      if (overround(book) > 0) expect(k).toBeGreaterThan(1);
      else expect(k).toBeLessThan(1);
    }
  });

  it('on an under-round book, gives the longshot MORE than multiplicative (k < 1)', () => {
    const l = longshot(UNDER_ROUND_3WAY);
    const mult = devigOdds(UNDER_ROUND_3WAY, 'multiplicative');
    expect(devigOdds(UNDER_ROUND_3WAY, 'power')[l]!).toBeGreaterThan(mult[l]!);
  });
});

describe('devigOdds shin', () => {
  /**
   * Shin's forward model: with insider share z and true probs p, the book's implied probs are
   * π_i = s_i·Σs_j where s_i = √(z·p_i + (1−z)·p_i²). (Then B = (Σs)² and π_i²/B = s_i², which is
   * exactly the quadratic (1−z)p² + zp − π²/B = 0 that devigOdds inverts.)
   */
  const shinBook = (fair: number[], z: number) => {
    const s = fair.map((p) => Math.sqrt(z * p + (1 - z) * p * p));
    const total = sum(s);
    return s.map((si) => 1 / (si * total));
  };

  it('recovers the true probabilities from Shin-generated odds', () => {
    const cases: [number[], number][] = [
      [[0.7, 0.3], 0.05], // 2-outcome
      [[0.6, 0.3, 0.1], 0.03],
      [[0.45, 0.28, 0.27], 0.015],
      [[0.8, 0.13, 0.07], 0.08],
    ];
    for (const [fair, z] of cases) {
      const odds = shinBook(fair, z);
      expect(overround(odds)).toBeGreaterThan(0);
      const p = devigOdds(odds, 'shin');
      fair.forEach((f, i) => expect(p[i]!).toBeCloseTo(f, 10));
    }
  });

  it('the result satisfies the Shin equations with one common z ∈ (0,1)', () => {
    for (const book of BOOKS) {
      const implied = book.map((o) => 1 / o);
      const B = sum(implied);
      const p = devigOdds(book, 'shin');
      // Each outcome's quadratic (1−z)p² + zp = π²/B solved for z must give the same z.
      const zs = p.map((pi, i) => (implied[i]! ** 2 / B - pi * pi) / (pi - pi * pi));
      const z = zs[0]!;
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(1);
      for (const zi of zs) expect(zi).toBeCloseTo(z, 9);
    }
  });

  it('falls back to multiplicative when the book has no margin (B ≤ 1)', () => {
    for (const book of [[2.04, 2.04], [2, 2], [2, 4, 4], UNDER_ROUND_3WAY]) {
      expect(overround(book)).toBeLessThanOrEqual(0);
      expect(devigOdds(book, 'shin')).toEqual(devig(book));
    }
  });
});
