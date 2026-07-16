import { DataTable, type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';

import { OFFER_TYPE_OPTIONS, type AdminOffer } from '../lib/admin-offers-api';

/**
 * Offers table (ADM-008) — a consumer of the shared `DataTable` composite.
 * Presentational only (the parent route supplies query data + state). "Manage"
 * navigates to the Offer detail page (Generate Coupons + coupon list live there);
 * "Edit" opens the create/edit dialog.
 */
interface OfferListProps {
  offers: AdminOffer[] | undefined;
  isLoading: boolean;
  error: unknown;
  onManage: (offer: AdminOffer) => void;
  onEdit: (offer: AdminOffer) => void;
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

function offerTypeLabel(type: AdminOffer['offerType']): string {
  return OFFER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/**
 * Discount value display is polymorphic (matches the admin boundary): the raw
 * value ×100 is stored as `discountValueCents`, so a percentage shows as a % and
 * a fixed discount shows as pesos. The four complex types have no scalar value.
 */
function discountDisplay(offer: AdminOffer): string {
  if (offer.discountValueCents === null) return '—';
  if (offer.offerType === 'percentage_discount') return `${offer.discountValueCents / 100}%`;
  if (offer.offerType === 'fixed_discount') return formatPeso(offer.discountValueCents);
  return '—';
}

export function OfferList({ offers, isLoading, error, onManage, onEdit }: OfferListProps) {
  const columns: DataTableColumn<AdminOffer>[] = [
    { key: 'title', header: 'Title', cell: (o) => o.title },
    { key: 'mechanic', header: 'Mechanic', cell: (o) => offerTypeLabel(o.offerType) },
    {
      key: 'value',
      header: 'Value',
      cell: (o) => discountDisplay(o),
      className: 'font-mono text-xs',
    },
    {
      key: 'min',
      header: 'Min order',
      cell: (o) => formatPeso(o.minimumOrderAmountCents),
      className: 'font-mono text-xs',
    },
    { key: 'status', header: 'Status', cell: (o) => (o.isActive ? 'Active' : 'Inactive') },
    {
      key: 'actions',
      header: 'Actions',
      cell: (o) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onManage(o)}>
            Manage
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onEdit(o)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={offers}
      rowKey={(o) => o.id}
      rowClassName={(o) => (o.isActive ? '' : 'opacity-50')}
      isLoading={isLoading}
      error={error}
      loadingLabel="Loading offers…"
      errorLabel="Failed to load offers"
      emptyLabel="No offers yet. Create the first one."
    />
  );
}
