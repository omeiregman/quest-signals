import {
  buildSlate,
  expectedSlateReturn,
  probNoWinner,
  slateCoverage,
  stakeSlate,
  type SlateRules,
} from '@quest/core';
import type { BacktestCandidate } from './candidates';

/** Monday ('YYYY-MM-DD') of the ISO week containing `date`. A round = one Mon–Sun week. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Every week that has at least one match, ascending — the timeline the bankroll walks. */
export function roundStarts(dates: string[]): string[] {
  return [...new Set(dates.map(weekStart))].sort();
}

export interface RoundPick extends BacktestCandidate {
  share: number; // fraction of the round's capital staked on this pick
  returned: number; // per unit of round capital: share × odds if won, else 0
}

export interface RoundResult {
  start: string; // Monday of the week
  /** Distinct matches with a candidate inside the edge/odds bands: how many bets were on offer. */
  available: number;
  picks: RoundPick[];
  coverage: number;
  winners: number;
  /** Returned per unit staked (0 = every pick lost). Meaningless when picks is empty. */
  multiple: number;
  probNoWinner: number;
  expectedMultiple: number;
}

function inBands(c: BacktestCandidate, rules: SlateRules): boolean {
  return (
    c.edge >= rules.minEdge &&
    (rules.maxEdge === undefined || c.edge <= rules.maxEdge) &&
    c.odds >= rules.minOdds &&
    c.odds <= rules.maxOdds
  );
}

/** Build, stake (1 unit) and settle one slate per week. Weeks without a slate have no picks. */
export function runRounds(
  candidates: BacktestCandidate[],
  rules: SlateRules,
  starts: string[],
): RoundResult[] {
  const byWeek = new Map<string, BacktestCandidate[]>();
  for (const c of candidates) {
    const key = weekStart(c.date);
    const list = byWeek.get(key);
    if (list) list.push(c);
    else byWeek.set(key, [c]);
  }

  return starts.map((start) => {
    const pool = byWeek.get(start) ?? [];
    const available = new Set(pool.filter((c) => inBands(c, rules)).map((c) => c.eventId)).size;
    const staked = stakeSlate(buildSlate(pool, rules), 1, rules.staking);
    const picks: RoundPick[] = staked.map(({ stake, returnIfWin, ...c }) => ({
      ...c,
      share: stake,
      returned: c.won ? returnIfWin : 0,
    }));
    return {
      start,
      available,
      picks,
      coverage: slateCoverage(
        picks.map((p) => p.odds),
        rules.staking,
      ),
      winners: picks.filter((p) => p.won).length,
      multiple: picks.reduce((a, p) => a + p.returned, 0),
      probNoWinner: probNoWinner(picks),
      expectedMultiple: expectedSlateReturn(staked),
    };
  });
}

export type BudgetPolicy =
  | { kind: 'fixed'; amount: number } // stake this much per week (or whatever is left)
  | { kind: 'fraction'; fraction: number } // stake this share of the current bankroll
  | { kind: 'perPick'; amount: number } // this much per bet: the week's budget grows with its picks
  | { kind: 'perPickFraction'; fraction: number }; // this share of the bankroll per bet

function weekBudget(policy: BudgetPolicy, bankroll: number, picks: number): number {
  switch (policy.kind) {
    case 'fixed':
      return policy.amount;
    case 'fraction':
      return bankroll * policy.fraction;
    case 'perPick':
      return policy.amount * picks;
    case 'perPickFraction':
      return bankroll * policy.fraction * picks;
  }
}

export interface BankrollWeek {
  start: string;
  before: number;
  staked: number;
  returned: number;
  after: number;
}

export interface BankrollPath {
  weeks: BankrollWeek[];
  final: number;
  peak: number;
  /** Largest peak-to-trough fall, as a fraction of the peak. */
  maxDrawdown: number;
  low: number;
  /** Bankroll fell below `minStake` and play stopped. */
  busted: boolean;
}

