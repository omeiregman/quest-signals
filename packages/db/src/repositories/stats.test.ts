import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { recordClosingOdds } from './closing-odds';
import { upsertOpportunity } from './opportunities';
import { recordPlacement } from './settlements';
import { computeStats } from './stats';

describe('computeStats', () => {
  it('aggregates count, avg margin, and avg survival per sport', () => {
    const db = createTestDb();
    // survives 60s
    upsertOpportunity(db, {
      type: 'arb',
      sportKey: 'soccer',
      eventId: 'e1',
      commenceTime: 't',
      marketType: 'h2h',
      regionProfile: 'eu',
      margin: 0.04,
      dedupeKey: 'k1',
      detectedAt: '2026-06-14T00:00:00Z',
      lastSeenAt: '2026-06-14T00:01:00Z',
      legs: [],
    });
    // survives 0s
    upsertOpportunity(db, {
      type: 'arb',
      sportKey: 'tennis',
      eventId: 'e2',
      commenceTime: 't',
      marketType: 'h2h',
      regionProfile: 'eu',
      margin: 0.06,
      dedupeKey: 'k2',
      detectedAt: '2026-06-14T00:00:00Z',
      lastSeenAt: '2026-06-14T00:00:00Z',
      legs: [],
    });

    const stats = computeStats(db);
    expect(stats.totalOpportunities).toBe(2);
    expect(stats.avgMargin).toBeCloseTo(0.05, 6);
    const soccer = stats.bySport.find((s) => s.sportKey === 'soccer')!;
    expect(soccer.count).toBe(1);
    expect(soccer.avgSurvivalSeconds).toBeCloseTo(60, 0);
    expect(stats.clv).toEqual({ trackedLegs: 0, avgClv: null });
  });

  it('reports CLV from placement legs vs closing odds', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      type: 'value',
      sportKey: 'soccer',
      eventId: 'e1',
      commenceTime: '2026-07-10T18:00:00Z',
      marketType: 'h2h',
      regionProfile: 'lt',
      edge: 0.05,
      referenceBook: 'pinnacle',
      dedupeKey: 'k-clv',
      detectedAt: 't0',
      lastSeenAt: 't0',
      legs: [{ outcome: 'Home', book: 'betsson', odds: 2.3 }],
    });
    recordPlacement(db, {
      opportunityId: id,
      totalStaked: 10,
      predictedProfit: null,
      placedAt: '2026-07-01T00:00:00Z',
      legs: [{ outcome: 'Home', book: 'betsson', actualStake: 10, actualOdds: 2.3 }],
    });
    recordClosingOdds(db, {
      opportunityId: id,
      outcome: 'Home',
      referenceBook: 'pinnacle',
      closingPrice: 2.1,
      capturedAt: 'x',
    });
    recordClosingOdds(db, {
      opportunityId: id,
      outcome: 'Away',
      referenceBook: 'pinnacle',
      closingPrice: 1.8,
      capturedAt: 'x',
    });

    const stats = computeStats(db);
    expect(stats.clv.trackedLegs).toBe(1);
    // fair prob(Home) = (1/2.1) / (1/2.1 + 1/1.8); clv = 2.3 × fairProb − 1
    const fair = 1 / 2.1 / (1 / 2.1 + 1 / 1.8);
    expect(stats.clv.avgClv).toBeCloseTo(2.3 * fair - 1, 10);
  });
});
