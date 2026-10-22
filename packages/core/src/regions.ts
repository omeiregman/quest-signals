import type { RegionProfile } from './types';

export const REGION_PROFILES: Record<string, RegionProfile> = {
  // Broad EU: widest net, no fundability filter, sharp reference for value bets.
  eu: { id: 'eu', apiRegions: ['eu', 'uk'], referenceBook: 'Pinnacle' },
  // Sweden: SE-licensed soft books (research §2/§3).
  se: {
    id: 'se',
    apiRegions: ['eu'],
    bookAllowlist: [
      'Unibet',
      'Betsson',
      'bet365',
      'Betway',
      'LeoVegas',
      'NordicBet',
      'Betsafe',
      'Expekt',
    ],
    referenceBook: 'Pinnacle',
  },
  // Lithuania: only Betsson overlaps The-Odds-API coverage -> value-focused (research §3).
  lt: { id: 'lt', apiRegions: ['eu'], bookAllowlist: ['Betsson'], referenceBook: 'Pinnacle' },

  // --- OddsPapi profiles (book identity = OddsPapi slug; apiRegions unused by OddsPapi) ---
  // Lithuania arbitrage: 7bet.lt + Betsson are independent, fundable, and both on OddsPapi.
  'lt-arb': {
    id: 'lt-arb',
    apiRegions: [],
    bookAllowlist: ['7bet.lt', 'betsson'],
    referenceBook: 'pinnacle',
  },
  // Nigeria arbitrage: SportyBet + MSport (independent), both on OddsPapi.
  'ng-arb': {
    id: 'ng-arb',
    apiRegions: [],
    bookAllowlist: ['sportybet', 'msport'],
    referenceBook: 'pinnacle',
  },
};

export function getRegionProfile(id: string): RegionProfile {
  return REGION_PROFILES[id] ?? REGION_PROFILES.eu!;
}
