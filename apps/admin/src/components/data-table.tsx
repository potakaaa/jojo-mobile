import type { ReactNode } from 'react';

import { QueryStates } from '@/components/query-states';

/**
 * Generic list-table shell (ADM-004, Decision 4 — the umbrella's flagged "real
 * second-consumer" extraction). A caller supplies column defs (header + a
 * per-row `cell` render slot) and the row data; loading/error/empty states
 * delegate to the shared `QueryStates` composite. Deliberately generic per E3 —
 * any deal-specific rendering lives in the caller's `cell`/`rowClassName`
 * callbacks, never in this shell. Informed by (not copy-pasted from) the three
 * hand-rolled list tables in `features/{branches,categories,products}/`.
 *
 * Intentionally NOT built with built-in sort/pagination controls: none of the
 * three precedent lists have them, the admin deal list is low-cardinality, and
 * adding them would be speculative complexity for a single current consumer
 * (KISS / E3). A caller that later needs sorting sorts its `rows` before passing.
 */
export interface DataTableColumn<T> {
  /** Stable key for the column (used as the React key for header/cell). */
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Optional extra classes for this column's <td>/<th>. */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string;
  isLoading?: boolean;
  error?: unknown;
  loadingLabel?: string;
  errorLabel?: string;
  emptyLabel?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  isLoading = false,
  error,
  loadingLabel,
  errorLabel,
  emptyLabel,
}: DataTableProps<T>) {
  return (
    <QueryStates
      isLoading={isLoading}
      error={error}
      isEmpty={!rows || rows.length === 0}
      loadingLabel={loadingLabel}
      errorLabel={errorLabel}
      emptyLabel={emptyLabel}
    >
      <div className="overflow-x-auto rounded-xl border-2 border-foreground">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b-2 border-foreground bg-secondary/40">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-2 font-semibold ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-foreground/20 ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-2 ${column.className ?? ''}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QueryStates>
  );
}
