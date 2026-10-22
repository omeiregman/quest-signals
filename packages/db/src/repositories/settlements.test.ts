import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { upsertOpportunity } from './opportunities';
import { recordPlacement, recordSettlement } from './settlements';

function seedOpp(db: ReturnType<typeof createTestDb>) {
  const { id } = upsertOpportunity(db, {
    type: 'arb',
    sportKey: 'soccer',
    eventId: 'evt1',
    commenceTime: 't',
    marketType: 'h2h',
    regionProfile: 'eu',
    margin: 0.05,
    dedupeKey: 'k1',
    detectedAt: 't0',
    lastSeenAt: 't0',
    legs: [{ outcome: 'Home', book: 'A', odds: 2.1 }],
  });
  return id;
}

describe('settlements repository', () => {
  it('records a placement with legs', () => {
    const db = createTestDb();
    const oppId = seedOpp(db);
    const pid = recordPlacement(db, {
      opportunityId: oppId,
      totalStaked: 100,
      predictedProfit: 5,
      placedAt: 't1',
      legs: [{ outcome: 'Home', book: 'A', actualStake: 50, actualOdds: 2.08 }],
    });
    expect(pid).toBeGreaterThan(0);
  });

  it('records a settlement with per-leg results', () => {
    const db = createTestDb();
    const oppId = seedOpp(db);
    const sid = recordSettlement(db, {
      opportunityId: oppId,
      winningSelection: 'Home',
      realizedProfit: 3.5,
      predictedProfit: 5,
      notes: 'Book B changed odds before confirm',
      autoFilled: false,
      settledAt: 't2',
      legs: [{ outcome: 'Home', result: 'settled' }],
    });
    expect(sid).toBeGreaterThan(0);
  });
});
