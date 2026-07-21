import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { PromotionForm } from '@/features/promotions/components/promotion-form';
import { PromotionList } from '@/features/promotions/components/promotion-list';
import {
  useAdminPromotions,
  useCreatePromotion,
} from '@/features/promotions/hooks/use-admin-promotions';
import type { PromotionCreateInput } from '@/features/promotions/lib/admin-promotions-api';

export const Route = createFileRoute('/(dashboard)/promotions/')({
  component: PromotionsPage,
});

/**
 * Promotions list screen (ADM-008). Index route of the `/promotions` layout —
 * renders inside `promotions.tsx`'s `<Outlet/>`. Reuses the shared `PageHeader`,
 * `DataTable` (via `PromotionList`), and `FormDialog` composites. Create-only per
 * SPEC (no edit/deactivate for Promotions). Inherits the `(dashboard)` admin guard.
 */
function PromotionsPage() {
  const navigate = useNavigate();
  const promotionsQuery = useAdminPromotions();
  const createMutation = useCreatePromotion();

  const [formOpen, setFormOpen] = useState(false);

  function openCreate() {
    createMutation.reset();
    setFormOpen(true);
  }

  function handleSubmit(input: PromotionCreateInput) {
    createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Promotions"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New promotion</Button>}
      />

      <PromotionList
        promotions={promotionsQuery.data}
        isLoading={promotionsQuery.isLoading}
        error={promotionsQuery.error}
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New promotion"
        description="Create a named, time-windowed campaign to group offers under."
      >
        <PromotionForm
          submitting={createMutation.isPending}
          error={createMutation.error instanceof Error ? createMutation.error.message : null}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </FormDialog>
    </main>
  );
}
