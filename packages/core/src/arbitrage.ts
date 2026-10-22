import type { ArbLeg, ArbOpportunity, BookOdds, FreshnessOpts, NormalizedMarket } from './types';

export interface ArbOptions extends FreshnessOpts {
  minMargin: number;
  bookAllowlist?: string[];
  /** Ignore individual book offers priced above this (longshot/stale price artifacts). 0/undefined = no cap. */
  maxOdds?: number;
}

function allowed(book: string, allowlist?: string[]): boolean {
  return !allowlist || allowlist.length === 0 || allowlist.includes(book);
}

function withinCap(price: number, maxOdds?: number): boolean {
  return !maxOdds || maxOdds <= 0 || price <= maxOdds;
}

/**
 * A price is fresh if we have no age limit, no timestamp (can't judge — keep), or it changed
 * within `maxAgeMs`. Stale soft-book lines are the #1 source of phantom arbs and value.
 */
export function isFresh(b: BookOdds, opts: FreshnessOpts): boolean {
  if (!opts.maxAgeMs || opts.maxAgeMs <= 0 || !b.updatedAt) return true;
  const t = Date.parse(b.updatedAt);
  if (!Number.isFinite(t)) return true;
  return (opts.now ?? Date.now()) - t <= opts.maxAgeMs;
}

export function detectArbitrage(
  market: NormalizedMarket,
  opts: ArbOptions,
): ArbOpportunity | null {
  if (market.outcomes.length < 2) return null;

  const legs: ArbLeg[] = [];
  for (const outcome of market.outcomes) {
    const candidates = outcome.books.filter(
      (b) =>
        allowed(b.book, opts.bookAllowlist) && withinCap(b.price, opts.maxOdds) && isFresh(b, opts),
    );
    if (candidates.length === 0) return null; // an outcome with no usable book => no arb
    const best = candidates.reduce((a, b) => (b.price > a.price ? b : a));
    legs.push({
      outcome: outcome.name,
      book: best.book,
      odds: best.price,
      impliedProb: 1 / best.price,
      ...(best.link ? { link: best.link } : {}),
      ...(best.updatedAt ? { updatedAt: best.updatedAt } : {}),
    });
  }

  const totalImplied = legs.reduce((sum, l) => sum + l.impliedProb, 0);
  const margin = 1 - totalImplied;
  if (totalImplied >= 1 || margin < opts.minMargin) return null;

  return {
    type: 'arb',
    sportKey: market.sportKey,
    eventId: market.eventId,
    commenceTime: market.commenceTime,
    marketType: market.marketType,
    legs,
    totalImplied,
    margin,
  };
}
