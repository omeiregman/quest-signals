import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import {
  archiveExpired,
  getOpportunity,
  listOpportunities,
  listPlacedStartingBefore,
  refreshOpportunityOdds,
  setStatus,
  upsertOpportunity,
} from './opportunities';

const base = {
  type: 'arb' as const,
  sportKey: 'soccer',
  eventId: 'evt1',
  eventName: 'Brazil vs Argentina',
  commenceTime: '2026-06-20T18:00:00Z',
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: 0.05,
  edge: null,
  referenceBook: null,
  defaultBankrollProfit: 5,
  dedupeKey: 'arb|soccer|evt1|h2h|Away:B,Home:A',
  legs: [
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
  ],
};

describe('opportunities repository', () => {
  it('inserts a new opportunity with legs', () => {
    const db = createTestDb();
    const { id, inserted } = upsertOpportunity(db, {
      ...base,
      detectedAt: '2026-06-14T00:00:00Z',
      lastSeenAt: '2026-06-14T00:00:00Z',
    });
    expect(inserted).toBe(true);
    const list = listOpportunities(db, {});
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(id);
    expect(list[0]!.legs).toHaveLength(2);
  });

  it('bumps last_seen_at instead of duplicating on the same dedupe key', () => {
    const db = createTestDb();
    const first = upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    const again = upsertOpportunity(db, { ...base, detectedAt: 't1', lastSeenAt: 't1' });
    expect(again.id).toBe(first.id); // same row
    expect(first.inserted).toBe(true);
    expect(again.inserted).toBe(false);
    const list = listOpportunities(db, {});
    expect(list).toHaveLength(1);
    expect(list[0]!.lastSeenAt).toBe('t1');
    expect(list[0]!.detectedAt).toBe('t0'); // detection time preserved
  });

  it('filters by status', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    setStatus(db, id, 'archived');
    expect(listOpportunities(db, { status: 'new' })).toHaveLength(0);
    expect(listOpportunities(db, { status: 'archived' })).toHaveLength(1);
  });

  it('filters by minMargin and sport', () => {
    const db = createTestDb();
    upsertOpportunity(db, { ...base, detectedAt: 't0', lastSeenAt: 't0' });
    expect(listOpportunities(db, { minMargin: 0.1 })).toHaveLength(0);
    expect(listOpportunities(db, { sport: 'tennis' })).toHaveLength(0);
    expect(listOpportunities(db, { sport: 'soccer', minMargin: 0.01 })).toHaveLength(1);
  });

  it('stores leg deep links', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-link',
      detectedAt: 't0',
      lastSeenAt: 't0',
      legs: [{ outcome: 'Home', book: 'A', odds: 2.0, deepLink: 'https://a.example/e' }],
    });
    const opp = getOpportunity(db, id);
    expect(opp!.legs[0]!.deepLink).toBe('https://a.example/e');
  });

  it('archiveExpired archives new/accepted opps whose kickoff passed', () => {
    const db = createTestDb();
    const { id: past } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-past',
      commenceTime: '2026-07-01T00:00:00Z',
      detectedAt: 't0',
      lastSeenAt: 't0',
    });
    const { id: future } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-fut',
      commenceTime: '2026-07-20T00:00:00Z',
      detectedAt: 't0',
      lastSeenAt: 't0',
    });
    const n = archiveExpired(db, '2026-07-05T00:00:00Z');
    expect(n).toBe(1);
    expect(getOpportunity(db, past)!.status).toBe('archived');
    expect(getOpportunity(db, future)!.status).toBe('new');
  });

  it('archiveExpired leaves bet_placed opportunities alone (they await settlement)', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-placed-old',
      commenceTime: '2026-07-01T00:00:00Z',
      detectedAt: 't0',
      lastSeenAt: 't0',
    });
    setStatus(db, id, 'bet_placed');
    expect(archiveExpired(db, '2026-07-05T00:00:00Z')).toBe(0);
    expect(getOpportunity(db, id)!.status).toBe('bet_placed');
  });

  it('listPlacedStartingBefore returns bet_placed opps inside the window', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-placed',
      commenceTime: '2026-07-05T12:00:00Z',
      detectedAt: 't0',
      lastSeenAt: 't0',
    });
    setStatus(db, id, 'bet_placed');
    expect(
      listPlacedStartingBefore(db, '2026-07-05T00:00:00Z', '2026-07-06T00:00:00Z').map((o) => o.id),
    ).toEqual([id]);
    expect(listPlacedStartingBefore(db, '2026-07-05T13:00:00Z', '2026-07-06T00:00:00Z')).toEqual(
      [],
    );
  });

  it('refreshOpportunityOdds replaces legs and updates margin/lastSeenAt', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      ...base,
      dedupeKey: 'k-refresh',
      detectedAt: 't0',
      lastSeenAt: 't0',
    });
    refreshOpportunityOdds(db, id, {
      margin: 0.011,
      lastSeenAt: '2026-07-05T00:00:00Z',
      legs: [{ outcome: 'Home', book: 'B', odds: 2.4 }],
    });
    const opp = getOpportunity(db, id)!;
    expect(opp.margin).toBeCloseTo(0.011);
    expect(opp.lastSeenAt).toBe('2026-07-05T00:00:00Z');
    expect(opp.legs).toHaveLength(1);
    expect(opp.legs[0]!.book).toBe('B');
  });
});
