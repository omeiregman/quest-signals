import {
  calcStakeSplit,
  dedupeKey,
  detectArbitrage,
  detectValue,
  getRegionProfile,
} from '@quest/core';
import type { MarketType, OddsProvider } from '@quest/core';
import {
  archiveExpired,
  finishPollRun,
  listPlacedStartingBefore,
  oddsSnapshots,
  recordClosingOdds,
  startPollRun,
  upsertOpportunity,
  type QuestDb,
} from '@quest/db';
import type { Config } from '../config';
import type { Clock } from '../clock';
import type { Notifier, NotifiableOpportunity } from '../notify/telegram';

export interface DetectionDeps {
  db: QuestDb;
  provider: OddsProvider;
  config: Config;
  clock: Clock;
  notifier?: Notifier;
}

export interface DetectionSummary {
  pollRunId: number;
  marketsFetched: number;
  arbsFound: number;
  valuesFound: number;
  /** Number of (sport × region) fetches that failed (e.g. provider rate-limit/error). */
  errors: number;
  creditsUsed?: number;
  /** Expired new/accepted opportunities auto-archived this run. */
  archived?: number;
  /** Placed bets whose closing odds were captured this run (CLV loop). */
  clvCaptured?: number;
  /** Markets each book quoted (after inactive/suspended filtering). A fundable book at 0 = dead feed. */
  bookCoverage?: Record<string, number>;
}

// Feed-health warnings are rate-limited per book for the process lifetime (polls are hours apart).
const FEED_WARNING_INTERVAL_MS = 12 * 3_600_000;
const lastFeedWarningAt = new Map<string, number>();

const H2H: MarketType[] = ['h2h'];

