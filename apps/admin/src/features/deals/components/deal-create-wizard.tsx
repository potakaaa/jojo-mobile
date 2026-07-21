import { Package } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ClockDial } from '@/components/clock-dial';
import { DateTimeField, localNow } from '@/components/date-time-field';
import { DayOfWeekPicker } from '@/components/day-of-week-picker';
import { QueryStates } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminBranches } from '@/features/branches/hooks/use-admin-branches';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

import type { DealCreateInput } from '../lib/admin-deals-api';
import { computeDealSavings } from '../lib/deal-savings';

/**
 * 2-step create wizard for a deal-product (Enhancement E1). Replaces the bare
 * single-step create form: Step 1 captures the deal's own details, Step 2 picks
 * the products it includes and shows a live savings calculation, then submits the
 * whole thing (product + components) in one atomic `POST /api/admin/deals`. This
 * is CREATE-ONLY — editing an existing deal still uses `DealForm` +
 * `DealComponentEditor` on the detail screen (D-E3). The dialog shell
 * (`FormDialog`) is provided by the caller; this component is only the body.
 */
interface DealCreateWizardProps {
  submitting: boolean;
  error: string | null;
  onSubmit: (input: DealCreateInput) => void;
  onCancel: () => void;
}

interface WizardItem {
  productId: string;
  name: string;
  unitCents: number;
  imageUrl: string | null;
  quantity: number;
}

