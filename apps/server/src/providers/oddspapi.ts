import type { MarketType, NormalizedMarket, OddsProvider } from '@quest/core';
import {
  parseOddsPapi,
  type FixtureMeta,
  type OddsPapiBookFeed,
  type OddsPapiRawFixture,
  type SportMarket,
} from './parse-oddspapi';

// Our sport keys -> OddsPapi sportId + match-winner market (ids verified from /v4/markets).
// Soccer is 3-way (1X2); the rest use the 2-way "Winner (incl. overtime)" moneyline so the
// rare regulation-draw leg doesn't get capped out and kill detection.
const SPORT_MARKETS: Record<string, { sportId: number } & SportMarket> = {
  soccer: { sportId: 10, marketId: '101', home: '101', draw: '102', away: '103' },
  basketball: { sportId: 11, marketId: '111', home: '111', away: '112' },
  tennis: { sportId: 12, marketId: '121', home: '121', away: '122' },
  baseball: { sportId: 13, marketId: '131', home: '131', away: '132' },
  'american-football': { sportId: 14, marketId: '141', home: '141', away: '142' },
  'ice-hockey': { sportId: 15, marketId: '151', home: '151', away: '152' },
};

interface RawFixture {
  fixtureId: string;
  hasOdds?: boolean;
  startTime?: string;
  participant1Name?: string | null;
  participant2Name?: string | null;
  tournamentId?: number | null;
}

// OddsPapi caps odds-by-tournaments at 5 tournament ids per request.
const MAX_TOURNAMENTS_PER_CALL = 5;

