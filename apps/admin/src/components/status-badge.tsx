import type { ReactNode } from 'react';

/**
 * Status tones for the admin visibility indicators (ADM-008 post-merge Fix 3).
 * Brutalist chip styling mirrors the deal-savings panel: a 2px ink border + a
 * hard offset shadow. Tones:
 *  - `success` — live/active (jyellow fill)
 *  - `warning` — active-but-invisible (jred outline, e.g. "Not available at any branch")
 *  - `muted`   — inactive / deactivated
 *  - `neutral` — informational window state (e.g. "Upcoming" / "Expired")
 */
export type StatusTone = 'success' | 'warning' | 'muted' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-foreground bg-primary text-primary-foreground',
  warning: 'border-destructive bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
  neutral: 'border-foreground bg-background text-foreground',
};

/**
 * Small inline status chip. Presentational only — callers pass a derived tone +
 * label (see `lib/entity-status.ts`). Reused across the Deals, Offers, and
 * Promotions list/detail screens so the status vocabulary stays consistent.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border-2 px-2 py-0.5 text-xs font-bold shadow-[var(--shadow-offset-sm)] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
