import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../client';
import { pollRuns } from '../schema';
import { finishPollRun, startPollRun } from './poll-runs';

describe('poll-runs repository', () => {
  it('starts and finishes a poll run', () => {
    const db = createTestDb();
    const id = startPollRun(db, {
      provider: 'mock',
      regionProfile: 'eu',
      startedAt: '2026-06-14T00:00:00Z',
    });
    expect(id).toBeGreaterThan(0);

    finishPollRun(db, id, { status: 'ok', creditsUsed: 3, finishedAt: '2026-06-14T00:00:05Z' });

    const run = db.select().from(pollRuns).where(eq(pollRuns.id, id)).get();
    expect(run?.status).toBe('ok');
    expect(run?.creditsUsed).toBe(3);
    expect(run?.finishedAt).toBe('2026-06-14T00:00:05Z');
  });
});
