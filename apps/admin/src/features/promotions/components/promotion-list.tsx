import { DataTable, type DataTableColumn } from '@/components/data-table';

import type { AdminPromotion } from '../lib/admin-promotions-api';

/**
 * Promotions table (ADM-008) — a consumer of the shared `DataTable` composite.
 * Presentational only: the parent route supplies the query data + state, so this
 * component has no react-query dependency and is directly renderable in a test.
 */
interface PromotionListProps {
  promotions: AdminPromotion[] | undefined;
  isLoading: boolean;
  error: unknown;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function PromotionList({ promotions, isLoading, error }: PromotionListProps) {
  const columns: DataTableColumn<AdminPromotion>[] = [
    { key: 'name', header: 'Name', cell: (p) => p.name },
    {
      key: 'description',
      header: 'Description',
      cell: (p) => p.description ?? '—',
      className: 'text-muted-foreground',
    },
    {
      key: 'window',
      header: 'Window',
      cell: (p) => `${formatDate(p.startAt)} – ${formatDate(p.endAt)}`,
      className: 'text-xs',
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={promotions}
      rowKey={(p) => p.id}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading promotions…"
      errorLabel="Failed to load promotions"
      emptyLabel="No promotions yet. Create the first one."
    />
  );
}
