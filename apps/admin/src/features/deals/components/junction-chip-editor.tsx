import { useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Feature-local many-to-many chip editor (ADM-004) — a multi-select-with-remove
 * UI for a deal's attached products or branches. Deliberately NOT extracted to a
 * shared composite (Decision 4): a junction editor is a genuinely new interaction
 * shape nothing in branches/categories/products has; per the P3 second-consumer
 * rule, it stays feature-local until a 5th domain needs the same shape. One
 * generic component drives BOTH the product and branch junctions (the caller
 * supplies the item list + attach/detach handlers).
 */
export interface JunctionItem {
  id: string;
  label: string;
}

interface JunctionChipEditorProps {
  heading: string;
  /** All selectable items (e.g. every product or branch). */
  items: JunctionItem[];
  /** Currently attached item ids. */
  attachedIds: string[];
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  attaching: boolean;
  detaching: boolean;
  error: string | null;
  emptyLabel: string;
}

export function JunctionChipEditor({
  heading,
  items,
  attachedIds,
  onAttach,
  onDetach,
  attaching,
  detaching,
  error,
  emptyLabel,
}: JunctionChipEditorProps) {
  const [selected, setSelected] = useState('');

  const attachedSet = new Set(attachedIds);
  const labelById = new Map(items.map((i) => [i.id, i.label]));
  const available = items.filter((i) => !attachedSet.has(i.id));

  function handleAdd() {
    if (!selected) return;
    onAttach(selected);
    setSelected('');
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3">{heading}</h2>

      {attachedIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attachedIds.map((id) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-full border-2 border-foreground bg-secondary/40 px-3 py-1 text-sm"
            >
              <span>{labelById.get(id) ?? id}</span>
              <button
                type="button"
                aria-label={`Remove ${labelById.get(id) ?? id}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={detaching}
                onClick={() => onDetach(id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 rounded-md border-2 border-border bg-transparent px-3 text-sm"
        >
          <option value="">Add…</option>
          {available.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!selected} isLoading={attaching} onClick={handleAdd}>
          Attach
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
