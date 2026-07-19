import type { ReactNode } from 'react';

/**
 * A single headline stat tile (ADM-007). Small brutalist card: a muted label, a
 * large value, and an optional sub-label. Shared by every scalar metric (AOV,
 * repeat rate, stars, rewards, new-vs-returning). No chart library (D6).
 */
interface MetricCardProps {
  label: string;
  value: ReactNode;
  subLabel?: string;
}

export function MetricCard({ label, value, subLabel }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border-2 border-foreground bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-h3 font-bold text-primary">{value}</p>
      {subLabel ? <p className="text-xs text-muted-foreground">{subLabel}</p> : null}
    </div>
  );
}
