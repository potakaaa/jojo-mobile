import type { AdminTopSellingProduct } from '@jojopotato/types';

import { DataTable, type DataTableColumn } from '@/components/data-table';

/**
 * Top-selling-products table (ADM-007, D8a) — a consumer of the shared `DataTable`
 * composite, mirroring `branch-orders-table.tsx`. Presentational: the parent
 * supplies the already-ranked rows (server orders them by quantity DESC, ≤10).
 */
interface TopProductsTableProps {
  rows: AdminTopSellingProduct[] | undefined;
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

export function TopProductsTable({ rows }: TopProductsTableProps) {
  const columns: DataTableColumn<AdminTopSellingProduct>[] = [
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

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.productId}
      emptyLabel="No product sales in this range."
    />
  );
}
