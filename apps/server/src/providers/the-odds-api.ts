import type { MarketType, NormalizedMarket, OddsProvider } from '@quest/core';
import { parseTheOddsApi } from './parse-the-odds-api';

const DEFAULT_BASE_URL = 'https://api.the-odds-api.com';

export interface TheOddsApiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * OddsProvider backed by The-Odds-API (https://the-odds-api.com) /v4 odds
 * endpoint. Fetches decimal h2h odds and delegates parsing to parseTheOddsApi.
 *
 * The `x-requests-remaining` response header is captured into
 * `lastRequestsRemaining` after each fetch for credit logging by the caller.
 */
export class TheOddsApiProvider implements OddsProvider {
  readonly name = 'theoddsapi';

  /** Credits remaining as reported by the last response, or null if unknown. */
  lastRequestsRemaining: number | null = null;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TheOddsApiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async fetchOdds(params: {
    sport: string;
    regions: string[];
    markets: MarketType[];
  }): Promise<NormalizedMarket[]> {
    const { sport, regions } = params;
    const url =
      `${this.baseUrl}/v4/sports/${sport}/odds` +
      `?regions=${regions.join(',')}` +
      `&markets=h2h` +
      `&oddsFormat=decimal` +
      `&apiKey=${this.apiKey}`;

    const response = await this.fetchImpl(url);

    const remaining = response.headers.get('x-requests-remaining');
    this.lastRequestsRemaining =
      remaining !== null && remaining.trim() !== '' && Number.isFinite(Number(remaining))
        ? Number(remaining)
        : null;

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `TheOddsApi request failed: ${response.status} ${response.statusText} ${body}`.trim(),
      );
    }

    const json: unknown = await response.json();
    return parseTheOddsApi(json);
  }
}
