import { cn } from '@/lib/utils';

/**
 * DEAL-005 Phase 2 — a Sun–Sat multi-select for `deal_schedules.recur_days`.
 *
 * VALUE CONTRACT: `value` is an array of day numbers using the JS `Date#getDay()`
 * convention (0=Sun .. 6=Sat) — the SAME convention the column and
 * `toManilaWallClock()` use, so no translation happens anywhere between this control
 * and the live-check. Order is not significant; the component emits ascending order
 * so the payload is stable across click sequences (a set, rendered as an array).
 *
 * Fully CONTROLLED: it holds no internal selection state, so `value` is always the
 * single source of truth and a parent reset cannot desync the UI.
 *
 * The days shown are wall-clock MANILA days — the server never interprets them in
 * UTC. See `packages/api/src/db/schema/deal_schedules.ts` for the full rule.
 */

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

export interface DayOfWeekPickerProps {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function DayOfWeekPicker({
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel = 'Repeat on days',
}: DayOfWeekPickerProps) {
  function toggle(day: number) {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(next.sort((a, b) => a - b));
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {DAYS.map((day) => {
        const selected = value.includes(day.value);
        return (
          <button
            key={day.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => toggle(day.value)}
            className={cn(
              'min-w-11 rounded-md border-2 border-foreground px-2 py-1 font-display text-xs font-bold',
              'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
              disabled
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : selected
                  ? 'cursor-pointer bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                  : 'cursor-pointer bg-background hover:bg-muted',
            )}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}
