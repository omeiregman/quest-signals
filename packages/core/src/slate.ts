/**
 * Value slate: a round (e.g. one week) of independent single value bets, staked so that a
 * single winner returns (at least) the round's capital. Pure, deterministic, no I/O.
 */

export type StakingMode = 'equal-return' | 'equal';

/** How candidates are ordered before greedy selection. */
export type SlateRanking = 'edge' | 'sharpe';

/** One bettable value candidate: a single selection at one book for one event. */
export interface SlateCandidate {
  eventId: string;
  kickoff: string; // sortable time string (ISO or local 'YYYY-MM-DDTHH:MM')
  league: string;
  market: string; // e.g. '1x2' | 'ou25'
  selection: string; // e.g. 'Home' | 'Draw' | 'Away' | 'Over' | 'Under'
  book: string;
  odds: number; // decimal price we take
  fairProb: number; // de-vigged reference probability of this selection
  edge: number; // fairProb × odds − 1
}

export interface SlateRules {
  minEdge: number;
  /** Drop edges above this (stale-line artifacts). undefined = no cap. */
  maxEdge?: number;
  minOdds: number;
  maxOdds: number;
  maxPicks: number;
  /** If fewer picks end up selected, the slate is empty (sit the round out). */
  minPicks: number;
  staking: StakingMode;
  /** Cap on slate coverage (see slateCoverage). 1 ⇒ any single winner returns ≥ the capital. */
  maxCoverage: number;
  /** Default 'edge'. 'sharpe' = edge / (odds·√(p(1−p))): edge per unit of the bet's return SD. */
  rankBy?: SlateRanking;
}

/** Float slack on the coverage cap, so e.g. nine picks @ 9.0 (Σ1/o = 1.0000000000000002) fit a cap of 1. */
const COVERAGE_EPS = 1e-9;

/**
 * Coverage S of a slate: its worst single winner returns capital / S.
 * equal-return: S = Σ 1/odds_i. equal: S = n / min(odds_i). Empty slate → 0.
 */
export function slateCoverage(odds: number[], staking: StakingMode): number {
  if (odds.length === 0) return 0;
  if (staking === 'equal') return odds.length / Math.min(...odds);
  return odds.reduce((sum, o) => sum + 1 / o, 0);
}

function rankScore(c: SlateCandidate, rankBy: SlateRanking): number {
  if (rankBy === 'edge') return c.edge;
  // A unit stake returns `odds` with prob p, else 0, so its return SD is odds·√(p(1−p)).
  const sd = c.odds * Math.sqrt(c.fairProb * (1 - c.fairProb));
  if (sd > 0) return c.edge / sd;
  // Degenerate p ∈ {0, 1}: no variance, so only the edge's sign matters (and no NaN reaches sort).
  return c.edge > 0 ? Infinity : c.edge < 0 ? -Infinity : 0;
}

interface Ranked<T extends SlateCandidate> {
  c: T;
  score: number;
  key: string;
}

