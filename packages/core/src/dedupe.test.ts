import { describe, expect, it } from 'vitest';
import { dedupeKey } from './dedupe';
import type { ArbOpportunity, ValueOpportunity } from './types';

const arb: ArbOpportunity = {
  type: 'arb',
  sportKey: 'soccer',
  eventId: 'evt1',
  commenceTime: 't',
  marketType: 'h2h',
  legs: [
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 0.47 },
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 0.47 },
  ],
  totalImplied: 0.94,
  margin: 0.06,
};

describe('dedupeKey', () => {
  it('is stable regardless of leg ordering', () => {
    const reordered: ArbOpportunity = { ...arb, legs: [arb.legs[1]!, arb.legs[0]!] };
    expect(dedupeKey(arb)).toBe(dedupeKey(reordered));
  });

  it('differs when a book changes', () => {
    const moved: ArbOpportunity = {
      ...arb,
      legs: [arb.legs[0]!, { ...arb.legs[1]!, book: 'C' }],
    };
    expect(dedupeKey(moved)).not.toBe(dedupeKey(arb));
  });

  it('builds a value key from outcome/book/reference', () => {
    const v: ValueOpportunity = {
      type: 'value',
      sportKey: 'soccer',
      eventId: 'evt1',
      commenceTime: 't',
      marketType: 'h2h',
      outcome: 'Home',
      book: 'Soft',
      softOdds: 2.3,
      referenceBook: 'Pinnacle',
      trueProb: 0.5,
      edge: 0.15,
    };
    expect(dedupeKey(v)).toBe('value|soccer|evt1|h2h|Home|Soft|Pinnacle');
  });
});
