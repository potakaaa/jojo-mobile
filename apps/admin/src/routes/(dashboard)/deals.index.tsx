import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DealCreateWizard } from '@/features/deals/components/deal-create-wizard';
import { DealForm } from '@/features/deals/components/deal-form';
import { DealList } from '@/features/deals/components/deal-list';
import {
  useAdminDeals,
  useCreateDeal,
  useUpdateDeal,
} from '@/features/deals/hooks/use-admin-deals';
import type { AdminDealProduct, DealCreateInput } from '@/features/deals/lib/admin-deals-api';

export const Route = createFileRoute('/(dashboard)/deals/')({
  component: DealsPage,
});

/**
 * Deal management list screen (ADM-004 deals-as-products). Index route of the
 * `/deals` layout — renders inside `deals.tsx`'s `<Outlet/>`. Consumes the shared
 * `PageHeader`, `DataTable` (via `DealList`), `FormDialog`, and `ConfirmDialog`
 * composites. A deal is a product, so deactivate/reactivate reuse the products
 * `is_active` toggle (`PATCH isActive`) — no dedicated deactivate route. The
 * "what's inside" component editor lives on the detail screen (Manage). Inherits
 * the `(dashboard)` admin guard.
 */
function DealsPage() {
  const navigate = useNavigate();
  const dealsQuery = useAdminDeals();
  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();
  // Separate mutation instance so reactivation errors surface beside the list
  // instead of being hidden behind the closed edit-form dialog.
  const reactivateMutation = useUpdateDeal();
  const deactivateMutation = useUpdateDeal();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDealProduct | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminDealProduct | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(deal: AdminDealProduct) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(deal);
    setFormOpen(true);
  }

  function handleSubmit(input: DealCreateInput) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleReactivate(deal: AdminDealProduct) {
    reactivateMutation.mutate({ id: deal.id, input: { isActive: true } });
  }

  function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(
      { id: deactivateTarget.id, input: { isActive: false } },
      { onSuccess: () => setDeactivateTarget(null) },
    );
  }

  const formSubmitting = createMutation.isPending || updateMutation.isPending;
  const formError =
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (updateMutation.error instanceof Error ? updateMutation.error.message : null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Deals"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New deal</Button>}
      />

      {reactivateMutation.error instanceof Error ? (
        <p role="alert" className="text-sm text-destructive">
          {reactivateMutation.error.message}
        </p>
      ) : null}

      <DealList
        deals={dealsQuery.data}
        isLoading={dealsQuery.isLoading}
        error={dealsQuery.error}
        onManage={(deal) => void navigate({ to: '/deals/$dealId', params: { dealId: deal.id } })}
        onEdit={openEdit}
        onDeactivate={setDeactivateTarget}
        onReactivate={handleReactivate}
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        size={editing ? 'default' : 'wide'}
        title={editing ? 'Edit deal' : 'New deal'}
        description={
          editing ? `Update “${editing.name}”.` : 'Create a new deal and pick what’s inside.'
        }
      >
        {editing ? (
          <DealForm
            initial={editing}
            submitting={formSubmitting}
            error={formError}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <DealCreateWizard
            submitting={createMutation.isPending}
            error={createMutation.error instanceof Error ? createMutation.error.message : null}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
          />
        )}
      </FormDialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate deal"
        description={
          deactivateTarget
            ? `“${deactivateTarget.name}” will be hidden from the menu and cannot be ordered. The deal is not deleted — historical orders keep their prices.`
            : ''
        }
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        pending={deactivateMutation.isPending}
        error={deactivateMutation.error instanceof Error ? deactivateMutation.error.message : null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onConfirm={handleDeactivateConfirm}
      />
    </main>
  );
}
