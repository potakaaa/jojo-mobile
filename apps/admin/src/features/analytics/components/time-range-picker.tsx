/**
 * Time-range picker (ADM-007) — "Last 7 days" / "Last 30 days" presets plus custom
 * from/to date inputs. Preset math is Manila-local (D3) and pure/unit-testable
 * (`computePresetRange`). Presentational: the parent owns the range state.
 */

export interface DateRange {
  from: string;
  to: string;
}

export type RangePreset = '7d' | '30d';

/** Manila is a fixed +08:00 offset (no DST). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Format an instant as its Manila calendar date (`YYYY-MM-DD`). */
export function formatManilaDate(instant: Date): string {
  const manila = new Date(instant.getTime() + MANILA_OFFSET_MS);
  const year = manila.getUTCFullYear();
  const month = String(manila.getUTCMonth() + 1).padStart(2, '0');
  const day = String(manila.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Inclusive last-N-days range ending today (Manila local days). "Last 7 days" is
 * `[today − 6, today]`; "Last 30 days" is `[today − 29, today]`. Pure — pass a
 * fixed `now` in tests.
 */
export function computePresetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const days = preset === '7d' ? 7 : 30;
  const to = formatManilaDate(now);
  const from = formatManilaDate(new Date(now.getTime() - (days - 1) * ONE_DAY_MS));
  return { from, to };
}

interface TimeRangePickerProps {
  range: DateRange;
  onChange: (next: DateRange) => void;
}

const inputClass =
  'h-9 rounded-md border-2 border-border bg-background px-2 text-sm text-foreground';
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-muted-foreground';
const presetClass =
  'h-9 rounded-md border-2 border-foreground bg-secondary/40 px-3 text-sm font-semibold text-foreground hover:bg-secondary';

export function TimeRangePicker({ range, onChange }: TimeRangePickerProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-foreground p-4">
      <button
        type="button"
        className={presetClass}
        onClick={() => onChange(computePresetRange('7d'))}
      >
        Last 7 days
      </button>
      <button
        type="button"
        className={presetClass}
        onClick={() => onChange(computePresetRange('30d'))}
      >
        Last 30 days
      </button>

      <label className={labelClass}>
        From
        <input
          type="date"
          className={inputClass}
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
        />
      </label>

      <label className={labelClass}>
        To
        <input
          type="date"
          className={inputClass}
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
        />
      </label>
    </div>
  );
}
