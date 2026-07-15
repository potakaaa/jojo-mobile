import { ConfirmDialog } from '@/components/confirm-dialog';

import type { AdminDeal, CouponPolicy } from '../lib/admin-deals-api';

/**
 * Deal deactivate confirm dialog (ADM-004, D1) — consumes the shared
 * `ConfirmDialog` (via its additive `children` slot) and injects the coupon
 * policy radio. Shows the deal's outstanding (`available`) coupon count so the
 * admin sees the blast radius before choosing `leave` (keep coupons honoring
 * their own expiry) vs `expire` (transition every outstanding coupon to expired
 * atomically). Cancel is the block — no hard server-side gate.
 */
interface DeactivateDealDialogProps {
  deal: AdminDeal | null;
  policy: CouponPolicy;
  onPolicyChange: (policy: CouponPolicy) => void;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function DeactivateDealDialog({
  deal,
  policy,
  onPolicyChange,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: DeactivateDealDialogProps) {
  const outstanding = deal?.outstandingCoupons ?? 0;

  return (
    <ConfirmDialog
      open={deal !== null}
      title="Deactivate deal"
      description={
        deal
          ? `“${deal.title}” will be hidden from customers. This deal has ${outstanding} outstanding coupon${
              outstanding === 1 ? '' : 's'
            }. Choose what happens to them:`
          : ''
      }
      confirmLabel="Deactivate"
      pendingLabel="Deactivating…"
      pending={pending}
      error={error}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    >
      <fieldset className="flex flex-col gap-2 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="couponPolicy"
            value="leave"
            checked={policy === 'leave'}
            onChange={() => onPolicyChange('leave')}
            className="mt-1"
          />
          <span>
            <strong>Leave coupons</strong> — outstanding coupons keep honoring their own expiry.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="couponPolicy"
            value="expire"
            checked={policy === 'expire'}
            onChange={() => onPolicyChange('expire')}
            className="mt-1"
          />
          <span>
            <strong>Expire coupons</strong> — immediately expire all {outstanding} outstanding
            coupon{outstanding === 1 ? '' : 's'}.
          </span>
        </label>
      </fieldset>
    </ConfirmDialog>
  );
}
