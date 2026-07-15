import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DealComponentEditor } from '@/features/deals/components/deal-component-editor';
import { useAdminDeal, useUpdateDeal } from '@/features/deals/hooks/use-admin-deals';

export const Route = createFileRoute('/(dashboard)/deals/$dealId')({
  component: DealDetailPage,
});

/**
 * Deal detail screen (ADM-004 deals-as-products) — hosts the quantity-aware
 * "what's inside" component editor plus a base-price editor that gates the price
 * change behind a `ConfirmDialog` (historical orders keep their snapshot prices —
 * AC9). A deal is a product, so it reuses the same detail shape as the product
 * detail screen. Sibling child route of `(dashboard)`, admin-guarded.
 */
function DealDetailPage() {
  const { dealId } = useParams({ from: '/(dashboard)/deals/$dealId' });
  const navigate = useNavigate();
  const dealQuery = useAdminDeal(dealId);
  const updateMutation = useUpdateDeal();

  const [priceInput, setPriceInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deal = dealQuery.data;

  function openPriceConfirm() {
    updateMutation.reset();
    setConfirmOpen(true);
  }

  function handlePriceConfirm() {
    const php = Number(priceInput);
    if (!Number.isFinite(php) || php < 0) return;
    updateMutation.mutate(
      { id: dealId, input: { basePriceCents: Math.round(php * 100) } },
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
      <PageHeader title="Deal" backLabel="← Deals" onBack={() => void navigate({ to: '/deals' })} />

      <QueryStates
        isLoading={dealQuery.isLoading}
        error={dealQuery.error}
        isEmpty={!deal}
        loadingLabel="Loading deal…"
        errorLabel="Failed to load deal"
        emptyLabel="Deal not found."
      >
        {deal ? (
          <>
            <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
              <h1 className="font-display text-h2 font-bold text-primary">{deal.name}</h1>
              <p className="text-sm text-muted-foreground">
                Slug <span className="font-mono">{deal.slug}</span> · Base price ₱
                {(deal.basePriceCents / 100).toFixed(2)} · {deal.isActive ? 'Active' : 'Inactive'}
              </p>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  New base price (₱)
                  <Input
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder={(deal.basePriceCents / 100).toFixed(2)}
                  />
                </label>
                <Button disabled={!priceValid} onClick={openPriceConfirm}>
                  Change price
                </Button>
              </div>
            </section>

            <DealComponentEditor dealId={dealId} components={deal.components} />
          </>
        ) : null}
      </QueryStates>

      <ConfirmDialog
        open={confirmOpen}
        title="Change base price"
        description={
          deal && priceValid
            ? `Change “${deal.name}” base price from ₱${(deal.basePriceCents / 100).toFixed(
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
