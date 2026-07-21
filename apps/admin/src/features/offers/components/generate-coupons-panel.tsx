import { useState } from 'react';

import { DateTimeField, localNow } from '@/components/date-time-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  needsBenefitProduct,
  type GenerateCouponsInput,
  type OfferType,
} from '../lib/admin-offers-api';

/**
 * "Generate Coupons" action panel (ADM-008), rendered on the Offer detail page.
 * Two modes: BULK (issue N unclaimed codes) or TARGETED (issue one code to a
 * specific customer). The route contract requires `quantity === 1` for a targeted
 * issue, so toggling "targeted" pins quantity to 1 and disables the quantity input
 * — the guard is enforced client-side here AND server-side by the route's Zod
 * `.refine`. An optional per-batch expiry overrides the Offer's own end date.
 *
 * A free_item/free_upgrade offer with no configured `benefitProductId` cannot
 * issue coupons — a code with no defined benefit would reject at redemption — so
 * the panel blocks generation (disabled control + explanatory message), matching
 * the server's `POST /coupons/generate` reject (ADM-008 fix 6 P2).
 */
interface GenerateCouponsPanelProps {
  offerId: string;
  /** The offer's mechanic — drives the unconfigured-free-mechanic block. */
  offerType: OfferType;
  /** The offer's configured benefit product (null when unconfigured). */
  benefitProductId: string | null;
  submitting: boolean;
  error: string | null;
  /** Count from the most recent successful issue, for inline feedback. */
  lastIssuedCount: number | null;
  onGenerate: (input: GenerateCouponsInput) => void;
}

function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function GenerateCouponsPanel({
  offerId,
  offerType,
  benefitProductId,
  submitting,
  error,
  lastIssuedCount,
  onGenerate,
}: GenerateCouponsPanelProps) {
  const [targeted, setTargeted] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [userId, setUserId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  /** Pinned at mount so the floor cannot drift forward while the panel is being filled. */
  const [now] = useState(localNow);

  // A benefit-bearing mechanic with no configured product cannot issue codes.
  const blocked = needsBenefitProduct(offerType) && !benefitProductId;

  function handleTargetedChange(next: boolean) {
    setTargeted(next);
    if (next) setQuantity('1'); // route contract: targeted issue is always quantity 1
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (blocked) return;

    const qty = targeted ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setLocalError('Quantity must be a whole number of at least 1.');
      return;
    }
    if (targeted && userId.trim().length === 0) {
      setLocalError('A targeted issue needs a customer ID.');
      return;
    }

    const input: GenerateCouponsInput = { offerId, quantity: qty };
    if (targeted) input.userId = userId.trim();
    if (expiresAt) input.expiresAt = toIso(expiresAt);

    onGenerate(input);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border-2 border-foreground p-4">
      <h2 className="font-display text-h3">Generate coupons</h2>

      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          Configure a benefit product first.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={targeted}
            onChange={(e) => handleTargetedChange(e.target.checked)}
          />
          Issue to a specific customer (targeted)
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Quantity
          <Input
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={targeted}
            required
          />
        </label>

        {targeted ? (
          <label className="flex flex-col gap-1 text-sm">
            Customer ID
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="user UUID"
              required
            />
          </label>
        ) : null}

        {/* Optional — an expiry is a deadline, so it defaults to end of the chosen day.
            An expiry already in the past would issue codes that are dead on arrival. */}
        <DateTimeField
          label="Expiry override (optional)"
          value={expiresAt}
          onChange={setExpiresAt}
          defaultTime="23:59"
          min={now}
        />

        {localError || error ? (
          <p role="alert" className="text-sm text-destructive">
            {localError ?? error}
          </p>
        ) : null}

        {lastIssuedCount !== null && !localError && !error ? (
          <p className="text-sm text-primary">
            Issued {lastIssuedCount} coupon{lastIssuedCount === 1 ? '' : 's'}.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" isLoading={submitting} disabled={blocked}>
            {submitting ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </form>
    </section>
  );
}
