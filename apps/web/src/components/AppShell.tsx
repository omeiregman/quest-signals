import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useBankroll } from './BankrollContext';
import { LiveIndicator } from './LiveIndicator';
import { Button } from './ui';
import { useTheme } from '@/theme/ThemeProvider';

type Feedback = { kind: 'ok' | 'warn' | 'err'; text: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export type ViewId = 'opportunities' | 'settlement' | 'stats';

const NAV: { id: ViewId; label: string }[] = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'settlement', label: 'Settlement' },
  { id: 'stats', label: 'Stats' },
];

export function AppShell({
  view,
  onView,
  children,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  children: ReactNode;
}) {
  const { bankroll, setBankroll } = useBankroll();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Auto-dismiss the search feedback after a few seconds.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(t);
  }, [feedback]);

  const poll = useMutation({
    mutationFn: api.poll,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['meta'] });
      void qc.invalidateQueries({ queryKey: ['sports'] });
      if (data.status === 'skipped') {
        setFeedback({ kind: 'warn', text: 'A refresh is already running' });
      } else if (data.status === 'error') {
        setFeedback({ kind: 'err', text: `Refresh failed: ${data.error ?? 'unknown error'}` });
      } else if (data.result && data.result.errors > 0 && data.result.marketsFetched === 0) {
        setFeedback({ kind: 'warn', text: 'Provider busy (rate-limited) — try again shortly' });
      } else if (data.result) {
        setFeedback({
          kind: 'ok',
          text: `Updated — ${plural(data.result.arbsFound, 'arb')}, ${plural(data.result.valuesFound, 'value bet')}`,
        });
      } else {
        setFeedback({ kind: 'ok', text: 'Updated' });
      }
    },
    onError: () => setFeedback({ kind: 'err', text: "Couldn't reach the server" }),
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tracking-tight text-text">quest</span>
            <span className="num text-[10px] text-accent">arb·value</span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => onView(n.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                  view === n.id
                    ? 'bg-surface-2 text-text'
                    : 'text-text-dim hover:text-text hover:bg-surface-2/60',
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[11px] text-text-dim">
              bankroll €
              <input
                type="number"
                min={1}
                value={bankroll}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) setBankroll(n);
                }}
                className="num w-20 rounded-md border bg-surface-2 px-2 py-1 text-[13px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>

            <LiveIndicator />

            {feedback && (
              <span
                role="status"
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium',
                  feedback.kind === 'ok' && 'bg-accent/12 text-accent',
                  feedback.kind === 'warn' && 'bg-accent-2/12 text-accent-2',
                  feedback.kind === 'err' && 'bg-danger/12 text-danger',
                )}
              >
                {feedback.text}
              </span>
            )}

            <Button variant="outline" onClick={() => poll.mutate()} disabled={poll.isPending}>
              {poll.isPending ? 'searching…' : 'Search now'}
            </Button>

            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={theme === 'dark'}
              title="Toggle theme"
              className="rounded-md px-2 py-1.5 text-[13px] text-text-dim hover:bg-surface-2 hover:text-text"
            >
              <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
