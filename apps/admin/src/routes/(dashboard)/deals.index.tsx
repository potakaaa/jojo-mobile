import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DealForm } from '@/features/deals/components/deal-form';
import { DealList } from '@/features/deals/components/deal-list';
import {
  useAdminDeals,
  useCreateDeal,
  useUpdateDeal,
} from '@/features/deals/hooks/use-admin-deals';
import type { AdminDeal, DealCreateInput } from '@/features/deals/lib/admin-deals-api';

export const Route = createFileRoute('/(dashboard)/deals/')({
  component: DealsPage,
});

/**
 * Deal management list screen (ADM-004). Index route of the `/deals` layout —
 * renders inside `deals.tsx`'s `<Outlet/>`. Consumes the shared `PageHeader`,
 * `DataTable` (via `DealList`), and `FormDialog` composites (the D4
 * second-consumer proof). Deactivate + junction editing live on the detail
 * screen (Manage). Inherits the `(dashboard)` admin guard.
 */
function DealsPage() {
  const navigate = useNavigate();
  const dealsQuery = useAdminDeals();
  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDeal | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(deal: AdminDeal) {
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

      <DealList
        deals={dealsQuery.data}
        isLoading={dealsQuery.isLoading}
        error={dealsQuery.error}
        onManage={(deal) => void navigate({ to: '/deals/$dealId', params: { dealId: deal.id } })}
        onEdit={openEdit}
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Edit deal' : 'New deal'}
        description={editing ? `Update “${editing.title}”.` : 'Create a new promotional deal.'}
      >
        <DealForm
          initial={editing ?? undefined}
          submitting={formSubmitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </FormDialog>
    </main>
  );
}