export function simulateBankroll(
  rounds: RoundResult[],
  startBankroll: number,
  policy: BudgetPolicy,
  minStake = 1,
): BankrollPath {
  let bankroll = startBankroll;
  let peak = startBankroll;
  let low = startBankroll;
  let maxDrawdown = 0;
  let busted = false;
  const weeks: BankrollWeek[] = [];

  for (const r of rounds) {
    const before = bankroll;
    const wanted = weekBudget(policy, before, r.picks.length);
    const staked = r.picks.length > 0 && before >= minStake ? Math.min(wanted, before) : 0;
    if (r.picks.length > 0 && before < minStake) busted = true;
    const returned = staked * r.multiple;
    bankroll = before - staked + returned;
    peak = Math.max(peak, bankroll);
    low = Math.min(low, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - bankroll) / peak : 0);
    weeks.push({ start: r.start, before, staked, returned, after: bankroll });
  }
  return { weeks, final: bankroll, peak, maxDrawdown, low, busted };
}

export interface StrategyMetrics {
  rounds: number;
  roundsPlayed: number;
  picks: number;
  avgPicks: number;
  avgOdds: number;
  pickHitRate: number;
  /** Share of played rounds with at least one winner. */
  roundsWithWinner: number;
  /** Share of played rounds returning at least the round's capital. */
  roundsCovered: number;
  /** Mean (multiple − 1) over played rounds: profit per unit staked per round. */
  roi: number;
  /** Standard error of `roi`. */
  roiSe: number;
  /** Model-expected ROI from the de-vigged reference (what the edges promise). */
  expectedRoi: number;
  avgEdge: number;
  /** Mean CLV over picks with closing prices; null when none. */
  avgClv: number | null;
  clvSe: number | null;
  clvPositiveShare: number | null;
  /** Most consecutive played rounds returning less than the capital. */
  longestLosingRun: number;
  /** Most consecutive played rounds with no winner at all. */
  longestWipeoutRun: number;
}

function meanSe(xs: number[]): { mean: number; se: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, se: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, se: 0 };
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n) };
}

export function strategyMetrics(rounds: RoundResult[]): StrategyMetrics {
  const played = rounds.filter((r) => r.picks.length > 0);
  const picks = played.flatMap((r) => r.picks);
  const roi = meanSe(played.map((r) => r.multiple - 1));
  const clvs = picks.flatMap((p) => (p.clv === undefined ? [] : [p.clv]));
  const clv = meanSe(clvs);

  let losingRun = 0;
  let wipeRun = 0;
  let longestLosingRun = 0;
  let longestWipeoutRun = 0;
  for (const r of played) {
    losingRun = r.multiple < 1 - 1e-9 ? losingRun + 1 : 0;
    wipeRun = r.winners === 0 ? wipeRun + 1 : 0;
    longestLosingRun = Math.max(longestLosingRun, losingRun);
    longestWipeoutRun = Math.max(longestWipeoutRun, wipeRun);
  }

  const n = played.length || 1;
  const p = picks.length || 1;
  return {
    rounds: rounds.length,
    roundsPlayed: played.length,
    picks: picks.length,
    avgPicks: picks.length / n,
    avgOdds: picks.reduce((a, x) => a + x.odds, 0) / p,
    pickHitRate: picks.filter((x) => x.won).length / p,
    roundsWithWinner: played.filter((r) => r.winners > 0).length / n,
    roundsCovered: played.filter((r) => r.multiple >= 1 - 1e-9).length / n,
    roi: roi.mean,
    roiSe: roi.se,
    expectedRoi: played.reduce((a, r) => a + r.expectedMultiple - 1, 0) / n,
    avgEdge: picks.reduce((a, x) => a + x.edge, 0) / p,
    avgClv: clvs.length ? clv.mean : null,
    clvSe: clvs.length ? clv.se : null,
    clvPositiveShare: clvs.length ? clvs.filter((x) => x > 0).length / clvs.length : null,
    longestLosingRun,
    longestWipeoutRun,
  };
}
