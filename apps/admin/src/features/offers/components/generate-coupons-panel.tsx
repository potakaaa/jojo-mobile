import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { GenerateCouponsInput } from '../lib/admin-offers-api';

/**
 * "Generate Coupons" action panel (ADM-008), rendered on the Offer detail page.
 * Two modes: BULK (issue N unclaimed codes) or TARGETED (issue one code to a
 * specific customer). The route contract requires `quantity === 1` for a targeted
 * issue, so toggling "targeted" pins quantity to 1 and disables the quantity input
 * — the guard is enforced client-side here AND server-side by the route's Zod
 * `.refine`. An optional per-batch expiry overrides the Offer's own end date.
 */
interface GenerateCouponsPanelProps {
  offerId: string;
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

  function handleTargetedChange(next: boolean) {
    setTargeted(next);
    if (next) setQuantity('1'); // route contract: targeted issue is always quantity 1
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

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

        <label className="flex flex-col gap-1 text-sm">
          Expiry override (optional)
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>

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
          <Button type="submit" isLoading={submitting}>
            {submitting ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </form>
    </section>
  );
}
