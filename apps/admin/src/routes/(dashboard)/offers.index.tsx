import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { OfferForm } from '@/features/offers/components/offer-form';
import { OfferList } from '@/features/offers/components/offer-list';
import {
  useAdminOffers,
  useCreateOffer,
  useUpdateOffer,
} from '@/features/offers/hooks/use-admin-offers';
import type { AdminOffer, OfferCreateInput } from '@/features/offers/lib/admin-offers-api';
import { useAdminPromotions } from '@/features/promotions/hooks/use-admin-promotions';

export const Route = createFileRoute('/(dashboard)/offers/')({
  component: OffersPage,
});

/**
 * Offers list screen (ADM-008). Index route of the `/offers` layout — renders
 * inside `offers.tsx`'s `<Outlet/>`. Reuses the shared `PageHeader`, `DataTable`
 * (via `OfferList`), and `FormDialog` composites. "Manage" navigates to the Offer
 * detail page (Generate Coupons + coupon list); "Edit" opens the create/edit
 * dialog. The Promotion-link dropdown in the form is sourced from the promotions
 * list query. Inherits the `(dashboard)` admin guard.
 */
function OffersPage() {
  const navigate = useNavigate();
  const offersQuery = useAdminOffers();
  const promotionsQuery = useAdminPromotions();
  const createMutation = useCreateOffer();
  const updateMutation = useUpdateOffer();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminOffer | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(offer: AdminOffer) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(offer);
    setFormOpen(true);
  }

  function handleSubmit(input: OfferCreateInput) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  const formSubmitting = createMutation.isPending || updateMutation.isPending;
  const formError =
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (updateMutation.error instanceof Error ? updateMutation.error.message : null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Offers"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New offer</Button>}
      />

      <OfferList
        offers={offersQuery.data}
        isLoading={offersQuery.isLoading}
        error={offersQuery.error}
        onManage={(offer) =>
          void navigate({ to: '/offers/$offerId', params: { offerId: offer.id } })
        }
        onEdit={openEdit}
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        size="wide"
        title={editing ? 'Edit offer' : 'New offer'}
        description={
          editing ? `Update “${editing.title}”.` : 'Create a discount offer customers can redeem.'
        }
      >
        <OfferForm
          initial={editing ?? undefined}
          promotions={promotionsQuery.data ?? []}
          submitting={formSubmitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </FormDialog>
    </main>
  );
}
