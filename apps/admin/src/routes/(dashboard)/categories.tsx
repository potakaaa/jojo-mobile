import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Dialog } from 'radix-ui';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { CategoryForm } from '@/features/categories/components/category-form';
import { CategoryList } from '@/features/categories/components/category-list';
import {
  useAdminCategories,
  useCreateCategory,
  useDeactivateCategory,
  useUpdateCategory,
} from '@/features/categories/hooks/use-admin-categories';
import type {
  AdminCategory,
  CategoryCreateInput,
} from '@/features/categories/lib/admin-categories-api';

export const Route = createFileRoute('/(dashboard)/categories')({
  component: CategoriesPage,
});

/**
 * Category management screen (ADM-003). A sibling child route of the
 * `(dashboard)` group, inheriting its server-verified `beforeLoad` admin guard.
 * Consumes all 3 extracted composites (Decision 1): `PageHeader` (header),
 * `CategoryList` → `QueryStates` (list states), and `ConfirmDialog` (deactivate).
 */
function CategoriesPage() {
  const navigate = useNavigate();
  const categoriesQuery = useAdminCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  // Separate mutation instance so reactivation errors surface beside the list
  // instead of being hidden behind the closed edit-form dialog.
  const reactivateMutation = useUpdateCategory();
  const deactivateMutation = useDeactivateCategory();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminCategory | null>(null);

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: AdminCategory) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(category);
    setFormOpen(true);
  }

  function handleFormSubmit(input: CategoryCreateInput) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleReactivate(category: AdminCategory) {
    reactivateMutation.mutate({ id: category.id, input: { isActive: true } });
  }

  function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(deactivateTarget.id, {
      onSuccess: () => setDeactivateTarget(null),
    });
  }

  const formSubmitting = createMutation.isPending || updateMutation.isPending;
  const formError =
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (updateMutation.error instanceof Error ? updateMutation.error.message : null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Categories"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New category</Button>}
      />

      {reactivateMutation.error instanceof Error ? (
        <p role="alert" className="text-sm text-destructive">
          {reactivateMutation.error.message}
        </p>
      ) : null}

      <CategoryList
        categories={categoriesQuery.data}
        isLoading={categoriesQuery.isLoading}
        error={categoriesQuery.error}
        onEdit={openEdit}
        onDeactivate={setDeactivateTarget}
        onReactivate={handleReactivate}
      />

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]">
            <Dialog.Title className="font-display text-h3">
              {editing ? 'Edit category' : 'New category'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 mb-4 text-sm text-muted-foreground">
              {editing ? `Update “${editing.name}”.` : 'Add a new menu category.'}
            </Dialog.Description>
            <CategoryForm
              initial={editing ?? undefined}
              submitting={formSubmitting}
              error={formError}
              onSubmit={handleFormSubmit}
              onCancel={() => setFormOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate category"
        description={
          deactivateTarget
            ? `“${deactivateTarget.name}” will be hidden from the menu. The category is not deleted — you can reactivate it later.`
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
