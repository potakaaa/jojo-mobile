import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminDeal, DealCreateInput, DealType } from '../lib/admin-deals-api';

/**
 * Shared create/edit deal form (ADM-004), rendered inside the shared
 * `FormDialog` shell. Money is entered human-readably (percent for
 * `percentage_discount`, ₱ for `fixed_discount` / minimum order) and converted to
 * integer CENTS on submit — the API boundary is uniformly cents (server
 * `serializeAdminDeal` applies `numericToCents` unconditionally). Discount input
 * is shown ONLY for the two deal types that carry a numeric discount (D5); the
 * other four omit it (null discount_value). Server-side Zod validation is the
 * real gate — this client validation is convenience only.
 */
export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  percentage_discount: 'Percentage discount',
  fixed_discount: 'Fixed discount',
  buy_one_take_one: 'Buy one, take one',
  free_item: 'Free item',
  free_upgrade: 'Free upgrade',
  bundle: 'Bundle',
};

const DISCOUNT_REQUIRED: ReadonlySet<DealType> = new Set(['percentage_discount', 'fixed_discount']);

interface DealFormProps {
  initial?: AdminDeal;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: DealCreateInput) => void;
  onCancel: () => void;
}

/** ISO → `YYYY-MM-DDTHH:mm` (local) for a `datetime-local` input value. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** Convert a stored cents discount to its human-entry value for the given type. */
function discountToInput(deal: AdminDeal | undefined): string {
  if (!deal || deal.discountValue === null) return '';
  // Both percent and fixed store cents; display value is cents / 100.
  return (deal.discountValue / 100).toString();
}

export function DealForm({ initial, submitting, error, onSubmit, onCancel }: DealFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dealType, setDealType] = useState<DealType>(initial?.dealType ?? 'percentage_discount');
  const [discount, setDiscount] = useState(discountToInput(initial));
  const [minOrder, setMinOrder] = useState(
    initial ? (initial.minimumOrderAmount / 100).toString() : '',
  );
  const [startAt, setStartAt] = useState(toLocalInput(initial?.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(initial?.endAt));
  const [usagePerUser, setUsagePerUser] = useState(
    initial?.usageLimitPerUser != null ? String(initial.usageLimitPerUser) : '',
  );
  const [totalUsage, setTotalUsage] = useState(
    initial?.totalUsageLimit != null ? String(initial.totalUsageLimit) : '',
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const needsDiscount = DISCOUNT_REQUIRED.has(dealType);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!title.trim()) {
      setLocalError('Title is required.');
      return;
    }
    if (!startAt || !endAt) {
      setLocalError('Start and end date/time are required.');
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setLocalError('End must be after start.');
      return;
    }

    let discountValueCents: number | null = null;
    if (needsDiscount) {
      const n = Number(discount);
      if (!Number.isFinite(n) || n < 0 || discount.trim() === '') {
        setLocalError('Discount must be a valid non-negative number.');
        return;
      }
      discountValueCents = Math.round(n * 100);
    }

    const minOrderCents =
      minOrder.trim() === '' ? 0 : Math.round(Math.max(0, Number(minOrder)) * 100);

    const input: DealCreateInput = {
      title: title.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
      dealType,
      discountValueCents,
      minimumOrderAmountCents: minOrderCents,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      usageLimitPerUser: usagePerUser.trim() === '' ? null : Math.round(Number(usagePerUser)),
      totalUsageLimit: totalUsage.trim() === '' ? null : Math.round(Number(totalUsage)),
    };

    onSubmit(input);
  }

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
        Deal type
        <select
          value={dealType}
          onChange={(e) => setDealType(e.target.value as DealType)}
          className="h-9 rounded-md border-2 border-border bg-transparent px-3 text-sm"
        >
          {(Object.keys(DEAL_TYPE_LABELS) as DealType[]).map((t) => (
            <option key={t} value={t}>
              {DEAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {needsDiscount ? (
        <label className="flex flex-col gap-1 text-sm">
          {dealType === 'percentage_discount' ? 'Discount (%)' : 'Discount (₱)'}
          <Input
            inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder={dealType === 'percentage_discount' ? '20' : '50.00'}
            required
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        Minimum order amount (₱, optional)
        <Input
          inputMode="decimal"
          value={minOrder}
          onChange={(e) => setMinOrder(e.target.value)}
          placeholder="0.00"
        />
      </label>

      <div className="flex flex-wrap gap-3">
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

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Usage limit / user (optional)
          <Input
            inputMode="numeric"
            value={usagePerUser}
            onChange={(e) => setUsagePerUser(e.target.value)}
            placeholder="unlimited"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Total usage limit (optional)
          <Input
            inputMode="numeric"
            value={totalUsage}
            onChange={(e) => setTotalUsage(e.target.value)}
            placeholder="unlimited"
          />
        </label>
      </div>

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
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create deal'}
        </Button>
      </div>
    </form>
  );
}
