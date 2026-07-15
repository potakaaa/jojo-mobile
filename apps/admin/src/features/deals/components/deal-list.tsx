import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';

import { DEAL_TYPE_LABELS } from './deal-form';
import type { AdminDeal } from '../lib/admin-deals-api';

/**
 * Deal management table (ADM-004) — the umbrella's real second consumer of the
 * shared `DataTable` composite (Decision 4). Column defs + per-row action slot;
 * loading/error/empty delegate to `DataTable` → `QueryStates`. Inactive deals
 * stay visible (dimmed). No "Reactivate" action — the ADM-004 contract has no
 * reactivate route (PATCH excludes `is_active`; deactivation is one-way this phase).
 * Deactivate lives on the detail screen (D1) where the deal's outstanding-coupon
 * count is already loaded for the confirm dialog — Manage navigates there.
 */
interface DealListProps {
  deals: AdminDeal[] | undefined;
  isLoading: boolean;
  error: unknown;
  onManage: (deal: AdminDeal) => void;
  onEdit: (deal: AdminDeal) => void;
}

function formatDiscount(deal: AdminDeal): string {
  if (deal.discountValue === null) return '—';
  if (deal.dealType === 'percentage_discount') return `${deal.discountValue / 100}%`;
  if (deal.dealType === 'fixed_discount') return `₱${(deal.discountValue / 100).toFixed(2)}`;
  return '—';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function DealList({ deals, isLoading, error, onManage, onEdit }: DealListProps) {
  const columns: DataTableColumn<AdminDeal>[] = [
    { key: 'title', header: 'Title', cell: (d) => d.title },
    { key: 'type', header: 'Type', cell: (d) => DEAL_TYPE_LABELS[d.dealType] },
    {
      key: 'discount',
      header: 'Discount',
      cell: (d) => formatDiscount(d),
      className: 'font-mono text-xs',
    },
    {
      key: 'window',
      header: 'Window',
      cell: (d) => `${formatDate(d.startAt)} → ${formatDate(d.endAt)}`,
      className: 'text-xs',
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
