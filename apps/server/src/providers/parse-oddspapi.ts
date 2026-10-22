import type { BookOdds, NormalizedMarket, NormalizedOutcome } from '@quest/core';

/** The match-winner market for a sport: market id + outcome ids (draw only for 3-way, e.g. soccer). */
export interface SportMarket {
  marketId: string;
  home: string;
  away: string;
  draw?: string;
}

// Loose shapes for the slices of the OddsPapi odds payload we read.
interface RawPlayer {
  price?: unknown;
  active?: unknown; // false = outcome not currently offered
  changedAt?: unknown; // ISO time the book last changed this price
}
interface RawOutcome {
  players?: Record<string, RawPlayer>;
}
interface RawMarket {
  outcomes?: Record<string, RawOutcome>;
  marketActive?: unknown; // false = whole market off the board
}
interface RawBookEntry {
  markets?: Record<string, RawMarket>;
  fixturePath?: unknown; // deep link to the book's event page (when the API provides it)
  suspended?: unknown; // true = book has the event suspended
  bookmakerIsActive?: unknown; // false = OddsPapi considers this book's feed inactive
}

interface ParsedPrice {
  price: number;
  updatedAt?: string;
}
export interface OddsPapiRawFixture {
  fixtureId: string;
  bookmakerOdds?: Record<string, RawBookEntry>;
}

/** One bookmaker's odds-by-tournaments response (a list of fixtures carrying that book's odds). */
export interface OddsPapiBookFeed {
  slug: string;
  fixtures: OddsPapiRawFixture[];
}

/** Team names + kickoff for a fixture, resolved from /v4/fixtures (odds responses omit names). */
export interface FixtureMeta {
  homeTeam?: string;
  awayTeam?: string;
  commenceTime: string;
}

function priceOf(outcome: RawOutcome | undefined): ParsedPrice | undefined {
  const players = outcome?.players;
  if (!players) return undefined;
  const p = players['0'] ?? Object.values(players)[0];
  if (!p || p.active === false) return undefined; // withdrawn outcome: not placeable
  const v = p.price;
  // Decimal odds are always > 1; reject anything else (parity with the other parser).
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 1) return undefined;
  const updatedAt =
    typeof p.changedAt === 'string' && Number.isFinite(Date.parse(p.changedAt))
      ? p.changedAt
      : undefined;
  return { price: v, ...(updatedAt ? { updatedAt } : {}) };
}

/**
 * Merge per-bookmaker OddsPapi odds feeds (each from /v4/odds-by-tournaments for one book)
 * into NormalizedMarket[] for the 1X2 match-winner market, joining team names from `metaById`.
 * Pure and defensive: fixtures/markets/outcomes without usable decimal prices are skipped.
 * Book identity is the OddsPapi slug (e.g. '7bet.lt', 'betsson', 'pinnacle').
 */
export function parseOddsPapi(
  feeds: OddsPapiBookFeed[],
  metaById: Map<string, FixtureMeta>,
  sportKey: string,
  market: SportMarket,
): NormalizedMarket[] {
  const acc = new Map<string, { home: BookOdds[]; draw: BookOdds[]; away: BookOdds[] }>();

  for (const feed of feeds) {
    for (const fx of feed.fixtures) {
      const entry = fx.bookmakerOdds?.[feed.slug];
      // Suspended event or dead feed: nothing placeable. (Sept 2026: betsson came through with
      // suspended=true + bookmakerIsActive=false on every fixture, prices 4 days old.)
      if (!entry || entry.suspended === true || entry.bookmakerIsActive === false) continue;
      const mk = entry.markets?.[market.marketId];
      if (!mk || mk.marketActive === false) continue; // market off the board
      const outs = mk.outcomes;
      if (!outs) continue;

      const home = priceOf(outs[market.home]);
      const draw = market.draw ? priceOf(outs[market.draw]) : undefined;
      const away = priceOf(outs[market.away]);
      if (home === undefined && draw === undefined && away === undefined) continue;

      let bucket = acc.get(fx.fixtureId);
      if (!bucket) {
        bucket = { home: [], draw: [], away: [] };
        acc.set(fx.fixtureId, bucket);
      }
      const link =
        typeof entry.fixturePath === 'string' && entry.fixturePath ? entry.fixturePath : undefined;
      const bookOdds = (p: ParsedPrice): BookOdds => ({
        book: feed.slug,
        price: p.price,
        ...(link ? { link } : {}),
        ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
      });
      if (home !== undefined) bucket.home.push(bookOdds(home));
      if (draw !== undefined) bucket.draw.push(bookOdds(draw));
      if (away !== undefined) bucket.away.push(bookOdds(away));
    }
  }

  const markets: NormalizedMarket[] = [];
  for (const [fixtureId, b] of acc) {
    // Require meta: it only exists for in-window, pre-match fixtures with known names/kickoff.
    // This drops live/started/out-of-window odds the feed may still carry (which would otherwise
    // show as nameless, un-time-filterable opportunities).
    const meta = metaById.get(fixtureId);
    if (!meta) continue;

    const outcomes: NormalizedOutcome[] = [
      { name: meta.homeTeam ?? 'Home', books: b.home },
      { name: 'Draw', books: b.draw },
      { name: meta.awayTeam ?? 'Away', books: b.away },
    ].filter((o) => o.books.length > 0);
    if (outcomes.length < 2) continue;

    markets.push({
      sportKey,
      eventId: fixtureId,
      ...(meta.homeTeam ? { homeTeam: meta.homeTeam } : {}),
      ...(meta.awayTeam ? { awayTeam: meta.awayTeam } : {}),
      commenceTime: meta.commenceTime,
      marketType: 'h2h',
      outcomes,
    });
  }
  return markets;
}
