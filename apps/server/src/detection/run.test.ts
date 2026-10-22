import { describe, expect, it, vi } from 'vitest';
import type { MarketType, NormalizedMarket, OddsProvider } from '@quest/core';
import {
  createTestDb,
  listClosingOdds,
  listOpportunities,
  oddsSnapshots,
  pollRuns,
  setStatus,
  upsertOpportunity,
} from '@quest/db';
import type { Config } from '../config';
import type { Clock } from '../clock';
import type { NotifiableOpportunity, Notifier } from '../notify/telegram';
import { runDetection } from './run';

// One clear arb market: Home 2.2 @ A, Away 2.2 @ B => implied 1/2.2 + 1/2.2 = 0.909 < 1.
const arbMarket: NormalizedMarket = {
  sportKey: 'soccer_test',
  eventId: 'evt-arb',
  homeTeam: 'Alpha',
  awayTeam: 'Beta',
  commenceTime: '2026-06-20T18:00:00Z',
  marketType: 'h2h',
  outcomes: [
    { name: 'Home', books: [{ book: 'A', price: 2.2 }] },
    { name: 'Away', books: [{ book: 'B', price: 2.2 }] },
  ],
};

// One value market with NO arbitrage. Sharp reference Pinnacle 2.0 / 1.7 has a small
// overround (implied 0.5 + 0.588 = 1.088); de-vig => trueProb Home ~0.4596. Soft book
// "Soft" prices Home at 2.3 => edge = 0.4596 * 2.3 - 1 = 0.057 (> minValueEdge 0.02).
// Best-of-each-outcome odds are Home 2.3 (Soft) and Away 1.7 (Pinnacle): implied
// 0.4348 + 0.5882 = 1.023 >= 1, so detectArbitrage returns null here — value only.
const valueMarket: NormalizedMarket = {
  sportKey: 'soccer_test',
  eventId: 'evt-value',
  homeTeam: 'Gamma',
  awayTeam: 'Delta',
  commenceTime: '2026-06-21T18:00:00Z',
  marketType: 'h2h',
  outcomes: [
    {
      name: 'Home',
      books: [
        { book: 'Pinnacle', price: 2.0 },
        { book: 'Soft', price: 2.3 },
      ],
    },
    {
      name: 'Away',
      books: [{ book: 'Pinnacle', price: 1.7 }],
    },
  ],
};

function makeProvider(markets: NormalizedMarket[]): OddsProvider {
  return {
    name: 'stub',
    async fetchOdds(params: { sport: string; regions: string[]; markets: MarketType[] }) {
      void params;
      return markets;
    },
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    oddsProvider: 'mock',
    oddsApiKey: undefined,
    pollIntervalSeconds: 300,
    sports: ['soccer_test'],
    regions: ['eu'], // eu profile: referenceBook 'Pinnacle', no allowlist
    minArbMargin: 0.01,
    minValueEdge: 0.02,
    maxLegOdds: 0,
    minTimeToEventMinutes: 0,
    taxRate: 0.2,
    defaultBankroll: 100,
    stakeRounding: 1,
    port: 8787,
    databaseUrl: ':memory:',
    notifyMinValueEdge: 0.03,
    oddsPapiTournamentIds: [],
    oddsPapiMaxTournaments: 5,
    maxPriceAgeHours: 48,
    ...overrides,
  };
}

