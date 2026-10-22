import { devig } from './value';

/**
 * Closing-line value of a placed bet: placed odds vs the de-vigged fair closing price.
 * `closingPrices` are the reference book's closing decimal odds for ALL outcomes of the
 * market; `outcomeIndex` is the outcome the bet was on. CLV = placedOdds × fairProb − 1.
 * Positive CLV over a sample of bets is the standard evidence of a real edge.
 */
export function clvForLeg(
  placedOdds: number,
  closingPrices: number[],
  outcomeIndex: number,
): number {
  const probs = devig(closingPrices);
  const p = probs[outcomeIndex];
  if (p === undefined) throw new RangeError('outcomeIndex out of range for closingPrices');
  return placedOdds * p - 1;
}
