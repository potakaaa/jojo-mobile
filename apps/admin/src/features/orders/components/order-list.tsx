import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';

import { orderStatusLabel, orderStatusTone, type AdminOrderSummary } from '../lib/admin-orders-api';

/**
 * Orders table (ADM-006) — a consumer of the shared `DataTable` composite. Read-only:
 * "View" navigates to the detail page; there is no edit/delete action (D1).
 * Presentational (the parent route supplies query data + state).
 */
interface OrderListProps {
  orders: AdminOrderSummary[] | undefined;
  isLoading: boolean;
  error: unknown;
  onView: (order: AdminOrderSummary) => void;
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function OrderList({ orders, isLoading, error, onView }: OrderListProps) {
  const columns: DataTableColumn<AdminOrderSummary>[] = [
    {
      key: 'orderNumber',
      header: 'Order',
      cell: (o) => o.orderNumber,
      className: 'font-mono text-xs',
    },
    { key: 'branch', header: 'Branch', cell: (o) => o.branchName },
    { key: 'customer', header: 'Customer', cell: (o) => o.customerName },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => (
        <StatusBadge tone={orderStatusTone(o.status)}>{orderStatusLabel(o.status)}</StatusBadge>
      ),
    },
    { key: 'placedAt', header: 'Placed', cell: (o) => formatDateTime(o.placedAt) },
    {
      key: 'total',
      header: 'Total',
      cell: (o) => formatPeso(o.totalCents),
      className: 'font-mono text-xs',
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (o) => (
        <Button size="sm" variant="secondary" onClick={() => onView(o)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={orders}
      rowKey={(o) => o.id}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading orders…"
      errorLabel="Failed to load orders"
      emptyLabel="No orders match these filters."
    />
  );
}
