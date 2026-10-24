import type { BacktestCandidate } from './candidates';

export interface FlatStats {
  label: string;
  bets: number;
  avgOdds: number;
  hitRate: number;
  /** Profit per €1 flat stake. */
  roi: number;
  roiSe: number;
  /** What the reference said each bet was worth: mean edge. */
  avgEdge: number;
  avgClv: number | null;
  clvSe: number | null;
}

/** Highest-edge candidate per match: one bet per match, so bets stay independent. */
export function bestPerEvent(candidates: BacktestCandidate[]): BacktestCandidate[] {
  const best = new Map<string, BacktestCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.eventId);
    if (!cur || c.edge > cur.edge) best.set(c.eventId, c);
  }
  return [...best.values()];
}

function meanSe(xs: number[]): { mean: number; se: number } {
  const n = xs.length;
  if (n < 2) return { mean: xs[0] ?? 0, se: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  return { mean, se: Math.sqrt(variance / n) };
}

/** Flat €1 singles on every given bet: did the flagged edge show up in results and in CLV? */
export function flatStats(label: string, bets: BacktestCandidate[]): FlatStats {
  const roi = meanSe(bets.map((b) => (b.won ? b.odds - 1 : -1)));
  const clvs = bets.flatMap((b) => (b.clv === undefined ? [] : [b.clv]));
  const clv = meanSe(clvs);
  const n = bets.length || 1;
  return {
    label,
    bets: bets.length,
    avgOdds: bets.reduce((a, b) => a + b.odds, 0) / n,
    hitRate: bets.filter((b) => b.won).length / n,
    roi: roi.mean,
    roiSe: roi.se,
    avgEdge: bets.reduce((a, b) => a + b.edge, 0) / n,
    avgClv: clvs.length ? clv.mean : null,
    clvSe: clvs.length ? clv.se : null,
  };
}

export const ODDS_BANDS: [number, number][] = [
  [1, 1.8],
  [1.8, 2.5],
  [2.5, 3.5],
  [3.5, 5],
  [5, 8],
  [8, 15],
  [15, 1000],
];

export function bandLabel([lo, hi]: [number, number]): string {
  return hi >= 1000 ? `${lo}+` : `${lo}–${hi}`;
}

/** Flat-singles results split by odds band (lo inclusive, hi exclusive). */
export function flatByOddsBand(
  bets: BacktestCandidate[],
  bands: [number, number][] = ODDS_BANDS,
): FlatStats[] {
  return bands.map((band) =>
    flatStats(
      bandLabel(band),
      bets.filter((b) => b.odds >= band[0] && b.odds < band[1]),
    ),
  );
}
