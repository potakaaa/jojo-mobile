import type { AdminTopSellingProduct } from '@jojopotato/types';

import { DataTable, type DataTableColumn } from '@/components/data-table';

import { formatPeso } from '../lib/format';

/**
 * Top-selling-products table (ADM-007, D8a) — a consumer of the shared `DataTable`
 * composite, mirroring `branch-orders-table.tsx`. Presentational: the parent
 * supplies the already-ranked rows (server orders them by quantity DESC, ≤10).
 */
interface TopProductsTableProps {
  rows: AdminTopSellingProduct[] | undefined;
}

/** Static column config — module level so the reference is stable across renders. */
const COLUMNS: DataTableColumn<AdminTopSellingProduct>[] = [
  { key: 'product', header: 'Product', cell: (r) => r.productName },
  {
    key: 'quantity',
    header: 'Qty sold',
    cell: (r) => r.quantitySold,
    className: 'font-mono text-xs',
  },
  {
    key: 'revenue',
    header: 'Revenue',
    cell: (r) => formatPeso(r.revenueCents),
    className: 'font-mono text-xs',
  },
];

export function TopProductsTable({ rows }: TopProductsTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.productId}
      emptyLabel="No product sales in this range."
    />
  );
}
