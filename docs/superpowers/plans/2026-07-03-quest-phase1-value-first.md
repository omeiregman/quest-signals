# Quest Phase 1 — Value-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of `docs/superpowers/specs/2026-07-03-quest-profitability-pivot-design.md`: credit refocus, Telegram notifications, per-leg deep links, re-check-before-placing, lifecycle hygiene, CLV tracking, and a value stake suggestion.

**Architecture:** Pure math stays in `packages/core` (CLV joins de-vig in `value.ts`'s style). Persistence additions (deep links on legs, `closing_odds` table, archive/refresh helpers) go in `packages/db` with a drizzle migration. `apps/server` gains a Telegram notifier module, a recheck module, provider `recheckEvent` capability, and detection-run wiring. `apps/web` surfaces deep links, the re-check button, the 1% stake suggestion, and the CLV stat.

**Tech Stack:** TypeScript 5.6 strict ESM, Drizzle + better-sqlite3, Hono, React 18 + TanStack Query, Vitest. Run everything from repo root `/Users/godsmanomeire/projects/quest`.

**Conventions:** TDD per task. `pnpm test` runs the whole workspace (vitest). `pnpm typecheck` + `pnpm lint` must stay green. Commit after each task. `noUncheckedIndexedAccess` is ON — index access yields `T | undefined`.

---

### Task 1: core — `BookOdds.link`, `recheckEvent` capability, CLV math

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/arbitrage.ts`
- Modify: `packages/core/src/value.ts`
- Create: `packages/core/src/clv.ts`
- Create: `packages/core/src/clv.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for CLV + link propagation**

`packages/core/src/clv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clvForLeg } from './clv';
import { detectArbitrage } from './arbitrage';
import { detectValue } from './value';
import type { NormalizedMarket } from './types';

describe('clvForLeg', () => {
  it('positive CLV when placed odds beat the de-vigged closing line', () => {
    // Closing ref: 2.0 / 2.1 → implied .5/.4762, devig → .5122/.4878.
    // Placed 2.10 on outcome 0: clv = 2.10 * 0.5122 - 1 ≈ +0.0756
    expect(clvForLeg(2.1, [2.0, 2.1], 0)).toBeCloseTo(2.1 * (0.5 / (0.5 + 1 / 2.1)) - 1, 10);
  });

  it('zero CLV when placed odds equal fair closing odds', () => {
    // Fair (vig-free) closing: 2.0/2.0 → prob .5 each; placed at 2.0 → clv 0.
    expect(clvForLeg(2.0, [2.0, 2.0], 1)).toBeCloseTo(0, 10);
  });

  it('throws on out-of-range outcome index', () => {
    expect(() => clvForLeg(2.0, [2.0, 2.0], 5)).toThrow(RangeError);
  });
});

const marketWithLinks: NormalizedMarket = {
  sportKey: 'soccer',
  eventId: 'e1',
  commenceTime: '2026-07-10T18:00:00Z',
  marketType: 'h2h',
  outcomes: [
    { name: 'Home', books: [{ book: 'A', price: 2.2, link: 'https://a.example/e1' }] },
    { name: 'Away', books: [{ book: 'B', price: 2.2, link: 'https://b.example/e1' }] },
  ],
};

describe('deep-link propagation', () => {
  it('detectArbitrage carries the winning book link onto the leg', () => {
    const arb = detectArbitrage(marketWithLinks, { minMargin: 0 });
    expect(arb?.legs[0]?.link).toBe('https://a.example/e1');
    expect(arb?.legs[1]?.link).toBe('https://b.example/e1');
  });

  it('detectValue carries the soft book link', () => {
    const m: NormalizedMarket = {
      ...marketWithLinks,
      outcomes: [
        {
          name: 'Home',
          books: [
            { book: 'pinnacle', price: 2.0 },
            { book: 'soft', price: 2.3, link: 'https://soft.example/e1' },
          ],
        },
        { name: 'Away', books: [{ book: 'pinnacle', price: 2.0 }] },
      ],
    };
    const values = detectValue(m, { referenceBook: 'pinnacle', minEdge: 0.01 });
    expect(values[0]?.link).toBe('https://soft.example/e1');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @quest/core test -- clv`
Expected: FAIL — `./clv` module not found (and link property tests fail).

- [ ] **Step 3: Implement**

`packages/core/src/clv.ts`:

```ts
import { devig } from './value';

/**
 * Closing-line value of a placed bet: placed odds vs the de-vigged fair closing price.
 * `closingPrices` are the reference book's closing decimal odds for ALL outcomes of the
 * market; `outcomeIndex` is the outcome the bet was on. CLV = placedOdds × fairProb − 1.
 * Positive CLV over a sample of bets is the standard evidence of a real edge.
 */
export function clvForLeg(
  placedOdds: number,
  closingPrices: number[],
  outcomeIndex: number,
): number {
  const probs = devig(closingPrices);
  const p = probs[outcomeIndex];
  if (p === undefined) throw new RangeError('outcomeIndex out of range for closingPrices');
  return placedOdds * p - 1;
}
```

`packages/core/src/types.ts` edits:
- `BookOdds` gains `link?: string; // bookmaker deep link to the event page (e.g. OddsPapi fixturePath)`
- `ArbLeg` gains `link?: string;`
- `ValueOpportunity` gains `link?: string;`
- `OddsProvider` gains:

```ts
  /**
   * Optional capability: fetch fresh odds for ONE known event (cheap re-check before placing;
   * also used for closing-line capture). Providers that can't do this leave it undefined.
   * `meta` carries names/kickoff the caller already knows (odds endpoints may omit them).
   */
  recheckEvent?(params: {
    sport: string;
    eventId: string;
    meta?: { homeTeam?: string; awayTeam?: string; commenceTime?: string };
  }): Promise<NormalizedMarket | null>;
```

`packages/core/src/arbitrage.ts` — in the `legs.push({...})`, add `...(best.link ? { link: best.link } : {})`.

`packages/core/src/value.ts` — in the `out.push({...})`, add `...(b.link ? { link: b.link } : {})`.

`packages/core/src/index.ts` — add `export * from './clv';`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @quest/core test`
Expected: PASS (all core tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core && git commit -m "feat(core): CLV math, BookOdds deep links, optional recheckEvent capability"
```

---

### Task 2: db — deep_link column, closing_odds table, upsert insert-flag, lifecycle helpers, CLV stats

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/repositories/opportunities.ts` (+ its test)
- Create: `packages/db/src/repositories/closing-odds.ts` + `closing-odds.test.ts`
- Modify: `packages/db/src/repositories/stats.ts` (+ its test)
- Modify: `packages/db/src/index.ts`, `packages/db/package.json`
- Generate: `packages/db/drizzle/0001_*.sql`

- [ ] **Step 1: Schema + migration**

`packages/db/src/schema.ts`:
- `opportunityLegs` gains `deepLink: text('deep_link'),`
- New table after `settlementLegs`:

```ts
// Reference-book (Pinnacle) prices captured at the last poll before kickoff, per outcome.
// Used to compute closing-line value (CLV) for placed bets. Re-captures overwrite
// (unique per opportunity+outcome): the capture closest to kickoff wins.
export const closingOdds = sqliteTable(
  'closing_odds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    referenceBook: text('reference_book').notNull(),
    closingPrice: real('closing_price').notNull(),
    capturedAt: text('captured_at').notNull(),
  },
  (t) => ({ byOppOutcome: uniqueIndex('closing_opp_outcome_idx').on(t.opportunityId, t.outcome) }),
);
```

Add `"@quest/core": "workspace:*"` to `packages/db/package.json` dependencies (for `devig`/`clvForLeg` in stats), then:

Run: `pnpm install && pnpm --filter @quest/db db:generate`
Expected: a new `packages/db/drizzle/0001_*.sql` containing `ALTER TABLE opportunity_legs ADD deep_link` and `CREATE TABLE closing_odds`.

- [ ] **Step 2: Failing tests**

`packages/db/src/repositories/closing-odds.test.ts`:

```ts
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
      opportunityId: id, outcome: 'Home', referenceBook: 'pinnacle',
      closingPrice: 2.1, capturedAt: '2026-07-10T10:00:00Z',
    });
    recordClosingOdds(db, {
      opportunityId: id, outcome: 'Home', referenceBook: 'pinnacle',
      closingPrice: 2.05, capturedAt: '2026-07-10T16:00:00Z',
    });
    const rows = listClosingOdds(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.closingPrice).toBe(2.05);
    expect(rows[0]!.capturedAt).toBe('2026-07-10T16:00:00Z');
  });
});
```

Additions to `packages/db/src/repositories/opportunities.test.ts`:

```ts
it('upsertOpportunity reports inserted vs re-seen', () => {
  const db = createTestDb();
  const first = upsertOpportunity(db, base); // reuse an existing `base` fixture in this file
  const again = upsertOpportunity(db, base);
  expect(first.inserted).toBe(true);
  expect(again.inserted).toBe(false);
  expect(again.id).toBe(first.id);
});

