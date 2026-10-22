import { eq } from 'drizzle-orm';
import type { QuestDb } from '../client';
import { closingOdds } from '../schema';

export interface ClosingOddsInput {
  opportunityId: number;
  outcome: string;
  referenceBook: string;
  closingPrice: number;
  capturedAt: string;
}

/** Upsert one outcome's reference closing price. Latest capture wins (unique opp+outcome). */
export function recordClosingOdds(db: QuestDb, input: ClosingOddsInput): void {
  db.insert(closingOdds)
    .values(input)
    .onConflictDoUpdate({
      target: [closingOdds.opportunityId, closingOdds.outcome],
      set: {
        referenceBook: input.referenceBook,
        closingPrice: input.closingPrice,
        capturedAt: input.capturedAt,
      },
    })
    .run();
}

export function listClosingOdds(db: QuestDb, opportunityId: number) {
  return db.select().from(closingOdds).where(eq(closingOdds.opportunityId, opportunityId)).all();
}
