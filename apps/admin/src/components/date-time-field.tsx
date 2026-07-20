import { useId, useState } from 'react';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClockDial } from '@/components/clock-dial';
import { cn } from '@/lib/utils';

/**
 * Brutalist date + time field — the replacement for `<Input type="datetime-local">`.
 *
 * The native control hides time selection behind the browser's calendar chrome; this
 * one surfaces both in a single popover, as two stages behind a Date/Time toggle.
 * Stacking a calendar above a 240px clock face would make the popover taller than
 * most viewports leave below a form row, so only one is mounted at a time; picking a
 * day auto-advances to Time, which is also the order the task is actually performed in.
 *
 * VALUE CONTRACT (load-bearing — do not change): `value`/`onChange` speak the exact
 * same naive-local string the native input emitted, `"YYYY-MM-DDTHH:mm"`, with `''`
 * meaning empty. No `Date` crosses the boundary and no timezone conversion happens,
 * so every downstream consumer (form state, validation, the `toIso()` call at submit)
 * behaves identically to before. Dates are built with `new Date(y, m - 1, d)` rather
 * than `new Date(string)` precisely because the latter parses a bare date as UTC and
 * would shift the day for anyone west of Greenwich.
 *
 * `required` renders as `aria-required` rather than a native constraint: a popover is
 * not natively form-validatable. The call sites already gate submit in JS and surface
 * a visible message, which is the real enforcement — this is the accessible label for it.
 *
 * BOUNDS (`min`/`max`) are passed in, never derived here. The component has no opinion
 * about "now" — a caller that wants "no past dates" hands it the current timestamp, and
 * the control stays a pure function of its props (which is also what makes it testable
 * without freezing the clock). These are an input-guidance affordance only; the server
 * remains the authority on what an offer window may actually be.
 *
 * GRANDFATHERING is the load-bearing rule. An offer that started last week is edited
 * with `min` = now, so its own saved `value` is already out of bounds. Blocking it would
 * force an unrelated re-pick on every edit of a live record, so the currently-selected
 * day is ALWAYS exempt from both bounds — the calendar disables everything before `min`
 * *except* the day the value already sits on. New picks are still bounded; only the
 * incumbent value is preserved. A naive `disabled={day < min}` breaks exactly this case.
 */
interface DateTimeFieldProps {
  /** Visible field label; also the accessible name of the trigger. */
  label: string;
  /** Naive-local `"YYYY-MM-DDTHH:mm"`, or `''` when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Marks the field `aria-required`. Submit gating stays with the parent form. */
  required?: boolean;
  /** Time applied when a date is chosen while no time is set yet. */
  defaultTime?: string;
  /**
   * Earliest selectable value, same `"YYYY-MM-DDTHH:mm"` contract as `value`.
   * The already-selected day is exempt — see GRANDFATHERING above.
   */
  min?: string;
  /** Latest selectable value, same contract and same grandfathering exemption. */
  max?: string;
  /** Extra classes for the outer wrapper (e.g. `flex-1` inside a row). */
  className?: string;
}

const VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** en-US is pinned deliberately: the admin UI is single-locale and this keeps the
 *  rendered trigger text deterministic across machines and in tests. */
const DISPLAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Trimmed from four presets to two. A dial reaches 9:00 AM and 12:00 PM in two
 * clicks, so those chips no longer earn their space — but the day boundaries are
 * exactly the values a 5-minute-labelled dial is worst at, and `23:59` is both the
 * `Ends` default and the most-used promo boundary. These two stay as the one-click
 * path; the dial's 1-minute drag and the numeric field remain the general case.
 */
