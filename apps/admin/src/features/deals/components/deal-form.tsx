import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminDealProduct, DealCreateInput } from '../lib/admin-deals-api';

/**
 * Shared create/edit deal form (ADM-004 deals-as-products). A deal is a product,
 * so the form mirrors the product form — name, slug, description, and a base
 * price entered in PHP (₱, 2 decimals) and converted to integer CENTS on submit
 * (the API boundary is cents). There is NO category picker: the server pins every
 * deal to the reserved "Deals" category (Decision 8). The deal's "what's inside"
 * components are edited on the detail screen, not here. Server-side Zod validation
 * is the real gate — this client validation is convenience only.
 */
interface DealFormProps {
  initial?: AdminDealProduct;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: DealCreateInput) => void;
  onCancel: () => void;
}

export function DealForm({ initial, submitting, error, onSubmit, onCancel }: DealFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial ? (initial.basePriceCents / 100).toFixed(2) : '');
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Name is required.');
      return;
    }
    if (!slug.trim()) {
      setLocalError('Slug is required.');
      return;
    }
    const php = Number(price);
    if (!Number.isFinite(php) || php < 0) {
      setLocalError('Price must be a valid non-negative amount.');
      return;
    }

    const input: DealCreateInput = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
      basePriceCents: Math.round(php * 100),
    };

    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Base price (₱)
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.00"
          required
        />
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
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create deal'}
        </Button>
      </div>
    </form>
  );
}
