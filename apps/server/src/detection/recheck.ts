import { detectArbitrage, detectValue, getRegionProfile } from '@quest/core';
import type { OddsProvider } from '@quest/core';
import { getOpportunity, refreshOpportunityOdds, type QuestDb } from '@quest/db';
import type { Config } from '../config';
import type { Clock } from '../clock';

export interface RecheckDeps {
  db: QuestDb;
  provider: OddsProvider;
  config: Config;
  clock: Clock;
}

export interface RecheckLeg {
  outcome: string;
  book: string;
  odds: number;
}

export interface RecheckResult {
  verdict: 'holds' | 'degraded' | 'gone';
  margin?: number;
  edge?: number;
  legs?: RecheckLeg[];
  checkedAt: string;
}

/**
 * Fresh-odds re-check of one opportunity (1 provider request): does the arb/edge still
 * exist right now? Also refreshes the stored legs so the UI shows current prices.
 * Returns null if the opportunity doesn't exist.
 */
export async function recheckOpportunity(
  deps: RecheckDeps,
  id: number,
): Promise<RecheckResult | null> {
  const { db, provider, config, clock } = deps;
  const opp = getOpportunity(db, id);
  if (!opp) return null;
  const checkedAt = clock();
  if (!provider.recheckEvent) return { verdict: 'gone', checkedAt };

  const [homeTeam, awayTeam] = (opp.eventName ?? '').split(' vs ');
  const fresh = await provider
    .recheckEvent({
      sport: opp.sportKey,
      eventId: opp.eventId,
      meta: {
        ...(homeTeam ? { homeTeam } : {}),
        ...(awayTeam ? { awayTeam } : {}),
        commenceTime: opp.commenceTime,
      },
    })
    .catch(() => null);
  if (!fresh) return { verdict: 'gone', checkedAt };

  const profile = getRegionProfile(opp.regionProfile);
  const maxOdds = config.maxLegOdds > 0 ? config.maxLegOdds : undefined;
  const freshness = {
    maxAgeMs: config.maxPriceAgeHours * 3_600_000,
    now: Date.parse(checkedAt),
  };

  if (opp.type === 'arb') {
    const arb = detectArbitrage(fresh, {
      minMargin: 0,
      ...(profile.bookAllowlist ? { bookAllowlist: profile.bookAllowlist } : {}),
      ...(maxOdds ? { maxOdds } : {}),
      ...freshness,
    });
    if (!arb || arb.margin <= 0) return { verdict: 'gone', checkedAt };
    refreshOpportunityOdds(db, id, {
      margin: arb.margin,
      lastSeenAt: checkedAt,
      legs: arb.legs.map((l) => ({
        outcome: l.outcome,
        book: l.book,
        odds: l.odds,
        impliedProb: l.impliedProb,
        deepLink: l.link ?? null,
        priceUpdatedAt: l.updatedAt ?? null,
      })),
    });
    return {
      verdict: arb.margin >= config.minArbMargin ? 'holds' : 'degraded',
      margin: arb.margin,
      legs: arb.legs.map((l) => ({ outcome: l.outcome, book: l.book, odds: l.odds })),
      checkedAt,
    };
  }

  const leg = opp.legs[0];
  const refBook = opp.referenceBook;
  if (!leg || !refBook) return { verdict: 'gone', checkedAt };
  const values = detectValue(fresh, {
    referenceBook: refBook,
    minEdge: -1, // return every priced outcome; thresholds are applied below
    ...(profile.bookAllowlist ? { bookAllowlist: profile.bookAllowlist } : {}),
    ...(maxOdds ? { maxOdds } : {}),
    ...freshness,
  });
  const match = values.find((v) => v.outcome === leg.outcome && v.book === leg.book);
  if (!match || match.edge <= 0) return { verdict: 'gone', checkedAt };
  refreshOpportunityOdds(db, id, {
    edge: match.edge,
    lastSeenAt: checkedAt,
    legs: [
      {
        outcome: match.outcome,
        book: match.book,
        odds: match.softOdds,
        deepLink: match.link ?? null,
        priceUpdatedAt: match.updatedAt ?? null,
      },
    ],
  });
  return {
    verdict: match.edge >= config.minValueEdge ? 'holds' : 'degraded',
    edge: match.edge,
    legs: [{ outcome: match.outcome, book: match.book, odds: match.softOdds }],
    checkedAt,
  };
}
