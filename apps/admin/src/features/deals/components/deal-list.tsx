import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';

import type { AdminDealProduct } from '../lib/admin-deals-api';

/**
 * Deal management table (ADM-004 deals-as-products) — a consumer of the shared
 * `DataTable` composite (Decision 4). A deal is a product, so the columns mirror
 * the product list (name/price/status) minus category (deals are all in the
 * reserved Deals category). Inactive deals stay visible (dimmed) with a
 * "Reactivate" action; deactivation reuses the products `is_active` toggle
 * (PATCH isActive) — no dedicated deactivate route. Manage navigates to the
 * detail screen where the "what's inside" component editor lives.
 */
interface DealListProps {
  deals: AdminDealProduct[] | undefined;
  isLoading: boolean;
  error: unknown;
  onManage: (deal: AdminDealProduct) => void;
  onEdit: (deal: AdminDealProduct) => void;
  onDeactivate: (deal: AdminDealProduct) => void;
  onReactivate: (deal: AdminDealProduct) => void;
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

export function DealList({
  deals,
  isLoading,
  error,
  onManage,
  onEdit,
  onDeactivate,
  onReactivate,
}: DealListProps) {
  const columns: DataTableColumn<AdminDealProduct>[] = [
    { key: 'name', header: 'Name', cell: (d) => d.name },
    {
      key: 'price',
      header: 'Price',
      cell: (d) => formatPeso(d.basePriceCents),
      className: 'font-mono text-xs',
    },
    { key: 'status', header: 'Status', cell: (d) => (d.isActive ? 'Active' : 'Inactive') },
    {
      key: 'actions',
      header: 'Actions',
      cell: (d) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onManage(d)}>
            Manage
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onEdit(d)}>
            Edit
          </Button>
          {d.isActive ? (
            <Button size="sm" variant="destructive" onClick={() => onDeactivate(d)}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => onReactivate(d)}>
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={deals}
      rowKey={(d) => d.id}
      rowClassName={(d) => (d.isActive ? '' : 'opacity-50')}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading deals…"
      errorLabel="Failed to load deals"
      emptyLabel="No deals yet. Create the first one."
    />
  );
}
