export type OddsFormat = 'decimal' | 'american' | 'fractional';
export type MarketType = 'h2h'; // v1; enum extensible later
export type OpportunityType = 'arb' | 'value';
export type OpportunityStatus = 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';

export interface BookOdds {
  book: string;
  price: number; // decimal
  link?: string; // bookmaker deep link to the event page (e.g. OddsPapi fixturePath)
  updatedAt?: string; // ISO time the book last changed this price (feed-reported); absent = unknown
}

/** Shared freshness gate for detection: drop prices older than `maxAgeMs` relative to `now`. */
export interface FreshnessOpts {
  maxAgeMs?: number; // undefined/0 = no age filtering
  now?: number; // epoch ms; defaults to Date.now()
}

export interface NormalizedOutcome {
  name: string; // normalized: 'Home' | 'Draw' | 'Away' or team name
  books: BookOdds[];
}

export interface NormalizedMarket {
  sportKey: string;
  eventId: string;
  homeTeam?: string;
  awayTeam?: string;
  commenceTime: string; // ISO 8601
  marketType: MarketType;
  outcomes: NormalizedOutcome[];
}

export interface ArbLeg {
  outcome: string;
  book: string;
  odds: number;
  impliedProb: number;
  link?: string;
  updatedAt?: string;
}

export interface ArbOpportunity {
  type: 'arb';
  sportKey: string;
  eventId: string;
  commenceTime: string;
  marketType: MarketType;
  legs: ArbLeg[];
  totalImplied: number; // Σ 1/best_odds_i (< 1 for an arb)
  margin: number; // 1 - totalImplied
}

export interface StakeLeg {
  outcome: string;
  book: string;
  odds: number;
  stake: number;
}

export interface PerOutcomeResult {
  outcome: string;
  return: number;
  grossProfit: number;
}

export interface StakeSplitResult {
  requestedStake: number;
  totalStake: number; // Σ rounded leg stakes
  legs: StakeLeg[];
  guaranteedReturn: number; // min over outcomes of stake_k * odds_k
  grossProfit: number; // worst-case (guaranteedReturn - totalStake) — the headline number
  perOutcome: PerOutcomeResult[];
}

export interface ValueOpportunity {
  type: 'value';
  sportKey: string;
  eventId: string;
  commenceTime: string;
  marketType: MarketType;
  outcome: string;
  book: string;
  softOdds: number;
  referenceBook: string;
  trueProb: number;
  edge: number; // trueProb * softOdds - 1
  link?: string;
  updatedAt?: string; // soft book's price timestamp
  referenceUpdatedAt?: string; // reference book's price timestamp for this outcome
}

export interface RegionProfile {
  id: string; // 'eu' | 'se' | 'lt'
  apiRegions: string[]; // The Odds API region params
  bookAllowlist?: string[]; // undefined/empty => no filtering (all books)
  referenceBook?: string; // sharp reference for value detection
}

// Stake-calculation options. Tax is intentionally NOT here: tax never affects
// arbitrage validity or the headline (gross) profit. It is a display-only
// annotation computed separately via netAfterTax(), configurable per region.
export interface StakeOpts {
  rounding: number; // stake increment; <= 0 means no rounding
}

// Implemented in Plan 2 by TheOddsApiProvider / MockOddsProvider.
export interface OddsProvider {
  readonly name: string;
  fetchOdds(params: {
    sport: string;
    regions: string[];
    markets: MarketType[];
  }): Promise<NormalizedMarket[]>;
  /**
   * Optional capability: fetch fresh odds for ONE known event (cheap re-check before
   * placing; also used for closing-line capture). Providers that can't leave it undefined.
   * `meta` carries names/kickoff the caller already knows (odds endpoints may omit them).
   */
  recheckEvent?(params: {
    sport: string;
    eventId: string;
    meta?: { homeTeam?: string; awayTeam?: string; commenceTime?: string };
  }): Promise<NormalizedMarket | null>;
}
