import type { ArbOpportunity, StakeLeg, StakeOpts, StakeSplitResult } from './types';

export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  const rounded = Math.round(value / increment) * increment;
  return Math.round(rounded * 100) / 100; // snap to cents to kill fp noise
}

/**
 * Display-only helper: the net figure after a country-specific tax on positive
 * winnings. This NEVER affects arbitrage validity or the headline gross profit —
 * the UI shows it as a small secondary annotation ("Net ≈ €X after Y%").
 */
export function netAfterTax(grossProfit: number, taxRate: number): number {
  return grossProfit > 0 ? grossProfit * (1 - taxRate) : grossProfit;
}

export function calcStakeSplit(
  arb: ArbOpportunity,
  totalStake: number,
  opts: StakeOpts,
): StakeSplitResult {
  const legs: StakeLeg[] = arb.legs.map((leg) => {
    const ideal = (totalStake * leg.impliedProb) / arb.totalImplied;
    return {
      outcome: leg.outcome,
      book: leg.book,
      odds: leg.odds,
      stake: roundToIncrement(ideal, opts.rounding),
    };
  });

  const actualTotal = legs.reduce((sum, l) => sum + l.stake, 0);

  const perOutcome = legs.map((l) => {
    const ret = l.stake * l.odds;
    return {
      outcome: l.outcome,
      return: ret,
      grossProfit: ret - actualTotal,
    };
  });

  const guaranteedReturn = Math.min(...perOutcome.map((p) => p.return));
  const grossProfit = guaranteedReturn - actualTotal;

  return {
    requestedStake: totalStake,
    totalStake: actualTotal,
    legs,
    guaranteedReturn,
    grossProfit,
    perOutcome,
  };
}

export interface StakeTarget {
  targetReturn?: number;
  targetGrossProfit?: number;
}

export function calcStakeFromTarget(
  arb: ArbOpportunity,
  target: StakeTarget,
  opts: StakeOpts,
): StakeSplitResult {
  const provided = [target.targetReturn, target.targetGrossProfit].filter((v) => v !== undefined);
  if (provided.length !== 1) {
    throw new Error('Provide exactly one of targetReturn, targetGrossProfit');
  }

  const f = arb.totalImplied; // < 1 for a valid arb
  if (f >= 1) throw new Error('Not an arbitrage: totalImplied >= 1');

  const idealStake =
    target.targetReturn !== undefined
      ? target.targetReturn * f // return = stake / f  =>  stake = return * f
      : (target.targetGrossProfit! * f) / (1 - f); // gross = stake*(1-f)/f  =>  stake = gross*f/(1-f)

  return calcStakeSplit(arb, idealStake, opts);
}
