import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// ---- Button -----------------------------------------------------------------
type ButtonVariant = 'solid' | 'ghost' | 'outline' | 'danger';
const buttonVariants: Record<ButtonVariant, string> = {
  solid: 'bg-accent text-bg hover:opacity-90',
  ghost: 'text-text-dim hover:text-text hover:bg-surface-2',
  outline: 'border text-text hover:bg-surface-2',
  danger: 'text-danger hover:bg-danger/10',
};

export function Button({
  variant = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:opacity-40 disabled:pointer-events-none',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---- Badge ------------------------------------------------------------------
type BadgeTone = 'arb' | 'value' | 'neutral' | 'positive' | 'danger';
const badgeTones: Record<BadgeTone, string> = {
  arb: 'bg-accent/12 text-accent border-accent/25',
  value: 'bg-accent-2/12 text-accent-2 border-accent-2/25',
  neutral: 'bg-surface-2 text-text-dim border-border',
  positive: 'bg-accent/12 text-accent border-accent/25',
  danger: 'bg-danger/12 text-danger border-danger/25',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

// ---- Card -------------------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border bg-surface', className)}>{children}</div>
  );
}

// ---- Field (labelled input) -------------------------------------------------
export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[11px] font-medium text-text-dim">{label}</span>}
      <input
        className={cn(
          'num rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          className,
        )}
        {...props}
      />
      {hint && <span className="text-[10px] text-text-dim">{hint}</span>}
    </label>
  );
}

// ---- Toggle (segmented) -----------------------------------------------------
export function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-[12px] font-medium transition-colors',
        active ? 'bg-accent text-bg' : 'text-text-dim hover:text-text hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}

// ---- Stat -------------------------------------------------------------------
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-dim">{label}</div>
      <div className="num mt-1 text-2xl text-text">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-text-dim">{sub}</div>}
    </Card>
  );
}
