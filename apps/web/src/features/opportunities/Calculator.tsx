import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  calcStakeFromTarget,
  calcStakeSplit,
  netAfterTax,
} from '@quest/core';
import type { ArbLeg, ArbOpportunity, StakeSplitResult } from '@quest/core';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { useBankroll } from '@/components/BankrollContext';
import { Badge, Button, Field, Toggle } from '@/components/ui';
import { formatAge, formatMoney, formatOdds, formatPercent } from '@/lib/format';
import type { Leg, Opportunity } from '@/lib/types';

type Mode = 'forward' | 'reverse';
type TargetKind = 'grossProfit' | 'return';

function buildArb(opp: Opportunity): ArbOpportunity {
  const legs: ArbLeg[] = opp.legs.map((l) => ({
    outcome: l.outcome,
    book: l.book,
    odds: l.odds,
    impliedProb: l.impliedProb ?? 1 / l.odds,
  }));
  const totalImplied = legs.reduce((sum, l) => sum + l.impliedProb, 0);
  return {
    type: 'arb',
    sportKey: opp.sportKey,
    eventId: opp.eventId,
    commenceTime: opp.commenceTime,
    marketType: 'h2h',
    legs,
    totalImplied,
    margin: 1 - totalImplied,
  };
}

/** Book name, rendered as an external deep link to the event page when one exists. */
function BookLabel({ book, link }: { book: string; link?: string | null }) {
  if (link && link.startsWith('http')) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text underline decoration-border underline-offset-2 hover:text-accent"
        onClick={(e) => e.stopPropagation()}
      >
        {book}
      </a>
    );
  }
  return <span className="text-text">{book}</span>;
}

/** Feed timestamp age next to a price — old lines are the #1 source of phantom edges. */
function PriceAge({ iso }: { iso?: string | null }) {
  if (!iso) return null;
  const hours = (Date.now() - Date.parse(iso)) / 3_600_000;
  const tone = hours > 24 ? 'text-danger' : hours > 6 ? 'text-accent-2' : 'text-text-dim';
  return (
    <span className={`ml-1 text-[10px] ${tone}`} title="time since the book last changed this price">
      {formatAge(iso)} old
    </span>
  );
}

