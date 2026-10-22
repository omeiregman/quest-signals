import { describe, expect, it } from 'vitest';
import { detectArbitrage, isFresh } from './arbitrage';
import { detectValue } from './value';
import type { NormalizedMarket } from './types';

const NOW = Date.parse('2026-09-20T12:00:00Z');
const H = 3_600_000;
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();

describe('isFresh', () => {
  it('keeps prices with no timestamp or no age limit', () => {
    expect(isFresh({ book: 'a', price: 2 }, { maxAgeMs: H, now: NOW })).toBe(true);
    expect(isFresh({ book: 'a', price: 2, updatedAt: iso(100) }, { now: NOW })).toBe(true);
  });
  it('drops prices older than maxAgeMs', () => {
    expect(isFresh({ book: 'a', price: 2, updatedAt: iso(2) }, { maxAgeMs: H, now: NOW })).toBe(false);
    expect(isFresh({ book: 'a', price: 2, updatedAt: iso(0.5) }, { maxAgeMs: H, now: NOW })).toBe(true);
  });
});

// Two-way market where the arb only exists if the STALE 74h-old 7bet line is believed.
const staleArbMarket: NormalizedMarket = {
  sportKey: 'soccer',
  eventId: 'e1',
  commenceTime: '2026-09-21T18:00:00Z',
  marketType: 'h2h',
  outcomes: [
    {
      name: 'Home',
      books: [
        { book: '7bet.lt', price: 2.4, updatedAt: iso(74) }, // stale zombie price
        { book: 'betsson', price: 2.0, updatedAt: iso(1) },
      ],
    },
    { name: 'Away', books: [{ book: 'betsson', price: 2.0, updatedAt: iso(1) }] },
  ],
};

describe('freshness gate in detection', () => {
  it('detectArbitrage ignores stale prices (no phantom arb) but finds it without the gate', () => {
    expect(detectArbitrage(staleArbMarket, { minMargin: 0 })).not.toBeNull();
    expect(
      detectArbitrage(staleArbMarket, { minMargin: 0, maxAgeMs: 48 * H, now: NOW }),
    ).toBeNull();
  });

  it('detectArbitrage carries updatedAt onto legs', () => {
    const arb = detectArbitrage(staleArbMarket, { minMargin: 0 });
    expect(arb?.legs[0]?.updatedAt).toBe(iso(74));
  });

  it('detectValue returns nothing when the reference line is stale', () => {
    const m: NormalizedMarket = {
      ...staleArbMarket,
      outcomes: [
        {
          name: 'Home',
          books: [
            { book: 'pinnacle', price: 2.0, updatedAt: iso(30) },
            { book: 'betsson', price: 2.3, updatedAt: iso(1) },
          ],
        },
        { name: 'Away', books: [{ book: 'pinnacle', price: 1.9, updatedAt: iso(30) }] },
      ],
    };
    expect(detectValue(m, { referenceBook: 'pinnacle', minEdge: 0.01 })).toHaveLength(1);
    expect(
      detectValue(m, { referenceBook: 'pinnacle', minEdge: 0.01, maxAgeMs: 12 * H, now: NOW }),
    ).toHaveLength(0);
  });

  it('detectValue skips a stale soft line and reports both timestamps on a fresh one', () => {
    const m: NormalizedMarket = {
      ...staleArbMarket,
      outcomes: [
        {
          name: 'Home',
          books: [
            { book: 'pinnacle', price: 2.0, updatedAt: iso(1) },
            { book: '7bet.lt', price: 2.5, updatedAt: iso(74) }, // stale
            { book: 'betsson', price: 2.3, updatedAt: iso(2) }, // fresh
          ],
        },
        { name: 'Away', books: [{ book: 'pinnacle', price: 1.9, updatedAt: iso(1) }] },
      ],
    };
    const values = detectValue(m, {
      referenceBook: 'pinnacle',
      minEdge: 0.01,
      maxAgeMs: 48 * H,
      now: NOW,
    });
    expect(values.map((v) => v.book)).toEqual(['betsson']);
    expect(values[0]?.updatedAt).toBe(iso(2));
    expect(values[0]?.referenceUpdatedAt).toBe(iso(1));
  });
});
