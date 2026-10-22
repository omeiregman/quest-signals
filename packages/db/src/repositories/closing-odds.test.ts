import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { upsertOpportunity } from './opportunities';
import { listClosingOdds, recordClosingOdds } from './closing-odds';

const base = {
  type: 'value' as const,
  sportKey: 'soccer',
  eventId: 'e1',
  commenceTime: '2026-07-10T18:00:00Z',
  marketType: 'h2h',
  regionProfile: 'lt-arb',
  dedupeKey: 'k1',
  detectedAt: '2026-07-01T00:00:00Z',
  lastSeenAt: '2026-07-01T00:00:00Z',
  legs: [{ outcome: 'Home', book: 'betsson', odds: 2.3 }],
};

describe('closing odds', () => {
  it('records and overwrites per opportunity+outcome (latest capture wins)', () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, base);
    recordClosingOdds(db, {
      opportunityId: id,
      outcome: 'Home',
      referenceBook: 'pinnacle',
      closingPrice: 2.1,
      capturedAt: '2026-07-10T10:00:00Z',
    });
    recordClosingOdds(db, {
      opportunityId: id,
      outcome: 'Home',
      referenceBook: 'pinnacle',
      closingPrice: 2.05,
      capturedAt: '2026-07-10T16:00:00Z',
    });
    const rows = listClosingOdds(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.closingPrice).toBe(2.05);
    expect(rows[0]!.capturedAt).toBe('2026-07-10T16:00:00Z');
  });
});
