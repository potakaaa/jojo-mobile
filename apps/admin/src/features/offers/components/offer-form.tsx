import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminProduct } from '@/features/products/lib/admin-products-api';
import type { AdminPromotion } from '@/features/promotions/lib/admin-promotions-api';

import {
  OFFER_TYPE_CREATE_OPTIONS,
  needsBenefitProduct,
  type AdminOffer,
  type OfferSubmitInput,
  type OfferType,
} from '../lib/admin-offers-api';

/**
 * Create/edit offer form (ADM-008). Mirrors `DealForm`/`BranchForm` — a
 * controlled form emitting an `OfferCreateInput` on submit. Money is entered in
 * PHP and multiplied by 100 to cents (the API boundary). The discount-value field
 * is polymorphic: shown as ₱ for `fixed_discount`, as % for `percentage_discount`,
 * and hidden for the four complex mechanics (which carry no scalar value). For
 * the free_item/free_upgrade mechanics a benefit-product picker is shown and
 * required instead (sourced from the caller-supplied products list). The optional
 * Promotion link is sourced from the caller-supplied promotions list. Server-side
 * Zod validation is the real gate — client checks are convenience only.
 */
interface OfferFormProps {
  initial?: AdminOffer;
  promotions: AdminPromotion[];
  /** Candidate benefit products for free_item/free_upgrade offers. */
  products: AdminProduct[];
  submitting: boolean;
  error: string | null;
  onSubmit: (input: OfferSubmitInput) => void;
  onCancel: () => void;
}

const selectClass =
  'flex h-9 w-full rounded-md border-2 border-foreground bg-transparent px-3 py-1 text-sm';

/** Offer mechanics that carry a scalar discount value. */
function hasScalarValue(type: OfferType): boolean {
  return type === 'percentage_discount' || type === 'fixed_discount';
}

function toIso(local: string): string {
  return new Date(local).toISOString();
}

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function OfferForm({
  initial,
  promotions,
  products,
  submitting,
  error,
  onSubmit,
  onCancel,
}: OfferFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [offerType, setOfferType] = useState<OfferType>(
    initial?.offerType ?? 'percentage_discount',
  );
  const [benefitProductId, setBenefitProductId] = useState(initial?.benefitProductId ?? '');
  const [value, setValue] = useState(
    initial?.discountValueCents != null ? String(initial.discountValueCents / 100) : '',
  );
  const [minOrder, setMinOrder] = useState(
    initial ? (initial.minimumOrderAmountCents / 100).toFixed(2) : '',
  );
  const [perUser, setPerUser] = useState(
    initial?.usageLimitPerUser != null ? String(initial.usageLimitPerUser) : '',
  );
  const [totalLimit, setTotalLimit] = useState(
    initial?.totalUsageLimit != null ? String(initial.totalUsageLimit) : '',
  );
  const [startAt, setStartAt] = useState(initial ? isoToLocal(initial.startAt) : '');
  const [endAt, setEndAt] = useState(initial ? isoToLocal(initial.endAt) : '');
  const [promotionId, setPromotionId] = useState(initial?.promotionId ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  /** Switching to a mechanic that carries no product benefit clears the picker. */
  function handleMechanicChange(next: OfferType) {
    setOfferType(next);
    if (!needsBenefitProduct(next)) setBenefitProductId('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!title.trim()) {
      setLocalError('Title is required.');
      return;
    }
    if (!startAt || !endAt) {
      setLocalError('Start and end dates are required.');
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setLocalError('End must be after start.');
      return;
    }
    const min = Number(minOrder || '0');
    if (!Number.isFinite(min) || min < 0) {
      setLocalError('Minimum order must be a valid non-negative amount.');
      return;
    }

    const input: OfferSubmitInput = {
      title: title.trim(),
      offerType,
      minimumOrderAmountCents: Math.round(min * 100),
      startAt: toIso(startAt),
      endAt: toIso(endAt),
    };
    if (description.trim().length > 0) input.description = description.trim();

    if (hasScalarValue(offerType) && value.trim().length > 0) {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0) {
        setLocalError('Discount value must be a valid non-negative number.');
        return;
      }
      input.discountValueCents = Math.round(v * 100);
    }

    if (needsBenefitProduct(offerType)) {
      if (!benefitProductId) {
        setLocalError('Select a benefit product for this mechanic.');
        return;
      }
      input.benefitProductId = benefitProductId;
    } else if (initial?.benefitProductId != null) {
      // EDIT mode (F2): the offer previously carried a benefit product but the mechanic
      // is now a non-free one — send an explicit null to CLEAR the column. Create mode
      // never reaches here with a lingering benefit, so the field stays omitted there.
      input.benefitProductId = null;
    }

    if (perUser.trim().length > 0) {
      const n = Number(perUser);
      if (!Number.isInteger(n) || n <= 0) {
        setLocalError('Per-user usage limit must be a positive whole number.');
        return;
      }
      input.usageLimitPerUser = n;
    }
    if (totalLimit.trim().length > 0) {
      const n = Number(totalLimit);
      if (!Number.isInteger(n) || n <= 0) {
        setLocalError('Total usage limit must be a positive whole number.');
        return;
      }
      input.totalUsageLimit = n;
    }
    if (promotionId) {
      input.promotionId = promotionId;
    } else if (initial?.promotionId != null) {
      // EDIT mode: the offer was linked to a promotion but the admin cleared the
      // selector — send an explicit null to UNLINK it (mirrors the benefit clear
      // above). Create mode never reaches here with a lingering link.
      input.promotionId = null;
    }

    onSubmit(input);
  }

  const valueLabel =
    offerType === 'percentage_discount' ? 'Discount percent (%)' : 'Discount amount (₱)';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Title
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mechanic
        <select
          className={selectClass}
          value={offerType}
          onChange={(e) => handleMechanicChange(e.target.value as OfferType)}
        >
          {OFFER_TYPE_CREATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {hasScalarValue(offerType) ? (
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

      {needsBenefitProduct(offerType) ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            Benefit product
            <select
              className={selectClass}
              value={benefitProductId}
              onChange={(e) => setBenefitProductId(e.target.value)}
            >
              <option value="">Select a product…</option>
              {/* F5: only active, non-deal products are valid benefits (the server
                  rejects a deal/inactive benefit), so never offer them. */}
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
            Redeeming this offer grants this product free (free_item) or waives its paid size
            upgrade (free_upgrade).
          </span>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        Minimum order (₱)
        <Input
          inputMode="decimal"
          value={minOrder}
          onChange={(e) => setMinOrder(e.target.value)}
          placeholder="0.00"
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Usage limit / user (optional)
          <Input
            inputMode="numeric"
            value={perUser}
            onChange={(e) => setPerUser(e.target.value)}
            placeholder="∞"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Total usage limit (optional)
          <Input
            inputMode="numeric"
            value={totalLimit}
            onChange={(e) => setTotalLimit(e.target.value)}
            placeholder="∞"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Starts
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Ends
          <Input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Promotion (optional)
        <select
          className={selectClass}
          value={promotionId}
          onChange={(e) => setPromotionId(e.target.value)}
        >
          <option value="">None</option>
          {promotions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

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
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create offer'}
        </Button>
      </div>
    </form>
  );
}
