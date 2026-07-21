import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { RewardForm } from '@/features/rewards/components/reward-form';
import { RewardList } from '@/features/rewards/components/reward-list';
import {
  useAdminRewards,
  useCreateReward,
  useUpdateReward,
} from '@/features/rewards/hooks/use-admin-rewards';
import type { AdminReward, RewardSubmitInput } from '@/features/rewards/lib/admin-rewards-api';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

export const Route = createFileRoute('/(dashboard)/rewards/')({
  component: RewardsPage,
});

/**
 * Rewards list screen (ADM-005). Index route of the `/rewards` layout — renders
 * inside `rewards.tsx`'s `<Outlet/>`. Reuses the shared `PageHeader`, `DataTable`
 * (via `RewardList`), `FormDialog`, and `ConfirmDialog` composites. Editing a
 * reward's `required_stars` and deactivating a reward each go through a
 * confirmation dialog (Safety requirement — required_stars edits affect future
 * unlock crossings; deactivation is logically destructive). Inherits the
 * `(dashboard)` admin guard.
 */
function RewardsPage() {
  const navigate = useNavigate();
  const rewardsQuery = useAdminRewards();
  const productsQuery = useAdminProducts();
  const createMutation = useCreateReward();
  const updateMutation = useUpdateReward();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminReward | null>(null);
  // A pending edit whose required_stars changed — held until the admin confirms.
  const [pendingStarsEdit, setPendingStarsEdit] = useState<{
    reward: AdminReward;
    input: RewardSubmitInput;
  } | null>(null);
  // A reward pending deactivation confirmation.
  const [deactivateTarget, setDeactivateTarget] = useState<AdminReward | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(reward: AdminReward) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(reward);
    setFormOpen(true);
  }

  function runCreate(input: RewardSubmitInput) {
    // Create never clears a column — a lingering null (only produced in edit mode)
    // is stripped so the payload matches RewardCreateInput.
    const { eligibleProductId, rewardValueCents, ...rest } = input;
    createMutation.mutate(
      {
        ...rest,
        ...(eligibleProductId != null ? { eligibleProductId } : {}),
        ...(rewardValueCents != null ? { rewardValueCents } : {}),
      },
      { onSuccess: () => setFormOpen(false) },
    );
  }

  function runUpdate(id: string, input: RewardSubmitInput, onDone: () => void) {
    updateMutation.mutate({ id, input }, { onSuccess: onDone });
  }

  function handleSubmit(input: RewardSubmitInput) {
    if (editing) {
      if (input.requiredStars !== editing.requiredStars) {
        // Defer the write behind a confirmation — required_stars edits change future
        // unlock crossings (past history and issued coupons are untouched).
        setPendingStarsEdit({ reward: editing, input });
        setFormOpen(false);
        return;
      }
      runUpdate(editing.id, input, () => setFormOpen(false));
    } else {
      runCreate(input);
    }
  }

  function confirmStarsEdit() {
    if (!pendingStarsEdit) return;
    runUpdate(pendingStarsEdit.reward.id, pendingStarsEdit.input, () => setPendingStarsEdit(null));
  }

  function handleToggleActive(reward: AdminReward) {
    updateMutation.reset();
    if (reward.isActive) {
      setDeactivateTarget(reward);
    } else {
      // Reactivation is non-destructive — no confirmation needed.
      updateMutation.mutate({ id: reward.id, input: { isActive: true } });
    }
  }

  function confirmDeactivate() {
    if (!deactivateTarget) return;
    updateMutation.mutate(
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
        title="Rewards"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New reward</Button>}
      />

      <RewardList
        rewards={rewardsQuery.data}
        isLoading={rewardsQuery.isLoading}
        error={rewardsQuery.error}
        onEdit={openEdit}
        onToggleActive={handleToggleActive}
      />

      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Edit reward' : 'New reward'}
        description={
          editing
            ? `Update “${editing.name}”.`
            : 'Create a points-earned reward customers can unlock.'
        }
      >
        <RewardForm
          initial={editing ?? undefined}
          products={productsQuery.data ?? []}
          submitting={formSubmitting}
          error={formError}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </FormDialog>

      <ConfirmDialog
        open={pendingStarsEdit !== null}
        title="Change required stars?"
        description="This changes how many stars future customers must earn to unlock this reward. Past star history and already-issued coupons are untouched — only future unlock crossings are affected."
        confirmLabel="Save change"
        pendingLabel="Saving…"
        pending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        destructive={false}
        onOpenChange={(open) => {
          if (!open) setPendingStarsEdit(null);
        }}
        onConfirm={confirmStarsEdit}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate reward?"
        description="Customers will stop unlocking this reward on future star crossings. Coupons already issued for it stay valid and redeemable. You can reactivate it later."
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        pending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onConfirm={confirmDeactivate}
      />
    </main>
  );
}
