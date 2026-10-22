import { describe, expect, it } from 'vitest';
import { createTestDb, getOpportunity, upsertOpportunity } from '@quest/db';
import type { NormalizedMarket, OddsProvider } from '@quest/core';
import { loadConfig } from '../config';
import { recheckOpportunity } from './recheck';

const clock = () => '2026-07-05T00:00:00Z';

function providerReturning(market: NormalizedMarket | null): OddsProvider {
  return {
    name: 'fake',
    fetchOdds: async () => [],
    recheckEvent: async () => market,
  };
}

const arbInput = {
  type: 'arb' as const,
  sportKey: 'soccer',
  eventId: 'e1',
  eventName: 'H vs A',
  commenceTime: '2026-07-10T18:00:00Z',
  marketType: 'h2h',
  regionProfile: 'lt-arb',
  margin: 0.02,
  dedupeKey: 'arb-e1',
  detectedAt: clock(),
  lastSeenAt: clock(),
  legs: [
    { outcome: 'H', book: '7bet.lt', odds: 2.3 },
    { outcome: 'Draw', book: 'betsson', odds: 3.6 },
    { outcome: 'A', book: 'betsson', odds: 3.4 },
  ],
};

function marketWith(prices: { h: number; d: number; a: number }): NormalizedMarket {
  return {
    sportKey: 'soccer',
    eventId: 'e1',
    homeTeam: 'H',
    awayTeam: 'A',
    commenceTime: '2026-07-10T18:00:00Z',
    marketType: 'h2h',
    outcomes: [
      { name: 'H', books: [{ book: '7bet.lt', price: prices.h, link: 'https://7bet.lt/e1' }] },
      { name: 'Draw', books: [{ book: 'betsson', price: prices.d }] },
      { name: 'A', books: [{ book: 'betsson', price: prices.a }] },
    ],
  };
}

describe('recheckOpportunity', () => {
  it('holds when the fresh margin still clears the threshold, and refreshes legs', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, arbInput);
    const config = loadConfig({ MIN_ARB_MARGIN: '0.01' });
    const res = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 2.4, d: 3.8, a: 3.5 })), config, clock },
      id,
    );
    expect(res?.verdict).toBe('holds');
    expect(res?.margin).toBeGreaterThan(0.01);
    const opp = getOpportunity(db, id)!;
    expect(opp.margin).toBeCloseTo(res!.margin!, 10);
    expect(opp.lastSeenAt).toBe(clock());
    expect(opp.legs.find((l) => l.outcome === 'H')!.deepLink).toBe('https://7bet.lt/e1');
  });

  it('degraded when positive but under threshold; gone when no arb', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, { ...arbInput, dedupeKey: 'arb-e1-b' });
    const config = loadConfig({ MIN_ARB_MARGIN: '0.05' });
    const degraded = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 2.4, d: 3.8, a: 3.5 })), config, clock },
      id,
    );
    expect(degraded?.verdict).toBe('degraded');
    const gone = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 1.8, d: 3.0, a: 2.8 })), config, clock },
      id,
    );
    expect(gone?.verdict).toBe('gone');
  });

  it('value: matches the same outcome+book and applies the edge threshold', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      type: 'value',
      sportKey: 'soccer',
      eventId: 'e1',
      eventName: 'H vs A',
      commenceTime: '2026-07-10T18:00:00Z',
      marketType: 'h2h',
      regionProfile: 'lt-arb',
      edge: 0.04,
      referenceBook: 'pinnacle',
      dedupeKey: 'val-e1',
      detectedAt: clock(),
      lastSeenAt: clock(),
      legs: [{ outcome: 'H', book: 'betsson', odds: 2.4 }],
    });
    const fresh: NormalizedMarket = {
      sportKey: 'soccer',
      eventId: 'e1',
      commenceTime: '2026-07-10T18:00:00Z',
      marketType: 'h2h',
      outcomes: [
        {
          name: 'H',
          books: [
            { book: 'pinnacle', price: 2.0 },
            { book: 'betsson', price: 2.35 },
          ],
        },
        { name: 'A', books: [{ book: 'pinnacle', price: 1.9 }] },
      ],
    };
    const res = await recheckOpportunity(
      { db, provider: providerReturning(fresh), config: loadConfig({ MIN_VALUE_EDGE: '0.02' }), clock },
      id,
    );
    expect(res?.verdict).toBe('holds'); // devig(2.0,1.9)[0] × 2.35 − 1 ≈ +0.145
    expect(res?.edge).toBeGreaterThan(0.02);
    expect(getOpportunity(db, id)!.legs[0]!.odds).toBe(2.35);
  });

  it('gone when provider returns null; null for unknown id', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, { ...arbInput, dedupeKey: 'arb-e1-c' });
    const config = loadConfig({});
    expect(
      (await recheckOpportunity({ db, provider: providerReturning(null), config, clock }, id))
        ?.verdict,
    ).toBe('gone');
    expect(
      await recheckOpportunity({ db, provider: providerReturning(null), config, clock }, 99999),
    ).toBeNull();
  });
});
