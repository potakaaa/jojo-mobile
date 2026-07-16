import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DealComponentEditor } from '@/features/deals/components/deal-component-editor';
import { computeDealSavings } from '@/features/deals/lib/deal-savings';
import { useAdminDeal, useUpdateDeal } from '@/features/deals/hooks/use-admin-deals';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

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
  const productsQuery = useAdminProducts();
  const updateMutation = useUpdateDeal();

  const [priceInput, setPriceInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deal = dealQuery.data;

  const priceValid =
    priceInput.trim().length > 0 && Number.isFinite(Number(priceInput)) && Number(priceInput) >= 0;
  // Live comparison follows the pending input while the admin types, else the saved price.
  const previewPriceCents = priceValid
    ? Math.round(Number(priceInput) * 100)
    : (deal?.basePriceCents ?? 0);

  const { savings, lineItems } = useMemo(() => {
    // Wait for product prices — an empty priceById would make every unit 0 and
    // briefly flash a false "costs more" warning.
    if (!deal || !productsQuery.data) return { savings: null, lineItems: [] };
    const priceById = new Map(
      (productsQuery.data ?? []).map((p) => [p.id, p.basePriceCents] as const),
    );
    const lines = deal.components.map((c) => ({
      productId: c.componentProductId,
      name: c.componentName,
      unitCents: priceById.get(c.componentProductId) ?? 0,
      quantity: c.quantity,
    }));
    return { savings: computeDealSavings(lines, previewPriceCents), lineItems: lines };
  }, [deal, productsQuery.data, previewPriceCents]);

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
                Slug <span className="font-mono">{deal.slug}</span> · Base price{' '}
                {formatPeso(deal.basePriceCents)} · {deal.isActive ? 'Active' : 'Inactive'}
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

            {savings && deal.components.length > 0 ? (
              <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
                <h2 className="font-display text-h3">Price comparison</h2>
                {priceValid ? (
                  <p className="text-xs text-muted-foreground">
                    Previewing new price — not saved until you confirm.
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {lineItems.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between text-sm text-muted-foreground"
                    >
                      <span className="truncate">
                        {item.quantity}× {item.name}
                        <span className="text-xs"> @ {formatPeso(item.unitCents)}</span>
                      </span>
                      <span className="font-mono">
                        {formatPeso(item.unitCents * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm text-muted-foreground">
                  <span>À-la-carte total</span>
                  <span className="font-mono">{formatPeso(savings.aLaCarteTotalCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Deal price</span>
                  <span className="font-mono">{formatPeso(savings.dealPriceCents)}</span>
                </div>
                {savings.costsMore ? (
                  <div className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive shadow-[var(--shadow-offset-sm)]">
                    ⚠ This deal costs {formatPeso(-savings.savingsCents)} more than buying
                    separately.
                  </div>
                ) : (
                  <div className="rounded-md border-2 border-foreground bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-[var(--shadow-offset-sm)]">
                    Customer saves {formatPeso(savings.savingsCents)} · {savings.percentOff}% off
                  </div>
                )}
              </section>
            ) : null}

            <DealComponentEditor dealId={dealId} components={deal.components} />
          </>
        ) : null}
      </QueryStates>

      <ConfirmDialog
        open={confirmOpen}
        title="Change base price"
        description={
          deal && priceValid
            ? `Change “${deal.name}” base price from ${formatPeso(deal.basePriceCents)} to ${formatPeso(
                Math.round(Number(priceInput) * 100),
              )}? Existing orders keep their original prices — only new orders use the new price.`
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
