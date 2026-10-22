export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

export function formatMoney(value: number, currency = '€'): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${currency}${Math.abs(value).toLocaleString('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Compact "time until kickoff" from an ISO commence time, relative to `now`. */
export function timeToKickoff(commenceIso: string, now: number = Date.now()): string {
  const ms = Date.parse(commenceIso) - now;
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'live/started';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Compact age of a feed price timestamp ("12m", "3h", "2d 4h"); null/invalid → '—'. */
export function formatAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${mins}m`;
}

/** Human survival duration from seconds. */
export function formatSurvival(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const mins = seconds / 60;
  if (mins < 90) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

/** Local clock time for "last polled" displays. */
export function formatClock(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
