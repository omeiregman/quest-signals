import { devigOdds, overround, type DevigMethod, type SlateCandidate } from '@quest/core';
import { MARKET_SELECTIONS, winningSelection, type HistoricalMatch, type MarketKey } from './types';

export interface CandidateConfig {
  /** Sharp reference book code whose de-vigged prices are "true" probabilities (BFE, PS). */
  reference: string;
  /** Soft books we hold accounts at; the best-priced one wins per match in buildSlate. */
  books: string[];
  markets: MarketKey[];
  devig: DevigMethod;
  /**
   * Skip a market when the reference's overround falls outside this band: a thin exchange
   * market (wide back prices) or a stale line makes a poor "true probability". Default [-0.03, 0.08].
   */
  referenceOverround?: [number, number];
}

/** A value candidate plus everything the backtest needs to settle and grade it. */
export interface BacktestCandidate extends SlateCandidate {
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string; // e.g. '2-1'
  won: boolean;
  /** De-vigged reference probability at kickoff; undefined when closing prices are missing. */
  closingFairProb?: number;
  /** Closing-line value: odds × closingFairProb − 1. */
  clv?: number;
}

const DEFAULT_REF_OVERROUND: [number, number] = [-0.03, 0.08];

/** Every positive-edge selection at the configured soft books for one match. */
export function candidatesForMatch(
  match: HistoricalMatch,
  cfg: CandidateConfig,
): BacktestCandidate[] {
  const [minOver, maxOver] = cfg.referenceOverround ?? DEFAULT_REF_OVERROUND;
  const out: BacktestCandidate[] = [];
  for (const market of cfg.markets) {
    const ref = match.prematch[cfg.reference]?.[market];
    if (!ref) continue;
    const refOver = overround(ref);
    if (refOver < minOver || refOver > maxOver) continue;
    const fair = devigOdds(ref, cfg.devig);
    const closingRef = match.closing[cfg.reference]?.[market];
    const closingFair = closingRef ? devigOdds(closingRef, cfg.devig) : undefined;
    const winner = winningSelection(match, market);
    const selections = MARKET_SELECTIONS[market];

    for (const book of cfg.books) {
      if (book === cfg.reference) continue;
      const prices = match.prematch[book]?.[market];
      if (!prices) continue;
      prices.forEach((odds, i) => {
        const fairProb = fair[i]!;
        const edge = fairProb * odds - 1;
        if (edge <= 0) return;
        const closingFairProb = closingFair?.[i];
        out.push({
          eventId: match.id,
          kickoff: match.kickoff,
          league: match.league,
          market,
          selection: selections[i]!,
          book,
          odds,
          fairProb,
          edge,
          season: match.season,
          date: match.date,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          score: `${match.homeGoals}-${match.awayGoals}`,
          won: i === winner,
          ...(closingFairProb !== undefined
            ? { closingFairProb, clv: odds * closingFairProb - 1 }
            : {}),
        });
      });
    }
  }
  return out;
}

export function buildCandidates(
  matches: HistoricalMatch[],
  cfg: CandidateConfig,
): BacktestCandidate[] {
  return matches.flatMap((m) => candidatesForMatch(m, cfg));
}
