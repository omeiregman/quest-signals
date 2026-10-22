import { describe, expect, it } from 'vitest';
import { detectArbitrage, detectValue } from '@quest/core';
import { parseOddsPapi, type FixtureMeta, type OddsPapiBookFeed } from './parse-oddspapi';
import sample from './fixtures/oddspapi-odds-sample.json';

const SOCCER = { marketId: '101', home: '101', away: '103', draw: '102' };

// Build a single-fixture, single-book feed with given 1X2 prices.
function feed(slug: string, fixtureId: string, [h, d, a]: [number, number, number]): OddsPapiBookFeed {
  const outcome = (price: number) => ({ players: { '0': { price } } });
  return {
    slug,
    fixtures: [
      {
        fixtureId,
        bookmakerOdds: {
          [slug]: {
            markets: {
              '101': { outcomes: { '101': outcome(h), '102': outcome(d), '103': outcome(a) } },
            },
          },
        },
      },
    ],
  };
}

describe('parseOddsPapi — synthetic', () => {
  it('merges two books on one fixture into a 1X2 market with team names', () => {
    const meta = new Map<string, FixtureMeta>([
      ['F1', { homeTeam: 'Sweden', awayTeam: 'Norway', commenceTime: '2026-06-20T18:00:00Z' }],
    ]);
    const markets = parseOddsPapi(
      [feed('7bet.lt', 'F1', [2.1, 3.3, 3.6]), feed('betsson', 'F1', [2.2, 3.2, 3.5])],
      meta,
      'soccer',
      SOCCER,
    );
    expect(markets).toHaveLength(1);
    const m = markets[0]!;
    expect(m.eventId).toBe('F1');
    expect(m.homeTeam).toBe('Sweden');
    expect(m.outcomes.map((o) => o.name)).toEqual(['Sweden', 'Draw', 'Norway']);
    const home = m.outcomes.find((o) => o.name === 'Sweden')!;
    expect(home.books).toEqual([
      { book: '7bet.lt', price: 2.1 },
      { book: 'betsson', price: 2.2 },
    ]);
  });

  it('drops non-decimal prices so that outcome carries no book', () => {
    const meta = new Map<string, FixtureMeta>([
      ['F2', { homeTeam: 'A', awayTeam: 'B', commenceTime: '2026-06-20T18:00:00Z' }],
    ]);
    const markets = parseOddsPapi([feed('betsson', 'F2', [1.0, 3.2, 2.5])], meta, 'soccer', SOCCER); // home 1.0 invalid
    const m = markets[0]!;
    expect(m.outcomes.map((o) => o.name)).toEqual(['Draw', 'B']); // home outcome dropped (no valid book)
  });

  it('skips fixtures without meta (live / out-of-window odds in the feed)', () => {
    const markets = parseOddsPapi([feed('betsson', 'NOMETA', [2.1, 3.3, 3.6])], new Map(), 'soccer', SOCCER);
    expect(markets).toEqual([]);
  });

  it('drops inactive outcomes, inactive markets and suspended books; keeps changedAt', () => {
    const outcome = (price: number, extra: Record<string, unknown> = {}) => ({
      players: { '0': { price, changedAt: '2026-09-20T10:00:00.000Z', ...extra } },
    });
    const meta = new Map<string, FixtureMeta>([
      ['F4', { homeTeam: 'A', awayTeam: 'B', commenceTime: '2026-09-21T18:00:00Z' }],
    ]);
    const feeds: OddsPapiBookFeed[] = [
      {
        slug: 'betsson',
        fixtures: [
          {
            fixtureId: 'F4',
            bookmakerOdds: {
              betsson: {
                markets: {
                  '101': {
                    outcomes: {
                      '101': outcome(2.1),
                      '102': outcome(3.3, { active: false }), // withdrawn draw
                      '103': outcome(3.4),
                    },
                  },
                },
              } as never,
            },
          },
        ],
      },
      {
        slug: '7bet.lt',
        fixtures: [
          {
            fixtureId: 'F4',
            bookmakerOdds: {
              '7bet.lt': { suspended: true, markets: { '101': { outcomes: { '101': outcome(2.5) } } } } as never,
            },
          },
        ],
      },
      {
        slug: 'pinnacle',
        fixtures: [
          {
            fixtureId: 'F4',
            bookmakerOdds: {
              pinnacle: { markets: { '101': { marketActive: false, outcomes: { '101': outcome(2.2) } } } } as never,
            },
          },
        ],
      },
    ];
    const markets = parseOddsPapi(feeds, meta, 'soccer', SOCCER);
    const m = markets[0]!;
    // Draw dropped (inactive), 7bet dropped (suspended), pinnacle dropped (market inactive).
    expect(m.outcomes.map((o) => o.name)).toEqual(['A', 'B']);
    expect(m.outcomes.flatMap((o) => o.books.map((b) => b.book))).toEqual(['betsson', 'betsson']);
    expect(m.outcomes[0]!.books[0]!.updatedAt).toBe('2026-09-20T10:00:00.000Z');
  });

  it('captures the per-book fixturePath as the leg deep link', () => {
    const outcome = (price: number) => ({ players: { '0': { price } } });
    const feeds: OddsPapiBookFeed[] = [
      {
        slug: 'betsson',
        fixtures: [
          {
            fixtureId: 'F3',
            bookmakerOdds: {
              betsson: {
                fixturePath: 'https://betsson.example/event/f3',
                markets: {
                  '101': { outcomes: { '101': outcome(2.1), '103': outcome(3.4) } },
                },
              } as never,
            },
          },
        ],
      },
    ];
    const meta = new Map<string, FixtureMeta>([
      ['F3', { homeTeam: 'A', awayTeam: 'B', commenceTime: '2026-06-20T18:00:00Z' }],
    ]);
    const markets = parseOddsPapi(feeds, meta, 'soccer', SOCCER);
    expect(markets[0]?.outcomes[0]?.books[0]?.link).toBe('https://betsson.example/event/f3');
  });
});

describe('parseOddsPapi — real captured 3-book sample (Superettan)', () => {
  const feeds: OddsPapiBookFeed[] = Object.entries(sample as Record<string, OddsPapiBookFeed['fixtures']>).map(
    ([slug, fixtures]) => ({ slug, fixtures }),
  );
  // Meta (names/kickoff) for every fixtureId in the sample, as the provider would supply from /v4/fixtures.
  const meta = new Map<string, FixtureMeta>();
  for (const f of feeds.flatMap((fd) => fd.fixtures)) {
    meta.set(f.fixtureId, { homeTeam: 'Home FC', awayTeam: 'Away FC', commenceTime: '2026-06-20T18:00:00Z' });
  }

  it('parses real odds-by-tournaments data into markets', () => {
    const markets = parseOddsPapi(feeds, meta, 'soccer', SOCCER);
    expect(markets.length).toBeGreaterThanOrEqual(3);
    // a fixture quoted by multiple books should have >1 book on an outcome
    const multi = markets.find((m) => m.outcomes.some((o) => o.books.length >= 2));
    expect(multi).toBeDefined();
    expect(multi!.outcomes.flatMap((o) => o.books.map((b) => b.book))).toContain('pinnacle');
    // engine runs cleanly on real data
    expect(() => detectArbitrage(multi!, { minMargin: 0.01 })).not.toThrow();
    expect(() => detectValue(multi!, { referenceBook: 'pinnacle', minEdge: 0.02 })).not.toThrow();
  });
});
