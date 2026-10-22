import { describe, expect, it } from 'vitest';
import { detectArbitrage, detectValue } from '@quest/core';
import type { NormalizedMarket } from '@quest/core';
import { parseTheOddsApi } from './parse-the-odds-api';
import fixture from './fixtures/the-odds-api-wc2026.json';

function findMarket(markets: NormalizedMarket[], eventId: string): NormalizedMarket {
  const m = markets.find((x) => x.eventId === eventId);
  expect(m, `market ${eventId} should be present`).toBeDefined();
  return m!;
}

describe('parseTheOddsApi', () => {
  const markets = parseTheOddsApi(fixture);

  it('produces one NormalizedMarket per event', () => {
    expect(markets).toHaveLength((fixture as unknown[]).length);
    expect(markets.length).toBeGreaterThanOrEqual(3);
    for (const m of markets) {
      expect(m.marketType).toBe('h2h');
      expect(m.sportKey).toBe('soccer_fifa_world_cup');
    }
  });

  it('sets event metadata from the raw event', () => {
    const arb = findMarket(markets, 'arb-usa-mex-2026');
    expect(arb.homeTeam).toBe('United States');
    expect(arb.awayTeam).toBe('Mexico');
    expect(arb.commenceTime).toBe('2026-06-18T19:00:00Z');
  });

  it('groups outcomes by normalized name and aggregates books per outcome', () => {
    const arb = findMarket(markets, 'arb-usa-mex-2026');
    // 3-way: Home / Away team names + Draw
    expect(arb.outcomes.map((o) => o.name).sort()).toEqual(
      ['Draw', 'Mexico', 'United States'].sort(),
    );

    const usa = arb.outcomes.find((o) => o.name === 'United States')!;
    // 5 bookmakers in the arb event, all quote United States
    expect(usa.books).toHaveLength(5);
    const betsson = usa.books.find((b) => b.book === 'Betsson');
    expect(betsson?.price).toBe(3.5);
    const pinnacle = usa.books.find((b) => b.book === 'Pinnacle');
    expect(pinnacle?.price).toBe(3.3);
  });

  it('applies aliasBook so Betsafe maps to Betsson', () => {
    const normal = findMarket(markets, 'normal-bra-arg-2026');
    const brazil = normal.outcomes.find((o) => o.name === 'Brazil')!;
    expect(brazil.books.map((b) => b.book)).toContain('Betsson');
    expect(brazil.books.map((b) => b.book)).not.toContain('Betsafe');
    const aliased = brazil.books.find((b) => b.book === 'Betsson')!;
    expect(aliased.price).toBe(2.55);
  });

  it('engineered arbitrage event is detected by detectArbitrage', () => {
    const arb = findMarket(markets, 'arb-usa-mex-2026');
    const opp = detectArbitrage(arb, { minMargin: 0.01 });
    expect(opp).not.toBeNull();
    expect(opp!.totalImplied).toBeLessThan(1);
    // best per outcome are spread across different soft books
    const usaLeg = opp!.legs.find((l) => l.outcome === 'United States')!;
    const drawLeg = opp!.legs.find((l) => l.outcome === 'Draw')!;
    expect(usaLeg.book).toBe('Betsson');
    expect(usaLeg.odds).toBe(3.5);
    expect(drawLeg.book).toBe('Unibet');
    expect(drawLeg.odds).toBe(3.8);
  });

  it('engineered value event yields at least one value bet vs Pinnacle', () => {
    const value = findMarket(markets, 'value-eng-fra-2026');
    const opps = detectValue(value, { referenceBook: 'Pinnacle', minEdge: 0.02 });
    expect(opps.length).toBeGreaterThanOrEqual(1);
    const eng = opps.find((v) => v.outcome === 'England' && v.book === 'Betsson');
    expect(eng).toBeDefined();
    expect(eng!.edge).toBeGreaterThanOrEqual(0.02);
  });

  it('keeps the value event distinct from arbitrage (no arb on it)', () => {
    const value = findMarket(markets, 'value-eng-fra-2026');
    expect(detectArbitrage(value, { minMargin: 0.01 })).toBeNull();
  });

  it('keeps normal events free of arb and value signals', () => {
    const normal = findMarket(markets, 'normal-ger-esp-2026');
    expect(detectArbitrage(normal, { minMargin: 0.01 })).toBeNull();
    expect(detectValue(normal, { referenceBook: 'Pinnacle', minEdge: 0.02 })).toEqual([]);
  });

  it('defensively skips malformed events and non-numeric prices', () => {
    const raw = [
      null,
      'nope',
      { id: 'no-bookmakers', sport_key: 's', commence_time: '2026-01-01T00:00:00Z' },
      {
        id: 'bad-prices',
        sport_key: 'soccer_fifa_world_cup',
        sport_title: 'FIFA World Cup',
        commence_time: '2026-01-01T00:00:00Z',
        home_team: 'A',
        away_team: 'B',
        bookmakers: [
          {
            key: 'pinnacle',
            title: 'Pinnacle',
            markets: [
              {
                key: 'totals',
                outcomes: [{ name: 'Over', price: 1.9 }],
              },
              {
                key: 'h2h',
                outcomes: [
                  { name: 'A', price: 'not-a-number' },
                  { name: 'B', price: 2.1 },
                  { name: 'Draw', price: null },
                ],
              },
            ],
          },
        ],
      },
    ];
    const out = parseTheOddsApi(raw);
    // one market kept (bad-prices), malformed events dropped
    expect(out).toHaveLength(1);
    const m = out[0]!;
    expect(m.eventId).toBe('bad-prices');
    // only the numeric h2h outcome survives; totals market ignored
    expect(m.outcomes.map((o) => o.name)).toEqual(['B']);
    expect(m.outcomes[0]!.books).toEqual([{ book: 'Pinnacle', price: 2.1 }]);
  });

  it('returns empty array for non-array input', () => {
    expect(parseTheOddsApi(null)).toEqual([]);
    expect(parseTheOddsApi({})).toEqual([]);
    expect(parseTheOddsApi('x')).toEqual([]);
  });
});

