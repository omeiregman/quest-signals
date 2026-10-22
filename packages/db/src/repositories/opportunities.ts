import { and, desc, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm';
import type { QuestDb } from '../client';
import { opportunities, opportunityLegs } from '../schema';

export interface UpsertLeg {
  outcome: string;
  book: string;
  odds: number;
  impliedProb?: number | null;
  recommendedStake?: number | null;
  deepLink?: string | null;
  priceUpdatedAt?: string | null;
}

export interface UpsertOpportunity {
  type: 'arb' | 'value';
  sportKey: string;
  eventId: string;
  eventName?: string | null;
  commenceTime: string;
  marketType: string;
  regionProfile: string;
  margin?: number | null;
  edge?: number | null;
  referenceBook?: string | null;
  defaultBankrollProfit?: number | null;
  dedupeKey: string;
  detectedAt: string;
  lastSeenAt: string;
  legs: UpsertLeg[];
}

export interface OpportunityFilter {
  status?: 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';
  type?: 'arb' | 'value';
  sport?: string;
  region?: string;
  minMargin?: number;
}

/**
 * Insert a new opportunity (+legs), or bump last_seen_at if the dedupe key already exists.
 * `inserted` tells callers whether this was genuinely new (drives notifications).
 */
export function upsertOpportunity(
  db: QuestDb,
  input: UpsertOpportunity,
): { id: number; inserted: boolean } {
  const existing = db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(eq(opportunities.dedupeKey, input.dedupeKey))
    .get();

  if (existing) {
    db.update(opportunities)
      .set({
        lastSeenAt: input.lastSeenAt,
        margin: input.margin ?? null,
        edge: input.edge ?? null,
        defaultBankrollProfit: input.defaultBankrollProfit ?? null,
      })
      .where(eq(opportunities.id, existing.id))
      .run();
    return { id: existing.id, inserted: false };
  }

  const row = db
    .insert(opportunities)
    .values({
      type: input.type,
      sportKey: input.sportKey,
      eventId: input.eventId,
      eventName: input.eventName ?? null,
      commenceTime: input.commenceTime,
      marketType: input.marketType,
      regionProfile: input.regionProfile,
      margin: input.margin ?? null,
      edge: input.edge ?? null,
      referenceBook: input.referenceBook ?? null,
      defaultBankrollProfit: input.defaultBankrollProfit ?? null,
      dedupeKey: input.dedupeKey,
      detectedAt: input.detectedAt,
      lastSeenAt: input.lastSeenAt,
    })
    .returning({ id: opportunities.id })
    .get();

  for (const leg of input.legs) {
    db.insert(opportunityLegs)
      .values({
        opportunityId: row.id,
        outcome: leg.outcome,
        book: leg.book,
        odds: leg.odds,
        impliedProb: leg.impliedProb ?? null,
        recommendedStake: leg.recommendedStake ?? null,
        deepLink: leg.deepLink ?? null,
        priceUpdatedAt: leg.priceUpdatedAt ?? null,
      })
      .run();
  }
  return { id: row.id, inserted: true };
}

/** Archive new/accepted opportunities whose kickoff already passed (unplaceable). Returns count. */
export function archiveExpired(db: QuestDb, nowIso: string): number {
  const res = db
    .update(opportunities)
    .set({ status: 'archived' })
    .where(
      and(
        inArray(opportunities.status, ['new', 'accepted']),
        lt(opportunities.commenceTime, nowIso),
      ),
    )
    .run();
  return Number(res.changes ?? 0);
}

/** bet_placed opportunities starting inside (afterIso, untilIso] — closing-odds capture window. */
export function listPlacedStartingBefore(db: QuestDb, afterIso: string, untilIso: string) {
  return db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.status, 'bet_placed'),
        gt(opportunities.commenceTime, afterIso),
        lte(opportunities.commenceTime, untilIso),
      ),
    )
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
        priceUpdatedAt: leg.priceUpdatedAt ?? null,
      })
      .run();
  }
}

export function listOpportunities(db: QuestDb, filter: OpportunityFilter) {
  const conditions = [];
  if (filter.status) conditions.push(eq(opportunities.status, filter.status));
  if (filter.type) conditions.push(eq(opportunities.type, filter.type));
  if (filter.sport) conditions.push(eq(opportunities.sportKey, filter.sport));
  if (filter.region) conditions.push(eq(opportunities.regionProfile, filter.region));
  if (filter.minMargin !== undefined) conditions.push(gte(opportunities.margin, filter.minMargin));

  const rows = db
    .select()
    .from(opportunities)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(opportunities.detectedAt))
    .all();

  return rows.map((opp) => ({
    ...opp,
    legs: db.select().from(opportunityLegs).where(eq(opportunityLegs.opportunityId, opp.id)).all(),
  }));
}

export function getOpportunity(db: QuestDb, id: number) {
  const opp = db.select().from(opportunities).where(eq(opportunities.id, id)).get();
  if (!opp) return undefined;
  const legs = db.select().from(opportunityLegs).where(eq(opportunityLegs.opportunityId, id)).all();
  return { ...opp, legs };
}

export function setStatus(
  db: QuestDb,
  id: number,
  status: 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived',
): void {
  db.update(opportunities).set({ status }).where(eq(opportunities.id, id)).run();
}
