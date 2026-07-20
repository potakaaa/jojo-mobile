import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';

import {
  REWARD_TYPE_OPTIONS,
  hasScalarValue,
  needsEligibleProduct,
  type AdminReward,
  type RewardSubmitInput,
  type RewardType,
} from '../lib/admin-rewards-api';

/**
 * Create/edit reward form (ADM-005). Mirrors `OfferForm` — a controlled form
 * emitting a `RewardSubmitInput` on submit. The value field is polymorphic: shown
 * as ₱ for `fixed_discount`, as % for `percentage_discount`, and hidden for the two
 * product-benefit mechanics (`free_item`/`free_upgrade`), which show a required
 * eligible-product picker instead (D4). Money is entered in PHP/percent and ×100 to
 * cents (the API boundary). Server-side Zod validation is the real gate — client
 * checks are convenience only.
 */
interface RewardFormProps {
  initial?: AdminReward;
  /** Candidate eligible products for free_item/free_upgrade rewards. */
  products: AdminProduct[];
  submitting: boolean;
  error: string | null;
  onSubmit: (input: RewardSubmitInput) => void;
  onCancel: () => void;
}

const selectClass =
  'flex h-9 w-full rounded-md border-2 border-foreground bg-transparent px-3 py-1 text-sm';

export function RewardForm({
  initial,
  products,
  submitting,
  error,
  onSubmit,
  onCancel,
}: RewardFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [requiredStars, setRequiredStars] = useState(initial ? String(initial.requiredStars) : '');
  const [rewardType, setRewardType] = useState<RewardType>(initial?.rewardType ?? 'free_item');
  const [eligibleProductId, setEligibleProductId] = useState(initial?.eligibleProductId ?? '');
  const [value, setValue] = useState(
    initial?.rewardValue != null ? String(initial.rewardValue / 100) : '',
  );
  const [localError, setLocalError] = useState<string | null>(null);

  /** Switching mechanic clears whichever conditional field the new mechanic doesn't use. */
  function handleMechanicChange(next: RewardType) {
    setRewardType(next);
    if (!needsEligibleProduct(next)) setEligibleProductId('');
    if (!hasScalarValue(next)) setValue('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Name is required.');
      return;
    }
    const stars = Number(requiredStars);
    if (!Number.isInteger(stars) || stars <= 0) {
      setLocalError('Required stars must be a positive whole number.');
      return;
    }

    const input: RewardSubmitInput = {
      name: name.trim(),
      requiredStars: stars,
      rewardType,
    };

    if (needsEligibleProduct(rewardType)) {
      if (!eligibleProductId) {
        setLocalError('Select an eligible product for this mechanic.');
        return;
      }
      input.eligibleProductId = eligibleProductId;
      // A product-benefit mechanic never carries a value; in EDIT mode clear any
      // lingering value from a prior discount mechanic.
      if (initial?.rewardValue != null) input.rewardValueCents = null;
    } else if (initial?.eligibleProductId != null) {
      // EDIT mode: flipped from a product mechanic to a discount one — clear the product.
      input.eligibleProductId = null;
    }

    if (hasScalarValue(rewardType)) {
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0) {
        setLocalError('Reward value must be a positive number.');
        return;
      }
      input.rewardValueCents = Math.round(v * 100);
    }

    onSubmit(input);
  }

  const valueLabel =
    rewardType === 'percentage_discount' ? 'Discount percent (%)' : 'Discount amount (₱)';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Required stars
        <Input
          inputMode="numeric"
          value={requiredStars}
          onChange={(e) => setRequiredStars(e.target.value)}
          placeholder="5"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Mechanic
        <select
          className={selectClass}
          value={rewardType}
          onChange={(e) => handleMechanicChange(e.target.value as RewardType)}
        >
          {REWARD_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {hasScalarValue(rewardType) ? (
        <label className="flex flex-col gap-1 text-sm">
          {valueLabel}
          <Input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        </label>
      ) : null}

      {needsEligibleProduct(rewardType) ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            Eligible product
            <select
              className={selectClass}
              value={eligibleProductId}
              onChange={(e) => setEligibleProductId(e.target.value)}
            >
              <option value="">Select a product…</option>
              {/* Only active, non-deal products are valid (the server rejects a
                  deal/inactive product), so never offer them. */}
              {products
                .filter((p) => p.isActive && !p.isDeal)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <span className="text-xs text-muted-foreground">
            Redeeming this reward grants this product free (free_item) or waives its paid size
            upgrade (free_upgrade).
          </span>
        </div>
      ) : null}

      {localError || error ? (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create reward'}
        </Button>
      </div>
    </form>
  );
}