// Regression tests for review findings parser-1 (decimal-odds guard) and parser-2 (per-book dedup).
function rawEvent(books: { title: string; outcomes: { name: string; price: unknown }[] }[]) {
  return [
    {
      id: 'e1',
      sport_key: 'soccer_fifa_world_cup',
      commence_time: '2026-06-20T18:00:00Z',
      home_team: 'A',
      away_team: 'B',
      bookmakers: books.map((b) => ({
        title: b.title,
        markets: [{ key: 'h2h', outcomes: b.outcomes }],
      })),
    },
  ];
}

describe('parseTheOddsApi — decimal-odds guard (parser-1)', () => {
  it('drops prices <= 1, zero, and negative as corrupt', () => {
    const markets = parseTheOddsApi(
      rawEvent([
        {
          title: 'X',
          outcomes: [
            { name: 'A', price: 1 }, // exactly 1 — rejected
            { name: 'B', price: 0 }, // zero — rejected
            { name: 'C', price: -2.5 }, // negative — rejected
            { name: 'D', price: 2.5 }, // valid
          ],
        },
      ]),
    );
    // Only the valid >1 price survives; bad prices never reach BookOdds.
    const allBooks = markets.flatMap((m) => m.outcomes.flatMap((o) => o.books));
    expect(allBooks).toEqual([{ book: 'X', price: 2.5 }]);
  });
});

describe('parseTheOddsApi — per-book dedup keeps max price (parser-2)', () => {
  it('collapses duplicate bookmakers to one entry per book at the best price', () => {
    const markets = parseTheOddsApi(
      rawEvent([
        { title: 'X', outcomes: [{ name: 'A', price: 2.0 }] },
        { title: 'X', outcomes: [{ name: 'A', price: 2.4 }] }, // duplicate book, higher price
        { title: 'X', outcomes: [{ name: 'A', price: 2.1 }] }, // duplicate book, lower price
      ]),
    );
    const outcomeA = markets[0]!.outcomes.find((o) => o.name === 'A')!;
    expect(outcomeA.books).toEqual([{ book: 'X', price: 2.4 }]);
  });
});
