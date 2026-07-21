import type { AdminBranch } from '@/features/branches/lib/admin-branches-api';

import {
  ORDER_STATUS_OPTIONS,
  type AdminOrderStatus,
  type OrderFilters,
} from '../lib/admin-orders-api';

/**
 * Read-only order filter bar (ADM-006, D7) — native `<select>` + date inputs,
 * feature-local (matching the offer-form convention; no shared `Select` primitive
 * is introduced until a second consumer needs one). Branch options come from the
 * P2 branches list. Presentational: the parent owns the filter state.
 */
interface OrderFilterBarProps {
  filters: OrderFilters;
  branches: AdminBranch[] | undefined;
  onChange: (next: OrderFilters) => void;
  onReset: () => void;
}

const selectClass =
  'h-9 rounded-md border-2 border-border bg-background px-2 text-sm text-foreground';
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-muted-foreground';

export function OrderFilterBar({ filters, branches, onChange, onReset }: OrderFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-foreground p-4">
      <label className={labelClass}>
        Branch
        <select
          className={selectClass}
          value={filters.branchId ?? ''}
          onChange={(e) => onChange({ ...filters, branchId: e.target.value || undefined })}
        >
          <option value="">All branches</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Status
        <select
          className={selectClass}
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              status: (e.target.value || undefined) as AdminOrderStatus | undefined,
            })
          }
        >
          <option value="">All statuses</option>
          {ORDER_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        From
        <input
          type="date"
          className={selectClass}
          value={filters.dateFrom ?? ''}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
        />
      </label>

      <label className={labelClass}>
        To
        <input
          type="date"
          className={selectClass}
          value={filters.dateTo ?? ''}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
        />
      </label>

      <button
        type="button"
        className="h-9 self-end text-sm text-muted-foreground hover:underline"
        onClick={onReset}
      >
        Clear filters
      </button>
    </div>
  );
}
