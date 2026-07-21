import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { PromotionCreateInput } from '../lib/admin-promotions-api';

/**
 * Create-promotion form (ADM-008). Mirrors `BranchForm`/`DealForm`: a controlled
 * form that emits a `PromotionCreateInput` on submit. The window is entered via
 * `datetime-local` inputs and normalized to ISO before submit (the server coerces
 * with `z.coerce.date()`). Server-side Zod validation is the real gate — the
 * client checks here are convenience only.
 */
interface PromotionFormProps {
  submitting: boolean;
  error: string | null;
  onSubmit: (input: PromotionCreateInput) => void;
  onCancel: () => void;
}

/** `datetime-local` gives a wall-clock string; normalize to ISO for the API. */
function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function PromotionForm({ submitting, error, onSubmit, onCancel }: PromotionFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Name is required.');
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

    const input: PromotionCreateInput = {
      name: name.trim(),
      startAt: toIso(startAt),
      endAt: toIso(endAt),
    };
    if (description.trim().length > 0) input.description = description.trim();

    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
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
          {submitting ? 'Saving…' : 'Create promotion'}
        </Button>
      </div>
    </form>
  );
}
