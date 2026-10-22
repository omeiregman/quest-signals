import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { Field, Toggle } from '@/components/ui';
import type { OpportunityQuery, OpportunityStatus, OpportunityType } from '@/lib/types';

export interface FiltersValue extends OpportunityQuery {
  /** Client-side sort: when true, sort by commenceTime descending (further from kickoff first). */
  furthestFirst?: boolean;
}

const STATUSES: OpportunityStatus[] = ['new', 'accepted', 'bet_placed', 'skipped', 'archived'];
const TYPES: Array<{ value: 'all' | OpportunityType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'arb', label: 'Arb' },
  { value: 'value', label: 'Value' },
];

export function FiltersBar({
  value,
  onChange,
}: {
  value: FiltersValue;
  onChange: (next: FiltersValue) => void;
}) {
  const sportsQuery = useQuery({ queryKey: qk.sports(), queryFn: api.sports });
  const metaQuery = useQuery({ queryKey: qk.meta(), queryFn: api.meta });

  const sports = sportsQuery.data ?? [];
  const regions = metaQuery.data ? Object.keys(metaQuery.data.regionProfiles) : [];

  const set = (patch: Partial<FiltersValue>) => onChange({ ...value, ...patch });

  const typeValue: 'all' | OpportunityType = value.type ?? 'all';

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-surface px-4 py-3">
      {/* Status */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Status</span>
        <select
          className="rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          value={value.status ?? 'new'}
          onChange={(e) => set({ status: e.target.value as OpportunityStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      {/* Type segmented */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Type</span>
        <div className="flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
          {TYPES.map((t) => (
            <Toggle
              key={t.value}
              active={typeValue === t.value}
              onClick={() => set({ type: t.value === 'all' ? undefined : t.value })}
            >
              {t.label}
            </Toggle>
          ))}
        </div>
      </div>

      {/* Sport */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Sport</span>
        <select
          className="rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          value={value.sport ?? ''}
          onChange={(e) => set({ sport: e.target.value || undefined })}
        >
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {/* Region */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Region</span>
        <select
          className="rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          value={value.region ?? ''}
          onChange={(e) => set({ region: e.target.value || undefined })}
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {/* Min margin */}
      <Field
        label="Min margin %"
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        placeholder="any"
        className="w-24 text-right tabular-nums"
        value={value.minMargin === undefined ? '' : String(value.minMargin * 100)}
        onChange={(e) => {
          // Field is a percent (e.g. 2 = 2%); the margin column/API is a fraction (0.02).
          const raw = e.target.value;
          const n = Number(raw);
          set({ minMargin: raw === '' || !Number.isFinite(n) ? undefined : n / 100 });
        }}
      />

      {/* Sort by time-to-event */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Sort</span>
        <div className="flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
          <Toggle
            active={value.sort === 'timeToEvent'}
            onClick={() =>
              set({ sort: value.sort === 'timeToEvent' ? undefined : 'timeToEvent' })
            }
          >
            Time to event
          </Toggle>
        </div>
      </div>

      {/* Further-from-kickoff-first (client sort) */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-text-dim">Order</span>
        <div className="flex gap-0.5 rounded-md border bg-surface-2 p-0.5">
          <Toggle
            active={!!value.furthestFirst}
            onClick={() => set({ furthestFirst: !value.furthestFirst })}
          >
            Furthest first
          </Toggle>
        </div>
      </div>
    </div>
  );
}
