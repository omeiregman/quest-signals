import { describe, expect, it } from 'vitest';
import { detectArbitrage, detectValue } from '@quest/core';
import { MockOddsProvider } from './mock';

describe('MockOddsProvider', () => {
  it('has the name "mock"', () => {
    expect(new MockOddsProvider().name).toBe('mock');
  });

  it('returns >=3 markets for the world cup sport', async () => {
    const provider = new MockOddsProvider();
    const markets = await provider.fetchOdds({
      sport: 'soccer_fifa_world_cup',
      regions: ['eu'],
      markets: ['h2h'],
    });
    expect(markets.length).toBeGreaterThanOrEqual(3);
    for (const m of markets) {
      expect(m.sportKey).toBe('soccer_fifa_world_cup');
      expect(m.marketType).toBe('h2h');
    }
  });

  it('feeds at least one market that detectArbitrage finds non-null', async () => {
    const markets = await new MockOddsProvider().fetchOdds({
      sport: 'soccer_fifa_world_cup',
      regions: ['eu'],
      markets: ['h2h'],
    });
    const arbs = markets
      .map((m) => detectArbitrage(m, { minMargin: 0.01 }))
      .filter((o) => o !== null);
    expect(arbs.length).toBeGreaterThanOrEqual(1);
  });

  it('feeds at least one market that detectValue yields >=1 value bet vs Pinnacle', async () => {
    const markets = await new MockOddsProvider().fetchOdds({
      sport: 'soccer_fifa_world_cup',
      regions: ['eu'],
      markets: ['h2h'],
    });
    const totalValueBets = markets
      .map((m) => detectValue(m, { referenceBook: 'Pinnacle', minEdge: 0.02 }))
      .reduce((sum, opps) => sum + opps.length, 0);
    expect(totalValueBets).toBeGreaterThanOrEqual(1);
  });

  it('filters by sport key, returning empty for an unknown sport', async () => {
    const markets = await new MockOddsProvider().fetchOdds({
      sport: 'basketball_nba',
      regions: ['eu'],
      markets: ['h2h'],
    });
    expect(markets).toEqual([]);
  });

  it('returns all parsed markets when no sport filter is given', async () => {
    const markets = await new MockOddsProvider().fetchOdds({
      sport: '',
      regions: ['eu'],
      markets: ['h2h'],
    });
    expect(markets.length).toBeGreaterThanOrEqual(3);
  });
});