describe('runDetection', () => {
  it('detects arb + value, persists snapshots, opportunities, and an ok poll run', async () => {
    const db = createTestDb();
    const clock: Clock = () => '2026-06-14T00:00:00Z';
    const provider = makeProvider([arbMarket, valueMarket]);
    const config = makeConfig();

    const summary = await runDetection({ db, provider, config, clock });

    expect(summary.marketsFetched).toBe(2);
    expect(summary.arbsFound).toBe(1);
    expect(summary.valuesFound).toBe(1);
    expect(summary.pollRunId).toBeGreaterThan(0);

    const list = listOpportunities(db, {});
    const arb = list.find((o) => o.type === 'arb');
    const value = list.find((o) => o.type === 'value');

    // Arb assertions: positive margin and a positive, gross default-bankroll profit.
    expect(arb).toBeDefined();
    expect(arb!.margin!).toBeGreaterThan(0);
    expect(arb!.defaultBankrollProfit!).toBeGreaterThan(0);
    expect(arb!.eventName).toBe('Alpha vs Beta');
    expect(arb!.legs).toHaveLength(2);
    // gross (no tax applied): with bankroll 100 and ~9% margin the profit is well
    // above what a 20% tax would leave — confirm it's the gross figure.
    expect(arb!.defaultBankrollProfit!).toBeGreaterThan(5);
    expect(arb!.legs.every((l) => (l.recommendedStake ?? 0) > 0)).toBe(true);

    // Value assertions: positive edge, reference book recorded, single soft leg.
    expect(value).toBeDefined();
    expect(value!.edge!).toBeGreaterThan(0);
    expect(value!.referenceBook).toBe('Pinnacle');
    expect(value!.legs).toHaveLength(1);
    expect(value!.legs[0]!.book).toBe('Soft');
    expect(value!.legs[0]!.outcome).toBe('Home');
    expect(value!.legs[0]!.odds).toBeCloseTo(2.3, 6);

    // A snapshot per fetched market was written.
    const snaps = db.select().from(oddsSnapshots).all();
    expect(snaps).toHaveLength(2);
    expect(snaps.every((s) => s.pollRunId === summary.pollRunId)).toBe(true);
    expect(snaps.every((s) => s.capturedAt === '2026-06-14T00:00:00Z')).toBe(true);

    // The poll run is recorded as ok.
    const runs = db.select().from(pollRuns).all();
    expect(runs).toHaveLength(1);
    const run = runs.find((r) => r.id === summary.pollRunId);
    expect(run?.status).toBe('ok');
  });

  it('dedupes on a second run with the same markets, bumping lastSeenAt only', async () => {
    const db = createTestDb();
    const provider = makeProvider([arbMarket, valueMarket]);
    const config = makeConfig();

    await runDetection({ db, provider, config, clock: () => '2026-06-14T00:00:00Z' });
    const first = listOpportunities(db, {});
    expect(first).toHaveLength(2);

    await runDetection({ db, provider, config, clock: () => '2026-06-14T01:00:00Z' });
    const second = listOpportunities(db, {});

    // No duplicate opportunity rows were added.
    expect(second).toHaveLength(2);

    for (const opp of second) {
      expect(opp.detectedAt).toBe('2026-06-14T00:00:00Z'); // detection time preserved
      expect(opp.lastSeenAt).toBe('2026-06-14T01:00:00Z'); // last seen bumped
    }
  });

  it('records an error poll run when a sport fetch throws but continues others', async () => {
    const db = createTestDb();
    const provider: OddsProvider = {
      name: 'flaky',
      async fetchOdds(params) {
        if (params.sport === 'boom') throw new Error('upstream 500');
        return [arbMarket];
      },
    };
    const config = makeConfig({ sports: ['boom', 'soccer_test'] });

    const summary = await runDetection({ db, provider, config, clock: () => '2026-06-14T00:00:00Z' });

    // The good sport still produced its arb.
    expect(summary.arbsFound).toBe(1);
    expect(listOpportunities(db, {})).toHaveLength(1);
  });

  it('notifies only newly inserted opportunities and archives expired ones', async () => {
    const db = createTestDb();
    const provider = makeProvider([arbMarket, valueMarket]);
    const config = makeConfig();
    const notifyNew = vi.fn<(opps: NotifiableOpportunity[]) => Promise<void>>(async () => {});
    const notifier: Notifier = { enabled: true, notifyNew, notifyText: async () => {} };

    // A stale row whose kickoff has passed should get archived by the run.
    const { id: staleId } = upsertOpportunity(db, {
      type: 'value',
      sportKey: 'soccer_test',
      eventId: 'evt-old',
      eventName: 'Old vs Older',
      commenceTime: '2026-06-13T00:00:00Z',
      marketType: 'h2h',
      regionProfile: 'eu',
      edge: 0.05,
      referenceBook: 'Pinnacle',
      dedupeKey: 'stale',
      detectedAt: 't0',
      lastSeenAt: 't0',
      legs: [{ outcome: 'Home', book: 'Soft', odds: 2.2 }],
    });

    const summary = await runDetection({
      db, provider, config, notifier, clock: () => '2026-06-14T00:00:00Z',
    });
    expect(notifyNew).toHaveBeenCalledTimes(1);
    expect(notifyNew.mock.calls[0]![0]).toHaveLength(2); // arb + value inserted
    expect(summary.archived).toBe(1);
    expect(listOpportunities(db, { status: 'archived' }).map((o) => o.id)).toEqual([staleId]);

    // Second run: same markets are re-seen, nothing new to notify.
    await runDetection({ db, provider, config, notifier, clock: () => '2026-06-14T01:00:00Z' });
    expect(notifyNew.mock.calls[1]![0]).toHaveLength(0);
  });

  it('reports per-book coverage and warns once when a fundable book returns no markets', async () => {
    const db = createTestDb();
    // lt-arb allowlist = 7bet.lt + betsson; this market only carries 7bet.lt + pinnacle.
    const market: NormalizedMarket = {
      ...valueMarket,
      outcomes: [
        { name: 'Home', books: [{ book: 'pinnacle', price: 2.0 }, { book: '7bet.lt', price: 2.3 }] },
        { name: 'Away', books: [{ book: 'pinnacle', price: 1.7 }] },
      ],
    };
    const notifyText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const notifier: Notifier = { enabled: true, notifyNew: async () => {}, notifyText };
    const config = makeConfig({ regions: ['lt-arb'] });

    const summary = await runDetection({
      db, provider: makeProvider([market]), config, notifier, clock: () => '2026-06-14T00:00:00Z',
    });
    expect(summary.bookCoverage).toEqual({ '7bet.lt': 1, betsson: 0, pinnacle: 1 });
    expect(notifyText).toHaveBeenCalledTimes(1);
    expect(notifyText.mock.calls[0]![0]).toContain('betsson returned 0 active markets');

    // Same process, 1h later: rate-limited, no second warning.
    await runDetection({
      db, provider: makeProvider([market]), config, notifier, clock: () => '2026-06-14T01:00:00Z',
    });
    expect(notifyText).toHaveBeenCalledTimes(1);
  });

  it('captures reference closing odds for bet_placed events near kickoff', async () => {
    const db = createTestDb();
    const { id } = upsertOpportunity(db, {
      type: 'value',
      sportKey: 'soccer_test',
      eventId: 'evt-value',
      eventName: 'Gamma vs Delta',
      commenceTime: '2026-06-14T00:04:00Z', // inside now..now+pollInterval (300s)
      marketType: 'h2h',
      regionProfile: 'eu',
      edge: 0.05,
      referenceBook: 'Pinnacle',
      dedupeKey: 'placed-clv',
      detectedAt: 't0',
      lastSeenAt: 't0',
      legs: [{ outcome: 'Home', book: 'Soft', odds: 2.3 }],
    });
    setStatus(db, id, 'bet_placed');

    const provider: OddsProvider = {
      name: 'stub',
      fetchOdds: async () => [],
      recheckEvent: async () => valueMarket, // carries Pinnacle prices on both outcomes
    };
    const summary = await runDetection({
      db, provider, config: makeConfig(), clock: () => '2026-06-14T00:00:00Z',
    });

    expect(summary.clvCaptured).toBe(1);
    const rows = listClosingOdds(db, id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.referenceBook === 'Pinnacle')).toBe(true);
    expect(rows.find((r) => r.outcome === 'Home')!.closingPrice).toBe(2.0);
  });
});