export async function runDetection(deps: DetectionDeps): Promise<DetectionSummary> {
  const { db, provider, config, clock, notifier } = deps;

  let pollRunId = 0;
  let marketsFetched = 0;
  let arbsFound = 0;
  let valuesFound = 0;
  let errors = 0;
  let creditsUsed: number | undefined; // last provider-reported remaining quota (telemetry)
  const nowMs = Date.parse(clock());
  const maxOdds = config.maxLegOdds > 0 ? config.maxLegOdds : undefined;
  // Stale-line guard: a soft book's price that hasn't changed in days is a phantom, not an edge.
  const freshness = { maxAgeMs: config.maxPriceAgeHours * 3_600_000, now: nowMs };
  const newOpps: NotifiableOpportunity[] = []; // inserted (not re-seen) this run → notified
  const bookCoverage: Record<string, number> = {};
  const fundableBooks = new Set<string>();

  for (const sport of config.sports) {
    for (const regionId of config.regions) {
      const profile = getRegionProfile(regionId);

      pollRunId = startPollRun(db, {
        provider: provider.name,
        regionProfile: regionId,
        startedAt: clock(),
      });

      let markets;
      try {
        markets = await provider.fetchOdds({
          sport,
          regions: profile.apiRegions,
          markets: H2H,
        });
      } catch (err) {
        errors += 1;
        finishPollRun(db, pollRunId, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          finishedAt: clock(),
        });
        continue; // per-sport isolation: keep processing other sports/regions
      }

      // Capture the provider's reported remaining request quota (TheOddsApiProvider
      // exposes x-requests-remaining); stored on the poll_run as quota telemetry.
      const creditsRemaining =
        'lastRequestsRemaining' in provider
          ? ((provider as { lastRequestsRemaining: number | null }).lastRequestsRemaining ??
            undefined)
          : undefined;
      if (creditsRemaining !== undefined) creditsUsed = creditsRemaining;

      for (const b of profile.bookAllowlist ?? []) {
        fundableBooks.add(b);
        bookCoverage[b] ??= 0;
      }
      if (profile.referenceBook) bookCoverage[profile.referenceBook] ??= 0;

      for (const market of markets) {
        marketsFetched += 1;
        for (const book of new Set(market.outcomes.flatMap((o) => o.books.map((b) => b.book)))) {
          bookCoverage[book] = (bookCoverage[book] ?? 0) + 1;
        }

        // Skip in-play / too-soon events: odds churn and you can't place in time.
        if (config.minTimeToEventMinutes > 0) {
          const startMs = Date.parse(market.commenceTime);
          if (Number.isFinite(startMs) && startMs - nowMs < config.minTimeToEventMinutes * 60_000) {
            continue;
          }
        }

        db.insert(oddsSnapshots)
          .values({
            pollRunId,
            sportKey: market.sportKey,
            eventId: market.eventId,
            commenceTime: market.commenceTime,
            marketType: market.marketType,
            normalizedJson: JSON.stringify(market),
            capturedAt: clock(),
          })
          .run();

        const eventName =
          market.homeTeam && market.awayTeam
            ? `${market.homeTeam} vs ${market.awayTeam}`
            : null;

        // --- Arbitrage ---
        const arb = detectArbitrage(market, {
          minMargin: config.minArbMargin,
          bookAllowlist: profile.bookAllowlist,
          maxOdds,
          ...freshness,
        });
        if (arb) {
          const split = calcStakeSplit(arb, config.defaultBankroll, {
            rounding: config.stakeRounding,
          });
          // Gross (worst-case) profit only — tax is display-only and never recorded here.
          const defaultBankrollProfit = split.grossProfit;

          // Only surface arbs that actually profit at the default bankroll after rounding.
          if (defaultBankrollProfit > 0) {
            arbsFound += 1;
            const stakeByLeg = new Map(
              split.legs.map((l) => [`${l.outcome}|${l.book}`, l.stake] as const),
            );

            const now = clock();
            const legs = arb.legs.map((leg) => ({
              outcome: leg.outcome,
              book: leg.book,
              odds: leg.odds,
              impliedProb: leg.impliedProb,
              recommendedStake: stakeByLeg.get(`${leg.outcome}|${leg.book}`) ?? null,
              deepLink: leg.link ?? null,
              priceUpdatedAt: leg.updatedAt ?? null,
            }));
            const { inserted } = upsertOpportunity(db, {
              type: 'arb',
              sportKey: arb.sportKey,
              eventId: arb.eventId,
              eventName,
              commenceTime: arb.commenceTime,
              marketType: arb.marketType,
              regionProfile: regionId,
              margin: arb.margin,
              defaultBankrollProfit,
              dedupeKey: dedupeKey(arb),
              detectedAt: now,
              lastSeenAt: now,
              legs,
            });
            if (inserted) {
              newOpps.push({
                type: 'arb',
                eventName,
                sportKey: arb.sportKey,
                commenceTime: arb.commenceTime,
                margin: arb.margin,
                defaultBankrollProfit,
                legs,
              });
            }
          }
        }

        // --- Value ---
        if (profile.referenceBook) {
          const values = detectValue(market, {
            referenceBook: profile.referenceBook,
            minEdge: config.minValueEdge,
            bookAllowlist: profile.bookAllowlist,
            maxOdds,
            ...freshness,
          });
          for (const v of values) {
            valuesFound += 1;
            const now = clock();
            const legs = [
              {
                outcome: v.outcome,
                book: v.book,
                odds: v.softOdds,
                deepLink: v.link ?? null,
                priceUpdatedAt: v.updatedAt ?? null,
              },
            ];
            const { inserted } = upsertOpportunity(db, {
              type: 'value',
              sportKey: v.sportKey,
              eventId: v.eventId,
              eventName,
              commenceTime: v.commenceTime,
              marketType: v.marketType,
              regionProfile: regionId,
              edge: v.edge,
              referenceBook: v.referenceBook,
              dedupeKey: dedupeKey(v),
              detectedAt: now,
              lastSeenAt: now,
              legs,
            });
            if (inserted) {
              newOpps.push({
                type: 'value',
                eventName,
                sportKey: v.sportKey,
                commenceTime: v.commenceTime,
                edge: v.edge,
                legs,
              });
            }
          }
        }
      }

      finishPollRun(db, pollRunId, {
        status: 'ok',
        ...(creditsRemaining !== undefined ? { creditsUsed: creditsRemaining } : {}),
        finishedAt: clock(),
      });
    }
  }

  // Lifecycle hygiene: kicked-off events can't be placed — archive them out of the default view.
  const archived = archiveExpired(db, clock());

  // Closing-line capture: last look before kickoff for placed bets (the CLV proof loop).
  let clvCaptured = 0;
  if (provider.recheckEvent) {
    const horizon = new Date(nowMs + config.pollIntervalSeconds * 1000).toISOString();
    for (const opp of listPlacedStartingBefore(db, clock(), horizon)) {
      try {
        const [homeTeam, awayTeam] = (opp.eventName ?? '').split(' vs ');
        const fresh = await provider.recheckEvent({
          sport: opp.sportKey,
          eventId: opp.eventId,
          meta: {
            ...(homeTeam ? { homeTeam } : {}),
            ...(awayTeam ? { awayTeam } : {}),
            commenceTime: opp.commenceTime,
          },
        });
        const refBook = opp.referenceBook ?? getRegionProfile(opp.regionProfile).referenceBook;
        if (!fresh || !refBook) continue;
        const captures = fresh.outcomes
          .map((o) => ({ outcome: o.name, price: o.books.find((b) => b.book === refBook)?.price }))
          .filter((c): c is { outcome: string; price: number } => c.price !== undefined);
        if (captures.length < 2) continue; // need the full outcome set to de-vig later
        for (const c of captures) {
          recordClosingOdds(db, {
            opportunityId: opp.id,
            outcome: c.outcome,
            referenceBook: refBook,
            closingPrice: c.price,
            capturedAt: clock(),
          });
        }
        clvCaptured += 1;
      } catch (err) {
        console.warn(
          `[quest] closing-odds capture failed for opp ${opp.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  try {
    await notifier?.notifyNew(newOpps);
    // Feed health: a fundable book with zero active markets means the pair is blind on that
    // side (e.g. OddsPapi's betsson feed was fully suspended for days in Sept 2026). Say so.
    if (notifier?.enabled && errors === 0 && marketsFetched > 0) {
      const dark = [...fundableBooks].filter((b) => (bookCoverage[b] ?? 0) === 0);
      for (const book of dark) {
        const last = lastFeedWarningAt.get(book) ?? 0;
        if (nowMs - last < FEED_WARNING_INTERVAL_MS) continue;
        lastFeedWarningAt.set(book, nowMs);
        await notifier.notifyText(
          `FEED WARNING — ${book} returned 0 active markets this poll (${marketsFetched} markets fetched). ` +
            `Arbs needing ${book} are impossible until its feed recovers; value alerts continue from the other books.`,
        );
      }
    }
  } catch {
    /* notifier must never break detection */
  }

  return {
    pollRunId,
    marketsFetched,
    arbsFound,
    valuesFound,
    errors,
    ...(creditsUsed !== undefined ? { creditsUsed } : {}),
    archived,
    clvCaptured,
    bookCoverage,
  };
}
