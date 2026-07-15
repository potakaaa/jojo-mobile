import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Dialog } from 'radix-ui';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useAdminCategories } from '@/features/categories/hooks/use-admin-categories';
import { ProductForm } from '@/features/products/components/product-form';
import { ProductList } from '@/features/products/components/product-list';
import {
  useAdminProducts,
  useCreateProduct,
  useDeactivateProduct,
  useUpdateProduct,
} from '@/features/products/hooks/use-admin-products';
import type { AdminProduct, ProductCreateInput } from '@/features/products/lib/admin-products-api';

export const Route = createFileRoute('/(dashboard)/products/')({
  component: ProductsPage,
});

/**
 * Product management list screen (ADM-003). Index route of the `/products`
 * layout — it renders inside the `products.tsx` layout `<Outlet/>`, so the
 * sibling detail route (`/products/$productId`) can replace it in the same
 * outlet. Inherits the `(dashboard)` group's admin guard. Consumes the shared
 * `PageHeader`, `QueryStates` (via `ProductList`), and `ConfirmDialog`
 * composites; the option/availability sub-editors live on the detail route.
 */
function ProductsPage() {
  const navigate = useNavigate();
  const productsQuery = useAdminProducts();
  const categoriesQuery = useAdminCategories();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  // Separate mutation instance so reactivation errors surface beside the list
  // instead of polluting (or being hidden behind) the closed edit-form dialog.
  const reactivateMutation = useUpdateProduct();
  const deactivateMutation = useDeactivateProduct();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminProduct | null>(null);

  const categories = categoriesQuery.data ?? [];
  const categoryName = (categoryId: string) =>
    categories.find((c) => c.id === categoryId)?.name ?? '—';

  function openCreate() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: AdminProduct) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(product);
    setFormOpen(true);
  }

  function handleFormSubmit(input: ProductCreateInput) {
    if (editing) {
      // Omit categoryId when unchanged so a plain field edit never re-triggers
      // the server's active-category FK check against an unrelated category.
      const { categoryId, ...rest } = input;
      const patch = categoryId === editing.categoryId ? rest : input;
      updateMutation.mutate(
        { id: editing.id, input: patch },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createMutation.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleReactivate(product: AdminProduct) {
    reactivateMutation.mutate({ id: product.id, input: { isActive: true } });
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
        title="Products"
        onBack={() => void navigate({ to: '/' })}
        action={<Button onClick={openCreate}>New product</Button>}
      />

      {reactivateMutation.error instanceof Error ? (
        <p role="alert" className="text-sm text-destructive">
          {reactivateMutation.error.message}
        </p>
      ) : null}

      <ProductList
        products={productsQuery.data}
        isLoading={productsQuery.isLoading}
        error={productsQuery.error}
        categoryName={categoryName}
        onManage={(product) =>
          void navigate({ to: '/products/$productId', params: { productId: product.id } })
        }
        onEdit={openEdit}
        onDeactivate={setDeactivateTarget}
        onReactivate={handleReactivate}
      />

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-6 text-card-foreground shadow-[var(--shadow-offset-md)]">
            <Dialog.Title className="font-display text-h3">
              {editing ? 'Edit product' : 'New product'}
            </Dialog.Title>
            <Dialog.Description className="mt-1 mb-4 text-sm text-muted-foreground">
              {editing ? `Update “${editing.name}”.` : 'Add a new menu product.'}
            </Dialog.Description>
            <ProductForm
              initial={editing ?? undefined}
              categories={categories}
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
        title="Deactivate product"
        description={
          deactivateTarget
            ? `“${deactivateTarget.name}” will be hidden from the menu and cannot be ordered. The product is not deleted — historical orders keep their prices.`
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
