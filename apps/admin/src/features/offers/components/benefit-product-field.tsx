import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import { useUpdateOffer } from '../hooks/use-admin-offers';
import type { AdminOffer } from '../lib/admin-offers-api';

const selectClass =
  'flex h-9 w-full rounded-md border-2 border-foreground bg-transparent px-3 py-1 text-sm';

/**
 * Benefit-product display + editor for a free_item/free_upgrade offer (ADM-008 fix
 * 6). Shows the configured product by name (resolved from the admin products list,
 * not the raw UUID) and lets an admin change it via the existing offer-update
 * mutation. Rendered only for benefit-bearing mechanics; mounted inside the loaded-
 * offer guard so its draft state initialises from the offer's current value.
 *
 * F5: the picker only lists ACTIVE, non-deal products — a deal-product or inactive
 * benefit would 400 server-side (assertBenefitProductExists), so it is never offered.
 */
export function BenefitProductField({
  offer,
  products,
}: {
  offer: AdminOffer;
  products: AdminProduct[];
}) {
  const mutation = useUpdateOffer();
  const [draft, setDraft] = useState(offer.benefitProductId ?? '');
  const options = products.filter((p) => p.isActive && !p.isDeal);

  const currentName =
    products.find((p) => p.id === offer.benefitProductId)?.name ??
    (offer.benefitProductId ? 'Unknown product' : 'Not configured');
  const dirty = draft !== (offer.benefitProductId ?? '');

  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-foreground p-4">
      <h2 className="font-display text-h3">Benefit product</h2>
      <p className="text-sm text-muted-foreground">
        Currently: <span className="font-bold text-foreground">{currentName}</span>
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Product
        <select className={selectClass} value={draft} onChange={(e) => setDraft(e.target.value)}>
          <option value="">Select a product…</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end">
        <Button
          disabled={!draft || !dirty}
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate({ id: offer.id, input: { benefitProductId: draft } })}
        >
          Save benefit product
        </Button>
      </div>

      {mutation.error instanceof Error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </section>
  );
}