export interface OddsPapiOptions {
  apiKey: string;
  /** Bookmaker slugs to fetch (incl. the reference book), e.g. ['7bet.lt','betsson','pinnacle']. */
  books: string[];
  baseUrl?: string;
  windowDays?: number;
  /** How many tournaments to monitor (busiest first). Default 5 = 1 call/book = free-tier-safe. */
  maxTournaments?: number;
  /** Explicit tournament ids to monitor (overrides busiest-first discovery). */
  tournamentIds?: number[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Spacing between calls (OddsPapi rate-limits odds-by-tournaments ~0.64s). */
  delayMs?: number;
}

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: unknown[] }).data;
  }
  return [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * OddsProvider backed by OddsPapi (api.oddspapi.io). Flow: fetch fixtures (names +
 * tournament ids) for the sport in a date window, then one odds-by-tournaments call per
 * configured book, then merge into NormalizedMarket[] (soccer 1X2). Pre-match only
 * (free tier has no live odds). Book identity is the OddsPapi slug.
 */
export class OddsPapiProvider implements OddsProvider {
  readonly name = 'oddspapi';

  constructor(private readonly opts: OddsPapiOptions) {}

  async fetchOdds(params: {
    sport: string;
    regions: string[];
    markets: MarketType[];
  }): Promise<NormalizedMarket[]> {
    const spec = SPORT_MARKETS[params.sport];
    if (!spec) return []; // unknown/unsupported sport key
    const sportId = spec.sportId;

    const now = (this.opts.now ?? (() => Date.now()))();
    const windowDays = this.opts.windowDays ?? 3;
    const from = new Date(now).toISOString().slice(0, 10);
    const to = new Date(now + windowDays * 86_400_000).toISOString().slice(0, 10);

    // 1. Fixtures: team names + tournament ids (odds responses omit names).
    const fixturesBody = await this.getJson(`/v4/fixtures?sportId=${sportId}&from=${from}&to=${to}`);
    const metaById = new Map<string, FixtureMeta>();
    const tournamentCounts = new Map<number, number>();
    for (const raw of asArray(fixturesBody)) {
      const f = raw as RawFixture;
      if (!f.hasOdds || !f.fixtureId) continue;
      const startMs = f.startTime ? Date.parse(f.startTime) : NaN;
      if (Number.isFinite(startMs) && startMs <= now) continue; // pre-match only
      metaById.set(f.fixtureId, {
        ...(f.participant1Name ? { homeTeam: f.participant1Name } : {}),
        ...(f.participant2Name ? { awayTeam: f.participant2Name } : {}),
        commenceTime: f.startTime ?? '',
      });
      if (typeof f.tournamentId === 'number') {
        tournamentCounts.set(f.tournamentId, (tournamentCounts.get(f.tournamentId) ?? 0) + 1);
      }
    }
    if (tournamentCounts.size === 0) return [];

    // Pick which tournaments to query: explicit list, else busiest-first (bigger leagues =
    // better book coverage), capped for credit budget. Then chunk to OddsPapi's 5-id limit.
    const ranked =
      this.opts.tournamentIds?.length
        ? this.opts.tournamentIds
        : [...tournamentCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const selected = ranked.slice(0, this.opts.maxTournaments ?? 5);
    const chunks = chunk(selected, MAX_TOURNAMENTS_PER_CALL);

    // 2. odds-by-tournaments per book, per chunk (spaced for the rate limit).
    const feeds: OddsPapiBookFeed[] = [];
    for (const slug of this.opts.books) {
      const fixtures: OddsPapiRawFixture[] = [];
      for (const ids of chunks) {
        try {
          const body = await this.getJson(
            `/v4/odds-by-tournaments?bookmaker=${encodeURIComponent(slug)}&tournamentIds=${ids.join(',')}&oddsFormat=decimal`,
          );
          fixtures.push(...(asArray(body) as OddsPapiRawFixture[]));
        } catch (err) {
          // A book often doesn't cover some tournaments (OddsPapi 404 FIXTURE_NOT_FOUND).
          // Skip that book/chunk rather than failing the whole sport.
          console.warn(
            `[oddspapi] ${slug} odds chunk skipped: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await this.delay();
      }
      feeds.push({ slug, fixtures });
    }

    // 3. Merge into NormalizedMarket[].
    return parseOddsPapi(feeds, metaById, params.sport, spec);
  }

  /** Fresh odds for ONE known fixture (1 request): /v4/odds across all configured books. */
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
      console.warn(
        `[oddspapi] recheck failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    const raw = (Array.isArray(body) ? body : [body]).filter(
      (f): f is OddsPapiRawFixture =>
        !!f && typeof f === 'object' && 'bookmakerOdds' in (f as object),
    );
    if (raw.length === 0) return null;
    // Key everything under the requested id so the meta join below always matches.
    const fixtures = raw.map((f) => ({ ...f, fixtureId: params.eventId }));
    const feeds: OddsPapiBookFeed[] = this.opts.books.map((slug) => ({ slug, fixtures }));
    const nowIso = new Date((this.opts.now ?? (() => Date.now()))()).toISOString();
    const metaById = new Map<string, FixtureMeta>([
      [
        params.eventId,
        {
          ...(params.meta?.homeTeam ? { homeTeam: params.meta.homeTeam } : {}),
          ...(params.meta?.awayTeam ? { awayTeam: params.meta.awayTeam } : {}),
          commenceTime: params.meta?.commenceTime ?? nowIso,
        },
      ],
    ]);
    return parseOddsPapi(feeds, metaById, params.sport, spec)[0] ?? null;
  }

  private async getJson(path: string, attempt = 0): Promise<unknown> {
    const base = this.opts.baseUrl ?? 'https://api.oddspapi.io';
    const sep = path.includes('?') ? '&' : '?';
    const fetchImpl = this.opts.fetchImpl ?? globalThis.fetch;
    const res = await fetchImpl(`${base}${path}${sep}apiKey=${this.opts.apiKey}`);
    // Recover from rate limits (free-tier odds-by-tournaments) instead of dropping the call.
    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await this.delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500);
      return this.getJson(path, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`OddsPapi ${res.status} on ${path.split('?')[0]}`);
    }
    const body: unknown = await res.json();
    // OddsPapi returns some failures as HTTP 200 with an { error } body — surface them.
    if (body && typeof body === 'object' && 'error' in body) {
      const err = (body as { error?: { message?: string } }).error;
      throw new Error(`OddsPapi error on ${path.split('?')[0]}: ${err?.message ?? 'unknown'}`);
    }
    return body;
  }

  private delay(ms: number = this.opts.delayMs ?? 800): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
