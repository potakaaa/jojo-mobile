import { useState } from 'react';

import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

import { useAttachComponent, useDetachComponent } from '../hooks/use-admin-deals';
import type { AdminDealComponent } from '../lib/admin-deals-api';

/**
 * Quantity-aware "what's inside" editor for a deal-product (ADM-004). Extends the
 * discarded discount plan's `junction-chip-editor` SHAPE (multi-select-with-remove
 * chips) with a per-component quantity field. Candidate components are the regular
 * catalog products (`useAdminProducts()` — which excludes deal-products by default,
 * so a deal can never contain another deal from the UI; the server enforces the
 * same guard). Feature-local — a junction+quantity editor is a genuinely new shape
 * nothing else in the admin app needs.
 */
interface DealComponentEditorProps {
  dealId: string;
  components: AdminDealComponent[];
}

export function DealComponentEditor({ dealId, components }: DealComponentEditorProps) {
  const productsQuery = useAdminProducts();
  const attachMutation = useAttachComponent(dealId);
  const detachMutation = useDetachComponent(dealId);

  const [selected, setSelected] = useState('');
  const [quantity, setQuantity] = useState('1');

  const attachedIds = new Set(components.map((c) => c.componentProductId));
  const candidates = (productsQuery.data ?? []).filter(
    (p) => !attachedIds.has(p.id) && p.id !== dealId,
  );

  function handleAttach() {
    if (!selected) return;
    const qty = Math.max(1, Math.round(Number(quantity) || 1));
    attachMutation.mutate(
      { componentProductId: selected, quantity: qty },
      {
        onSuccess: () => {
          setSelected('');
          setQuantity('1');
        },
      },
    );
  }

  const attachError = attachMutation.error instanceof Error ? attachMutation.error.message : null;
  const detachError = detachMutation.error instanceof Error ? detachMutation.error.message : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3">What&rsquo;s inside</h2>

      {components.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No components yet. Add the products this deal includes.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {components.map((c) => (
            <li
              key={c.componentProductId}
              className="flex items-center gap-2 rounded-full border-2 border-foreground bg-secondary/40 px-3 py-1 text-sm"
            >
              <span>
                {c.quantity}× {c.componentName}
              </span>
              <button
                type="button"
                aria-label={`Remove ${c.componentName}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={detachMutation.isPending}
                onClick={() => detachMutation.mutate(c.componentProductId)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <QueryStates
        isLoading={productsQuery.isLoading}
        error={productsQuery.error}
        isEmpty={!productsQuery.data || productsQuery.data.length === 0}
        loadingLabel="Loading products…"
        errorLabel="Failed to load products"
        emptyLabel="No products to add. Create a product first."
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Product
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-9 rounded-md border-2 border-border bg-transparent px-3 text-sm"
            >
              <option value="">Add a product…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-20 flex-col gap-1 text-sm">
            Qty
            <Input
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            disabled={!selected}
            isLoading={attachMutation.isPending}
            onClick={handleAttach}
          >
            Attach
          </Button>
        </div>
      </QueryStates>

      {attachError ? (
        <p role="alert" className="text-sm text-destructive">
          {attachError}
        </p>
      ) : null}
      {detachError ? (
        <p role="alert" className="text-sm text-destructive">
          {detachError}
        </p>
      ) : null}
    </section>
  );
}
