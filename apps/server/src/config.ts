import { z } from 'zod';

export interface Config {
  oddsProvider: 'theoddsapi' | 'mock' | 'oddspapi';
  oddsApiKey?: string;
  oddsPapiApiKey?: string;
  pollIntervalSeconds: number;
  sports: string[];
  regions: string[];
  minArbMargin: number;
  minValueEdge: number;
  maxLegOdds: number; // ignore book offers above this (longshot artifacts); 0 = no cap
  minTimeToEventMinutes: number; // skip events starting within this many minutes / in-play; 0 = off
  taxRate: number;
  defaultBankroll: number;
  stakeRounding: number;
  port: number;
  databaseUrl: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyMinValueEdge: number; // notify on new value bets at/above this edge
  oddsPapiTournamentIds: number[]; // pinned tournaments ([] = busiest-first discovery)
  oddsPapiMaxTournaments: number;
  /** Ignore book prices whose feed timestamp is older than this (stale-line guard). 0 = off. */
  maxPriceAgeHours: number;
}

const csv = (s: string | undefined, fallback: string[]) =>
  s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : fallback;

const posInt = z.coerce.number().int().positive(); // counts: interval seconds, port
const positive = z.coerce.number().finite().positive(); // money: bankroll
const nonneg = z.coerce.number().finite().nonnegative(); // thresholds, rounding (0 = none)
const ratio01 = z.coerce.number().finite().min(0).max(1); // tax rate

/** Parse a numeric env var with a zod schema. Empty/whitespace/invalid/out-of-range -> fallback. */
function numEnv(raw: string | undefined, schema: z.ZodType<number>, fallback: number): number {
  const t = raw?.trim();
  if (!t) return fallback;
  const r = schema.safeParse(t);
  return r.success ? r.data : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const key = env.ODDS_API_KEY?.trim() || undefined;
  const oddsPapiKey = env.ODDSPAPI_API_KEY?.trim() || undefined;
  // oddspapi when explicitly selected + keyed; else theoddsapi if keyed; else mock (keyless dev).
  const oddsProvider: Config['oddsProvider'] =
    env.ODDS_PROVIDER === 'oddspapi' && oddsPapiKey
      ? 'oddspapi'
      : key && env.ODDS_PROVIDER !== 'mock'
        ? 'theoddsapi'
        : 'mock';
  return {
    oddsProvider,
    oddsApiKey: key,
    oddsPapiApiKey: oddsPapiKey,
    // Default once a day (86400s) — free-tier-safe. Use the "Search now" button for ad-hoc refreshes.
    pollIntervalSeconds: numEnv(env.POLL_INTERVAL_SECONDS, posInt, 86400),
    sports: csv(env.SPORTS, ['soccer_fifa_world_cup']),
    regions: csv(env.REGIONS, ['eu']),
    minArbMargin: numEnv(env.MIN_ARB_MARGIN, nonneg, 0.01),
    minValueEdge: numEnv(env.MIN_VALUE_EDGE, nonneg, 0.02),
    maxLegOdds: numEnv(env.MAX_LEG_ODDS, nonneg, 0),
    minTimeToEventMinutes: numEnv(env.MIN_TIME_TO_EVENT_MINUTES, nonneg, 0),
    taxRate: numEnv(env.TAX_RATE, ratio01, 0.2),
    defaultBankroll: numEnv(env.DEFAULT_BANKROLL, positive, 100),
    // 0.1 default: €1 rounding eats most of a 1–1.5% arb margin at small bankrolls.
    stakeRounding: numEnv(env.STAKE_ROUNDING, nonneg, 0.1),
    port: numEnv(env.PORT, posInt, 8787),
    databaseUrl: env.DATABASE_URL?.trim() || './data/quest.sqlite',
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    telegramChatId: env.TELEGRAM_CHAT_ID?.trim() || undefined,
    notifyMinValueEdge: numEnv(env.NOTIFY_MIN_VALUE_EDGE, nonneg, 0.03),
    oddsPapiTournamentIds: csv(env.ODDSPAPI_TOURNAMENTS, [])
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
    oddsPapiMaxTournaments: numEnv(env.ODDSPAPI_MAX_TOURNAMENTS, posInt, 5),
    // 48h default: the June sample showed 7bet lines 50–98h old that produced phantom arbs.
    maxPriceAgeHours: numEnv(env.MAX_PRICE_AGE_HOURS, nonneg, 48),
  };
}
