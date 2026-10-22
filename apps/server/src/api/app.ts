import { Hono } from 'hono';
import { z } from 'zod';
import {
  computeStats,
  getOpportunity,
  listOpportunities,
  opportunities,
  pollRuns,
  recordPlacement,
  recordSettlement,
  setStatus,
  type OpportunityFilter,
  type QuestDb,
} from '@quest/db';
import { REGION_PROFILES } from '@quest/core';
import type { Config } from '../config';
import type { Clock } from '../clock';
import type { RecheckResult } from '../detection/recheck';

export interface PollResult {
  status: 'ok' | 'skipped' | 'error';
  result?: { marketsFetched: number; arbsFound: number; valuesFound: number; errors: number };
  error?: string;
}

export interface ApiDeps {
  db: QuestDb;
  config: Config;
  runOnce: () => Promise<PollResult>;
  recheck: (id: number) => Promise<RecheckResult | null>;
  supportsRecheck: boolean;
  clock: Clock;
}

const opportunityStatus = z.enum(['new', 'accepted', 'bet_placed', 'skipped', 'archived']);
const opportunityType = z.enum(['arb', 'value']);
const legResult = z.enum(['settled', 'voided', 'rejected']);

const listQuerySchema = z.object({
  status: opportunityStatus.optional().default('new'),
  type: opportunityType.optional(),
  sport: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  minMargin: z.coerce.number().optional(),
  sort: z.enum(['timeToEvent']).optional(),
});

const placementSchema = z.object({
  totalStaked: z.number(),
  predictedProfit: z.number().optional(),
  legs: z
    .array(
      z.object({
        outcome: z.string(),
        book: z.string(),
        actualStake: z.number(),
        actualOdds: z.number(),
      }),
    )
    .min(1),
});

const statusBodySchema = z
  .object({
    status: opportunityStatus,
    placement: placementSchema.optional(),
  })
  .refine((b) => !b.placement || b.status === 'bet_placed', {
    message: 'placement is only allowed when status is bet_placed',
    path: ['placement'],
  });

const settlementBodySchema = z.object({
  winningSelection: z.string().optional(),
  realizedProfit: z.number().optional(),
  predictedProfit: z.number().optional(),
  notes: z.string().optional(),
  autoFilled: z.boolean().default(false),
  legs: z
    .array(z.object({ outcome: z.string(), result: legResult }))
    .min(1),
});

const idParam = z.coerce.number().int().positive();

export function createApp(deps: ApiDeps): Hono {
  const { db, config, runOnce, recheck, supportsRecheck, clock } = deps;
  const app = new Hono();

  // All uncaught errors share the JSON { error } shape.
  app.onError((err, c) => {
    console.error('[quest] API error:', err);
    return c.json({ error: 'internal error' }, 500);
  });

  // GET /api/opportunities
  app.get('/api/opportunities', (c) => {
    const rawQuery = Object.fromEntries(new URL(c.req.url).searchParams);
    // Treat empty-string params (e.g. ?minMargin=) as absent so they don't coerce to 0 or fail enums.
    const cleanedQuery = Object.fromEntries(Object.entries(rawQuery).filter(([, v]) => v !== ''));
    const parsed = listQuerySchema.safeParse(cleanedQuery);
    if (!parsed.success) {
      return c.json({ error: 'invalid query', issues: parsed.error.issues }, 400);
    }
    const { status, type, sport, region, minMargin, sort } = parsed.data;

    const filter: OpportunityFilter = { status };
    if (type !== undefined) filter.type = type;
    if (sport !== undefined) filter.sport = sport;
    if (region !== undefined) filter.region = region;
    if (minMargin !== undefined) filter.minMargin = minMargin;

    let results = listOpportunities(db, filter);
    if (sort === 'timeToEvent') {
      // Soonest events first.
      results = [...results].sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));
    }
    return c.json(results);
  });

  // GET /api/opportunities/:id
  app.get('/api/opportunities/:id', (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid id' }, 400);
    const opp = getOpportunity(db, id.data);
    if (!opp) return c.json({ error: 'not found' }, 404);
    return c.json(opp);
  });

  // POST /api/opportunities/:id/status
  app.post('/api/opportunities/:id/status', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid id' }, 400);

    const json = await c.req.json().catch(() => undefined);
    const parsed = statusBodySchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);
    }

    const existing = getOpportunity(db, id.data);
    if (!existing) return c.json({ error: 'not found' }, 404);

    const { status, placement } = parsed.data;
    setStatus(db, id.data, status);

    if (status === 'bet_placed' && placement) {
      recordPlacement(db, {
        opportunityId: id.data,
        totalStaked: placement.totalStaked,
        predictedProfit: placement.predictedProfit ?? null,
        placedAt: clock(),
        legs: placement.legs,
      });
    }

    return c.json({ ok: true });
  });

  // POST /api/opportunities/:id/recheck — fresh-odds check before placing (1 provider request).
  app.post('/api/opportunities/:id/recheck', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid id' }, 400);
    if (!supportsRecheck) {
      return c.json({ error: 'recheck not supported by this provider' }, 501);
    }
    const result = await recheck(id.data);
    if (!result) return c.json({ error: 'not found' }, 404);
    return c.json(result);
  });

  // POST /api/opportunities/:id/settlement
  app.post('/api/opportunities/:id/settlement', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid id' }, 400);

    const json = await c.req.json().catch(() => undefined);
    const parsed = settlementBodySchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);
    }

    const existing = getOpportunity(db, id.data);
    if (!existing) return c.json({ error: 'not found' }, 404);

    const { winningSelection, realizedProfit, predictedProfit, notes, autoFilled, legs } =
      parsed.data;
    recordSettlement(db, {
      opportunityId: id.data,
      settledAt: clock(),
      winningSelection: winningSelection ?? null,
      realizedProfit: realizedProfit ?? null,
      predictedProfit: predictedProfit ?? null,
      notes: notes ?? null,
      autoFilled,
      legs,
    });

    return c.json({ ok: true });
  });

  // GET /api/stats
  app.get('/api/stats', (c) => c.json(computeStats(db)));

  // POST /api/poll — runs a detection cycle and returns its outcome (status + summary).
  app.post('/api/poll', async (c) => {
    return c.json(await runOnce());
  });

  // GET /api/meta
  app.get('/api/meta', (c) => {
    const finishedAts = db
      .select({ finishedAt: pollRuns.finishedAt })
      .from(pollRuns)
      .all()
      .map((r) => r.finishedAt)
      .filter((f): f is string => f !== null);
    const lastPoll =
      finishedAts.length > 0
        ? finishedAts.reduce((max, f) => (f > max ? f : max))
        : null;

    return c.json({
      lastPoll,
      config: {
        defaultBankroll: config.defaultBankroll,
        taxRate: config.taxRate,
        stakeRounding: config.stakeRounding,
        regions: config.regions,
        sports: config.sports,
        oddsProvider: config.oddsProvider,
        supportsRecheck,
      },
      regionProfiles: REGION_PROFILES,
    });
  });

  // GET /api/sports — the sports the filter dropdown offers: every sport we POLL
  // (config.sports) plus any that already have opportunities. So the dropdown lists
  // sports in play even before they've produced an opportunity.
  app.get('/api/sports', (c) => {
    const stored = db
      .selectDistinct({ sportKey: opportunities.sportKey })
      .from(opportunities)
      .all()
      .map((r) => r.sportKey);
    const sports = [...new Set([...config.sports, ...stored])].sort();
    return c.json(sports);
  });

  return app;
}
