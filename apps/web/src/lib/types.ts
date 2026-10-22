export type OpportunityType = 'arb' | 'value';
export type OpportunityStatus = 'new' | 'accepted' | 'bet_placed' | 'skipped' | 'archived';
export type LegResult = 'settled' | 'voided' | 'rejected';

export interface Leg {
  id: number;
  outcome: string;
  book: string;
  odds: number;
  impliedProb: number | null;
  recommendedStake: number | null;
  deepLink?: string | null;
  priceUpdatedAt?: string | null;
}

export interface Opportunity {
  id: number;
  type: OpportunityType;
  sportKey: string;
  eventId: string;
  eventName: string | null;
  commenceTime: string;
  marketType: string;
  regionProfile: string;
  margin: number | null;
  edge: number | null;
  referenceBook: string | null;
  defaultBankrollProfit: number | null; // GROSS
  status: OpportunityStatus;
  detectedAt: string;
  lastSeenAt: string;
  legs: Leg[];
}

export interface SportStat {
  sportKey: string;
  count: number;
  avgMargin: number | null;
  avgSurvivalSeconds: number;
}

export interface ClvStats {
  trackedLegs: number;
  avgClv: number | null;
}

export interface Stats {
  totalOpportunities: number;
  avgMargin: number | null;
  avgSurvivalSeconds: number;
  bySport: SportStat[];
  clv: ClvStats;
}

export interface RegionProfileDto {
  id: string;
  apiRegions: string[];
  bookAllowlist?: string[];
  referenceBook?: string;
}

export interface Meta {
  lastPoll: string | null;
  config: {
    defaultBankroll: number;
    taxRate: number;
    stakeRounding: number;
    regions: string[];
    sports: string[];
    oddsProvider: string;
    supportsRecheck: boolean;
  };
  regionProfiles: Record<string, RegionProfileDto>;
}

export interface RecheckResult {
  verdict: 'holds' | 'degraded' | 'gone';
  margin?: number;
  edge?: number;
  legs?: { outcome: string; book: string; odds: number }[];
  checkedAt: string;
}

export interface PlacementLegInput {
  outcome: string;
  book: string;
  actualStake: number;
  actualOdds: number;
}

export interface StatusBody {
  status: OpportunityStatus;
  placement?: {
    totalStaked: number;
    predictedProfit?: number;
    legs: PlacementLegInput[];
  };
}

export interface SettlementBody {
  winningSelection?: string;
  realizedProfit?: number;
  predictedProfit?: number;
  notes?: string;
  autoFilled?: boolean;
  legs: { outcome: string; result: LegResult }[];
}

export interface PollResult {
  status: 'ok' | 'skipped' | 'error';
  result?: { marketsFetched: number; arbsFound: number; valuesFound: number; errors: number };
  error?: string;
}

export interface OpportunityQuery {
  status?: OpportunityStatus;
  type?: OpportunityType;
  sport?: string;
  region?: string;
  minMargin?: number;
  sort?: 'timeToEvent';
}
