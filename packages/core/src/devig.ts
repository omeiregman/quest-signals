import { devig } from './value';

export type DevigMethod = 'multiplicative' | 'additive' | 'power' | 'shin';

export const DEVIG_METHODS: readonly DevigMethod[] = [
  'multiplicative',
  'additive',
  'power',
  'shin',
];

/** Additive de-vig can push extreme longshots to ≤ 0; they're floored here before renormalizing. */
const ADDITIVE_FLOOR = 1e-6;
/** Bisection stops once the bracket on k (power) / z (shin) is this narrow… */
const ROOT_TOL = 1e-12;
/** …or after this many halvings / bracket doublings, whichever comes first. */
const MAX_ITER = 200;

/** Book overround (margin): Σ 1/odds − 1. Negative for an under-round (e.g. exchange back prices). */
export function overround(odds: number[]): number {
  return odds.reduce((sum, o) => sum + 1 / o, 0) - 1;
}

function assertBook(odds: number[]): void {
  if (odds.length < 2) {
    throw new RangeError(`devigOdds needs at least 2 outcomes, got ${odds.length}`);
  }
  for (const o of odds) {
    if (!Number.isFinite(o) || o <= 1) throw new RangeError(`devigOdds: invalid decimal odds ${o}`);
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Scale to sum exactly-ish to 1: the solvers converge to ~1e-12, this kills the residual drift. */
function normalize(ps: number[]): number[] {
  const total = sum(ps);
  return ps.map((p) => p / total);
}

/**
 * Root of a strictly DECREASING f bracketed by f(lo) > 0 ≥ f(hi). Stops on ROOT_TOL, MAX_ITER,
 * or when the midpoint can no longer move in floating point.
 */
function bisectDecreasing(f: (x: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < MAX_ITER && hi - lo > ROOT_TOL; i++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) break;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function additive(implied: number[]): number[] {
  // Subtract the margin equally from every outcome — it punishes longshots hardest, and on a heavy
  // margin can drive them to ≤ 0.
  const share = (sum(implied) - 1) / implied.length;
  return normalize(implied.map((p) => Math.max(p - share, ADDITIVE_FLOOR)));
}

function power(implied: number[]): number[] {
  const booksum = sum(implied);
  // g(k) = Σ π_i^k − 1 is strictly decreasing in k (every π_i ∈ (0,1)), with g(0) = n − 1 > 0 and
  // g(1) = B − 1. So the root is k > 1 for a margin, k < 1 for an under-round, k = 1 for a fair book.
  const g = (k: number) => implied.reduce((s, p) => s + p ** k, 0) - 1;
  let k = 1;
  if (booksum > 1) {
    // Root lies above 1: double the upper end until g goes non-positive (π^k → 0 as k → ∞).
    let lo = 1;
    let hi = 2;
    for (let i = 0; i < MAX_ITER && g(hi) > 0; i++) {
      lo = hi;
      hi *= 2;
    }
    k = bisectDecreasing(g, lo, hi);
  } else if (booksum < 1) {
    k = bisectDecreasing(g, 0, 1);
  }
  return normalize(implied.map((p) => p ** k));
}

function shin(odds: number[], implied: number[]): number[] {
  const booksum = sum(implied);
  if (booksum <= 1) return devig(odds); // no margin ⇒ no insider share to strip out
  const prob = (pi: number, z: number) =>
    (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / booksum) - z) / (2 * (1 - z));
  // Σ p_i(z) − 1 decreases in z: at z = 0 it's √B − 1 > 0; as z → 1 it tends to Σπ_i²/B − 1 < 0
  // (π_i² < π_i). Midpoints never reach z = 1, so the (1 − z) divisor stays non-zero.
  const z = bisectDecreasing((x) => sum(implied.map((pi) => prob(pi, x))) - 1, 0, 1);
  return normalize(implied.map((pi) => prob(pi, z)));
}

/**
 * Fair (margin-free) probabilities from ONE book's complete set of decimal odds for a market
 * (every mutually-exclusive outcome, in order). Same order as the input; sums to 1.
 *
 * - multiplicative: p_i ∝ 1/o_i (identical to `devig` in value.ts). Overstates longshots.
 * - additive: p_i = 1/o_i − overround/n; any p_i that would be ≤ 0 is floored at 1e-6, then renormalized.
 * - power: p_i = (1/o_i)^k with k solved so Σ p_i = 1 (k > 1 when overround > 0, k < 1 when under-round).
 * - shin: Shin (1993) model, p_i = (√(z² + 4(1−z)·π_i²/B) − z) / (2(1−z)) with π_i = 1/o_i,
 *   B = Σπ_i, and z ∈ [0,1) solved so Σ p_i = 1. For B ≤ 1 (no margin) falls back to multiplicative.
 *
 * Throws RangeError for fewer than 2 outcomes or any odds that are non-finite or ≤ 1.
 */
export function devigOdds(odds: number[], method: DevigMethod): number[] {
  assertBook(odds);
  // Delegate rather than re-derive so the two can never drift apart (bit-identical results).
  if (method === 'multiplicative') return devig(odds);
  const implied = odds.map((o) => 1 / o);
  switch (method) {
    case 'additive':
      return additive(implied);
    case 'power':
      return power(implied);
    case 'shin':
      return shin(odds, implied);
    default:
      // Unreachable for typed callers; guards a method string read from untyped config/CLI input.
      throw new RangeError(`devigOdds: unknown method ${String(method)}`);
  }
}
