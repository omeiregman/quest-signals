import type { NormalizedMarket, OddsProvider } from '@quest/core';
import { parseTheOddsApi } from './parse-the-odds-api';
import fixture from './fixtures/the-odds-api-wc2026.json';

/**
 * Offline OddsProvider backed by a bundled The-Odds-API fixture. Useful for
 * tests and local development without spending API credits. The fixture is run
 * through the same parser as the live provider, so the resulting markets are
 * indistinguishable in shape.
 *
 * `sport` filters the parsed markets by sportKey. A falsy `sport` returns every
 * market the fixture contains. `regions` and `markets` are accepted to satisfy
 * the OddsProvider contract but ignored — the mock simply serves all it has.
 */
export class MockOddsProvider implements OddsProvider {
  readonly name = 'mock';

  fetchOdds(params: {
    sport: string;
    regions: string[];
    markets: ('h2h')[];
  }): Promise<NormalizedMarket[]> {
    const all = parseTheOddsApi(fixture);
    const filtered = params.sport
      ? all.filter((m) => m.sportKey === params.sport)
      : all;
    return Promise.resolve(filtered);
  }
}
