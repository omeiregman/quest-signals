import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import type { Opportunity, OpportunityQuery } from '@/lib/types';
import { FiltersBar } from './FiltersBar';
import type { FiltersValue } from './FiltersBar';
import { OpportunityRow } from './OpportunityRow';

const HEADERS = ['Type', 'Sport', 'Event', 'Kickoff', 'Market', 'Margin / Edge', 'Profit', ''];

export function OpportunitiesView() {
  const [filters, setFilters] = useState<FiltersValue>({ status: 'new' });

  // Only the server-side query fields go to the API; furthestFirst is client-only.
  const serverQuery: OpportunityQuery = useMemo(
    () => ({
      status: filters.status,
      type: filters.type,
      sport: filters.sport,
      region: filters.region,
      minMargin: filters.minMargin,
      sort: filters.sort,
    }),
    [filters],
  );

  const { data, isLoading } = useQuery({
    queryKey: qk.opportunities(serverQuery),
    queryFn: () => api.listOpportunities(serverQuery),
  });

  const rows = useMemo<Opportunity[]>(() => {
    const list = data ?? [];
    if (!filters.furthestFirst) return list;
    return [...list].sort(
      (a, b) => Date.parse(b.commenceTime) - Date.parse(a.commenceTime),
    );
  }, [data, filters.furthestFirst]);

  return (
    <div className="flex flex-col gap-4">
      <FiltersBar value={filters} onChange={setFilters} />

      <div className="overflow-hidden rounded-lg border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b text-[11px] uppercase tracking-wider text-text-dim">
              {HEADERS.map((h, i) => (
                <th
                  key={h || `col-${i}`}
                  className={
                    h === 'Margin / Edge' || h === 'Profit'
                      ? 'px-3 py-2 text-right font-medium'
                      : 'px-3 py-2 text-left font-medium'
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-text-dim">
                  Loading opportunities…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-text-dim">
                  No opportunities — try Search now
                </td>
              </tr>
            ) : (
              rows.map((opp, i) => <OpportunityRow key={opp.id} opp={opp} index={i} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
