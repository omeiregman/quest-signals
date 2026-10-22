import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { Badge, Button } from '@/components/ui';
import { formatClock, formatMoney, formatPercent, timeToKickoff } from '@/lib/format';
import type { Opportunity, OpportunityStatus } from '@/lib/types';
import { Calculator } from './Calculator';

/** Fresh-odds check before placing: does the arb/edge still exist right now? */
function RecheckPanel({ opp }: { opp: Opportunity }) {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
  const recheck = useMutation({
    mutationFn: () => api.recheck(opp.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
  });
  if (!metaQuery.data?.config.supportsRecheck) return null;
  const r = recheck.data;
  const freshNumber =
    r?.margin != null
      ? ` — ${formatPercent(r.margin)} margin`
      : r?.edge != null
        ? ` — ${formatPercent(r.edge)} edge`
        : '';
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
        {recheck.isPending ? 'Re-checking…' : 'Re-check odds'}
      </Button>
      {r && r.verdict === 'holds' && (
        <span className="text-sm text-accent">✓ still live{freshNumber}</span>
      )}
      {r && r.verdict === 'degraded' && (
        <span className="text-sm text-accent-2">↓ degraded{freshNumber}</span>
      )}
      {r && r.verdict === 'gone' && (
        <span className="text-sm text-danger">✗ gone — do not place</span>
      )}
      {recheck.isError && <span className="text-sm text-danger">re-check failed</span>}
      <span className="text-[11px] text-text-dim">uses 1 API request</span>
    </div>
  );
}

const ACTIONS: Array<{ status: OpportunityStatus; label: string; danger?: boolean }> = [
  { status: 'accepted', label: 'Accept' },
  { status: 'bet_placed', label: 'Bet placed' },
  { status: 'skipped', label: 'Skip' },
  { status: 'archived', label: 'Archive', danger: true },
];

export function OpportunityRow({ opp, index = 0 }: { opp: Opportunity; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (status: OpportunityStatus) => api.setStatus(opp.id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: qk.stats() });
      void queryClient.invalidateQueries({ queryKey: qk.sports() });
    },
  });

  const isArb = opp.type === 'arb';
  const profit = opp.defaultBankrollProfit;

  return (
    <>
      <tr
        className="animate-row-in cursor-pointer border-b border-border/60 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        style={{ animationDelay: `${index * 24}ms` }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`opp-detail-${opp.id}`}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <td className="px-3 py-2">
          <Badge tone={isArb ? 'arb' : 'value'}>{opp.type}</Badge>
        </td>
        <td className="px-3 py-2 text-text-dim">{opp.sportKey}</td>
        <td className="px-3 py-2 text-text">{opp.eventName ?? opp.eventId}</td>
        <td className="px-3 py-2 text-text-dim">
          <span className="num tabular-nums">{timeToKickoff(opp.commenceTime)}</span>
          <span className="ml-1 text-[11px] text-text-dim">{formatClock(opp.commenceTime)}</span>
        </td>
        <td className="px-3 py-2 text-text-dim">{opp.marketType}</td>
        <td className="num px-3 py-2 text-right tabular-nums">
          {isArb ? (
            <span className="text-accent">
              {opp.margin !== null ? formatPercent(opp.margin) : '—'}
            </span>
          ) : (
            <span className="text-accent-2">
              {opp.edge !== null ? formatPercent(opp.edge) : '—'}
            </span>
          )}
        </td>
        <td className="num px-3 py-2 text-right tabular-nums">
          {profit !== null ? (
            <span className={profit > 0 ? 'text-accent' : 'text-text'}>{formatMoney(profit)}</span>
          ) : (
            '—'
          )}
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {ACTIONS.map((a) => (
              <Button
                key={a.status}
                variant={a.danger ? 'danger' : 'ghost'}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(a.status)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr id={`opp-detail-${opp.id}`} className="border-b border-border/60 bg-surface-2/30">
          <td colSpan={8} className="px-4 py-4">
            <div className="animate-row-in">
              <RecheckPanel opp={opp} />
              <Calculator opp={opp} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
