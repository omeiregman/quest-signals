import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { formatMoney, timeToKickoff } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, Field } from '@/components/ui';
import type { LegResult, Opportunity, SettlementBody } from '@/lib/types';

const SETTLE_QUERY = { status: 'bet_placed' } as const;
const LEG_RESULTS: LegResult[] = ['settled', 'voided', 'rejected'];

/**
 * SETTLEMENT — record the real-world outcome of placed bets.
 *
 * NOTE: the API has no live results feed yet, so the operator records the
 * winning selection manually. Auto-filling the winning selection from a feed
 * (and pre-computing realizedProfit) is a future seam — when results land,
 * fetch them here and default the form, leaving `autoFilled: true`.
 */
export function SettlementView() {
  const { data, isLoading } = useQuery({
    queryKey: qk.opportunities(SETTLE_QUERY),
    queryFn: () => api.listOpportunities(SETTLE_QUERY),
  });

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-text-dim">Loading placed bets…</div>;
  }

  const opps = data ?? [];

  if (opps.length === 0) {
    return (
      <Card className="px-6 py-12 text-center">
        <div className="text-sm text-text-dim">No placed bets to settle</div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {opps.map((opp, i) => (
        <SettlementCard key={opp.id} opp={opp} index={i} />
      ))}
    </div>
  );
}

function SettlementCard({ opp, index }: { opp: Opportunity; index: number }) {
  const qc = useQueryClient();

  const outcomes = useMemo(() => opp.legs.map((l) => l.outcome), [opp.legs]);
  const firstOutcome = outcomes[0] ?? '';

  const [winningSelection, setWinningSelection] = useState<string>(firstOutcome);
  const [legResults, setLegResults] = useState<Record<string, LegResult>>(() =>
    Object.fromEntries(opp.legs.map((l) => [l.outcome, 'settled' as LegResult])),
  );
  const [realizedProfit, setRealizedProfit] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const settle = useMutation({
    mutationFn: (body: SettlementBody) => api.settle(opp.id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.opportunities(SETTLE_QUERY) });
      void qc.invalidateQueries({ queryKey: qk.stats() });
    },
  });

  const predictedGross = opp.defaultBankrollProfit;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(realizedProfit);
    const body: SettlementBody = {
      winningSelection,
      realizedProfit: Number.isFinite(parsed) && realizedProfit !== '' ? parsed : undefined,
      notes: notes.trim() || undefined,
      autoFilled: false,
      legs: opp.legs.map((l) => ({
        outcome: l.outcome,
        result: legResults[l.outcome] ?? 'settled',
      })),
    };
    settle.mutate(body);
  }

  return (
    <Card className="animate-row-in p-4">
      {/* staggered entrance via inline animationDelay */}
      <div style={{ animationDelay: `${index * 40}ms` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone={opp.type === 'arb' ? 'arb' : 'value'}>{opp.type}</Badge>
              <span className="truncate text-sm font-medium text-text">
                {opp.eventName ?? opp.eventId}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-text-dim">
              {opp.sportKey} · {opp.marketType} · {timeToKickoff(opp.commenceTime)}
            </div>
          </div>
          {settle.isSuccess && <Badge tone="positive">settled</Badge>}
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-dim">Winning selection</span>
            <select
              aria-label="Winning selection"
              value={winningSelection}
              onChange={(e) => setWinningSelection(e.target.value)}
              className={cn(
                'rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              )}
            >
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium text-text-dim">Per-leg result</span>
            <div className="flex flex-col gap-2">
              {opp.legs.map((leg) => (
                <div
                  key={leg.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-surface-2 px-2.5 py-1.5"
                >
                  <div className="min-w-0 text-[13px]">
                    <span className="text-text">{leg.outcome}</span>{' '}
                    <span className="text-text-dim">@ {leg.book}</span>{' '}
                    <span className="num text-text-dim">{leg.odds.toFixed(2)}</span>
                  </div>
                  <select
                    aria-label={`Result for ${leg.outcome}`}
                    value={legResults[leg.outcome] ?? 'settled'}
                    onChange={(e) =>
                      setLegResults((prev) => ({
                        ...prev,
                        [leg.outcome]: e.target.value as LegResult,
                      }))
                    }
                    className={cn(
                      'rounded-md border bg-surface px-2 py-1 text-[13px] text-text',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                    )}
                  >
                    {LEG_RESULTS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <Field
              label="Realized profit"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={realizedProfit}
              onChange={(e) => setRealizedProfit(e.target.value)}
              className="w-40 text-right tabular-nums"
            />
            <div className="pb-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-text-dim">
                Predicted (gross)
              </div>
              <div className="num mt-0.5 text-right text-sm tabular-nums text-text">
                {predictedGross != null ? formatMoney(predictedGross) : '—'}
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-dim">Notes</span>
            <textarea
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={cn(
                'rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
              )}
            />
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="solid" disabled={settle.isPending}>
              {settle.isPending ? 'Recording…' : 'Record outcome'}
            </Button>
            {settle.isError && (
              <span className="text-[12px] text-danger">Failed to record. Try again.</span>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}
