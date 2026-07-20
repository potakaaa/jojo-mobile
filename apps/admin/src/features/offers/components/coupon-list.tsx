import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';

import type { AdminCoupon } from '../lib/admin-offers-api';

/**
 * Issued-coupon list sub-view (ADM-008), rendered on the Offer detail page below
 * the Generate panel. Consumer of the shared `DataTable` composite. Columns: code,
 * status, recipient (a targeted `userId`, else "Bulk"), and expiry, with a
 * per-row copy-code action. Presentational only.
 */
interface CouponListProps {
  coupons: AdminCoupon[] | undefined;
  isLoading: boolean;
  error: unknown;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function copyCode(code: string): void {
  try {
    void navigator.clipboard?.writeText(code);
  } catch {
    /* clipboard unavailable (e.g. non-secure context) — no-op */
  }
}

export function CouponList({ coupons, isLoading, error }: CouponListProps) {
  const columns: DataTableColumn<AdminCoupon>[] = [
    { key: 'code', header: 'Code', cell: (c) => c.code, className: 'font-mono text-xs' },
    { key: 'status', header: 'Status', cell: (c) => c.status },
    {
      key: 'recipient',
      header: 'Recipient',
      cell: (c) => (c.userId ? `Targeted · ${c.userId.slice(0, 8)}…` : 'Bulk'),
      className: 'text-xs',
    },
    {
      key: 'expires',
      header: 'Expires',
      cell: (c) => formatDate(c.expiresAt),
      className: 'text-xs',
    },
    {
      key: 'actions',
      header: '',
      cell: (c) => (
        <Button size="sm" variant="secondary" onClick={() => copyCode(c.code)}>
          Copy
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={coupons}
      rowKey={(c) => c.id}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading coupons…"
      errorLabel="Failed to load coupons"
      emptyLabel="No coupons issued yet."
    />
  );
}
