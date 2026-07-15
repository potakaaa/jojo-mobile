import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminCategory } from '@/features/categories/lib/admin-categories-api';

import type { AdminProduct, ProductCreateInput } from '../lib/admin-products-api';

/**
 * Shared create/edit product form. Price is entered in PHP (₱, 2 decimals) for
 * admin readability and converted to integer CENTS on submit (the API boundary
 * is cents). In edit mode (`initial`) fields pre-fill. Server-side Zod validation
 * is the real gate — this client validation is convenience only. `categories`
 * feeds the category selector; only active categories are creatable against.
 */
interface ProductFormProps {
  initial?: AdminProduct;
  categories: AdminCategory[];
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ProductCreateInput) => void;
  onCancel: () => void;
}

export function ProductForm({
  initial,
  categories,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const activeCategories = categories.filter((c) => c.isActive || c.id === initial?.categoryId);
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? activeCategories[0]?.id ?? '',
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial ? (initial.basePriceCents / 100).toFixed(2) : '');
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!categoryId) {
      setLocalError('Select a category.');
      return;
    }
    const php = Number(price);
    if (!Number.isFinite(php) || php < 0) {
      setLocalError('Price must be a valid non-negative amount.');
      return;
    }

    const input: ProductCreateInput = {
      categoryId,
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
        Category
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="h-9 rounded-md border-2 border-border bg-transparent px-3 text-sm"
        >
          <option value="" disabled>
            Select a category…
          </option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
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
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
