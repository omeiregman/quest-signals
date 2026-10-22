import { describe, expect, it } from 'vitest';
import { toDecimal } from './odds';

describe('toDecimal', () => {
  it('returns decimal odds unchanged', () => {
    expect(toDecimal(2.5, 'decimal')).toBe(2.5);
  });

  it('converts positive american odds', () => {
    expect(toDecimal(150, 'american')).toBeCloseTo(2.5, 10);
  });

  it('converts negative american odds', () => {
    expect(toDecimal(-200, 'american')).toBeCloseTo(1.5, 10);
  });

  it('converts fractional string odds', () => {
    expect(toDecimal('5/2', 'fractional')).toBeCloseTo(3.5, 10);
  });

  it('throws on non-positive decimal odds', () => {
    expect(() => toDecimal(0, 'decimal')).toThrow();
  });
});