/** Kebab slug from a name — lowercase, non-alphanumerics collapsed to hyphens. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

/** Naive-local `DateTimeField` value → the ISO instant the API stores. */
function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function DealCreateWizard({ submitting, error, onSubmit, onCancel }: DealCreateWizardProps) {
  const productsQuery = useAdminProducts();
  const branchesQuery = useAdminBranches();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');

  // DEAL-005 scheduled window — BOTH optional (unlike offers, which require both):
  // leaving them blank creates an always-live deal, the pre-DEAL-005 default.
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  // Pinned once at mount so the bound cannot drift mid-edit and retroactively
  // invalidate a value the admin already picked.
  const [now] = useState(localNow);
  const endMin = startsAt || now;
  // Surfaced, never auto-corrected — clearing a deliberately-picked value is worse
  // than asking which of the two to change (same treatment as `offer-form.tsx`).
  const windowError =
    startsAt && endsAt && endsAt <= startsAt
      ? 'End must be after start — adjust one of them.'
      : null;

  // DEAL-005 Phase 2 — weekly recurrence, gated behind a toggle so the common
  // non-recurring case stays uncluttered. The three values are only submitted when
  // the toggle is ON and all of them are filled; the server rejects a partial triple.
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [recurStartTime, setRecurStartTime] = useState('14:00');
  const [recurEndTime, setRecurEndTime] = useState('17:00');
  // Client-side affordances only — the hard rejection is the server's
  // `validateRecurrence` (D5 forbids an overnight span outright).
  const recurError = !recurEnabled
    ? null
    : recurDays.length === 0
      ? 'Pick at least one day.'
      : recurEndTime <= recurStartTime
        ? 'End time must be after start time. For an overnight deal, create two deals.'
        : null;

  // Step 2 state.
  const [items, setItems] = useState<WizardItem[]>([]);
  const [selected, setSelected] = useState('');

  // Branch availability — every active branch is ON by default (preserving the
  // server's seed-all behavior); the admin opts branches OUT here. Tracked as an
  // exclude set so a branch created after the wizard opened is still ON by default.
  const [excludedBranchIds, setExcludedBranchIds] = useState<Set<string>>(new Set());
  const activeBranches = (branchesQuery.data ?? []).filter((b) => b.isActive);

  function handleNameChange(value: string) {
    setName(value);
    // Auto-derive the slug from the name until the admin hand-edits it.
    if (!slugEdited) setSlug(slugify(value));
  }

  const php = Number(price);
  const priceValid = price.trim().length > 0 && Number.isFinite(php) && php >= 0;
  const dealPriceCents = priceValid ? Math.round(php * 100) : 0;
  const step1Valid =
    name.trim().length > 0 && slug.trim().length > 0 && !windowError && !recurError;

  const addedIds = new Set(items.map((i) => i.productId));
  const candidates = (productsQuery.data ?? []).filter((p) => !addedIds.has(p.id));

  const savings = useMemo(
    () =>
      computeDealSavings(
        items.map((i) => ({ unitCents: i.unitCents, quantity: i.quantity })),
        dealPriceCents,
      ),
    [items, dealPriceCents],
  );

  function handleAdd() {
    if (!selected) return;
    const product = (productsQuery.data ?? []).find((p) => p.id === selected);
    if (!product || addedIds.has(product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        name: product.name,
        unitCents: product.basePriceCents,
        imageUrl: product.imageUrl,
        quantity: 1,
      },
    ]);
    setSelected('');
  }

  function changeQty(productId: string, delta: number) {
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i,
      ),
    );
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function toggleBranch(branchId: string) {
    setExcludedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }

  function handleCreate() {
    if (items.length === 0 || !step1Valid || !priceValid) return;
    const input: DealCreateInput = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim().length > 0 ? description.trim() : null,
      basePriceCents: dealPriceCents,
      components: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    };
    // Only send a bound the admin actually picked — omitting both leaves the deal
    // always-live (no `deal_schedules` row written server-side).
    if (startsAt) input.startsAt = toIso(startsAt);
    if (endsAt) input.endsAt = toIso(endsAt);
    // Phase 2 — send the recurrence triple only when the toggle is on and complete.
    // Toggle off omits all three, leaving a non-recurring (Phase 1 shape) deal.
    if (recurEnabled && recurDays.length > 0) {
      input.recurDays = recurDays;
      input.recurStartTime = recurStartTime;
      input.recurEndTime = recurEndTime;
    }
    // Only send branchIds when the admin opted a branch OUT — omitting keeps the
    // server's default (seed every active branch), so the common case is unchanged.
    if (excludedBranchIds.size > 0) {
      input.branchIds = activeBranches.filter((b) => !excludedBranchIds.has(b.id)).map((b) => b.id);
    }
    onSubmit(input);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Step rail */}
      <ol className="flex items-center gap-2 text-sm">
        {(
          [
            { n: 1, label: 'Details' },
            { n: 2, label: 'Items & Pricing' },
          ] as const
        ).map((s) => (
          <li
            key={s.n}
            className={`flex items-center gap-2 rounded-md border-2 px-3 py-1 font-display ${
              step === s.n
                ? 'border-foreground bg-primary text-primary-foreground shadow-[var(--shadow-offset-sm)]'
                : 'border-border text-muted-foreground'
            }`}
          >
            <span className="font-bold">{s.n}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <Input value={name} onChange={(e) => handleNameChange(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Slug
            <Input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Description (optional)
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          {/* DEAL-005 schedule. Both optional: left blank, the deal is live as soon
              as it is active and available, exactly as deals behaved before. */}
          <fieldset className="flex flex-col gap-2 rounded-lg border-2 border-border p-3">
            <legend className="px-1 text-sm font-medium">Schedule (optional)</legend>
            <p className="text-xs text-muted-foreground">
              Leave blank to make this deal live as soon as it is active. Customers never see the
              dates — an out-of-window deal is simply hidden.
            </p>
            <div className="flex flex-wrap gap-3">
              <DateTimeField
                label="Starts"
                value={startsAt}
                onChange={setStartsAt}
                min={now}
                className="flex-1"
              />
              <DateTimeField
                label="Ends"
                value={endsAt}
                onChange={setEndsAt}
                defaultTime="23:59"
                min={endMin}
                className="flex-1"
              />
            </div>
            {windowError ? (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {windowError}
              </p>
            ) : null}

            {/* DEAL-005 Phase 2 — weekly recurrence NARROWS the window above: within
                the dates, the deal is live only on the chosen days during the chosen
                hours. Times are Manila wall-clock, matching what staff and customers
                actually experience. */}
            <label className="mt-1 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={recurEnabled}
                onChange={(e) => setRecurEnabled(e.target.checked)}
                className="size-4 accent-primary"
              />
              Repeats weekly
            </label>

            {recurEnabled ? (
              <div className="flex flex-col gap-3 rounded-md border-2 border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Live only on the selected days, between the selected times (Manila time). For an
                  overnight deal such as 10pm–2am, create one deal per side of midnight.
                </p>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Repeat on</span>
                  <DayOfWeekPicker value={recurDays} onChange={setRecurDays} />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Starts at {recurStartTime}</span>
                    <ClockDial value={recurStartTime} onChange={setRecurStartTime} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Ends at {recurEndTime}</span>
                    <ClockDial value={recurEndTime} onChange={setRecurEndTime} />
                  </div>
                </div>
                {recurError ? (
                  <p role="alert" className="text-sm font-semibold text-destructive">
                    {recurError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" disabled={!step1Valid} onClick={() => setStep(2)}>
              Next: items →
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 md:grid-cols-2">
            {/* LEFT column — items */}
            <div className="flex flex-col gap-3">
              <QueryStates
                isLoading={productsQuery.isLoading}
                error={productsQuery.error}
                isEmpty={!productsQuery.data || productsQuery.data.length === 0}
                loadingLabel="Loading products…"
                errorLabel="Failed to load products"
                emptyLabel="No products to add. Create a product first."
              >
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Add a product
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                      className="h-9 cursor-pointer rounded-md border-2 border-border bg-transparent px-3 text-sm"
                    >
                      <option value="">Choose a product…</option>
                      {candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {formatPeso(p.basePriceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="button" size="sm" disabled={!selected} onClick={handleAdd}>
                    Add
                  </Button>
                </div>
              </QueryStates>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No items yet — add the products this deal includes.
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center gap-3 rounded-lg border-2 border-foreground p-2"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md border-2 border-border object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-border text-muted-foreground">
                          <Package className="size-5" />
                        </span>
                      )}

                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatPeso(item.unitCents)} each
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="secondary"
                          aria-label={`Decrease ${item.name} quantity`}
                          className="cursor-pointer"
                          onClick={() => changeQty(item.productId, -1)}
                        >
                          −
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="secondary"
                          aria-label={`Increase ${item.name} quantity`}
                          className="cursor-pointer"
                          onClick={() => changeQty(item.productId, 1)}
                        >
                          +
                        </Button>
                      </div>

                      <span className="w-20 text-right font-mono text-xs">
                        {formatPeso(item.unitCents * item.quantity)}
                      </span>

                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.productId)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* RIGHT column — calculations (sticky on md+ so it stays visible while items scroll) */}
            <div className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
              <label className="flex flex-col gap-1 text-sm">
                Deal price (₱)
                <Input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </label>

              {/* Savings panel — omitted entirely with 0 items (nothing to compare). */}
              {items.length > 0 && !priceValid ? (
                <p className="text-sm text-muted-foreground">
                  Enter a deal price to see the comparison.
                </p>
              ) : null}
              {items.length > 0 && priceValid ? (
                <div className="flex flex-col gap-2 rounded-lg border-2 border-border p-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>À-la-carte total</span>
                    <span className="font-mono">{formatPeso(savings.aLaCarteTotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Deal price</span>
                    <span className="font-mono">{formatPeso(dealPriceCents)}</span>
                  </div>
                  {savings.costsMore ? (
                    <div className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive shadow-[var(--shadow-offset-sm)]">
                      ⚠ This deal costs {formatPeso(-savings.savingsCents)} more than buying
                      separately.
                    </div>
                  ) : (
                    <div className="rounded-md border-2 border-foreground bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow-[var(--shadow-offset-sm)]">
                      Customer saves {formatPeso(savings.savingsCents)} · {savings.percentOff}% off
                    </div>
                  )}
                </div>
              ) : null}

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          {/* Branch availability — all active branches ON by default; opt out here. */}
          <div className="flex flex-col gap-2 rounded-lg border-2 border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Branch availability</span>
              <span className="text-xs text-muted-foreground">
                On by default — toggle off to hide this deal at a branch.
              </span>
            </div>
            <QueryStates
              isLoading={branchesQuery.isLoading}
              error={branchesQuery.error}
              isEmpty={activeBranches.length === 0}
              loadingLabel="Loading branches…"
              errorLabel="Failed to load branches"
              emptyLabel="No active branches — the deal will be created with no availability."
            >
              <ul className="flex flex-wrap gap-2">
                {activeBranches.map((branch) => {
                  const on = !excludedBranchIds.has(branch.id);
                  return (
                    <li key={branch.id}>
                      <Button
                        type="button"
                        size="sm"
                        variant={on ? 'default' : 'secondary'}
                        aria-pressed={on}
                        onClick={() => toggleBranch(branch.id)}
                      >
                        {on ? '✓ ' : ''}
                        {branch.name}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </QueryStates>
          </div>

          <div className="mt-2 flex justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              ← Back
            </Button>
            <Button
              type="button"
              isLoading={submitting}
              disabled={items.length === 0 || !priceValid}
              onClick={handleCreate}
            >
              Create deal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
