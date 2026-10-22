import type { ArbOpportunity, ValueOpportunity } from './types';

export function dedupeKey(opp: ArbOpportunity | ValueOpportunity): string {
  if (opp.type === 'arb') {
    const legs = [...opp.legs]
      .map((l) => `${l.outcome}:${l.book}`)
      .sort()
      .join(',');
    return `arb|${opp.sportKey}|${opp.eventId}|${opp.marketType}|${legs}`;
  }
  return `value|${opp.sportKey}|${opp.eventId}|${opp.marketType}|${opp.outcome}|${opp.book}|${opp.referenceBook}`;
}
