/** Markets the backtest understands. Selection order is fixed per market (see MARKET_SELECTIONS). */
export type MarketKey = '1x2' | 'ou25';

export const MARKET_SELECTIONS: Record<MarketKey, readonly string[]> = {
  '1x2': ['Home', 'Draw', 'Away'],
  ou25: ['Over', 'Under'],
};

/** One book's complete prices per market, in MARKET_SELECTIONS order (e.g. 1x2 = [H, D, A]). */
export type BookMarkets = Partial<Record<MarketKey, number[]>>;

/**
 * A played match from football-data.co.uk with pre-match and closing prices per book.
 * Book codes are football-data's (B365, BW, BV, BFD, PS = Pinnacle, BFE = Betfair Exchange,
 * Max/Avg = market max/average, …). Pinnacle's over/under columns ("P>2.5") map to code PS.
 */
export interface HistoricalMatch {
  id: string; // `${league}:${date}:${homeTeam}:${awayTeam}`
  league: string; // football-data division code, e.g. 'E0'
  season: string; // e.g. '2526'
  date: string; // 'YYYY-MM-DD'
  kickoff: string; // 'YYYY-MM-DDTHH:MM' UK local time ('T00:00' when the CSV has no time)
  homeTeam: string;
  awayTeam: string;
  homeGoals: number; // full time
  awayGoals: number;
  /** Prices collected before the match (football-data: Fri pm for weekend, Tue for midweek). */
  prematch: Record<string, BookMarkets>;
  /** Closing prices (at kickoff). */
  closing: Record<string, BookMarkets>;
}

/** Index into MARKET_SELECTIONS[market] of the selection that won. */
export function winningSelection(match: HistoricalMatch, market: MarketKey): number {
  if (market === '1x2') {
    if (match.homeGoals > match.awayGoals) return 0;
    return match.homeGoals === match.awayGoals ? 1 : 2;
  }
  return match.homeGoals + match.awayGoals > 2.5 ? 0 : 1;
}
