import { createTestDb, getOpportunity, upsertOpportunity, pollRuns, placements } from '@quest/db';
import { REGION_PROFILES } from '@quest/core';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { createApp } from './app';

const arbBase = {
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
  detectedAt: '2026-06-14T00:00:00Z',
  lastSeenAt: '2026-06-14T00:00:00Z',
  legs: [
    { outcome: 'Home', book: 'A', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
    { outcome: 'Away', book: 'B', odds: 2.1, impliedProb: 0.476, recommendedStake: 50 },
  ],
};

const valueBase = {
  type: 'value' as const,
  sportKey: 'tennis',
  eventId: 'evt2',
  eventName: 'Player X vs Player Y',
  commenceTime: '2026-06-21T12:00:00Z',
  marketType: 'h2h',
  regionProfile: 'eu',
  margin: null,
  edge: 0.04,
  referenceBook: 'Pinnacle',
  defaultBankrollProfit: null,
  dedupeKey: 'value|tennis|evt2|h2h|Player X|Betsson|Pinnacle',
  detectedAt: '2026-06-14T00:00:00Z',
  lastSeenAt: '2026-06-14T00:00:00Z',
  legs: [{ outcome: 'Player X', book: 'Betsson', odds: 2.5, impliedProb: 0.4, recommendedStake: null }],
};

function setup() {
  const db = createTestDb();
  const { id: arbId } = upsertOpportunity(db, arbBase);
  const { id: valueId } = upsertOpportunity(db, valueBase);
  const config = loadConfig({});
  const runOnce = vi.fn(async () => ({
    status: 'ok' as const,
    result: { marketsFetched: 5, arbsFound: 1, valuesFound: 2, errors: 0 },
  }));
  const recheck = vi.fn(async (id: number) =>
    id === arbId
      ? { verdict: 'holds' as const, margin: 0.02, legs: [], checkedAt: '2026-06-14T00:00:00Z' }
      : null,
  );
  const app = createApp({
    db,
    config,
    runOnce,
    recheck,
    supportsRecheck: true,
    clock: () => '2026-06-14T00:00:00Z',
  });
  return { db, app, arbId, valueId, runOnce, recheck, config };
}

describe('createApp', () => {
  it('GET /api/opportunities returns the new arb with its legs', async () => {
    const { app, arbId } = setup();
    const res = await app.request('/api/opportunities');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: number; type: string; legs: unknown[] }>;
    const arb = body.find((o) => o.id === arbId);
    expect(arb).toBeDefined();
    expect(arb!.type).toBe('arb');
    expect(arb!.legs).toHaveLength(2);
  });

  it('GET /api/opportunities?status=archived returns []', async () => {
    const { app } = setup();
    const res = await app.request('/api/opportunities?status=archived');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/opportunities filters by type', async () => {
    const { app, valueId } = setup();
    const res = await app.request('/api/opportunities?type=value');
    const body = (await res.json()) as Array<{ id: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.id).toBe(valueId);
  });

  it('GET /api/opportunities/:id returns the opp; 404 for unknown', async () => {
    const { app, arbId } = setup();
    const ok = await app.request(`/api/opportunities/${arbId}`);
    expect(ok.status).toBe(200);
    const opp = (await ok.json()) as { id: number; legs: unknown[] };
    expect(opp.id).toBe(arbId);
    expect(opp.legs).toHaveLength(2);

    const missing = await app.request('/api/opportunities/999999');
    expect(missing.status).toBe(404);
  });

  it('POST /api/opportunities/:id/status sets status and records placement', async () => {
    const { app, db, arbId } = setup();
    const res = await app.request(`/api/opportunities/${arbId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'bet_placed',
        placement: {
          totalStaked: 100,
          predictedProfit: 5,
          legs: [
            { outcome: 'Home', book: 'A', actualStake: 50, actualOdds: 2.1 },
            { outcome: 'Away', book: 'B', actualStake: 50, actualOdds: 2.1 },
          ],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const opp = getOpportunity(db, arbId);
    expect(opp!.status).toBe('bet_placed');

    const recorded = db
      .select()
      .from(placements)
      .all()
      .filter((p) => p.opportunityId === arbId);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.totalStaked).toBe(100);
    expect(recorded[0]!.placedAt).toBe('2026-06-14T00:00:00Z');
  });

  it('POST /api/opportunities/:id/status returns 404 for unknown opp', async () => {
    const { app } = setup();
    const res = await app.request('/api/opportunities/999999/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/opportunities/:id/settlement returns ok', async () => {
    const { app, arbId } = setup();
    const res = await app.request(`/api/opportunities/${arbId}/settlement`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        winningSelection: 'Home',
        realizedProfit: 5,
        legs: [
          { outcome: 'Home', result: 'settled' },
          { outcome: 'Away', result: 'settled' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /api/stats returns totalOpportunities >= 2', async () => {
    const { app } = setup();
    const res = await app.request('/api/stats');
    expect(res.status).toBe(200);
    const stats = (await res.json()) as { totalOpportunities: number };
    expect(stats.totalOpportunities).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/poll runs a poll and returns its outcome', async () => {
    const { app, runOnce } = setup();
    const res = await app.request('/api/poll', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; result?: { arbsFound: number } };
    expect(body.status).toBe('ok');
    expect(body.result?.arbsFound).toBe(1);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('GET /api/meta returns config with regionProfiles', async () => {
    const { app } = setup();
    const res = await app.request('/api/meta');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as {
      lastPoll: string | null;
      config: { defaultBankroll: number; taxRate: number; regions: string[] };
      regionProfiles: typeof REGION_PROFILES;
    };
    expect(meta.config.defaultBankroll).toBe(100);
    expect(meta.config.taxRate).toBeCloseTo(0.2, 6);
    expect(meta.regionProfiles).toEqual(REGION_PROFILES);
    expect(meta.lastPoll).toBeNull();
  });

  it('GET /api/meta reflects the most recent finished poll run', async () => {
    const { app, db } = setup();
    db.insert(pollRuns)
      .values({
        provider: 'mock',
        regionProfile: 'eu',
        status: 'ok',
        startedAt: '2026-06-13T23:59:00Z',
        finishedAt: '2026-06-14T00:00:00Z',
      })
      .run();
    const res = await app.request('/api/meta');
    const meta = (await res.json()) as { lastPoll: string | null };
    expect(meta.lastPoll).toBe('2026-06-14T00:00:00Z');
  });

  it('GET /api/sports lists polled sports plus any with opportunities', async () => {
    const { app } = setup(); // config.sports default = [soccer_fifa_world_cup]; opps seeded in soccer + tennis
    const res = await app.request('/api/sports');
    expect(res.status).toBe(200);
    const sports = (await res.json()) as string[];
    expect(sports).toEqual(['soccer', 'soccer_fifa_world_cup', 'tennis']);
  });

  // Regression hono-2: an empty minMargin must be treated as absent, not coerced to 0
  // (which would silently drop value opportunities that have a null margin).
  it('GET /api/opportunities?minMargin= (empty) does not drop value opps', async () => {
    const { app, valueId } = setup();
    const res = await app.request('/api/opportunities?minMargin=');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: number }>;
    expect(body.some((o) => o.id === valueId)).toBe(true);
  });

  // Regression hono-3: placement is only valid with status=bet_placed; otherwise 400.
  it('POST /api/opportunities/:id/status rejects placement when status is not bet_placed', async () => {
    const { app, arbId } = setup();
    const res = await app.request(`/api/opportunities/${arbId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'skipped',
        placement: {
          totalStaked: 100,
          legs: [{ outcome: 'Home', book: 'A', actualStake: 50, actualOdds: 2.1 }],
        },
      }),
    });
    expect(res.status).toBe(400);
  });

  // Regression hono-4: unhandled errors return the JSON { error } shape, not plain text.
  it('returns a JSON error shape on an unhandled error', async () => {
    const db = createTestDb();
    const app = createApp({
      db,
      config: loadConfig({}),
      runOnce: vi.fn(async () => {
        throw new Error('boom');
      }),
      recheck: vi.fn(async () => null),
      supportsRecheck: false,
      clock: () => '2026-06-14T00:00:00Z',
    });
    const res = await app.request('/api/poll', { method: 'POST' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });

  it('POST /api/opportunities/:id/recheck returns the verdict; 404 unknown', async () => {
    const { app, arbId } = setup();
    const ok = await app.request(`/api/opportunities/${arbId}/recheck`, { method: 'POST' });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { verdict: string }).verdict).toBe('holds');
    const missing = await app.request('/api/opportunities/999999/recheck', { method: 'POST' });
    expect(missing.status).toBe(404);
  });

  it('POST recheck returns 501 when the provider lacks the capability', async () => {
    const db = createTestDb();
    const app = createApp({
      db,
      config: loadConfig({}),
      runOnce: vi.fn(async () => ({ status: 'ok' as const })),
      recheck: vi.fn(async () => null),
      supportsRecheck: false,
      clock: () => '2026-06-14T00:00:00Z',
    });
    const res = await app.request('/api/opportunities/1/recheck', { method: 'POST' });
    expect(res.status).toBe(501);
  });

  it('GET /api/meta exposes supportsRecheck', async () => {
    const { app } = setup();
    const meta = (await (await app.request('/api/meta')).json()) as {
      config: { supportsRecheck: boolean };
    };
    expect(meta.config.supportsRecheck).toBe(true);
  });
});
