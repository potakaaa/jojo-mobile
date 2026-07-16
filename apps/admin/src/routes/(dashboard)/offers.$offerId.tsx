import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { BenefitProductField } from '@/features/offers/components/benefit-product-field';
import { CouponList } from '@/features/offers/components/coupon-list';
import { GenerateCouponsPanel } from '@/features/offers/components/generate-coupons-panel';
import { useAdminOffer, useUpdateOffer } from '@/features/offers/hooks/use-admin-offers';
import { useGenerateCoupons, useOfferCoupons } from '@/features/offers/hooks/use-generate-coupons';
import {
  OFFER_TYPE_OPTIONS,
  needsBenefitProduct,
  type GenerateCouponsInput,
} from '@/features/offers/lib/admin-offers-api';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';
import { offerStatus } from '@/lib/entity-status';

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

export const Route = createFileRoute('/(dashboard)/offers/$offerId')({
  component: OfferDetailPage,
});

/**
 * Offer detail screen (ADM-008) — hosts the "Generate Coupons" action panel and
 * the issued-coupon list sub-view. Sibling child route of `(dashboard)`,
 * admin-guarded, mounted into `offers.tsx`'s `<Outlet/>`. Generating coupons
 * invalidates the coupon-list query, so newly issued codes appear below without a
 * manual refetch.
 */
function OfferDetailPage() {
  const { offerId } = useParams({ from: '/(dashboard)/offers/$offerId' });
  const navigate = useNavigate();
  const offerQuery = useAdminOffer(offerId);
  const couponsQuery = useOfferCoupons(offerId);
  const productsQuery = useAdminProducts();
  const generateMutation = useGenerateCoupons(offerId);
  const updateMutation = useUpdateOffer();

  const [lastIssuedCount, setLastIssuedCount] = useState<number | null>(null);

  const offer = offerQuery.data;
  const mechanicLabel = offer
    ? (OFFER_TYPE_OPTIONS.find((o) => o.value === offer.offerType)?.label ?? offer.offerType)
    : '';

  function handleGenerate(input: GenerateCouponsInput) {
    generateMutation.mutate(input, {
      onSuccess: (created) => setLastIssuedCount(created.length),
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader
        title="Offer"
        backLabel="← Offers"
        onBack={() => void navigate({ to: '/offers' })}
      />

      <QueryStates
        isLoading={offerQuery.isLoading}
        error={offerQuery.error}
        isEmpty={!offer}
        loadingLabel="Loading offer…"
        errorLabel="Failed to load offer"
        emptyLabel="Offer not found."
      >
        {offer ? (
          <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-h2 font-bold text-primary">{offer.title}</h1>
              <StatusBadge tone={offerStatus(offer).tone}>{offerStatus(offer).label}</StatusBadge>
            </div>
            {offer.description ? (
              <p className="text-sm text-muted-foreground">{offer.description}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {mechanicLabel} · Min order {formatPeso(offer.minimumOrderAmountCents)}
            </p>

            <div className="mt-2 flex items-center gap-3">
              <Button
                variant={offer.isActive ? 'destructive' : 'default'}
                isLoading={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({ id: offerId, input: { isActive: !offer.isActive } })
                }
              >
                {offer.isActive ? 'Deactivate offer' : 'Activate offer'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {offer.isActive
                  ? 'Live for customers (within its validity window).'
                  : 'Hidden from customers.'}
              </span>
            </div>
            {updateMutation.error instanceof Error ? (
              <p role="alert" className="text-sm text-destructive">
                {updateMutation.error.message}
              </p>
            ) : null}
          </section>
        ) : null}
      </QueryStates>

      {offer ? (
        <>
          {needsBenefitProduct(offer.offerType) ? (
            <BenefitProductField offer={offer} products={productsQuery.data ?? []} />
          ) : null}

          <GenerateCouponsPanel
            offerId={offerId}
            offerType={offer.offerType}
            benefitProductId={offer.benefitProductId}
            submitting={generateMutation.isPending}
            error={generateMutation.error instanceof Error ? generateMutation.error.message : null}
            lastIssuedCount={lastIssuedCount}
            onGenerate={handleGenerate}
          />

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h3">Issued coupons</h2>
            <CouponList
              coupons={couponsQuery.data}
              isLoading={couponsQuery.isLoading}
              error={couponsQuery.error}
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
