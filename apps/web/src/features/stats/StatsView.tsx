import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { formatPercent, formatSurvival } from '@/lib/format';
import { Card, Stat } from '@/components/ui';
import { BarChart } from './charts/BarChart';

export function StatsView() {
  const { data, isLoading } = useQuery({
    queryKey: qk.stats(),
    queryFn: api.stats,
  });

  if (isLoading) {
    return (
      <div className="num py-16 text-center text-sm text-text-dim">loading stats…</div>
    );
  }

  if (!data || data.totalOpportunities === 0) {
    return (
      <Card className="px-4 py-16">
        <div className="text-center text-sm text-text-dim">
          No opportunities detected yet. Stats populate once the poller finds edges.
        </div>
      </Card>
    );
  }

  const bySport = data.bySport;
  const distinctSports = bySport.length;

  const countData = bySport.map((s) => ({ label: s.sportKey, value: s.count }));
  // avgMargin can be null per sport — coerce to 0 so the bar collapses cleanly.
  const marginData = bySport.map((s) => ({ label: s.sportKey, value: s.avgMargin ?? 0 }));

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Summary cards ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Opportunities" value={data.totalOpportunities} />
        <Stat
          label="Avg Margin"
          value={data.avgMargin === null ? '—' : formatPercent(data.avgMargin)}
        />
        <Stat label="Avg Edge Survival" value={formatSurvival(data.avgSurvivalSeconds)} />
        <Stat label="Sports" value={distinctSports} />
        <Stat
          label="Avg CLV"
          value={
            data.clv.avgClv === null
              ? '—'
              : `${data.clv.avgClv >= 0 ? '+' : ''}${formatPercent(data.clv.avgClv)}`
          }
          sub={
            data.clv.trackedLegs > 0
              ? `${data.clv.trackedLegs} tracked bet${data.clv.trackedLegs === 1 ? '' : 's'}`
              : 'place bets to track closing-line value'
          }
        />
      </div>

      {/* ---- Per-sport breakdown ---- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="px-4 py-4">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-dim">
            Opportunities by sport
          </div>
          <BarChart data={countData} label="Opportunities by sport" color="hsl(var(--accent))" />
        </Card>

        <Card className="px-4 py-4">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-dim">
            Avg margin by sport
          </div>
          <BarChart
            data={marginData}
            label="Average margin by sport"
            color="hsl(var(--accent-2))"
            valueFormat={(n) => formatPercent(n)}
          />
        </Card>
      </div>

      {/*
        FUTURE: realized-vs-predicted profit, hit-rate, and slippage charts plug
        in here once settlement data accrues. The stats API currently returns
        counts / avgMargin / avgSurvivalSeconds only — wire those panels (e.g. a
        <Sparkline> of realized P&L over time, a hit-rate <BarChart> by sport)
        when the settlement pipeline surfaces realized outcomes in /api/stats.
      */}
    </div>
  );
}
