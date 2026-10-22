import { describe, expect, it } from 'vitest';
import { OddsPapiProvider } from './oddspapi';
import sample from './fixtures/oddspapi-odds-sample.json';

const feeds = sample as Record<string, Array<{ fixtureId: string }>>;
const allFixtureIds = [...new Set(Object.values(feeds).flat().map((f) => f.fixtureId))];

function fixturesResponse(now: number) {
  const future = new Date(now + 86_400_000).toISOString();
  return allFixtureIds.map((id, i) => ({
    fixtureId: id,
    hasOdds: true,
    startTime: future,
    tournamentId: 46,
    participant1Name: `Home ${i}`,
    participant2Name: `Away ${i}`,
  }));
}

function makeFetch(now: number, capture: string[]): typeof fetch {
  return (async (url: string | URL) => {
    const u = String(url);
    capture.push(u);
    let body: unknown = [];
    if (u.includes('/v4/fixtures')) {
      body = fixturesResponse(now);
    } else if (u.includes('/v4/odds-by-tournaments')) {
      const m = u.match(/bookmaker=([^&]+)/);
      const slug = m?.[1] ? decodeURIComponent(m[1]) : '';
      body = feeds[slug] ?? [];
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('OddsPapiProvider', () => {
  it('fetches fixtures then per-book odds and merges into markets', async () => {
    const now = Date.parse('2026-06-14T00:00:00Z');
    const calls: string[] = [];
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['7bet.lt', 'betsson', 'pinnacle'],
      fetchImpl: makeFetch(now, calls),
      now: () => now,
      delayMs: 0,
    });

    const markets = await provider.fetchOdds({ sport: 'soccer', regions: [], markets: ['h2h'] });

    expect(markets.length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((c) => c.includes('/v4/fixtures'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('odds-by-tournaments'))).toHaveLength(3);
    expect(calls.some((c) => c.includes('sportId=10'))).toBe(true);
    expect(calls.some((c) => c.includes('bookmaker=betsson'))).toBe(true);
    expect(calls.every((c) => c.includes('apiKey=k'))).toBe(true);

    const multi = markets.find((m) => m.outcomes.some((o) => o.books.length >= 2))!;
    expect(multi.outcomes.flatMap((o) => o.books.map((b) => b.book))).toContain('pinnacle');
  });

  it('returns [] for an unsupported sport key', async () => {
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['betsson'],
      fetchImpl: makeFetch(0, []),
      now: () => 0,
      delayMs: 0,
    });
    expect(await provider.fetchOdds({ sport: 'cricket', regions: [], markets: ['h2h'] })).toEqual([]);
  });

  it('skips a book that 404s on odds without failing the sport', async () => {
    const now = Date.parse('2026-06-14T00:00:00Z');
    const fetchImpl = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/v4/fixtures')) {
        return new Response(JSON.stringify(fixturesResponse(now)), { status: 200 });
      }
      if (u.includes('bookmaker=7bet.lt')) {
        return new Response(JSON.stringify({ error: { message: 'no fixtures' } }), { status: 404 });
      }
      const m = u.match(/bookmaker=([^&]+)/);
      const slug = m?.[1] ? decodeURIComponent(m[1]) : '';
      return new Response(JSON.stringify(feeds[slug] ?? []), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['7bet.lt', 'betsson', 'pinnacle'],
      fetchImpl,
      now: () => now,
      delayMs: 0,
    });
    const markets = await provider.fetchOdds({ sport: 'soccer', regions: [], markets: ['h2h'] });
    expect(markets.length).toBeGreaterThanOrEqual(3); // betsson + pinnacle still produced markets
  });

  it('throws on a non-2xx response', async () => {
    const f = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['betsson'],
      fetchImpl: f,
      now: () => 0,
      delayMs: 0,
    });
    await expect(provider.fetchOdds({ sport: 'soccer', regions: [], markets: ['h2h'] })).rejects.toThrow();
  });

  it('recheckEvent fetches /v4/odds for one fixture and returns a merged market', async () => {
    const calls: string[] = [];
    const outcome = (price: number) => ({ players: { '0': { price } } });
    const body = [
      {
        fixtureId: 'fx9',
        bookmakerOdds: {
          betsson: { markets: { '101': { outcomes: { '101': outcome(2.2), '103': outcome(3.4) } } } },
          pinnacle: { markets: { '101': { outcomes: { '101': outcome(2.1), '103': outcome(3.2) } } } },
        },
      },
    ];
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['betsson', 'pinnacle'],
      delayMs: 0,
      now: () => Date.parse('2026-07-03T00:00:00Z'),
      fetchImpl: (async (url: string | URL) => {
        calls.push(String(url));
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const market = await provider.recheckEvent({
      sport: 'soccer',
      eventId: 'fx9',
      meta: { homeTeam: 'H', awayTeam: 'A', commenceTime: '2026-07-10T18:00:00Z' },
    });
    expect(calls[0]).toContain('/v4/odds?fixtureId=fx9');
    expect(calls[0]).toContain('bookmakers=betsson%2Cpinnacle');
    expect(market?.eventId).toBe('fx9');
    expect(market?.homeTeam).toBe('H');
    expect(market?.commenceTime).toBe('2026-07-10T18:00:00Z');
    expect(market?.outcomes.find((o) => o.name === 'H')?.books).toHaveLength(2);
  });

  it('recheckEvent returns null on error bodies or fetch failure', async () => {
    const provider = new OddsPapiProvider({
      apiKey: 'k',
      books: ['betsson'],
      delayMs: 0,
      now: () => 0,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 200 })) as unknown as typeof fetch,
    });
    expect(await provider.recheckEvent({ sport: 'soccer', eventId: 'x' })).toBeNull();
  });
});
