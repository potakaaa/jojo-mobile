import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminCategory, CategoryCreateInput } from '../lib/admin-categories-api';

/**
 * Shared create/edit category form. In edit mode (`initial` supplied) the fields
 * pre-fill; on submit it emits the full field set (the generic PATCH accepts a
 * partial, so sending everything is safe). Server-side Zod validation is the real
 * gate — this client validation is convenience only.
 */
interface CategoryFormProps {
  initial?: AdminCategory;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CategoryCreateInput) => void;
  onCancel: () => void;
}

export function CategoryForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sortOrder, setSortOrder] = useState(initial ? String(initial.sortOrder) : '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const input: CategoryCreateInput = {
      name: name.trim(),
      slug: slug.trim(),
    };
    const sort = Number(sortOrder.trim());
    if (sortOrder.trim().length > 0 && Number.isInteger(sort) && sort >= 0) {
      input.sortOrder = sort;
    }

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
        Sort order (optional)
        <Input
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="0"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create category'}
        </Button>
      </div>
    </form>
  );
}