/** Negative when `a` ranks ahead of `b`: score desc, then fairProb desc, then key asc. */
function compareRanked(a: Ranked<SlateCandidate>, b: Ranked<SlateCandidate>): number {
  if (a.score !== b.score) return b.score > a.score ? 1 : -1;
  if (a.c.fairProb !== b.c.fairProb) return b.c.fairProb > a.c.fairProb ? 1 : -1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Choose the slate:
 * 1. keep candidates with minEdge ≤ edge (≤ maxEdge when set) and minOdds ≤ odds ≤ maxOdds;
 * 2. keep only the best (by the ranking score) candidate per eventId (one pick per match);
 * 3. rank by score desc (ties: higher fairProb, then `${eventId}|${selection}|${book}` asc);
 * 4. walk the ranking and add a candidate unless adding it would push slateCoverage above
 *    maxCoverage (skip it and keep walking), stopping at maxPicks.
 * Returns [] if fewer than minPicks were selected. Output is in selection order and holds the
 * ORIGINAL input objects (same references, extra fields intact), never copies.
 */
export function buildSlate<T extends SlateCandidate>(candidates: T[], rules: SlateRules): T[] {
  const rankBy = rules.rankBy ?? 'edge';
  const eligible = candidates.filter(
    (c) =>
      c.edge >= rules.minEdge &&
      (rules.maxEdge === undefined || c.edge <= rules.maxEdge) &&
      c.odds >= rules.minOdds &&
      c.odds <= rules.maxOdds,
  );

  // One pick per match — the best by the SAME ordering used for the slate ranking below.
  const bestPerEvent = new Map<string, Ranked<T>>();
  for (const c of eligible) {
    const r: Ranked<T> = {
      c,
      score: rankScore(c, rankBy),
      key: `${c.eventId}|${c.selection}|${c.book}`,
    };
    const cur = bestPerEvent.get(c.eventId);
    if (!cur || compareRanked(r, cur) < 0) bestPerEvent.set(c.eventId, r);
  }
  const ranked = [...bestPerEvent.values()].sort(compareRanked);

  const picks: T[] = [];
  const odds: number[] = [];
  for (const { c } of ranked) {
    if (picks.length >= rules.maxPicks) break;
    // Skip, don't stop: a lower-ranked, longer-priced pick may still fit under the cap.
    if (slateCoverage([...odds, c.odds], rules.staking) > rules.maxCoverage + COVERAGE_EPS) continue;
    picks.push(c);
    odds.push(c.odds);
  }
  return picks.length < rules.minPicks ? [] : picks;
}

export interface StakedPick extends SlateCandidate {
  stake: number;
  returnIfWin: number; // stake × odds
}

/**
 * equal-return: stake_i = capital·(1/o_i)/Σ(1/o_j), so every winner returns capital/Σ(1/o_j).
 * equal: stake_i = capital/n. No rounding. Σ stakes = capital. Empty input → [].
 * Each result is `{ ...pick, stake, returnIfWin }`, so any extra fields on the picks survive.
 */
export function stakeSlate<T extends SlateCandidate>(
  picks: T[],
  capital: number,
  staking: StakingMode,
): (T & { stake: number; returnIfWin: number })[] {
  if (picks.length === 0) return [];
  const coverage = slateCoverage(
    picks.map((p) => p.odds),
    'equal-return',
  );
  return picks.map((pick) => {
    const stake =
      staking === 'equal' ? capital / picks.length : (capital * (1 / pick.odds)) / coverage;
    return { ...pick, stake, returnIfWin: stake * pick.odds };
  });
}

export interface SettledPick extends StakedPick {
  won: boolean;
  returned: number; // returnIfWin when won, else 0
}

export interface SlateOutcome {
  picks: number;
  winners: number;
  staked: number;
  returned: number;
  profit: number; // returned − staked
}

/** `{ ...pick, won, returned }` (returned = returnIfWin when won, else 0); extra fields survive. */
export function settlePick<T extends StakedPick>(
  pick: T,
  won: boolean,
): T & { won: boolean; returned: number } {
  return { ...pick, won, returned: won ? pick.returnIfWin : 0 };
}

export function summarizeSlate(settled: SettledPick[]): SlateOutcome {
  let winners = 0;
  let staked = 0;
  let returned = 0;
  for (const s of settled) {
    if (s.won) winners++;
    staked += s.stake;
    returned += s.returned;
  }
  return { picks: settled.length, winners, staked, returned, profit: returned - staked };
}

/** P(no pick wins), assuming independent events, from each pick's fairProb. Empty → 1. */
export function probNoWinner(picks: Pick<SlateCandidate, 'fairProb'>[]): number {
  return picks.reduce((prob, p) => prob * (1 - p.fairProb), 1);
}

/** Model-expected return of a staked slate: Σ stake·odds·fairProb. */
export function expectedSlateReturn(staked: StakedPick[]): number {
  return staked.reduce((sum, s) => sum + s.stake * s.odds * s.fairProb, 0);
}
