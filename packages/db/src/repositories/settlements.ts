import type { QuestDb } from '../client';
import { placementLegs, placements, settlementLegs, settlements } from '../schema';

export interface RecordPlacement {
  opportunityId: number;
  totalStaked: number;
  predictedProfit?: number | null; // gross
  placedAt: string;
  legs: { outcome: string; book: string; actualStake: number; actualOdds: number }[];
}

export function recordPlacement(db: QuestDb, input: RecordPlacement): number {
  const row = db
    .insert(placements)
    .values({
      opportunityId: input.opportunityId,
      totalStaked: input.totalStaked,
      predictedProfit: input.predictedProfit ?? null,
      placedAt: input.placedAt,
    })
    .returning({ id: placements.id })
    .get();

  for (const leg of input.legs) {
    db.insert(placementLegs)
      .values({ placementId: row.id, ...leg })
      .run();
  }
  return row.id;
}

export interface RecordSettlement {
  opportunityId: number;
  winningSelection?: string | null;
  realizedProfit?: number | null;
  predictedProfit?: number | null;
  notes?: string | null;
  autoFilled: boolean;
  settledAt: string;
  legs: { outcome: string; result: 'settled' | 'voided' | 'rejected' }[];
}

export function recordSettlement(db: QuestDb, input: RecordSettlement): number {
  const row = db
    .insert(settlements)
    .values({
      opportunityId: input.opportunityId,
      winningSelection: input.winningSelection ?? null,
      realizedProfit: input.realizedProfit ?? null,
      predictedProfit: input.predictedProfit ?? null,
      notes: input.notes ?? null,
      autoFilled: input.autoFilled,
      settledAt: input.settledAt,
    })
    .returning({ id: settlements.id })
    .get();

  for (const leg of input.legs) {
    db.insert(settlementLegs)
      .values({ settlementId: row.id, ...leg })
      .run();
  }
  return row.id;
}
