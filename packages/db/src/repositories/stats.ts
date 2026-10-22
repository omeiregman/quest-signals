import { clvForLeg } from '@quest/core';
import type { QuestDb } from '../client';
import { closingOdds, opportunities, placementLegs, placements } from '../schema';

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

/** CLV across placed legs whose event has >= 2 captured closing prices (needed to de-vig). */
export function computeClvStats(db: QuestDb): ClvStats {
  const closings = db.select().from(closingOdds).all();
  const byOpp = new Map<number, typeof closings>();
  for (const c of closings) {
    const list = byOpp.get(c.opportunityId) ?? [];
    list.push(c);
    byOpp.set(c.opportunityId, list);
  }

  const placs = db.select().from(placements).all();
  const legs = db.select().from(placementLegs).all();
  const legsByPlacement = new Map<number, typeof legs>();
  for (const l of legs) {
    const list = legsByPlacement.get(l.placementId) ?? [];
    list.push(l);
    legsByPlacement.set(l.placementId, list);
  }

  const clvs: number[] = [];
  for (const p of placs) {
    const closing = byOpp.get(p.opportunityId);
    if (!closing || closing.length < 2) continue;
    const prices = closing.map((c) => c.closingPrice);
    for (const leg of legsByPlacement.get(p.id) ?? []) {
      const idx = closing.findIndex((c) => c.outcome === leg.outcome);
      if (idx === -1) continue;
      clvs.push(clvForLeg(leg.actualOdds, prices, idx));
    }
  }

  return {
    trackedLegs: clvs.length,
    avgClv: clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null,
  };
}

function survivalSeconds(detectedAt: string, lastSeenAt: string): number {
  return (Date.parse(lastSeenAt) - Date.parse(detectedAt)) / 1000;
}

export function computeStats(db: QuestDb): Stats {
  const rows = db.select().from(opportunities).all();
  const margins = rows.map((r) => r.margin).filter((m): m is number => m !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const bySportMap = new Map<string, { margins: number[]; survivals: number[] }>();
  for (const r of rows) {
    const e = bySportMap.get(r.sportKey) ?? { margins: [], survivals: [] };
    if (r.margin !== null) e.margins.push(r.margin);
    e.survivals.push(survivalSeconds(r.detectedAt, r.lastSeenAt));
    bySportMap.set(r.sportKey, e);
  }

  const bySport: SportStat[] = [...bySportMap.entries()].map(([sportKey, e]) => ({
    sportKey,
    count: e.survivals.length,
    avgMargin: avg(e.margins),
    avgSurvivalSeconds: e.survivals.reduce((a, b) => a + b, 0) / e.survivals.length,
  }));

  const allSurvivals = rows.map((r) => survivalSeconds(r.detectedAt, r.lastSeenAt));
  return {
    totalOpportunities: rows.length,
    avgMargin: avg(margins),
    avgSurvivalSeconds: allSurvivals.length
      ? allSurvivals.reduce((a, b) => a + b, 0) / allSurvivals.length
      : 0,
    bySport,
    clv: computeClvStats(db),
  };
}
