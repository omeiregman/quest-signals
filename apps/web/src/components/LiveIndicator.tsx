import { useIsFetching, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { qk } from '@/lib/query';
import { cn } from '@/lib/cn';

export function LiveIndicator() {
  const { data: meta } = useQuery({ queryKey: qk.meta(), queryFn: api.meta });
  const fetching = useIsFetching() > 0;

  return (
    <div className="flex items-center gap-2 text-[11px] text-text-dim">
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          fetching ? 'bg-accent animate-pulse-dot' : 'bg-text-dim/50',
        )}
        aria-hidden
      />
      <span>
        last poll <span className="num text-text">{formatClock(meta?.lastPoll ?? null)}</span>
      </span>
      {meta?.config.oddsProvider && (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-dim">
          via {meta.config.oddsProvider}
        </span>
      )}
    </div>
  );
}
