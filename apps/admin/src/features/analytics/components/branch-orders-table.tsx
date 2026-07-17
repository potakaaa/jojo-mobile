import type { AdminBranchOrderCount } from '@jojopotato/types';

import { DataTable, type DataTableColumn } from '@/components/data-table';

/**
 * Orders-per-branch table (ADM-007) — a consumer of the shared `DataTable`
 * composite. Presentational: the parent supplies the already-fetched rows.
 */
interface BranchOrdersTableProps {
  rows: AdminBranchOrderCount[] | undefined;
}

export function BranchOrdersTable({ rows }: BranchOrdersTableProps) {
  const columns: DataTableColumn<AdminBranchOrderCount>[] = [
    { key: 'branch', header: 'Branch', cell: (r) => r.branchName },
    {
      key: 'orders',
      header: 'Orders',
      cell: (r) => r.orderCount,
      className: 'font-mono text-xs',
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.branchId}
      emptyLabel="No branches to report."
    />
  );
}
