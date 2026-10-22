import { describe, expect, it } from 'vitest';
import { createTestDb } from './client';
import { pollRuns } from './schema';

describe('createTestDb', () => {
  it('applies migrations and allows inserts', () => {
    const db = createTestDb();
    db.insert(pollRuns)
      .values({
        provider: 'mock',
        regionProfile: 'eu',
        status: 'running',
        startedAt: '2026-06-14T00:00:00Z',
      })
      .run();
    const rows = db.select().from(pollRuns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('mock');
  });
});
