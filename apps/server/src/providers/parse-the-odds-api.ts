import { aliasBook, normalizeOutcomeName } from '@quest/core';
import type { NormalizedMarket, NormalizedOutcome } from '@quest/core';

// Loose shapes mirroring The-Odds-API /v4 odds payload. Everything is treated
// as `unknown` first and validated defensively, since this is untrusted input.
interface RawOutcome {
  name?: unknown;
  price?: unknown;
}
interface RawMarket {
  key?: unknown;
  outcomes?: unknown;
}
interface RawBookmaker {
  title?: unknown;
  markets?: unknown;
}
interface RawEvent {
  id?: unknown;
  sport_key?: unknown;
  commence_time?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  bookmakers?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asDecimalOdds(v: unknown): number | undefined {
  // Decimal odds are always > 1 (The Odds API with oddsFormat=decimal guarantees this).
  // Reject 0, negatives, <=1 and non-finite as corrupt — they would otherwise produce
  // Infinity/negative implied probabilities and fabricate phantom arbs downstream.
  return typeof v === 'number' && Number.isFinite(v) && v > 1 ? v : undefined;
}

/**
 * Parse a raw The-Odds-API /v4 odds response (array of events) into
 * NormalizedMarket[]. Pure and defensive: malformed events, markets, outcomes
 * and non-numeric prices are skipped rather than throwing.
 *
 * One NormalizedMarket is produced per event (h2h only). Outcomes are grouped
 * by normalizeOutcomeName(); each outcome's `books` aggregates one entry per
 * bookmaker quoting that outcome, keyed by aliasBook(bookmaker.title).
 */
export function parseTheOddsApi(raw: unknown): NormalizedMarket[] {
  if (!Array.isArray(raw)) return [];

  const markets: NormalizedMarket[] = [];

  for (const rawEvent of raw) {
    if (!isObject(rawEvent)) continue;
    const event = rawEvent as RawEvent;

    const eventId = asNonEmptyString(event.id);
    const sportKey = asNonEmptyString(event.sport_key);
    const commenceTime = asNonEmptyString(event.commence_time);
    if (!eventId || !sportKey || !commenceTime) continue;

    const bookmakers = event.bookmakers;
    if (!Array.isArray(bookmakers)) continue;

    // Preserve first-seen outcome order while grouping books by outcome name.
    // Inner map is book -> best (highest) decimal price, so duplicate bookmakers
    // or repeated h2h market objects collapse to one entry per book.
    const order: string[] = [];
    const byOutcome = new Map<string, Map<string, number>>();

    for (const rawBookmaker of bookmakers) {
      if (!isObject(rawBookmaker)) continue;
      const bookmaker = rawBookmaker as RawBookmaker;

      const title = asNonEmptyString(bookmaker.title);
      if (!title) continue;
      const book = aliasBook(title);

      const bmMarkets = bookmaker.markets;
      if (!Array.isArray(bmMarkets)) continue;

      for (const rawMarket of bmMarkets) {
        if (!isObject(rawMarket)) continue;
        const market = rawMarket as RawMarket;
        if (market.key !== 'h2h') continue;

        const outcomes = market.outcomes;
        if (!Array.isArray(outcomes)) continue;

        for (const rawOutcome of outcomes) {
          if (!isObject(rawOutcome)) continue;
          const outcome = rawOutcome as RawOutcome;

          const name = asNonEmptyString(outcome.name);
          const price = asDecimalOdds(outcome.price);
          if (!name || price === undefined) continue;

          const normalized = normalizeOutcomeName(name);
          let bucket = byOutcome.get(normalized);
          if (!bucket) {
            bucket = new Map<string, number>();
            byOutcome.set(normalized, bucket);
            order.push(normalized);
          }
          const existing = bucket.get(book);
          if (existing === undefined || price > existing) bucket.set(book, price);
        }
      }
    }

    const outcomes: NormalizedOutcome[] = order.map((name) => ({
      name,
      books: [...byOutcome.get(name)!.entries()].map(([book, price]) => ({ book, price })),
    }));

    markets.push({
      sportKey,
      eventId,
      ...(asNonEmptyString(event.home_team) !== undefined
        ? { homeTeam: asNonEmptyString(event.home_team) }
        : {}),
      ...(asNonEmptyString(event.away_team) !== undefined
        ? { awayTeam: asNonEmptyString(event.away_team) }
        : {}),
      commenceTime,
      marketType: 'h2h',
      outcomes,
    });
  }

  return markets;
}