it('stores leg deep links', () => {
  const db = createTestDb();
  const { id } = upsertOpportunity(db, {
    ...base, dedupeKey: 'k-link',
    legs: [{ outcome: 'Home', book: 'A', odds: 2.0, deepLink: 'https://a.example/e' }],
  });
  const opp = getOpportunity(db, id);
  expect(opp!.legs[0]!.deepLink).toBe('https://a.example/e');
});

it('archiveExpired archives new/accepted opps whose kickoff passed', () => {
  const db = createTestDb();
  const { id: past } = upsertOpportunity(db, { ...base, dedupeKey: 'k-past', commenceTime: '2026-07-01T00:00:00Z' });
  const { id: future } = upsertOpportunity(db, { ...base, dedupeKey: 'k-fut', commenceTime: '2026-07-20T00:00:00Z' });
  const n = archiveExpired(db, '2026-07-05T00:00:00Z');
  expect(n).toBe(1);
  expect(getOpportunity(db, past)!.status).toBe('archived');
  expect(getOpportunity(db, future)!.status).toBe('new');
});

it('listPlacedStartingBefore returns bet_placed opps inside the window', () => {
  const db = createTestDb();
  const { id } = upsertOpportunity(db, { ...base, dedupeKey: 'k-placed', commenceTime: '2026-07-05T12:00:00Z' });
  setStatus(db, id, 'bet_placed');
  expect(listPlacedStartingBefore(db, '2026-07-05T00:00:00Z', '2026-07-06T00:00:00Z').map((o) => o.id)).toEqual([id]);
  expect(listPlacedStartingBefore(db, '2026-07-05T13:00:00Z', '2026-07-06T00:00:00Z')).toEqual([]);
});

it('refreshOpportunityOdds replaces legs and updates margin/lastSeenAt', () => {
  const db = createTestDb();
  const { id } = upsertOpportunity(db, { ...base, dedupeKey: 'k-refresh', margin: 0.02 });
  refreshOpportunityOdds(db, id, {
    margin: 0.011, lastSeenAt: '2026-07-05T00:00:00Z',
    legs: [{ outcome: 'Home', book: 'B', odds: 2.4 }],
  });
  const opp = getOpportunity(db, id)!;
  expect(opp.margin).toBeCloseTo(0.011);
  expect(opp.lastSeenAt).toBe('2026-07-05T00:00:00Z');
  expect(opp.legs).toHaveLength(1);
  expect(opp.legs[0]!.book).toBe('B');
});
```

Stats CLV test (`packages/db/src/repositories/stats.test.ts` addition):

```ts
it('computeStats reports CLV from placement legs vs closing odds', () => {
  const db = createTestDb();
  const { id } = upsertOpportunity(db, base); // fixture from this file
  recordPlacement(db, {
    opportunityId: id, totalStaked: 10, predictedProfit: null, placedAt: '2026-07-01T00:00:00Z',
    legs: [{ outcome: 'Home', book: 'betsson', actualStake: 10, actualOdds: 2.3 }],
  });
  recordClosingOdds(db, { opportunityId: id, outcome: 'Home', referenceBook: 'pinnacle', closingPrice: 2.1, capturedAt: 'x' });
  recordClosingOdds(db, { opportunityId: id, outcome: 'Away', referenceBook: 'pinnacle', closingPrice: 1.8, capturedAt: 'x' });
  const stats = computeStats(db);
  expect(stats.clv.trackedLegs).toBe(1);
  // fair prob Home = (1/2.1)/(1/2.1 + 1/1.8); clv = 2.3 * fairProb - 1
  const fair = (1 / 2.1) / (1 / 2.1 + 1 / 1.8);
  expect(stats.clv.avgClv).toBeCloseTo(2.3 * fair - 1, 10);
});
```

Run: `pnpm --filter @quest/db test` → Expected: FAIL (missing module/functions/fields).

- [ ] **Step 3: Implement**

`packages/db/src/repositories/opportunities.ts`:
- `UpsertLeg` gains `deepLink?: string | null;`
- `upsertOpportunity` return type becomes `{ id: number; inserted: boolean }`; existing branch returns `{ id: existing.id, inserted: false }`; insert branch writes `deepLink: leg.deepLink ?? null` per leg and returns `{ id: row.id, inserted: true }`.
- New functions (import `inArray, lt, gt, lte, and` from drizzle as needed):

```ts
/** Archive new/accepted opportunities whose kickoff already passed (unplaceable). Returns count. */
export function archiveExpired(db: QuestDb, nowIso: string): number {
  const res = db
    .update(opportunities)
    .set({ status: 'archived' })
    .where(and(inArray(opportunities.status, ['new', 'accepted']), lt(opportunities.commenceTime, nowIso)))
    .run();
  return Number(res.changes ?? 0);
}

