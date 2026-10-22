import { cn } from '@/lib/cn';

export interface SparklineProps {
  points: number[];
  /** Accessible name (aria-label) for the chart. */
  label?: string;
  /** Stroke colour. Defaults to the accent token. */
  color?: string;
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 28;
const PAD = 2;

/**
 * Pure SVG sparkline — a single polyline scaled to a fixed viewBox. Gracefully
 * handles empty / single-point inputs (renders nothing / a flat dot).
 */
export function Sparkline({
  points,
  label,
  color = 'hsl(var(--accent))',
  className,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className={cn('w-full', className)}
        style={{ color }}
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const usableW = VIEW_W - PAD * 2;
  const usableH = VIEW_H - PAD * 2;

  const x = (i: number) =>
    points.length === 1 ? VIEW_W / 2 : PAD + (i / (points.length - 1)) * usableW;
  // Flat series (span 0) sits on the vertical midline.
  const y = (v: number) => (span === 0 ? VIEW_H / 2 : PAD + (1 - (v - min) / span) * usableH);

  if (points.length === 1) {
    const v = points[0] ?? 0;
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className={cn('w-full', className)}
        style={{ color }}
      >
        <circle cx={x(0)} cy={y(v)} r={2} fill="currentColor" />
      </svg>
    );
  }

  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');

  return (
    <svg
      role="img"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ color }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
