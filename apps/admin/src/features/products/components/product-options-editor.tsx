import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  useCreateOption,
  useDeactivateOption,
  useProductOptions,
} from '../hooks/use-admin-products';
import type { AdminProductOption, OptionType } from '../lib/admin-products-api';

/**
 * Feature-local product-option sub-editor (ADM-003 — NOT extracted; the nested
 * option list + inline add form is a product-specific shape, deferred from the
 * shared `form-dialog` composite per Decision 1). Lists a product's options,
 * adds new ones (option_type + PHP delta), and soft-deactivates existing ones.
 * Reuses the shared `QueryStates` + `ConfirmDialog` composites where they fit.
 */
const OPTION_TYPES: OptionType[] = ['size', 'flavor', 'add_on'];

interface ProductOptionsEditorProps {
  productId: string;
}

export function ProductOptionsEditor({ productId }: ProductOptionsEditorProps) {
  const optionsQuery = useProductOptions(productId);
  const createMutation = useCreateOption(productId);
  const deactivateMutation = useDeactivateOption(productId);

  const [optionType, setOptionType] = useState<OptionType>('size');
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<AdminProductOption | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const php = Number(delta || '0');
    if (!Number.isFinite(php) || php < 0) return;
    createMutation.mutate(
      {
        optionType,
        name: name.trim(),
        priceDeltaCents: Math.round(php * 100),
      },
      {
        onSuccess: () => {
          setName('');
          setDelta('');
        },
      },
    );
  }

  const addError = createMutation.error instanceof Error ? createMutation.error.message : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3">Options</h2>

      <QueryStates
        isLoading={optionsQuery.isLoading}
        error={optionsQuery.error}
        isEmpty={!optionsQuery.data || optionsQuery.data.length === 0}
        loadingLabel="Loading options…"
        errorLabel="Failed to load options"
        emptyLabel="No options yet."
      >
        <ul className="flex flex-col gap-1">
          {optionsQuery.data?.map((option) => (
            <li
              key={option.id}
              className={`flex items-center justify-between rounded-md border-2 border-foreground/20 px-3 py-2 text-sm ${
                option.isActive ? '' : 'opacity-50'
              }`}
            >
              <span>
                <span className="font-mono text-xs text-muted-foreground">{option.optionType}</span>{' '}
                {option.name} · ₱{(option.priceDeltaCents / 100).toFixed(2)}
                {option.isActive ? '' : ' (inactive)'}
              </span>
              {option.isActive ? (
                <Button size="sm" variant="destructive" onClick={() => setDeactivateTarget(option)}>
                  Deactivate
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </QueryStates>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select
            value={optionType}
            onChange={(e) => setOptionType(e.target.value as OptionType)}
            className="h-9 rounded-md border-2 border-border bg-transparent px-3 text-sm"
          >
            {OPTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Delta (₱)
          <Input
            inputMode="decimal"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <Button type="submit" isLoading={createMutation.isPending}>
          Add option
        </Button>
      </form>
      {addError ? (
        <p role="alert" className="text-sm text-destructive">
          {addError}
        </p>
      ) : null}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate option"
        description={
          deactivateTarget
            ? `“${deactivateTarget.name}” will stop being selectable. The option is not deleted.`
            : ''
        }
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        pending={deactivateMutation.isPending}
        error={deactivateMutation.error instanceof Error ? deactivateMutation.error.message : null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onConfirm={() => {
          if (!deactivateTarget) return;
          deactivateMutation.mutate(deactivateTarget.id, {
            onSuccess: () => setDeactivateTarget(null),
          });
        }}
      />
    </section>
  );
}