const TIME_PRESETS = [
  { label: 'Start of day', time: '00:00' },
  { label: 'End of day', time: '23:59' },
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Splits the contract string into a local-midnight Date + an `HH:mm` string. */
export function parseDateTimeValue(value: string): { date: Date | undefined; time: string } {
  const match = VALUE_PATTERN.exec(value);
  if (!match) return { date: undefined, time: '' };
  const [, year, month, day, hours, minutes] = match;
  return {
    date: new Date(Number(year), Number(month) - 1, Number(day)),
    time: `${hours}:${minutes}`,
  };
}

/** Re-assembles the contract string from a local Date + an `HH:mm` string. */
export function buildDateTimeValue(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

function formatDisplay(value: string): string | null {
  const { date, time } = parseDateTimeValue(value);
  if (!date || !time) return null;
  const [hours, minutes] = time.split(':');
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return DISPLAY_FORMAT.format(date);
}

/** Local midnight of a date — the granularity the calendar grid compares at. */
function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameDay(a: Date, b: Date): boolean {
  return dayStart(a) === dayStart(b);
}

/**
 * Brand disabled language. Deliberately NOT `opacity-50`: at 50% the neutral-700
 * muted token drops under 4.5:1 and "unavailable" becomes indistinguishable from
 * "just not selected yet" — which in a grid of 42 unselected days is every cell.
 * Full-strength muted text plus a strike keeps the contrast and adds a non-colour
 * signal, so the state survives greyscale and colour-blind viewing both.
 */
const DISABLED_CELL =
  'text-muted-foreground line-through decoration-2 cursor-not-allowed ' +
  'hover:border-transparent hover:bg-transparent';

export function DateTimeField({
  label,
  value,
  onChange,
  required = false,
  defaultTime = '09:00',
  min,
  max,
  className,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'date' | 'time'>('date');
  /** Transient explanation for a rejected interaction — silence would be worse. */
  const [reason, setReason] = useState<string | null>(null);
  const triggerId = useId();

  const { date, time } = parseDateTimeValue(value);
  const display = formatDisplay(value);

  const minParsed = parseDateTimeValue(min ?? '');
  const maxParsed = parseDateTimeValue(max ?? '');

  /**
   * The day a time-only interaction lands on. Falls back to the earliest allowed day
   * rather than raw today, so "pick a time first" cannot manufacture a past value on a
   * field whose whole point is that the past is unavailable.
   */
  const fallbackDate =
    minParsed.date && dayStart(minParsed.date) > dayStart(new Date()) ? minParsed.date : new Date();
  const effectiveDate = date ?? fallbackDate;

  /**
   * Time bounds engage ONLY on the boundary day itself. On a grandfathered earlier day
   * every time is equally past, so clamping hours there would be noise; on any later day
   * the bound is already satisfied by the date alone.
   */
  const timeMin =
    minParsed.date && isSameDay(effectiveDate, minParsed.date) ? minParsed.time : undefined;
  const timeMax =
    maxParsed.date && isSameDay(effectiveDate, maxParsed.date) ? maxParsed.time : undefined;

  /**
   * Zero-padded 24-hour and ISO-ordered date strings compare correctly with `<`, so the
   * whole bounds check is plain string comparison — no Date construction, no drift.
   */
  const isGrandfathered = value !== '' && min !== undefined && value < min;

  function isDayDisabled(day: Date): boolean {
    // GRANDFATHERING: the incumbent day is exempt from both bounds.
    if (date && isSameDay(day, date)) return false;
    const d = dayStart(day);
    if (minParsed.date && d < dayStart(minParsed.date)) return true;
    if (maxParsed.date && d > dayStart(maxParsed.date)) return true;
    return false;
  }

  function isTimeAllowed(candidate: string): boolean {
    if (timeMin !== undefined && candidate < timeMin) return false;
    if (timeMax !== undefined && candidate > timeMax) return false;
    return true;
  }

  /** Picking a day keeps the time already chosen, falling back to `defaultTime`. */
  function handleSelectDate(next: Date | undefined) {
    if (!next) return;
    setReason(null);

    // Carrying a time onto the boundary day can land it out of bounds (e.g. keeping
    // 00:00 while moving onto a `min` day of 11:00), so it is pulled to the bound.
    let nextTime = time || defaultTime;
    const onMinDay = minParsed.date && isSameDay(next, minParsed.date);
    const onMaxDay = maxParsed.date && isSameDay(next, maxParsed.date);
    const grandfatheredDay = date && isSameDay(next, date);
    if (!grandfatheredDay) {
      if (onMinDay && nextTime < minParsed.time) nextTime = minParsed.time;
      if (onMaxDay && nextTime > maxParsed.time) nextTime = maxParsed.time;
    }

    onChange(buildDateTimeValue(next, nextTime));
    setView('time');
  }

  /** Setting a time before a day defaults the day to the earliest allowed one. */
  function handleSelectTime(nextTime: string) {
    if (!nextTime) return;
    setReason(null);
    onChange(buildDateTimeValue(effectiveDate, nextTime));
  }

  const boundHint = (() => {
    if (minParsed.date && minParsed.time) {
      return `Earliest ${formatDisplay(min ?? '')}`;
    }
    if (maxParsed.date && maxParsed.time) {
      return `Latest ${formatDisplay(max ?? '')}`;
    }
    return null;
  })();

  return (
    <div className={cn('flex flex-col gap-1 text-sm', className)}>
      <label htmlFor={triggerId}>{label}</label>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setReason(null);
          // Every open starts on Date, so the popover never re-opens mid-flow on a
          // stage the user has no memory of leaving.
          if (next) setView('date');
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            aria-required={required || undefined}
            className={cn(
              'flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border-2 border-foreground bg-transparent px-3 py-1 text-left text-sm',
              'transition-shadow outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
              'data-[state=open]:shadow-[var(--shadow-offset-sm)]',
              !display && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className={cn('truncate', display && 'font-semibold')}>
              {display ?? 'Select date and time'}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-auto border-2 border-foreground p-0 shadow-[var(--shadow-offset-md)] motion-reduce:animate-none"
        >
          {/* Stage toggle. Two buttons rather than a real tablist: there is no
              arrow-key roving here, and claiming the tab role without it would
              promise a keyboard contract this control does not honour. */}
          <div className="flex gap-1 border-b-2 border-foreground p-2">
            {(['date', 'time'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setView(option);
                  setReason(null);
                }}
                aria-pressed={view === option}
                className={cn(
                  'flex-1 cursor-pointer rounded-md border-2 border-foreground px-2 py-1 font-display text-xs font-bold capitalize',
                  'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
                  view === option
                    ? 'bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                    : 'bg-background hover:bg-muted',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Bound stated up front. Telling the admin the rule before they hit it beats
              only scolding them after a rejected click, and it is the one message that
              stays true on both stages. */}
          {boundHint || isGrandfathered ? (
            <p className="border-b-2 border-foreground px-3 py-1.5 text-xs text-muted-foreground">
              {isGrandfathered ? 'Keeping this record’s original date.' : boundHint}
            </p>
          ) : null}

          {view === 'date' ? (
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleSelectDate}
              defaultMonth={date ?? (minParsed.date || undefined)}
              disabled={isDayDisabled}
              components={{
                // Wrapped rather than restyled at source: `aria-disabled` makes the
                // state readable to assistive tech instead of leaving it a purely
                // visual one, and the brand strike overrides the primitive's default
                // opacity treatment without touching the shared calendar.
                DayButton: (dayProps) => (
                  <CalendarDayButton
                    {...dayProps}
                    aria-disabled={dayProps.modifiers.disabled || undefined}
                    className={cn(dayProps.className, dayProps.modifiers.disabled && DISABLED_CELL)}
                  />
                ),
              }}
              autoFocus
            />
          ) : (
            <div className="flex flex-col gap-3 p-3">
              <ClockDial
                value={time || defaultTime}
                onChange={handleSelectTime}
                min={timeMin}
                max={timeMax}
              />

              <div className="flex gap-1">
                {TIME_PRESETS.map((preset) => {
                  const allowed = isTimeAllowed(preset.time);
                  return (
                    <button
                      key={preset.time}
                      type="button"
                      // Left clickable on purpose. A chip that silently does nothing is
                      // worse than one that says why, so `aria-disabled` carries the
                      // state while the handler supplies the reason.
                      aria-disabled={!allowed || undefined}
                      onClick={() =>
                        allowed
                          ? handleSelectTime(preset.time)
                          : setReason(`${preset.label} is outside the allowed range.`)
                      }
                      aria-pressed={time === preset.time}
                      className={cn(
                        'flex-1 rounded-md border-2 border-foreground px-2 py-0.5 text-xs font-bold',
                        'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
                        !allowed
                          ? 'cursor-not-allowed bg-muted text-muted-foreground line-through decoration-2'
                          : time === preset.time
                            ? 'cursor-pointer bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                            : 'cursor-pointer bg-background hover:bg-muted',
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {reason ? (
                <p role="status" className="text-xs font-semibold text-destructive">
                  {reason}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex justify-between gap-2 border-t-2 border-foreground p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
