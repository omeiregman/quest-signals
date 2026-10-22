import { isFresh } from './arbitrage';
import type { FreshnessOpts, NormalizedMarket, ValueOpportunity } from './types';

export interface ValueOptions extends FreshnessOpts {
  referenceBook: string;
  minEdge: number;
  bookAllowlist?: string[];
  /** Don't flag a soft bet priced above this (longshot pricing artifacts). 0/undefined = no cap. */
  maxOdds?: number;
}

/** Multiplicative (proportional) de-vig: normalize implied probabilities to sum to 1. */
export function devig(referenceOdds: number[]): number[] {
  const implied = referenceOdds.map((o) => 1 / o);
  const sum = implied.reduce((a, b) => a + b, 0);
  return implied.map((p) => p / sum);
}

function allowed(book: string, allowlist?: string[]): boolean {
  return !allowlist || allowlist.length === 0 || allowlist.includes(book);
}

export function detectValue(market: NormalizedMarket, opts: ValueOptions): ValueOpportunity[] {
  // Reference odds for every outcome are required to de-vig — and they must be FRESH:
  // "value" against a stale sharp line is noise, not edge.
  const refOdds: number[] = [];
  const refUpdated: (string | undefined)[] = [];
  for (const outcome of market.outcomes) {
    const ref = outcome.books.find((b) => b.book === opts.referenceBook);
    if (!ref || !isFresh(ref, opts)) return [];
    refOdds.push(ref.price);
    refUpdated.push(ref.updatedAt);
  }
  const trueProbs = devig(refOdds);

  const out: ValueOpportunity[] = [];
  market.outcomes.forEach((outcome, i) => {
    const trueProb = trueProbs[i]!;
    for (const b of outcome.books) {
      if (b.book === opts.referenceBook) continue;
      if (!allowed(b.book, opts.bookAllowlist)) continue;
      if (opts.maxOdds && opts.maxOdds > 0 && b.price > opts.maxOdds) continue; // skip longshot artifacts
      if (!isFresh(b, opts)) continue; // stale soft line => phantom value
      const edge = trueProb * b.price - 1;
      if (edge >= opts.minEdge) {
        const refAt = refUpdated[i];
        out.push({
          type: 'value',
          sportKey: market.sportKey,
          eventId: market.eventId,
          commenceTime: market.commenceTime,
          marketType: market.marketType,
          outcome: outcome.name,
          book: b.book,
          softOdds: b.price,
          referenceBook: opts.referenceBook,
          trueProb,
          edge,
          ...(b.link ? { link: b.link } : {}),
          ...(b.updatedAt ? { updatedAt: b.updatedAt } : {}),
          ...(refAt ? { referenceUpdatedAt: refAt } : {}),
        });
      }
    }
  });
  return out;
}