/** bet_placed opportunities starting inside (afterIso, untilIso] — closing-odds capture window. */
export function listPlacedStartingBefore(db: QuestDb, afterIso: string, untilIso: string) {
  return db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.status, 'bet_placed'), gt(opportunities.commenceTime, afterIso), lte(opportunities.commenceTime, untilIso)))
    .all();
}

/** Replace an opportunity's legs + margin/edge after a live re-check. */
export function refreshOpportunityOdds(
  db: QuestDb,
  id: number,
  update: { margin?: number | null; edge?: number | null; lastSeenAt: string; legs: UpsertLeg[] },
): void {
  db.update(opportunities)
    .set({
      lastSeenAt: update.lastSeenAt,
      ...(update.margin !== undefined ? { margin: update.margin } : {}),
      ...(update.edge !== undefined ? { edge: update.edge } : {}),
    })
    .where(eq(opportunities.id, id))
    .run();
  db.delete(opportunityLegs).where(eq(opportunityLegs.opportunityId, id)).run();
  for (const leg of update.legs) {
    db.insert(opportunityLegs)
      .values({
        opportunityId: id,
        outcome: leg.outcome,
        book: leg.book,
        odds: leg.odds,
        impliedProb: leg.impliedProb ?? null,
        recommendedStake: leg.recommendedStake ?? null,
        deepLink: leg.deepLink ?? null,
      })
      .run();
  }
}
```

`packages/db/src/repositories/closing-odds.ts`:

```ts
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
```

`packages/db/src/repositories/stats.ts` — add CLV:

```ts
import { clvForLeg } from '@quest/core';
import { closingOdds, opportunities, placementLegs, placements } from '../schema';

export interface ClvStats {
  trackedLegs: number;
  avgClv: number | null;
}

