import { cn } from '@/lib/cn';

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** Accessible name for the chart (rendered as an SVG <title> + aria-label). */
  label?: string;
  /** Bar fill colour. Defaults to the accent token. */
  color?: string;
  /** Format the numeric value label. Defaults to a plain number. */
  valueFormat?: (n: number) => string;
  className?: string;
}

// Layout constants (SVG user units; scales responsively via viewBox).
const ROW_H = 28;
const GAP = 6;
const LABEL_W = 168;
const VALUE_W = 64;
const TRACK_X = LABEL_W;
const VIEW_W = 580;
const TRACK_W = VIEW_W - LABEL_W - VALUE_W;
const LABEL_MAX_CHARS = 24;

function truncate(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

/**
 * Pure presentational horizontal bar chart. No external deps — a single inline
 * SVG that scales to its container via viewBox. Bars use the supplied colour
 * (an accent CSS var by default); axis/value labels are mono ("num").
 */
export function BarChart({
  data,
  label,
  color = 'hsl(var(--accent))',
  valueFormat = (n) => String(n),
  className,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn('num py-6 text-center text-[12px] text-text-dim', className)}>
        no data
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);
  const safeMax = max > 0 ? max : 1;
  const height = data.length * ROW_H + Math.max(0, data.length - 1) * GAP;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('w-full', className)}
      style={{ color }}
    >
      {label && <title>{label}</title>}
      {data.map((d, i) => {
        const y = i * (ROW_H + GAP);
        const barH = ROW_H - 8;
        const barY = y + 4;
        const w = Math.max(0, (d.value / safeMax) * TRACK_W);
        return (
          <g key={`${d.label}-${i}`}>
            {/* row label */}
            <text
              x={LABEL_W - 8}
              y={y + ROW_H / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="num"
              fontSize={11}
              fill="hsl(var(--text-dim))"
            >
              {truncate(d.label)}
            </text>
            {/* track */}
            <rect
              x={TRACK_X}
              y={barY}
              width={TRACK_W}
              height={barH}
              rx={3}
              fill="hsl(var(--surface-2))"
            />
            {/* bar */}
            <rect
              x={TRACK_X}
              y={barY}
              width={w}
              height={barH}
              rx={3}
              fill="currentColor"
            />
            {/* value label */}
            <text
              x={VIEW_W - 4}
              y={y + ROW_H / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="num"
              fontSize={11}
              fill="hsl(var(--text))"
            >
              {valueFormat(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
