import { describe, expect, it } from 'vitest';
import { TheOddsApiProvider } from './the-odds-api';
import fixture from './fixtures/the-odds-api-wc2026.json';

function fakeFetch(
  capture: { url?: string; init?: RequestInit },
  response: Response,
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    capture.url = typeof input === 'string' ? input : input.toString();
    capture.init = init;
    return response;
  }) as typeof fetch;
}

function okResponse(): Response {
  return new Response(JSON.stringify(fixture), {
    status: 200,
    headers: { 'x-requests-remaining': '42' },
  });
}

describe('TheOddsApiProvider', () => {
  it('has name "theoddsapi"', () => {
    const provider = new TheOddsApiProvider({ apiKey: 'k' });
    expect(provider.name).toBe('theoddsapi');
  });

  it('fetches and returns parsed markets, and records requests-remaining', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const provider = new TheOddsApiProvider({
      apiKey: 'secret-key',
      fetchImpl: fakeFetch(capture, okResponse()),
    });

    const markets = await provider.fetchOdds({
      sport: 'soccer_fifa_world_cup',
      regions: ['eu', 'us'],
      markets: ['h2h'],
    });

    expect(markets.length).toBeGreaterThanOrEqual(3);
    expect(markets.length).toBe((fixture as unknown[]).length);
    for (const m of markets) {
      expect(m.marketType).toBe('h2h');
    }
    expect(provider.lastRequestsRemaining).toBe(42);
  });

  it('builds the request URL with sport, decimal odds format, and the api key', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const provider = new TheOddsApiProvider({
      apiKey: 'secret-key',
      fetchImpl: fakeFetch(capture, okResponse()),
    });

    await provider.fetchOdds({
      sport: 'soccer_fifa_world_cup',
      regions: ['eu', 'us'],
      markets: ['h2h'],
    });

    expect(capture.url).toBeDefined();
    const url = capture.url!;
    expect(url).toContain('soccer_fifa_world_cup');
    expect(url).toContain('oddsFormat=decimal');
    expect(url).toContain('apiKey=secret-key');
    expect(url).toContain('markets=h2h');
    expect(url).toContain('regions=eu,us');
  });

  it('respects a custom baseUrl', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const provider = new TheOddsApiProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test',
      fetchImpl: fakeFetch(capture, okResponse()),
    });

    await provider.fetchOdds({ sport: 'sport1', regions: ['eu'], markets: ['h2h'] });

    expect(capture.url!.startsWith('https://example.test/v4/sports/sport1/odds')).toBe(true);
  });

  it('defaults lastRequestsRemaining to null before any fetch', () => {
    const provider = new TheOddsApiProvider({ apiKey: 'k' });
    expect(provider.lastRequestsRemaining).toBeNull();
  });

  it('leaves lastRequestsRemaining null when header is absent', async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const response = new Response(JSON.stringify(fixture), { status: 200 });
    const provider = new TheOddsApiProvider({
      apiKey: 'k',
      fetchImpl: fakeFetch(capture, response),
    });

    await provider.fetchOdds({ sport: 's', regions: ['eu'], markets: ['h2h'] });
    expect(provider.lastRequestsRemaining).toBeNull();
  });

  it('throws on a non-2xx response, including status and body', async () => {
    // Each fetch returns a fresh Response — bodies are one-shot streams.
    const fetchImpl = (async () =>
      new Response('unauthorized: bad key', { status: 401 })) as typeof fetch;
    const provider = new TheOddsApiProvider({ apiKey: 'bad', fetchImpl });

    await expect(
      provider.fetchOdds({ sport: 's', regions: ['eu'], markets: ['h2h'] }),
    ).rejects.toThrow(/401/);
    await expect(
      provider.fetchOdds({ sport: 's', regions: ['eu'], markets: ['h2h'] }),
    ).rejects.toThrow(/unauthorized: bad key/);
  });
});
