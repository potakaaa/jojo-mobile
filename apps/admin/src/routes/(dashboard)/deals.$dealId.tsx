import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';
import { DEAL_TYPE_LABELS } from '@/features/deals/components/deal-form';
import { DeactivateDealDialog } from '@/features/deals/components/deactivate-deal-dialog';
import { JunctionChipEditor } from '@/features/deals/components/junction-chip-editor';
import {
  useAdminDeal,
  useAttachBranch,
  useAttachProduct,
  useDeactivateDeal,
  useDetachBranch,
  useDetachProduct,
} from '@/features/deals/hooks/use-admin-deals';
import type { CouponPolicy } from '@/features/deals/lib/admin-deals-api';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

export const Route = createFileRoute('/(dashboard)/deals/$dealId')({
  component: DealDetailPage,
});

/**
 * Deal detail screen (ADM-004) — hosts the feature-local product/branch junction
 * chip editors and the D1 deactivate flow (its `DeactivateDealDialog` reads the
 * already-loaded `outstandingCoupons` count, so no extra round trip). Sibling
 * child route of `(dashboard)`, admin-guarded.
 */
function DealDetailPage() {
  const { dealId } = useParams({ from: '/(dashboard)/deals/$dealId' });
  const navigate = useNavigate();
  const dealQuery = useAdminDeal(dealId);
  const productsQuery = useAdminProducts();
  const branchesQuery = useAdminBranches();

  const attachProduct = useAttachProduct(dealId);
  const detachProduct = useDetachProduct(dealId);
  const attachBranch = useAttachBranch(dealId);
  const detachBranch = useDetachBranch(dealId);
  const deactivateMutation = useDeactivateDeal();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [policy, setPolicy] = useState<CouponPolicy>('leave');

  const deal = dealQuery.data;

  function openDeactivate() {
    deactivateMutation.reset();
    setPolicy('leave');
    setConfirmOpen(true);
  }

  function handleDeactivateConfirm() {
    deactivateMutation.mutate(
      { id: dealId, couponPolicy: policy },
      { onSuccess: () => setConfirmOpen(false) },
    );
  }

  const productError =
    (attachProduct.error instanceof Error ? attachProduct.error.message : null) ??
    (detachProduct.error instanceof Error ? detachProduct.error.message : null);
  const branchError =
    (attachBranch.error instanceof Error ? attachBranch.error.message : null) ??
    (detachBranch.error instanceof Error ? detachBranch.error.message : null);

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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-h2 font-bold text-primary">{deal.title}</h1>
                  <p className="text-sm text-muted-foreground">
                    {DEAL_TYPE_LABELS[deal.dealType]} · {deal.isActive ? 'Active' : 'Inactive'} ·{' '}
                    {deal.outstandingCoupons} outstanding coupon
                    {deal.outstandingCoupons === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(deal.startAt).toLocaleString()} →{' '}
                    {new Date(deal.endAt).toLocaleString()}
                  </p>
                </div>
                {deal.isActive ? (
                  <Button variant="destructive" onClick={openDeactivate}>
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </section>

            <JunctionChipEditor
              heading="Products"
              items={(productsQuery.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
              attachedIds={deal.productIds}
              onAttach={(id) => attachProduct.mutate(id)}
              onDetach={(id) => detachProduct.mutate(id)}
              attaching={attachProduct.isPending}
              detaching={detachProduct.isPending}
              error={productError}
              emptyLabel="No products attached — this deal applies to all products."
            />

            <JunctionChipEditor
              heading="Branches"
              items={(branchesQuery.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
              attachedIds={deal.branchIds}
              onAttach={(id) => attachBranch.mutate(id)}
              onDetach={(id) => detachBranch.mutate(id)}
              attaching={attachBranch.isPending}
              detaching={detachBranch.isPending}
              error={branchError}
              emptyLabel="No branches attached — this deal is branch-agnostic."
            />
          </>
        ) : null}
      </QueryStates>

      <DeactivateDealDialog
        deal={confirmOpen ? (deal ?? null) : null}
        policy={policy}
        onPolicyChange={setPolicy}
        pending={deactivateMutation.isPending}
        error={deactivateMutation.error instanceof Error ? deactivateMutation.error.message : null}
        onConfirm={handleDeactivateConfirm}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
      />
    </main>
  );
}
