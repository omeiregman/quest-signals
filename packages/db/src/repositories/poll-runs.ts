import { eq } from 'drizzle-orm';
import type { QuestDb } from '../client';
import { pollRuns } from '../schema';

export function startPollRun(
  db: QuestDb,
  input: { provider: string; regionProfile: string; startedAt: string },
): number {
  const row = db
    .insert(pollRuns)
    .values({ ...input, status: 'running' })
    .returning({ id: pollRuns.id })
    .get();
  return row.id;
}

export function finishPollRun(
  db: QuestDb,
  id: number,
  input: { status: 'ok' | 'error'; creditsUsed?: number; error?: string; finishedAt: string },
): void {
  db.update(pollRuns)
    .set({
      status: input.status,
      creditsUsed: input.creditsUsed ?? null,
      error: input.error ?? null,
      finishedAt: input.finishedAt,
    })
    .where(eq(pollRuns.id, id))
    .run();
}