function LegTable({
  result,
  legsByKey,
}: {
  result: StakeSplitResult;
  legsByKey?: Map<string, Leg>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-[11px] uppercase tracking-wider text-text-dim">
          <th className="px-2 py-1.5 text-left font-medium">Book</th>
          <th className="px-2 py-1.5 text-left font-medium">Outcome</th>
          <th className="px-2 py-1.5 text-right font-medium">Odds</th>
          <th className="px-2 py-1.5 text-right font-medium">Stake</th>
        </tr>
      </thead>
      <tbody>
        {result.legs.map((leg, i) => {
          const src = legsByKey?.get(`${leg.book}|${leg.outcome}`);
          return (
          <tr key={`${leg.book}-${leg.outcome}-${i}`} className="border-b border-border/60">
            <td className="px-2 py-1.5">
              <BookLabel book={leg.book} link={src?.deepLink} />
            </td>
            <td className="px-2 py-1.5 text-text-dim">{leg.outcome}</td>
            <td className="num px-2 py-1.5 text-right tabular-nums text-text">
              {formatOdds(leg.odds)}
              <PriceAge iso={src?.priceUpdatedAt} />
            </td>
            <td className="num px-2 py-1.5 text-right tabular-nums text-text">
              {formatMoney(leg.stake)}
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ArbCalculator({ opp }: { opp: Opportunity }) {
  const { bankroll } = useBankroll();
  const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
  const rounding = metaQuery.data?.config.stakeRounding ?? 1;
  const taxRate = metaQuery.data?.config.taxRate ?? 0.2;

  const arb = useMemo(() => buildArb(opp), [opp]);
  const legsByKey = useMemo(
    () => new Map(opp.legs.map((l) => [`${l.book}|${l.outcome}`, l] as const)),
    [opp],
  );

  const [mode, setMode] = useState<Mode>('forward');
  const [stakeInput, setStakeInput] = useState<string>(String(bankroll));
  const [targetKind, setTargetKind] = useState<TargetKind>('grossProfit');
  const [targetInput, setTargetInput] = useState<string>('10');

  const result = useMemo<StakeSplitResult | null>(() => {
    // Guard malformed/legacy opps: a real arb needs >=2 legs and 0 < totalImplied < 1.
    // Without this, empty legs make guaranteedReturn = Math.min(...[]) = Infinity.
    if (arb.legs.length < 2 || !Number.isFinite(arb.totalImplied) || arb.totalImplied <= 0) {
      return null;
    }
    try {
      if (mode === 'forward') {
        const total = Number(stakeInput);
        if (!Number.isFinite(total) || total <= 0) return null;
        return calcStakeSplit(arb, total, { rounding });
      }
      const target = Number(targetInput);
      if (!Number.isFinite(target) || target <= 0) return null;
      return calcStakeFromTarget(
        arb,
        targetKind === 'grossProfit'
          ? { targetGrossProfit: target }
          : { targetReturn: target },
        { rounding },
      );
    } catch {
      return null;
    }
  }, [mode, stakeInput, targetInput, targetKind, arb, rounding]);

  const copySummary = async () => {
    if (!result) return;
    const lines = result.legs.map(
      (l) => `${l.book}  ${l.outcome} @ ${formatOdds(l.odds)}  ${formatMoney(l.stake)}`,
    );
    lines.push(
      `Total ${formatMoney(result.totalStake)} → return ${formatMoney(
        result.guaranteedReturn,
      )} (profit ${formatMoney(result.grossProfit)})`,
    );
    try {
      await navigator.clipboard?.writeText(lines.join('\n'));
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode + margin */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone="arb">arb</Badge>
          <span className="num text-sm tabular-nums text-accent">
            {formatPercent(arb.margin)} margin
          </span>
        </div>
        <div className="flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
          <Toggle active={mode === 'forward'} onClick={() => setMode('forward')}>
            From stake
          </Toggle>
          <Toggle active={mode === 'reverse'} onClick={() => setMode('reverse')}>
            From target
          </Toggle>
        </div>
      </div>

      {/* Inputs */}
      {mode === 'forward' ? (
        <Field
          label="Total stake"
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          className="w-40 text-right tabular-nums"
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label={targetKind === 'grossProfit' ? 'Target gross profit' : 'Target return'}
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            className="w-40 text-right tabular-nums"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text-dim">Target</span>
            <div className="flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
              <Toggle
                active={targetKind === 'grossProfit'}
                onClick={() => setTargetKind('grossProfit')}
              >
                Gross profit
              </Toggle>
              <Toggle active={targetKind === 'return'} onClick={() => setTargetKind('return')}>
                Return
              </Toggle>
            </div>
          </div>
        </div>
      )}

      {result ? (
        <>
          <div className="overflow-hidden rounded-md border">
            <LegTable result={result} legsByKey={legsByKey} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-3 text-sm">
                <span className="text-text-dim">Total stake</span>
                <span className="num tabular-nums text-text">
                  {formatMoney(result.totalStake)}
                </span>
              </div>
              <div className="flex items-baseline gap-3 text-sm">
                <span className="text-text-dim">Guaranteed return</span>
                <span className="num tabular-nums text-text">
                  {formatMoney(result.guaranteedReturn)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-text-dim">
                Gross profit
              </div>
              <div className="num text-2xl tabular-nums text-accent">
                {formatMoney(result.grossProfit)}
              </div>
              <div className="num text-[11px] tabular-nums text-text-dim">
                Net ≈ {formatMoney(netAfterTax(result.grossProfit, taxRate))} after{' '}
                {(taxRate * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div>
            <Button variant="outline" onClick={copySummary}>
              Copy
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-text-dim">Enter a positive amount to compute stakes.</p>
      )}
    </div>
  );
}

function ValueCalculator({ opp }: { opp: Opportunity }) {
  const { bankroll } = useBankroll();
  const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
  const leg = opp.legs[0];
  if (!leg) {
    return <p className="text-sm text-text-dim">No legs on this value opportunity.</p>;
  }
  // Flat 1% of bankroll: value bets are +EV singles with variance — small, repeatable stakes.
  const rounding = metaQuery.data?.config.stakeRounding ?? 0.1;
  const step = rounding > 0 ? rounding : 0.1;
  const stake = Math.max(step, Math.round((bankroll * 0.01) / step) * step);
  const potentialReturn = stake * leg.odds;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="value">value</Badge>
        {opp.edge !== null && (
          <span className="num text-sm tabular-nums text-accent-2">
            {formatPercent(opp.edge)} edge
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border/60">
              <td className="px-2 py-1.5 text-text-dim">Soft book</td>
              <td className="px-2 py-1.5 text-right">
                <BookLabel book={leg.book} link={leg.deepLink} />
              </td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="px-2 py-1.5 text-text-dim">Outcome</td>
              <td className="px-2 py-1.5 text-right text-text">{leg.outcome}</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="px-2 py-1.5 text-text-dim">Odds</td>
              <td className="num px-2 py-1.5 text-right tabular-nums text-text">
                {formatOdds(leg.odds)}
                <PriceAge iso={leg.priceUpdatedAt} />
              </td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="px-2 py-1.5 text-text-dim">Reference book</td>
              <td className="px-2 py-1.5 text-right text-text">{opp.referenceBook ?? '—'}</td>
            </tr>
            <tr className="border-b border-border/60">
              <td className="px-2 py-1.5 text-text-dim">Suggested stake (1% bankroll)</td>
              <td className="num px-2 py-1.5 text-right tabular-nums text-text">
                {formatMoney(stake)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-right">
        <div className="text-[11px] uppercase tracking-wider text-text-dim">
          Potential return
        </div>
        <div className="num text-2xl tabular-nums text-accent-2">
          {formatMoney(potentialReturn)}
        </div>
        <div className="text-[11px] text-text-dim">
          Single non-guaranteed bet — not an arb. Outcome may lose.
        </div>
      </div>
    </div>
  );
}

export function Calculator({ opp }: { opp: Opportunity }) {
  return opp.type === 'arb' ? <ArbCalculator opp={opp} /> : <ValueCalculator opp={opp} />;
}
