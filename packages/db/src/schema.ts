import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pollRuns = sqliteTable('poll_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  regionProfile: text('region_profile').notNull(),
  status: text('status', { enum: ['running', 'ok', 'error'] }).notNull(),
  creditsUsed: integer('credits_used'),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
});

export const oddsSnapshots = sqliteTable(
  'odds_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pollRunId: integer('poll_run_id').references(() => pollRuns.id),
    sportKey: text('sport_key').notNull(),
    eventId: text('event_id').notNull(),
    commenceTime: text('commence_time').notNull(),
    marketType: text('market_type').notNull(),
    rawJson: text('raw_json'),
    normalizedJson: text('normalized_json').notNull(),
    capturedAt: text('captured_at').notNull(),
  },
  (t) => ({ byEvent: index('snap_event_idx').on(t.eventId) }),
);

export const opportunities = sqliteTable(
  'opportunities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['arb', 'value'] }).notNull(),
    sportKey: text('sport_key').notNull(),
    eventId: text('event_id').notNull(),
    eventName: text('event_name'),
    commenceTime: text('commence_time').notNull(),
    marketType: text('market_type').notNull(),
    regionProfile: text('region_profile').notNull(),
    margin: real('margin'),
    edge: real('edge'),
    referenceBook: text('reference_book'),
    defaultBankrollProfit: real('default_bankroll_profit'), // gross
    status: text('status', {
      enum: ['new', 'accepted', 'bet_placed', 'skipped', 'archived'],
    })
      .notNull()
      .default('new'),
    dedupeKey: text('dedupe_key').notNull(),
    detectedAt: text('detected_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (t) => ({
    byDedupe: uniqueIndex('opp_dedupe_idx').on(t.dedupeKey),
    byStatus: index('opp_status_idx').on(t.status),
    bySport: index('opp_sport_idx').on(t.sportKey),
    byCommence: index('opp_commence_idx').on(t.commenceTime),
  }),
);

export const opportunityLegs = sqliteTable('opportunity_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  book: text('book').notNull(),
  odds: real('odds').notNull(),
  impliedProb: real('implied_prob'),
  recommendedStake: real('recommended_stake'),
  deepLink: text('deep_link'),
  priceUpdatedAt: text('price_updated_at'), // feed-reported time the book last changed this price
});

export const placements = sqliteTable('placements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  totalStaked: real('total_staked').notNull(),
  predictedProfit: real('predicted_profit'), // gross (tax is display-only)
  placedAt: text('placed_at').notNull(),
});

export const placementLegs = sqliteTable('placement_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  placementId: integer('placement_id')
    .notNull()
    .references(() => placements.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  book: text('book').notNull(),
  actualStake: real('actual_stake').notNull(),
  actualOdds: real('actual_odds').notNull(),
});

export const settlements = sqliteTable('settlements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  opportunityId: integer('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  winningSelection: text('winning_selection'),
  realizedProfit: real('realized_profit'),
  predictedProfit: real('predicted_profit'),
  notes: text('notes'),
  autoFilled: integer('auto_filled', { mode: 'boolean' }).notNull().default(false),
  settledAt: text('settled_at').notNull(),
});

export const settlementLegs = sqliteTable('settlement_legs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  settlementId: integer('settlement_id')
    .notNull()
    .references(() => settlements.id, { onDelete: 'cascade' }),
  outcome: text('outcome').notNull(),
  result: text('result', { enum: ['settled', 'voided', 'rejected'] }).notNull(),
});

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
  (t) => ({
    byOppOutcome: uniqueIndex('closing_opp_outcome_idx').on(t.opportunityId, t.outcome),
  }),
);
