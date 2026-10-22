import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults on an empty env', () => {
    const c = loadConfig({});
    expect(c.oddsProvider).toBe('mock'); // no key => mock
    expect(c.pollIntervalSeconds).toBe(86400); // once a day (free-tier-safe)
    expect(c.regions).toEqual(['eu']);
    expect(c.taxRate).toBeCloseTo(0.2, 6);
    expect(c.defaultBankroll).toBe(100);
    expect(c.maxLegOdds).toBe(0); // no cap by default
    expect(c.minTimeToEventMinutes).toBe(0); // off by default
  });

  it('parses csv lists and numbers', () => {
    const c = loadConfig({ SPORTS: 'soccer,tennis', MIN_ARB_MARGIN: '0.02', STAKE_ROUNDING: '5' });
    expect(c.sports).toEqual(['soccer', 'tennis']);
    expect(c.minArbMargin).toBeCloseTo(0.02, 6);
    expect(c.stakeRounding).toBe(5);
  });

  it('uses theoddsapi when a key is present', () => {
    const c = loadConfig({ ODDS_PROVIDER: 'theoddsapi', ODDS_API_KEY: 'abc' });
    expect(c.oddsProvider).toBe('theoddsapi');
    expect(c.oddsApiKey).toBe('abc');
  });

  it('falls back to mock when theoddsapi is requested but no key is set', () => {
    const c = loadConfig({ ODDS_PROVIDER: 'theoddsapi' });
    expect(c.oddsProvider).toBe('mock');
    expect(c.oddsApiKey).toBeUndefined();
  });

  it('selects oddspapi when requested with an OddsPapi key', () => {
    const c = loadConfig({ ODDS_PROVIDER: 'oddspapi', ODDSPAPI_API_KEY: 'op-key' });
    expect(c.oddsProvider).toBe('oddspapi');
    expect(c.oddsPapiApiKey).toBe('op-key');
  });

  it('parses phase-1 env vars with sane defaults', () => {
    const c = loadConfig({});
    expect(c.stakeRounding).toBe(0.1);
    expect(c.notifyMinValueEdge).toBe(0.03);
    expect(c.oddsPapiTournamentIds).toEqual([]);
    expect(c.oddsPapiMaxTournaments).toBe(5);
    expect(c.telegramBotToken).toBeUndefined();
    expect(c.telegramChatId).toBeUndefined();
    expect(c.maxPriceAgeHours).toBe(48);
    expect(loadConfig({ MAX_PRICE_AGE_HOURS: '6' }).maxPriceAgeHours).toBe(6);
    expect(loadConfig({ MAX_PRICE_AGE_HOURS: '0' }).maxPriceAgeHours).toBe(0); // off
  });

  it('parses tournament ids and telegram settings', () => {
    const c = loadConfig({
      ODDSPAPI_TOURNAMENTS: '46, 81,notanum',
      ODDSPAPI_MAX_TOURNAMENTS: '8',
      TELEGRAM_BOT_TOKEN: 'tok',
      TELEGRAM_CHAT_ID: '123',
      NOTIFY_MIN_VALUE_EDGE: '0.05',
    });
    expect(c.oddsPapiTournamentIds).toEqual([46, 81]);
    expect(c.oddsPapiMaxTournaments).toBe(8);
    expect(c.telegramBotToken).toBe('tok');
    expect(c.telegramChatId).toBe('123');
    expect(c.notifyMinValueEdge).toBeCloseTo(0.05);
  });

  // Regression for general-1: empty/whitespace numeric env vars must use the fallback, not coerce to 0.
  it('uses fallbacks for empty / whitespace numeric env vars', () => {
    const c = loadConfig({
      POLL_INTERVAL_SECONDS: '',
      STAKE_ROUNDING: '   ',
      DEFAULT_BANKROLL: '',
      TAX_RATE: '',
    });
    expect(c.pollIntervalSeconds).toBe(86400);
    expect(c.stakeRounding).toBe(0.1);
    expect(c.defaultBankroll).toBe(100);
    expect(c.taxRate).toBeCloseTo(0.2, 6);
  });

  // Regression for general-2: out-of-range / non-finite values must be rejected to the fallback.
  it('rejects nonsensical numeric env values to the fallback', () => {
    const c = loadConfig({
      POLL_INTERVAL_SECONDS: '0', // not positive -> 86400
      DEFAULT_BANKROLL: '-50', // negative -> 100
      TAX_RATE: '2', // > 1 -> 0.2
      PORT: 'NaN', // non-numeric -> 8787
    });
    expect(c.pollIntervalSeconds).toBe(86400);
    expect(c.defaultBankroll).toBe(100);
    expect(c.taxRate).toBeCloseTo(0.2, 6);
    expect(c.port).toBe(8787);
  });

  // stakeRounding=0 is a legitimate "no rounding" value and must be preserved.
  it('preserves stakeRounding=0 (no rounding)', () => {
    expect(loadConfig({ STAKE_ROUNDING: '0' }).stakeRounding).toBe(0);
  });
});
