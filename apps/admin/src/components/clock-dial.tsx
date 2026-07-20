import { useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Brutalist Material-style analog clock dial.
 *
 * VALUE CONTRACT: `value`/`onChange` speak a 24-hour `"HH:mm"` string. The 12-hour
 * face plus AM/PM toggle is presentation only — the caller never sees a `Date`, a
 * period, or a locale-formatted string, so `DateTimeField` can splice this straight
 * into its own `"YYYY-MM-DDTHH:mm"` contract without any conversion.
 *
 * INTERACTION MODEL — three paths to the same value, deliberately:
 *   1. Click a number on the face. Hour clicks advance the stage to minutes; the
 *      minute ring is labelled every 5 (00, 05, … 55) because 60 legible labels do
 *      not fit a 240px face.
 *   2. Drag anywhere on the face. Dragging snaps to 1-minute granularity, NOT 5 —
 *      this is what keeps `23:59` (the default promo-end value) reachable on the
 *      dial itself rather than only through the numeric field.
 *   3. Type in the `[HH]:[MM]` readout, or focus the face and use arrow keys.
 *      Arrows step 1 unit, PageUp/PageDown step 5, Home/End jump to the extremes.
 *
 * Clicks are resolved semantically (each number is a real hit target) and drags are
 * resolved geometrically (angle from centre). Keeping those two paths separate is
 * why a plain click never runs trigonometry: pointer-down only starts a drag when it
 * lands on the face background, so tapping "3" can never be nudged to "2" by a
 * one-pixel jitter between mousedown and mouseup.
 *
 * ACCESSIBILITY: the face is a single `role="slider"` — the numbers inside it are
 * `aria-hidden` pointer targets, not focus stops, so screen-reader and keyboard users
 * get one coherent control per stage instead of 12 unlabelled buttons to tab past.
 * The numeric inputs are the documented alternative for exact entry.
 *
 * BOUNDS (`min`/`max`, both `"HH:mm"`) narrow every one of those paths at once, because
 * they are enforced in `commit` — the single funnel all three go through. An hour is
 * only offered when at least one minute inside it is reachable; picking such an hour
 * pulls the minutes to the nearest allowed value rather than emitting an out-of-range
 * time. Rejected input is a no-op, so a drag or an arrow key stops at the bound instead
 * of wrapping past it.
 */
interface ClockDialProps {
  /** 24-hour `"HH:mm"`. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest allowed `"HH:mm"`, inclusive. Unbounded when omitted. */
  min?: string;
  /** Latest allowed `"HH:mm"`, inclusive. Unbounded when omitted. */
  max?: string;
  className?: string;
}

type Stage = 'hour' | 'minute';

const CENTER = 120;
const RING_RADIUS = 92;
const HOUR_NUMBERS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Polar → cartesian on the face, with 12 o'clock at the top (−90°). */
function pointAt(index: number, stepsPerTurn: number, radius: number) {
  const radians = ((index * (360 / stepsPerTurn) - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

/** Splits `"HH:mm"` into the 12-hour face position plus the 24-hour parts. */
function readValue(value: string) {
  const [rawHours, rawMinutes] = value.split(':');
  const hours24 = Number(rawHours);
  const minutes = Number(rawMinutes);
  const safeHours = Number.isFinite(hours24) ? Math.min(23, Math.max(0, hours24)) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0;
  return {
    hours24: safeHours,
    minutes: safeMinutes,
    hours12: safeHours % 12 === 0 ? 12 : safeHours % 12,
    period: safeHours < 12 ? ('AM' as const) : ('PM' as const),
  };
}

/** `"HH:mm"` → minutes past midnight, or `null` when absent/unparseable. */
function toMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const [rawHours, rawMinutes] = time.split(':');
  const h = Number(rawHours);
  const m = Number(rawMinutes);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function ClockDial({ value, onChange, min, max, className }: ClockDialProps) {
  const [stage, setStage] = useState<Stage>('hour');
  const minMinutes = toMinutes(min);
  const maxMinutes = toMinutes(max);
  /** Held only while an input is mid-edit, so a half-typed "1" is not clamped to 01. */
  const [draft, setDraft] = useState<{ field: 'hour' | 'minute'; text: string } | null>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const { hours24, minutes, hours12, period } = readValue(value);

  function isAllowed(totalMinutes: number): boolean {
    if (minMinutes !== null && totalMinutes < minMinutes) return false;
    if (maxMinutes !== null && totalMinutes > maxMinutes) return false;
    return true;
  }

  /**
   * The nearest allowed time that stays inside `hour24`, or `null` when the whole hour
   * is out of range. Keeping the clamp within the hour is what lets a click on "11"
   * mean 11 — landing on 11:30 under a `min` of 11:30 rather than silently jumping to
   * a different hour the admin never pointed at.
   */
  function clampWithinHour(hour24: number, minute: number): number | null {
    const low = Math.max(hour24 * 60, minMinutes ?? Number.NEGATIVE_INFINITY);
    const high = Math.min(hour24 * 60 + 59, maxMinutes ?? Number.POSITIVE_INFINITY);
    if (low > high) return null;
    return Math.min(high, Math.max(low, hour24 * 60 + minute));
  }

  /** The one funnel every input path shares — so the bound only needs enforcing here. */
  function commit(nextHours24: number, nextMinutes: number) {
    if (!isAllowed(nextHours24 * 60 + nextMinutes)) return;
    onChange(`${pad(nextHours24)}:${pad(nextMinutes)}`);
  }

  function commitTotal(totalMinutes: number) {
    commit(Math.floor(totalMinutes / 60), totalMinutes % 60);
  }

  function isHourDisabled(hour12: number, forPeriod: 'AM' | 'PM' = period): boolean {
    const base = hour12 % 12;
    return clampWithinHour(forPeriod === 'AM' ? base : base + 12, 0) === null;
  }

  /** Applies a 12-hour face position against the current AM/PM half. */
  function setHour12(next12: number, nextPeriod: 'AM' | 'PM' = period) {
    const base = next12 % 12;
    const hour24 = nextPeriod === 'AM' ? base : base + 12;
    const clamped = clampWithinHour(hour24, minutes);
    if (clamped === null) return;
    commit(Math.floor(clamped / 60), clamped % 60);
  }

  function setMinute(next: number) {
    commit(hours24, ((next % 60) + 60) % 60);
  }

  /** The allowed window inside a 12-hour half, or `null` when the half is unreachable. */
  function halfRange(half: 'AM' | 'PM'): { low: number; high: number } | null {
    const start = half === 'AM' ? 0 : 12 * 60;
    const low = Math.max(start, minMinutes ?? Number.NEGATIVE_INFINITY);
    const high = Math.min(start + 12 * 60 - 1, maxMinutes ?? Number.POSITIVE_INFINITY);
    return low > high ? null : { low, high };
  }

  function setPeriod(next: 'AM' | 'PM') {
    if (next === period) return;
    const hour24 = (hours12 % 12) + (next === 'AM' ? 0 : 12);

    const sameHour = clampWithinHour(hour24, minutes);
    if (sameHour !== null) return commitTotal(sameHour);

    // The mirrored hour is out of range (e.g. 2 AM under a `min` of 11:00), so land on
    // the nearest reachable time in that half instead of silently ignoring the click.
    const range = halfRange(next);
    if (!range) return;
    commitTotal(Math.min(range.high, Math.max(range.low, hour24 * 60 + minutes)));
  }

  /** Geometric hit-test for drags — 1-minute granularity keeps 23:59 dial-reachable. */
  function applyPointer(clientX: number, clientY: number) {
    const rect = faceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    const degrees = ((((Math.atan2(y, x) * 180) / Math.PI + 90) % 360) + 360) % 360;

    if (stage === 'hour') {
      setHour12(Math.round(degrees / 30) % 12 || 12);
    } else {
      setMinute(Math.round(degrees / 6) % 60);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Only the face background starts a drag. Number targets keep their own click
    // handler, so a click is never re-interpreted through the angle math.
    if (event.target !== event.currentTarget) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    applyPointer(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    applyPointer(event.clientX, event.clientY);
  }

  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (stage === 'hour') setStage('minute');
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = (delta: number) => {
      event.preventDefault();
      if (stage === 'hour') {
        // Step through all 24 hours so arrows can cross noon/midnight on their own.
        commit((((hours24 + delta) % 24) + 24) % 24, minutes);
      } else {
        setMinute(minutes + delta);
      }
    };

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return step(1);
      case 'ArrowDown':
      case 'ArrowLeft':
        return step(-1);
      case 'PageUp':
        return step(5);
      case 'PageDown':
        return step(-5);
      // The extremes are the extremes of what is *reachable*, so under a bound Home/End
      // land on the bound itself rather than doing nothing at 00:00 / 23:59.
      case 'Home':
        event.preventDefault();
        return stage === 'hour'
          ? commitTotal(Math.max(0, minMinutes ?? 0))
          : setMinute(Math.max(0, (clampWithinHour(hours24, 0) ?? hours24 * 60) - hours24 * 60));
      case 'End':
        event.preventDefault();
        return stage === 'hour'
          ? commitTotal(Math.min(23 * 60 + 59, maxMinutes ?? 23 * 60 + 59))
          : setMinute((clampWithinHour(hours24, 59) ?? hours24 * 60 + 59) - hours24 * 60);
      case 'Enter':
      case ' ':
        event.preventDefault();
        return setStage(stage === 'hour' ? 'minute' : 'hour');
      default:
        return undefined;
    }
  }

  /** Numeric readout edits: accept the keystroke, commit only once it parses. */
  function handleNumericChange(field: 'hour' | 'minute', text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 2);
    setDraft({ field, text: digits });
    if (digits === '') return;
    const parsed = Number(digits);
    if (field === 'hour') {
      if (parsed >= 1 && parsed <= 12) setHour12(parsed);
    } else if (parsed <= 59) {
      setMinute(parsed);
    }
  }

  const handAngle = stage === 'hour' ? (hours12 % 12) * 30 : minutes * 6;
  const activeIndex = stage === 'hour' ? hours12 % 12 : Math.round(minutes / 5) % 12;
  // The hand only lands on a labelled tick when the minute is a multiple of 5;
  // in between it reads as a bare pointer, which is the honest signal that the
  // value is off-label (e.g. :59) rather than mis-snapped.
  const handOnLabel = stage === 'hour' || minutes % 5 === 0;

  const numbers = stage === 'hour' ? HOUR_NUMBERS : HOUR_NUMBERS.map((_, i) => i * 5);
  const valueText = `${hours12}:${pad(minutes)} ${period}`;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Numeric readout — the exact-entry and keyboard path. Each field also acts
          as the stage selector, mirroring Material's behaviour. */}
      <div className="flex items-center gap-2">
        <div className="flex items-stretch gap-1">
          <input
            aria-label="Hour"
            inputMode="numeric"
            value={draft?.field === 'hour' ? draft.text : String(hours12)}
            onFocus={() => setStage('hour')}
            onChange={(e) => handleNumericChange('hour', e.target.value)}
            onBlur={() => setDraft(null)}
            className={cn(
              'h-11 w-14 rounded-md border-2 border-foreground text-center font-display text-h2 font-bold tabular-nums',
              'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
              stage === 'hour'
                ? 'bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                : 'bg-background',
            )}
          />
          <span className="self-center font-display text-h2 font-bold">:</span>
          <input
            aria-label="Minute"
            inputMode="numeric"
            value={draft?.field === 'minute' ? draft.text : pad(minutes)}
            onFocus={() => setStage('minute')}
            onChange={(e) => handleNumericChange('minute', e.target.value)}
            onBlur={() => setDraft(null)}
            className={cn(
              'h-11 w-14 rounded-md border-2 border-foreground text-center font-display text-h2 font-bold tabular-nums',
              'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
              stage === 'minute'
                ? 'bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                : 'bg-background',
            )}
          />
        </div>

        <div className="flex flex-col gap-1">
          {(['AM', 'PM'] as const).map((option) => {
            // A half is unreachable when no time in it clears the bound — e.g. AM under
            // a `min` of 2:00 PM. Offering it would just silently do nothing.
            const halfDisabled = option !== period && halfRange(option) === null;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                disabled={halfDisabled}
                aria-disabled={halfDisabled || undefined}
                aria-pressed={period === option}
                className={cn(
                  'rounded-md border-2 border-foreground px-2 text-xs font-bold',
                  'outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
                  halfDisabled
                    ? 'cursor-not-allowed bg-muted text-muted-foreground line-through decoration-2'
                    : period === option
                      ? 'cursor-pointer bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                      : 'cursor-pointer bg-background hover:bg-muted',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <p className="font-display text-caption font-semibold text-muted-foreground">
        {stage === 'hour' ? 'Pick an hour' : 'Pick a minute'}
      </p>

      {/* The face. One slider, one tab stop, one announced value per stage. */}
      <div
        ref={faceRef}
        role="slider"
        tabIndex={0}
        aria-label={stage === 'hour' ? 'Hour dial' : 'Minute dial'}
        // Announced range narrows with the bound, so a screen-reader user hears the
        // real limits rather than a full day they cannot actually traverse.
        aria-valuemin={
          stage === 'hour'
            ? Math.floor(Math.max(0, minMinutes ?? 0) / 60)
            : Math.max(0, (clampWithinHour(hours24, 0) ?? hours24 * 60) - hours24 * 60)
        }
        aria-valuemax={
          stage === 'hour'
            ? Math.floor(Math.min(23 * 60 + 59, maxMinutes ?? 23 * 60 + 59) / 60)
            : (clampWithinHour(hours24, 59) ?? hours24 * 60 + 59) - hours24 * 60
        }
        aria-valuenow={stage === 'hour' ? hours24 : minutes}
        aria-valuetext={valueText}
        data-stage={stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative size-60 touch-none rounded-full border-2 border-foreground bg-muted select-none',
          'shadow-[var(--shadow-offset-sm)] outline-hidden focus-visible:ring-3 focus-visible:ring-ring/50',
        )}
      >
        {/* Hand + hub, behind the numbers and inert to the pointer so the face
            background keeps receiving drag events across the whole disc. */}
        <svg
          viewBox="0 0 240 240"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <g
            className="transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: `rotate(${handAngle}deg)`, transformOrigin: '120px 120px' }}
          >
            <line
              x1={CENTER}
              y1={CENTER}
              x2={CENTER}
              y2={CENTER - RING_RADIUS}
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle
              cx={CENTER}
              cy={CENTER - RING_RADIUS}
              r={handOnLabel ? 18 : 6}
              fill={handOnLabel ? 'transparent' : 'var(--color-jyellow)'}
              stroke="var(--color-ink)"
              strokeWidth={2}
            />
          </g>
          <circle cx={CENTER} cy={CENTER} r={4} fill="var(--color-ink)" />
        </svg>

        {numbers.map((number, index) => {
          const { x, y } = pointAt(index, 12, RING_RADIUS);
          const isActive = index === activeIndex && handOnLabel;
          const isDisabled =
            stage === 'hour'
              ? isHourDisabled(number === 0 ? 12 : number)
              : !isAllowed(hours24 * 60 + number);
          return (
            <button
              key={number}
              type="button"
              // aria-hidden + tabIndex -1: the parent slider is the accessible
              // control. These exist purely so a mouse can hit an exact number.
              aria-hidden="true"
              tabIndex={-1}
              disabled={isDisabled}
              aria-disabled={isDisabled || undefined}
              data-dial-value={number}
              onClick={() => {
                if (stage === 'hour') {
                  setHour12(number === 0 ? 12 : number);
                  setStage('minute');
                } else {
                  setMinute(number);
                }
              }}
              style={{ left: x, top: y }}
              className={cn(
                'absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full',
                'text-sm font-bold tabular-nums transition-colors motion-reduce:transition-none',
                isDisabled
                  ? // Same vocabulary as a disabled calendar day: full-strength muted
                    // plus a strike, so the state reads without relying on colour.
                    'cursor-not-allowed text-muted-foreground line-through decoration-2'
                  : isActive
                    ? 'cursor-pointer border-2 border-foreground bg-primary text-primary-foreground'
                    : 'cursor-pointer text-foreground hover:bg-background',
              )}
            >
              {stage === 'hour' ? number : pad(number)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