/** CLV across placed legs that have >= 2 captured closing prices for their event. */
export function computeClvStats(db: QuestDb): ClvStats {
  const closings = db.select().from(closingOdds).all();
  const byOpp = new Map<number, typeof closings>();
  for (const c of closings) {
    const list = byOpp.get(c.opportunityId) ?? [];
    list.push(c);
    byOpp.set(c.opportunityId, list);
  }

  const placs = db.select().from(placements).all();
  const legs = db.select().from(placementLegs).all();
  const legsByPlacement = new Map<number, typeof legs>();
  for (const l of legs) {
    const list = legsByPlacement.get(l.placementId) ?? [];
    list.push(l);
    legsByPlacement.set(l.placementId, list);
  }

  const clvs: number[] = [];
  for (const p of placs) {
    const closing = byOpp.get(p.opportunityId);
    if (!closing || closing.length < 2) continue; // need the full outcome set to de-vig
    const prices = closing.map((c) => c.closingPrice);
    for (const leg of legsByPlacement.get(p.id) ?? []) {
      const idx = closing.findIndex((c) => c.outcome === leg.outcome);
      if (idx === -1) continue;
      clvs.push(clvForLeg(leg.actualOdds, prices, idx));
    }
  }

  return {
    trackedLegs: clvs.length,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}
```

`Stats` interface gains `clv: ClvStats;` and `computeStats` returns `clv: computeClvStats(db)`.

`packages/db/src/index.ts` — export `./repositories/closing-odds` and the new opportunity helpers (follow the existing export pattern in that file).

Fix all callers of `upsertOpportunity` that used the numeric return: `packages/db/src/repositories/*.test.ts`, `apps/server/src/api/app.test.ts` (destructure `{ id }`).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @quest/db test && pnpm --filter @quest/server test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db apps/server pnpm-lock.yaml && git commit -m "feat(db): closing_odds table, leg deep links, insert-flag upsert, archive/refresh helpers, CLV stats"
```

---

### Task 3: server config — new env vars + rounding default

**Files:**
- Modify: `apps/server/src/config.ts`, `apps/server/src/config.test.ts`

- [ ] **Step 1: Failing tests** (`config.test.ts` additions)

```ts
it('parses phase-1 env vars with sane defaults', () => {
  const c = loadConfig({});
  expect(c.stakeRounding).toBe(0.1);
  expect(c.notifyMinValueEdge).toBe(0.03);
  expect(c.oddsPapiTournamentIds).toEqual([]);
  expect(c.oddsPapiMaxTournaments).toBe(5);
  expect(c.telegramBotToken).toBeUndefined();
  expect(c.telegramChatId).toBeUndefined();
});

it('parses tournament ids and telegram settings', () => {
  const c = loadConfig({
    ODDSPAPI_TOURNAMENTS: '46, 81,notanum',
    ODDSPAPI_MAX_TOURNAMENTS: '8',
    TELEGRAM_BOT_TOKEN: 'tok',
    TELEGRAM_CHAT_ID: '123',
    NOTIFY_MIN_VALUE_EDGE: '0.05',
  });
  expect(c.oddsPapiTournamentIds).toEqual([46, 81]);
  expect(c.oddsPapiMaxTournaments).toBe(8);
  expect(c.telegramBotToken).toBe('tok');
  expect(c.telegramChatId).toBe('123');
  expect(c.notifyMinValueEdge).toBeCloseTo(0.05);
});
```

Run: `pnpm --filter @quest/server test -- config` → FAIL.

- [ ] **Step 2: Implement**

`Config` gains:

```ts
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyMinValueEdge: number; // notify on new value bets at/above this edge
  oddsPapiTournamentIds: number[]; // pinned tournaments ([] = busiest-first discovery)
  oddsPapiMaxTournaments: number;
```

`loadConfig` additions (and change `stakeRounding` fallback to `0.1`):

```ts
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    telegramChatId: env.TELEGRAM_CHAT_ID?.trim() || undefined,
    notifyMinValueEdge: numEnv(env.NOTIFY_MIN_VALUE_EDGE, nonneg, 0.03),
    oddsPapiTournamentIds: csv(env.ODDSPAPI_TOURNAMENTS, [])
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
    oddsPapiMaxTournaments: numEnv(env.ODDSPAPI_MAX_TOURNAMENTS, posInt, 5),
```

- [ ] **Step 3: Run + commit**

Run: `pnpm --filter @quest/server test -- config` → PASS.

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts && git commit -m "feat(server): telegram/tournament/notify env config; stake rounding default 0.1"
```

---

### Task 4: OddsPapi — deep links, recheckEvent, tournament env plumbing

**Files:**
- Modify: `apps/server/src/providers/parse-oddspapi.ts` (+ its test)
- Modify: `apps/server/src/providers/oddspapi.ts` (+ its test)
- Modify: `apps/server/src/providers/index.ts`

- [ ] **Step 1: Failing tests**

`parse-oddspapi.test.ts` addition — the raw book entry now carries `fixturePath`:

```ts
it('captures the per-book fixturePath as the leg deep link', () => {
  const feeds = [{
    slug: 'betsson',
    fixtures: [{
      fixtureId: 'f1',
      bookmakerOdds: {
        betsson: {
          fixturePath: 'https://betsson.example/event/f1',
          markets: { '101': { outcomes: { '101': { players: { '0': { price: 2.1 } } } } } },
        },
      },
    }],
  }];
  const meta = new Map([['f1', { homeTeam: 'A', awayTeam: 'B', commenceTime: '2026-07-10T18:00:00Z' }]]);
  const markets = parseOddsPapi(feeds, meta, 'soccer', { marketId: '101', home: '101', draw: '102', away: '103' });
  expect(markets[0]?.outcomes[0]?.books[0]?.link).toBe('https://betsson.example/event/f1');
});
```

`oddspapi.test.ts` addition — recheck (follow this file's existing fetch-stub pattern; `delayMs: 0`, `now` fixed):

```ts
it('recheckEvent fetches /v4/odds for one fixture and returns a merged market', async () => {
  const calls: string[] = [];
  const provider = new OddsPapiProvider({
    apiKey: 'k', books: ['betsson', 'pinnacle'], delayMs: 0,
    fetchImpl: (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify([{
        fixtureId: 'fx9',
        bookmakerOdds: {
          betsson: { markets: { '101': { outcomes: { '101': { players: { '0': { price: 2.2 } } }, '103': { players: { '0': { price: 3.4 } } } } } } },
          pinnacle: { markets: { '101': { outcomes: { '101': { players: { '0': { price: 2.1 } } }, '103': { players: { '0': { price: 3.2 } } } } } } },
        },
      }]), { status: 200 });
    }) as typeof fetch,
  });
  const market = await provider.recheckEvent!({
    sport: 'soccer', eventId: 'fx9',
    meta: { homeTeam: 'H', awayTeam: 'A', commenceTime: '2026-07-10T18:00:00Z' },
  });
  expect(calls[0]).toContain('/v4/odds?fixtureId=fx9');
  expect(calls[0]).toContain('bookmakers=betsson%2Cpinnacle');
  expect(market?.eventId).toBe('fx9');
  expect(market?.homeTeam).toBe('H');
  expect(market?.outcomes.find((o) => o.name === 'H')?.books).toHaveLength(2);
});

it('recheckEvent returns null on fetch failure or empty body', async () => {
  const provider = new OddsPapiProvider({
    apiKey: 'k', books: ['betsson'], delayMs: 0,
    fetchImpl: (async () => new Response('{"error":{"message":"nope"}}', { status: 200 })) as typeof fetch,
  });
  expect(await provider.recheckEvent!({ sport: 'soccer', eventId: 'x' })).toBeNull();
});
```

Run: `pnpm --filter @quest/server test -- oddspapi` → FAIL.

- [ ] **Step 2: Implement**

`parse-oddspapi.ts`:
- `RawBookEntry` gains `fixturePath?: unknown;`
- In the feed loop, resolve the entry once and pass the link into the pushed `BookOdds`:

```ts
const entry = fx.bookmakerOdds?.[feed.slug];
const mk = entry?.markets?.[market.marketId];
// ...
const link = typeof entry?.fixturePath === 'string' && entry.fixturePath ? entry.fixturePath : undefined;
const bookOdds = (price: number) => ({ book: feed.slug, price, ...(link ? { link } : {}) });
if (home !== undefined) bucket.home.push(bookOdds(home));
if (draw !== undefined) bucket.draw.push(bookOdds(draw));
if (away !== undefined) bucket.away.push(bookOdds(away));
```

`oddspapi.ts` — new method on `OddsPapiProvider`:

```ts
  /** Fresh odds for one known fixture (1 request): /v4/odds across all configured books. */
  async recheckEvent(params: {
    sport: string;
    eventId: string;
    meta?: { homeTeam?: string; awayTeam?: string; commenceTime?: string };
  }): Promise<NormalizedMarket | null> {
    const spec = SPORT_MARKETS[params.sport];
    if (!spec) return null;
    let body: unknown;
    try {
      body = await this.getJson(
        `/v4/odds?fixtureId=${encodeURIComponent(params.eventId)}&bookmakers=${encodeURIComponent(this.opts.books.join(','))}&oddsFormat=decimal`,
      );
    } catch (err) {
      console.warn(`[oddspapi] recheck failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const raw = (Array.isArray(body) ? body : [body]).filter(
      (f): f is OddsPapiRawFixture => !!f && typeof f === 'object' && 'bookmakerOdds' in f,
    );
    if (raw.length === 0) return null;
    // Key everything under the requested id so the meta join below always matches.
    const fixtures = raw.map((f) => ({ ...f, fixtureId: params.eventId }));
    const feeds = this.opts.books.map((slug) => ({ slug, fixtures }));
    const nowIso = new Date((this.opts.now ?? (() => Date.now()))()).toISOString();
    const metaById = new Map([[params.eventId, {
      ...(params.meta?.homeTeam ? { homeTeam: params.meta.homeTeam } : {}),
      ...(params.meta?.awayTeam ? { awayTeam: params.meta.awayTeam } : {}),
      commenceTime: params.meta?.commenceTime ?? nowIso,
    }]]);
    return parseOddsPapi(feeds, metaById, params.sport, spec)[0] ?? null;
  }
```

`providers/index.ts` — pass the pinned/env options:

```ts
    return new OddsPapiProvider({
      apiKey: config.oddsPapiApiKey,
      books: [...books],
      maxTournaments: config.oddsPapiMaxTournaments,
      ...(config.oddsPapiTournamentIds.length ? { tournamentIds: config.oddsPapiTournamentIds } : {}),
    });
```

- [ ] **Step 3: Run + commit**

Run: `pnpm --filter @quest/server test` → PASS.

```bash
git add apps/server/src/providers && git commit -m "feat(oddspapi): fixturePath deep links, recheckEvent, env-pinned tournaments"
```

---

### Task 5: Telegram notifier

**Files:**
- Create: `apps/server/src/notify/telegram.ts`, `apps/server/src/notify/telegram.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createNotifier, formatOpportunityMessage, type NotifiableOpportunity } from './telegram';

const arb: NotifiableOpportunity = {
  type: 'arb', eventName: 'A vs B', sportKey: 'soccer',
  commenceTime: '2026-07-10T18:00:00Z', margin: 0.015, defaultBankrollProfit: 1.42,
  legs: [
    { outcome: 'A', book: '7bet.lt', odds: 2.28, recommendedStake: 48.2, deepLink: 'https://7bet.lt/e/1' },
    { outcome: 'B', book: 'betsson', odds: 2.82, recommendedStake: 51.8 },
  ],
};
const smallValue: NotifiableOpportunity = {
  type: 'value', eventName: 'C vs D', sportKey: 'soccer',
  commenceTime: '2026-07-11T18:00:00Z', edge: 0.021,
  legs: [{ outcome: 'C', book: 'betsson', odds: 2.3 }],
};

describe('telegram notifier', () => {
  it('formats an arb message with legs, stakes and links', () => {
    const msg = formatOpportunityMessage(arb);
    expect(msg).toContain('ARB 1.5%');
    expect(msg).toContain('A vs B');
    expect(msg).toContain('7bet.lt: A @ 2.28');
    expect(msg).toContain('https://7bet.lt/e/1');
  });

  it('is disabled without token/chat id and sends nothing', async () => {
    const fetchSpy = vi.fn();
    const n = createNotifier({ notifyMinValueEdge: 0.03 }, fetchSpy as unknown as typeof fetch);
    expect(n.enabled).toBe(false);
    await n.notifyNew([arb]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends arbs always, values only at/above the edge threshold', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    const n = createNotifier(
      { telegramBotToken: 't', telegramChatId: 'c', notifyMinValueEdge: 0.03 },
      fetchSpy as unknown as typeof fetch,
    );
    await n.notifyNew([arb, smallValue]);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // smallValue (2.1%) filtered out
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain('api.telegram.org/bott/sendMessage');
    expect(JSON.parse((init as RequestInit).body as string).chat_id).toBe('c');
  });

  it('swallows send failures', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('net down'); });
    const n = createNotifier(
      { telegramBotToken: 't', telegramChatId: 'c', notifyMinValueEdge: 0.03 },
      fetchSpy as unknown as typeof fetch,
    );
    await expect(n.notifyNew([arb])).resolves.toBeUndefined();
  });
});
```

Run: `pnpm --filter @quest/server test -- telegram` → FAIL (module missing).

- [ ] **Step 2: Implement** (`apps/server/src/notify/telegram.ts`)

```ts
export interface NotifiableLeg {
  outcome: string;
  book: string;
  odds: number;
  recommendedStake?: number | null;
  deepLink?: string | null;
}

export interface NotifiableOpportunity {
  type: 'arb' | 'value';
  eventName: string | null;
  sportKey: string;
  commenceTime: string;
  margin?: number | null;
  edge?: number | null;
  defaultBankrollProfit?: number | null;
  legs: NotifiableLeg[];
}

export interface Notifier {
  enabled: boolean;
  /** Fire-and-forget push for opportunities INSERTED this run. Never throws. */
  notifyNew(opps: NotifiableOpportunity[]): Promise<void>;
}

export interface NotifierConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyMinValueEdge: number;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const MAX_MESSAGES_PER_RUN = 10; // spam guard for a first poll on a fresh db

export function formatOpportunityMessage(o: NotifiableOpportunity): string {
  const head =
    o.type === 'arb'
      ? `ARB ${o.margin != null ? pct(o.margin) : ''}`.trim()
      : `VALUE ${o.edge != null ? pct(o.edge) : ''}`.trim();
  const lines = [
    `${head} — ${o.eventName ?? 'unknown event'} (${o.sportKey})`,
    `kickoff ${o.commenceTime}`,
    ...o.legs.map((l) => {
      const stake = l.recommendedStake != null ? `  stake ${l.recommendedStake}` : '';
      const link = l.deepLink ? `\n  ${l.deepLink}` : '';
      return `${l.book}: ${l.outcome} @ ${l.odds}${stake}${link}`;
    }),
  ];
  if (o.type === 'arb' && o.defaultBankrollProfit != null) {
    lines.push(`profit @ default bankroll: ${o.defaultBankrollProfit.toFixed(2)}`);
  }
  return lines.join('\n');
}

export function createNotifier(
  cfg: NotifierConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): Notifier {
  const { telegramBotToken: token, telegramChatId: chatId } = cfg;
  if (!token || !chatId) {
    return { enabled: false, notifyNew: async () => {} };
  }
  return {
    enabled: true,
    async notifyNew(opps) {
      const wanted = opps
        .filter((o) => o.type === 'arb' || (o.edge ?? 0) >= cfg.notifyMinValueEdge)
        .slice(0, MAX_MESSAGES_PER_RUN);
      for (const o of wanted) {
        try {
          const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: formatOpportunityMessage(o),
              disable_web_page_preview: true,
            }),
          });
          if (!res.ok) console.warn(`[quest] telegram sendMessage failed: HTTP ${res.status}`);
        } catch (err) {
          console.warn(
            `[quest] telegram sendMessage error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },
  };
}
```

- [ ] **Step 3: Run + commit**

Run: `pnpm --filter @quest/server test -- telegram` → PASS.

```bash
git add apps/server/src/notify && git commit -m "feat(server): telegram notifier for newly inserted opportunities"
```

---

### Task 6: detection wiring — notify, deep links into legs, auto-archive, CLV capture

**Files:**
- Modify: `apps/server/src/detection/run.ts` (+ `run.test.ts`)
- Create: `apps/server/src/detection/recheck.ts`, `apps/server/src/detection/recheck.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Failing tests**

`run.test.ts` additions (follow the file's existing fake-provider pattern):

```ts
it('notifies only newly inserted opportunities and archives expired ones', async () => {
  // Arrange a provider whose market yields one arb; run detection twice with a notifier spy.
  // First run: notifier receives 1 opportunity. Second run (same odds): receives 0 (re-seen).
  // Seed one bet-less 'new' opportunity with a past commenceTime; expect it archived after run.
});

it('captures reference closing odds for bet_placed events near kickoff', async () => {
  // Seed opportunity (commenceTime inside now..now+pollInterval), setStatus bet_placed.
  // Provider has recheckEvent returning a market with pinnacle prices on both outcomes.
  // After runDetection: listClosingOdds(db, id) has one row per outcome with referenceBook pinnacle.
});
```

Write these as real tests using the file's existing helpers (fake provider objects + `createTestDb`); assert via `listClosingOdds` and `getOpportunity(...).status`.

`recheck.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb, getOpportunity, setStatus, upsertOpportunity } from '@quest/db';
import type { NormalizedMarket, OddsProvider } from '@quest/core';
import { loadConfig } from '../config';
import { recheckOpportunity } from './recheck';

const clock = () => '2026-07-05T00:00:00Z';

function providerReturning(market: NormalizedMarket | null): OddsProvider {
  return {
    name: 'fake',
    fetchOdds: async () => [],
    recheckEvent: async () => market,
  };
}

const arbInput = {
  type: 'arb' as const, sportKey: 'soccer', eventId: 'e1', eventName: 'H vs A',
  commenceTime: '2026-07-10T18:00:00Z', marketType: 'h2h', regionProfile: 'lt-arb',
  margin: 0.02, dedupeKey: 'arb-e1', detectedAt: clock(), lastSeenAt: clock(),
  legs: [
    { outcome: 'H', book: '7bet.lt', odds: 2.3 },
    { outcome: 'Draw', book: 'betsson', odds: 3.6 },
    { outcome: 'A', book: 'betsson', odds: 3.4 },
  ],
};

function marketWith(prices: { h: number; d: number; a: number }): NormalizedMarket {
  return {
    sportKey: 'soccer', eventId: 'e1', homeTeam: 'H', awayTeam: 'A',
    commenceTime: '2026-07-10T18:00:00Z', marketType: 'h2h',
    outcomes: [
      { name: 'H', books: [{ book: '7bet.lt', price: prices.h }] },
      { name: 'Draw', books: [{ book: 'betsson', price: prices.d }] },
      { name: 'A', books: [{ book: 'betsson', price: prices.a }] },
    ],
  };
}

describe('recheckOpportunity', () => {
  it('holds when the fresh margin still clears the threshold, and refreshes legs', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, arbInput);
    const config = loadConfig({ MIN_ARB_MARGIN: '0.01' });
    const res = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 2.4, d: 3.8, a: 3.5 })), config, clock },
      id,
    );
    expect(res?.verdict).toBe('holds');
    expect(res?.margin).toBeGreaterThan(0.01);
    expect(getOpportunity(db, id)!.margin).toBeCloseTo(res!.margin!, 10);
  });

  it('degraded when positive but under threshold; gone when no arb', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, { ...arbInput, dedupeKey: 'arb-e1-b' });
    const config = loadConfig({ MIN_ARB_MARGIN: '0.05' });
    const degraded = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 2.4, d: 3.8, a: 3.5 })), config, clock },
      id,
    );
    expect(degraded?.verdict).toBe('degraded');
    const gone = await recheckOpportunity(
      { db, provider: providerReturning(marketWith({ h: 1.8, d: 3.0, a: 2.8 })), config, clock },
      id,
    );
    expect(gone?.verdict).toBe('gone');
  });

  it('value: matches the same outcome+book and applies the edge threshold', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      type: 'value', sportKey: 'soccer', eventId: 'e1', eventName: 'H vs A',
      commenceTime: '2026-07-10T18:00:00Z', marketType: 'h2h', regionProfile: 'lt',
      edge: 0.04, referenceBook: 'pinnacle', dedupeKey: 'val-e1',
      detectedAt: clock(), lastSeenAt: clock(),
      legs: [{ outcome: 'H', book: 'betsson', odds: 2.4 }],
    });
    const fresh: NormalizedMarket = {
      sportKey: 'soccer', eventId: 'e1', commenceTime: '2026-07-10T18:00:00Z', marketType: 'h2h',
      outcomes: [
        { name: 'H', books: [{ book: 'pinnacle', price: 2.0 }, { book: 'betsson', price: 2.35 }] },
        { name: 'A', books: [{ book: 'pinnacle', price: 1.9 }] },
      ],
    };
    const res = await recheckOpportunity(
      { db, provider: providerReturning(fresh), config: loadConfig({ MIN_VALUE_EDGE: '0.02' }), clock },
      id,
    );
    expect(res?.verdict).toBe('holds'); // edge = devig(2.0,1.9)[0] * 2.35 - 1 ≈ 0.145
    expect(res?.edge).toBeGreaterThan(0.02);
  });

  it('gone when provider returns null; null for unknown id', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, { ...arbInput, dedupeKey: 'arb-e1-c' });
    const config = loadConfig({});
    expect((await recheckOpportunity({ db, provider: providerReturning(null), config, clock }, id))?.verdict).toBe('gone');
    expect(await recheckOpportunity({ db, provider: providerReturning(null), config, clock }, 99999)).toBeNull();
  });
});
```

Run: `pnpm --filter @quest/server test -- detection` → FAIL.

- [ ] **Step 2: Implement `recheck.ts`**

```ts
import { detectArbitrage, detectValue, getRegionProfile } from '@quest/core';
import type { OddsProvider } from '@quest/core';
import { getOpportunity, refreshOpportunityOdds, type QuestDb } from '@quest/db';
import type { Config } from '../config';
import type { Clock } from '../clock';

export interface RecheckDeps {
  db: QuestDb;
  provider: OddsProvider;
  config: Config;
  clock: Clock;
}

export interface RecheckLeg {
  outcome: string;
  book: string;
  odds: number;
}

export interface RecheckResult {
  verdict: 'holds' | 'degraded' | 'gone';
  margin?: number;
  edge?: number;
  legs?: RecheckLeg[];
  checkedAt: string;
}

/** Fresh-odds re-check of one opportunity. Returns null if the opportunity doesn't exist. */
export async function recheckOpportunity(
  deps: RecheckDeps,
  id: number,
): Promise<RecheckResult | null> {
  const { db, provider, config, clock } = deps;
  const opp = getOpportunity(db, id);
  if (!opp) return null;
  const checkedAt = clock();
  if (!provider.recheckEvent) return { verdict: 'gone', checkedAt };

  const [homeTeam, awayTeam] = (opp.eventName ?? '').split(' vs ');
  const fresh = await provider
    .recheckEvent({
      sport: opp.sportKey,
      eventId: opp.eventId,
      meta: {
        ...(homeTeam ? { homeTeam } : {}),
        ...(awayTeam ? { awayTeam } : {}),
        commenceTime: opp.commenceTime,
      },
    })
    .catch(() => null);
  if (!fresh) return { verdict: 'gone', checkedAt };

  const profile = getRegionProfile(opp.regionProfile);
  const maxOdds = config.maxLegOdds > 0 ? config.maxLegOdds : undefined;

  if (opp.type === 'arb') {
    const arb = detectArbitrage(fresh, {
      minMargin: 0,
      bookAllowlist: profile.bookAllowlist,
      ...(maxOdds ? { maxOdds } : {}),
    });
    if (!arb || arb.margin <= 0) return { verdict: 'gone', checkedAt };
    const legs = arb.legs.map((l) => ({ outcome: l.outcome, book: l.book, odds: l.odds }));
    refreshOpportunityOdds(db, id, {
      margin: arb.margin,
      lastSeenAt: checkedAt,
      legs: arb.legs.map((l) => ({
        outcome: l.outcome,
        book: l.book,
        odds: l.odds,
        impliedProb: l.impliedProb,
        deepLink: l.link ?? null,
      })),
    });
    return {
      verdict: arb.margin >= config.minArbMargin ? 'holds' : 'degraded',
      margin: arb.margin,
      legs,
      checkedAt,
    };
  }

  const leg = opp.legs[0];
  const refBook = opp.referenceBook;
  if (!leg || !refBook) return { verdict: 'gone', checkedAt };
  const values = detectValue(fresh, {
    referenceBook: refBook,
    minEdge: -1, // return every priced outcome; we apply thresholds ourselves
    bookAllowlist: profile.bookAllowlist,
    ...(maxOdds ? { maxOdds } : {}),
  });
  const match = values.find((v) => v.outcome === leg.outcome && v.book === leg.book);
  if (!match || match.edge <= 0) return { verdict: 'gone', checkedAt };
  refreshOpportunityOdds(db, id, {
    edge: match.edge,
    lastSeenAt: checkedAt,
    legs: [{ outcome: match.outcome, book: match.book, odds: match.softOdds, deepLink: match.link ?? null }],
  });
  return {
    verdict: match.edge >= config.minValueEdge ? 'holds' : 'degraded',
    edge: match.edge,
    legs: [{ outcome: match.outcome, book: match.book, odds: match.softOdds }],
    checkedAt,
  };
}
```

- [ ] **Step 3: Implement `run.ts` changes**

- `DetectionDeps` gains `notifier?: Notifier;` (import from `../notify/telegram`).
- `DetectionSummary` gains `archived?: number; clvCaptured?: number;`.
- Arb branch: capture `const { inserted } = upsertOpportunity(...)`; legs mapping gains `deepLink: leg.link ?? null`; when `inserted`, push onto a `newOpps: NotifiableOpportunity[]` array (fields: type/eventName/sportKey/commenceTime/margin/defaultBankrollProfit + legs with recommendedStake and deepLink).
- Value branch: same pattern (`edge`, single leg with `deepLink: v.link ?? null`).
- After the sport/region loops, before `return`:

```ts
  // Lifecycle hygiene: kicked-off events can't be placed — archive them out of the default view.
  const archived = archiveExpired(db, clock());

  // Closing-line capture: last look before kickoff for placed bets (CLV proof loop).
  let clvCaptured = 0;
  if (provider.recheckEvent) {
    const horizon = new Date(nowMs + config.pollIntervalSeconds * 1000).toISOString();
    for (const opp of listPlacedStartingBefore(db, clock(), horizon)) {
      try {
        const [homeTeam, awayTeam] = (opp.eventName ?? '').split(' vs ');
        const fresh = await provider.recheckEvent({
          sport: opp.sportKey,
          eventId: opp.eventId,
          meta: {
            ...(homeTeam ? { homeTeam } : {}),
            ...(awayTeam ? { awayTeam } : {}),
            commenceTime: opp.commenceTime,
          },
        });
        const refBook =
          opp.referenceBook ?? getRegionProfile(opp.regionProfile).referenceBook;
        if (!fresh || !refBook) continue;
        const captures = fresh.outcomes
          .map((o) => ({ outcome: o.name, price: o.books.find((b) => b.book === refBook)?.price }))
          .filter((c): c is { outcome: string; price: number } => c.price !== undefined);
        if (captures.length < 2) continue; // need the full outcome set to de-vig later
        for (const c of captures) {
          recordClosingOdds(db, {
            opportunityId: opp.id,
            outcome: c.outcome,
            referenceBook: refBook,
            closingPrice: c.price,
            capturedAt: clock(),
          });
        }
        clvCaptured += 1;
      } catch (err) {
        console.warn(
          `[quest] closing-odds capture failed for opp ${opp.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  try {
    await notifier?.notifyNew(newOpps);
  } catch {
    /* notifier never breaks detection */
  }
```

Return gains `archived` and `clvCaptured`.

- [ ] **Step 4: Wire `index.ts`**

```ts
import { createNotifier } from './notify/telegram';
// ...
const notifier = createNotifier(config);
const detect = async (): Promise<DetectionSummary> => {
  const summary = await runDetection({ db, provider, config, clock, notifier });
  console.log(
    `[quest] poll — markets=${summary.marketsFetched} arbs=${summary.arbsFound} values=${summary.valuesFound} errors=${summary.errors} archived=${summary.archived ?? 0} clv=${summary.clvCaptured ?? 0}`,
  );
  return summary;
};
```

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter @quest/server test` → PASS.

```bash
git add apps/server/src && git commit -m "feat(server): notify new opps, persist deep links, auto-archive expired, capture closing odds"
```

---

### Task 7: API — recheck route + meta.supportsRecheck

**Files:**
- Modify: `apps/server/src/api/app.ts` (+ `app.test.ts`), `apps/server/src/index.ts`

- [ ] **Step 1: Failing tests** (`app.test.ts`)

In `setup()`, extend `createApp` deps:

```ts
  const recheck = vi.fn(async (id: number) =>
    id === arbId ? { verdict: 'holds' as const, margin: 0.02, legs: [], checkedAt: '2026-06-14T00:00:00Z' } : null,
  );
  const app = createApp({ db, config, runOnce, recheck, supportsRecheck: true, clock: () => '2026-06-14T00:00:00Z' });
```

New tests:

```ts
it('POST /api/opportunities/:id/recheck returns the verdict; 404 unknown', async () => {
  const { app, arbId } = setup();
  const ok = await app.request(`/api/opportunities/${arbId}/recheck`, { method: 'POST' });
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as { verdict: string }).verdict).toBe('holds');
  const missing = await app.request('/api/opportunities/999999/recheck', { method: 'POST' });
  expect(missing.status).toBe(404);
});

it('GET /api/meta exposes supportsRecheck', async () => {
  const { app } = setup();
  const meta = (await (await app.request('/api/meta')).json()) as { config: { supportsRecheck: boolean } };
  expect(meta.config.supportsRecheck).toBe(true);
});
```

(Also fix this file's `upsertOpportunity` destructuring from Task 2 if not already done, and add `recheck`/`supportsRecheck` to the hono-4 error-shape test's `createApp` call.)

Run: `pnpm --filter @quest/server test -- app` → FAIL.

- [ ] **Step 2: Implement**

`app.ts`:
- `ApiDeps` gains `recheck: (id: number) => Promise<RecheckResult | null>;` and `supportsRecheck: boolean;` (import `RecheckResult` type from `../detection/recheck`).
- New route after the status route:

```ts
  // POST /api/opportunities/:id/recheck — fresh-odds check before placing (1 provider request).
  app.post('/api/opportunities/:id/recheck', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid id' }, 400);
    if (!supportsRecheck) return c.json({ error: 'recheck not supported by this provider' }, 501);
    const result = await recheck(id.data);
    if (!result) return c.json({ error: 'not found' }, 404);
    return c.json(result);
  });
```

- `/api/meta` config object gains `supportsRecheck,`.

`index.ts`:

```ts
const app = createApp({
  db,
  config,
  runOnce: () => poller.runOnce(),
  recheck: (id) => recheckOpportunity({ db, provider, config, clock }, id),
  supportsRecheck: typeof provider.recheckEvent === 'function',
  clock,
});
```

- [ ] **Step 3: Run + commit**

Run: `pnpm --filter @quest/server test` → PASS.

```bash
git add apps/server/src && git commit -m "feat(api): recheck endpoint + supportsRecheck in meta"
```

---

### Task 8: web — deep links, re-check panel, 1% value stake, CLV stat

**Files:**
- Modify: `apps/web/src/lib/types.ts`, `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/features/opportunities/Calculator.tsx` (+ `Calculator.test.tsx`)
- Modify: `apps/web/src/features/opportunities/OpportunityRow.tsx`
- Modify: `apps/web/src/features/stats/StatsView.tsx` (+ `StatsView.test.tsx`)

- [ ] **Step 1: Types + api client**

`types.ts`: `Leg` gains `deepLink: string | null;`. `Stats` gains `clv: { trackedLegs: number; avgClv: number | null };`. `Meta['config']` gains `supportsRecheck: boolean;`. New:

```ts
export interface RecheckResult {
  verdict: 'holds' | 'degraded' | 'gone';
  margin?: number;
  edge?: number;
  legs?: { outcome: string; book: string; odds: number }[];
  checkedAt: string;
}
```

`api.ts`: `recheck: (id: number) => req<RecheckResult>(`/api/opportunities/${id}/recheck`, { method: 'POST' }),`

- [ ] **Step 2: Failing component tests**

`Calculator.test.tsx` additions (follow the file's existing render helpers/mocks):

```tsx
it('renders the soft book as a link when the leg has an http deep link', () => {
  // value opp fixture with legs[0].deepLink = 'https://betsson.example/e1'
  // render <Calculator opp={valueOpp} />
  // expect screen.getByRole('link', { name: /betsson/i }) to have href 'https://betsson.example/e1'
});

it('suggests a 1% bankroll flat stake for value bets', () => {
  // bankroll context = 1000, stakeRounding 0.1 → suggested stake 10
  // expect text 'Suggested stake' and '10' visible; potential return = 10 × odds
});
```

`StatsView.test.tsx` addition:

```tsx
it('shows the average CLV when tracked legs exist', () => {
  // mock api.stats to include clv: { trackedLegs: 4, avgClv: 0.021 }
  // expect 'Avg CLV' and '+2.1%' (formatPercent) visible
});
```

Run: `pnpm --filter @quest/web test` → FAIL.

- [ ] **Step 3: Implement**

`Calculator.tsx`:
- Add a small helper used by both calculators:

```tsx
function BookLabel({ book, link }: { book: string; link?: string | null }) {
  if (link && link.startsWith('http')) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text underline decoration-border underline-offset-2 hover:text-accent"
        onClick={(e) => e.stopPropagation()}
      >
        {book}
      </a>
    );
  }
  return <span className="text-text">{book}</span>;
}
```

- `LegTable` gains a `links?: Map<string, string | null>` prop (key `${book}|${outcome}`); the book cell renders `<BookLabel book={leg.book} link={links?.get(`${leg.book}|${leg.outcome}`)} />`. `ArbCalculator` builds the map from `opp.legs` (`l.deepLink`).
- `ValueCalculator`: soft-book row uses `<BookLabel book={leg.book} link={leg.deepLink} />`. Stake becomes the suggestion:

```tsx
const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
const rounding = metaQuery.data?.config.stakeRounding ?? 0.1;
const step = rounding > 0 ? rounding : 0.1;
const stake = Math.max(step, Math.round((bankroll * 0.01) / step) * step);
```

Row label changes to `Suggested stake (1% bankroll)`; the disclaimer line stays.

`OpportunityRow.tsx` — in the expanded detail cell, above `<Calculator/>`, add:

```tsx
function RecheckPanel({ opp }: { opp: Opportunity }) {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
  const recheck = useMutation({
    mutationFn: () => api.recheck(opp.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
  if (!metaQuery.data?.config.supportsRecheck) return null;
  const r = recheck.data;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
        {recheck.isPending ? 'Re-checking…' : 'Re-check odds'}
      </Button>
      {r && (
        <span
          className={
            r.verdict === 'holds'
              ? 'text-sm text-accent'
              : r.verdict === 'degraded'
                ? 'text-sm text-warn'
                : 'text-sm text-danger'
          }
        >
          {r.verdict === 'holds' && `✓ still live${r.margin != null ? ` — ${formatPercent(r.margin)} margin` : r.edge != null ? ` — ${formatPercent(r.edge)} edge` : ''}`}
          {r.verdict === 'degraded' && `↓ degraded${r.margin != null ? ` — ${formatPercent(r.margin)}` : r.edge != null ? ` — ${formatPercent(r.edge)}` : ''}`}
          {r.verdict === 'gone' && '✗ gone — do not place'}
        </span>
      )}
      {recheck.isError && <span className="text-sm text-danger">re-check failed</span>}
      <span className="text-[11px] text-text-dim">uses 1 API request</span>
    </div>
  );
}
```

(If `text-warn`/`text-danger` tokens don't exist in the Tailwind theme, use the file's existing danger/dim classes — check `Button variant="danger"` styling in `components/ui.tsx` and reuse its color token.)

`StatsView.tsx` — extend the summary grid (`sm:grid-cols-4` → `sm:grid-cols-5`):

```tsx
<Stat
  label="Avg CLV"
  value={
    data.clv.trackedLegs === 0 || data.clv.avgClv === null
      ? '—'
      : `${data.clv.avgClv >= 0 ? '+' : ''}${formatPercent(data.clv.avgClv)}`
  }
/>
```

With a `title`/subtext showing `data.clv.trackedLegs` tracked legs if the `Stat` component supports it; otherwise append ` (${data.clv.trackedLegs})` to the label.

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @quest/web test && pnpm typecheck && pnpm lint` → PASS.

```bash
git add apps/web && git commit -m "feat(web): leg deep links, re-check panel, 1% value stake suggestion, CLV stat"
```

---

### Task 9: env, purge, docs, full verification

**Files:**
- Modify: `.env` (NOT committed), `.env.example`, `docs/STATUS.md`
- One-off: purge stale rows in `apps/server/data/quest.sqlite`

- [ ] **Step 1: `.env` (gitignored) — refocus + new knobs**

```
SPORTS=soccer
POLL_INTERVAL_SECONDS=43200
STAKE_ROUNDING=0.1
# TELEGRAM_BOT_TOKEN=   (create via @BotFather; leave commented until user provides)
# TELEGRAM_CHAT_ID=
# NOTIFY_MIN_VALUE_EDGE=0.03
# ODDSPAPI_TOURNAMENTS=   (pin ids both books quote, e.g. 46 = Superettan)
# ODDSPAPI_MAX_TOURNAMENTS=5
```

Mirror the same knobs (with placeholder values) into `.env.example` with comments.

- [ ] **Step 2: One-off purge of pre-fix rows** (server must be stopped)

```bash
sqlite3 /Users/godsmanomeire/projects/quest/apps/server/data/quest.sqlite \
  "PRAGMA foreign_keys=ON; DELETE FROM opportunities WHERE event_name IS NULL OR commence_time = '';"
```

Expected: removes the nameless/timeless artifacts (~30 rows incl. the 2 stale arbs). Verify: `SELECT COUNT(*) FROM opportunities WHERE event_name IS NULL;` → 0.

- [ ] **Step 3: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green (≈140+ tests).

Live smoke test: start server + web, confirm `/api/meta` shows `supportsRecheck: true`, expand an opportunity → Re-check works against real OddsPapi (1 request), deep link renders if fixturePath present. Screenshot the UI.

- [ ] **Step 4: Update `docs/STATUS.md`** — new section: Phase 1 (value-first) built; what changed; Phase 2 checklist for the user (Telegram token, place bets, BreakingBet coverage check, OddsPapi quote); Phase 3 gate.

- [ ] **Step 5: Final commit + merge to main**

```bash
git add -A && git commit -m "docs: STATUS — phase 1 value-first shipped; env example knobs"
git checkout main && git merge --no-ff <branch> -m "Merge: phase 1 value-first (notifications, deep links, re-check, CLV, hygiene)"
```
