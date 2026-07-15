import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductAvailabilityEditor } from '@/features/products/components/product-availability-editor';
import { ProductOptionsEditor } from '@/features/products/components/product-options-editor';
import { useAdminProduct, useUpdateProduct } from '@/features/products/hooks/use-admin-products';

export const Route = createFileRoute('/(dashboard)/products/$productId')({
  component: ProductDetailPage,
});

/**
 * Product detail screen (ADM-003) — hosts the feature-local option and
 * availability sub-editors plus a price editor that gates the price change
 * behind a `ConfirmDialog` (the AC8 "confirmation before a price-changing
 * action" requirement). Sibling child route of `(dashboard)`, admin-guarded.
 */
function ProductDetailPage() {
  const { productId } = useParams({ from: '/(dashboard)/products/$productId' });
  const navigate = useNavigate();
  const productQuery = useAdminProduct(productId);
  const updateMutation = useUpdateProduct();

  const [priceInput, setPriceInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const product = productQuery.data;

  function openPriceConfirm() {
    updateMutation.reset();
    setConfirmOpen(true);
  }

  function handlePriceConfirm() {
    const php = Number(priceInput);
    if (!Number.isFinite(php) || php < 0) return;
    updateMutation.mutate(
      { id: productId, input: { basePriceCents: Math.round(php * 100) } },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setPriceInput('');
        },
      },
    );
  }

  const priceValid =
    priceInput.trim().length > 0 && Number.isFinite(Number(priceInput)) && Number(priceInput) >= 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Product"
        backLabel="← Products"
        onBack={() => void navigate({ to: '/products' })}
      />

      <QueryStates
        isLoading={productQuery.isLoading}
        error={productQuery.error}
        isEmpty={!product}
        loadingLabel="Loading product…"
        errorLabel="Failed to load product"
        emptyLabel="Product not found."
      >
        {product ? (
          <>
            <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
              <h1 className="font-display text-h2 font-bold text-primary">{product.name}</h1>
              <p className="text-sm text-muted-foreground">
                Slug <span className="font-mono">{product.slug}</span> · Base price ₱
                {(product.basePriceCents / 100).toFixed(2)} ·{' '}
                {product.isActive ? 'Active' : 'Inactive'}
              </p>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  New base price (₱)
                  <Input
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder={(product.basePriceCents / 100).toFixed(2)}
                  />
                </label>
                <Button disabled={!priceValid} onClick={openPriceConfirm}>
                  Change price
                </Button>
              </div>
            </section>

            <ProductOptionsEditor productId={productId} />
            <ProductAvailabilityEditor productId={productId} />
          </>
        ) : null}
      </QueryStates>

      <ConfirmDialog
        open={confirmOpen}
        title="Change base price"
        description={
          product && priceValid
            ? `Change “${product.name}” base price from ₱${(product.basePriceCents / 100).toFixed(
                2,
              )} to ₱${Number(priceInput).toFixed(2)}? Existing orders keep their original prices — only new orders use the new price.`
            : ''
        }
        confirmLabel="Change price"
        pendingLabel="Saving…"
        destructive={false}
        pending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        onOpenChange={setConfirmOpen}
        onConfirm={handlePriceConfirm}
      />
    </main>
  );
}
