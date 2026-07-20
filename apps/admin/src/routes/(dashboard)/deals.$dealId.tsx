import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { ClockDial } from '@/components/clock-dial';
import { DateTimeField, localNow } from '@/components/date-time-field';
import { DayOfWeekPicker } from '@/components/day-of-week-picker';
import { PageHeader } from '@/components/page-header';
import { QueryStates } from '@/components/query-states';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DealAvailabilityEditor } from '@/features/deals/components/deal-availability-editor';
import { DealComponentEditor } from '@/features/deals/components/deal-component-editor';
import { computeDealSavings } from '@/features/deals/lib/deal-savings';
import { dealStatus } from '@/lib/entity-status';
import { useAdminDeal, useUpdateDeal } from '@/features/deals/hooks/use-admin-deals';
import { useAdminProducts } from '@/features/products/hooks/use-admin-products';

function formatPeso(cents: number): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

/** DEAL-005 Phase 2 — the weekly-recurrence slice of the schedule editor draft. */
interface RecurDraft {
  enabled: boolean;
  days: number[];
  startTime: string;
  endTime: string;
}

/** The whole schedule editor draft. Null until the admin edits, so the fields track
 *  the refetched server state instead of a stale seeded copy. */
interface WindowDraft {
  startsAt: string;
  endsAt: string;
  recur: RecurDraft;
}

/** Naive-local `DateTimeField` value → the ISO instant the API stores. */
function toIso(local: string): string {
  return new Date(local).toISOString();
}

/** Stored ISO instant → the naive-local string `DateTimeField` speaks. */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export const Route = createFileRoute('/(dashboard)/deals/$dealId')({
  component: DealDetailPage,
});

/**
 * Deal detail screen (ADM-004 deals-as-products) — hosts the quantity-aware
 * "what's inside" component editor plus a base-price editor that gates the price
 * change behind a `ConfirmDialog` (historical orders keep their snapshot prices —
 * AC9). A deal is a product, so it reuses the same detail shape as the product
 * detail screen. Sibling child route of `(dashboard)`, admin-guarded.
 */
function DealDetailPage() {
  const { dealId } = useParams({ from: '/(dashboard)/deals/$dealId' });
  const navigate = useNavigate();
  const dealQuery = useAdminDeal(dealId);
  const productsQuery = useAdminProducts();
  const updateMutation = useUpdateDeal();

  const [priceInput, setPriceInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deal = dealQuery.data;

  // DEAL-005 window editor. The fields DERIVE from the loaded deal and are only
  // shadowed once the admin actually edits (`windowDraft !== null`) — deliberately
  // NOT seeded into state via an effect or an object-identity guard, which silently
  // fails to fire when react-query returns the same cached object on a revisit and
  // leaves the fields blank (the STAFF-005 prep-time bug).
  const [windowDraft, setWindowDraft] = useState<WindowDraft | null>(null);
  const [windowNow] = useState(localNow);

  const storedStartsAt = deal?.startsAt ? isoToLocal(deal.startsAt) : '';
  const storedEndsAt = deal?.endsAt ? isoToLocal(deal.endsAt) : '';
  // DEAL-005 Phase 2 — an existing recurring row pre-fills the toggle and controls;
  // a non-recurring deal falls back to sensible defaults that are only ever SENT if
  // the admin actually turns the toggle on.
  const storedRecur: RecurDraft = {
    enabled: (deal?.recurDays?.length ?? 0) > 0,
    days: deal?.recurDays ?? [],
    startTime: deal?.recurStartTime ?? '14:00',
    endTime: deal?.recurEndTime ?? '17:00',
  };

  const stored: WindowDraft = {
    startsAt: storedStartsAt,
    endsAt: storedEndsAt,
    recur: storedRecur,
  };
  const current = windowDraft ?? stored;
  const { startsAt, endsAt } = current;
  const recur = current.recur;

  /** Patch one slice of the draft, seeding from the stored state on first edit. */
  function patchWindow(patch: Partial<WindowDraft>) {
    setWindowDraft({ ...current, ...patch });
  }
  function patchRecur(patch: Partial<RecurDraft>) {
    patchWindow({ recur: { ...recur, ...patch } });
  }

  const windowDirty =
    startsAt !== stored.startsAt ||
    endsAt !== stored.endsAt ||
    recur.enabled !== storedRecur.enabled ||
    recur.days.join(',') !== storedRecur.days.join(',') ||
    (recur.enabled &&
      (recur.startTime !== storedRecur.startTime || recur.endTime !== storedRecur.endTime));

  const windowError =
    startsAt && endsAt && endsAt <= startsAt
      ? 'End must be after start — adjust one of them.'
      : null;
  const recurError = !recur.enabled
    ? null
    : recur.days.length === 0
      ? 'Pick at least one day.'
      : recur.endTime <= recur.startTime
        ? 'End time must be after start time. For an overnight deal, create two deals.'
        : null;

  function saveWindow() {
    updateMutation.mutate(
      {
        id: dealId,
        // Empty field → explicit null → the server clears that part. Every field
        // cleared deletes the row entirely and the deal returns to always-live.
        input: {
          startsAt: startsAt ? toIso(startsAt) : null,
          endsAt: endsAt ? toIso(endsAt) : null,
          // Toggling recurrence OFF sends explicit nulls — the three fields must be
          // cleared together or the server rejects the half-specified triple.
          recurDays: recur.enabled ? recur.days : null,
          recurStartTime: recur.enabled ? recur.startTime : null,
          recurEndTime: recur.enabled ? recur.endTime : null,
        },
      },
      // Drop the draft so the fields resume tracking the refetched server state.
      { onSuccess: () => setWindowDraft(null) },
    );
  }

  const priceValid =
    priceInput.trim().length > 0 && Number.isFinite(Number(priceInput)) && Number(priceInput) >= 0;
  // Live comparison follows the pending input while the admin types, else the saved price.
  const previewPriceCents = priceValid
    ? Math.round(Number(priceInput) * 100)
    : (deal?.basePriceCents ?? 0);

  const { savings, lineItems } = useMemo(() => {
    // Wait for product prices — an empty priceById would make every unit 0 and
    // briefly flash a false "costs more" warning.
    if (!deal || !productsQuery.data) return { savings: null, lineItems: [] };
    const priceById = new Map(
      (productsQuery.data ?? []).map((p) => [p.id, p.basePriceCents] as const),
    );
    const lines = deal.components.map((c) => ({
      productId: c.componentProductId,
      name: c.componentName,
      unitCents: priceById.get(c.componentProductId) ?? 0,
      quantity: c.quantity,
    }));
    return { savings: computeDealSavings(lines, previewPriceCents), lineItems: lines };
  }, [deal, productsQuery.data, previewPriceCents]);

  function openPriceConfirm() {
    updateMutation.reset();
    setConfirmOpen(true);
  }

  function handlePriceConfirm() {
    const php = Number(priceInput);
    if (!Number.isFinite(php) || php < 0) return;
    updateMutation.mutate(
      { id: dealId, input: { basePriceCents: Math.round(php * 100) } },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setPriceInput('');
        },
      },
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background p-8 text-foreground">
      <PageHeader title="Deal" backLabel="← Deals" onBack={() => void navigate({ to: '/deals' })} />

      <QueryStates
        isLoading={dealQuery.isLoading}
        error={dealQuery.error}
        isEmpty={!deal}
        loadingLabel="Loading deal…"
        errorLabel="Failed to load deal"
        emptyLabel="Deal not found."
      >
        {deal ? (
          <>
            <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-h2 font-bold text-foreground">{deal.name}</h1>
                <StatusBadge tone={dealStatus(deal).tone}>{dealStatus(deal).label}</StatusBadge>
                {/* DEAL-005 Phase 2 — additional, alongside the phase badge (E4). */}
                {dealStatus(deal).recurring ? (
                  <StatusBadge tone="neutral">Recurring</StatusBadge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Slug <span className="font-mono">{deal.slug}</span> · Base price{' '}
                {formatPeso(deal.basePriceCents)}
              </p>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  New base price (₱)
                  <Input
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder={(deal.basePriceCents / 100).toFixed(2)}
                  />
                </label>
                <Button disabled={!priceValid} onClick={openPriceConfirm}>
                  Change price
                </Button>
              </div>
            </section>

            {savings && deal.components.length > 0 ? (
              <section className="flex flex-col gap-2 rounded-xl border-2 border-foreground p-4">
                <h2 className="font-display text-h3">Price comparison</h2>
                {priceValid ? (
                  <p className="text-xs text-muted-foreground">
                    Previewing new price — not saved until you confirm.
                  </p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {lineItems.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between text-sm text-muted-foreground"
                    >
                      <span className="truncate">
                        {item.quantity}× {item.name}
                        <span className="text-xs"> @ {formatPeso(item.unitCents)}</span>
                      </span>
                      <span className="font-mono">
                        {formatPeso(item.unitCents * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm text-muted-foreground">
                  <span>À-la-carte total</span>
                  <span className="font-mono">{formatPeso(savings.aLaCarteTotalCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Deal price</span>
                  <span className="font-mono">{formatPeso(savings.dealPriceCents)}</span>
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
              </section>
            ) : null}

            {/* DEAL-005 — the deal's scheduled live window. Clearing both fields
                returns it to always-live (the pre-DEAL-005 default). */}
            <section className="flex flex-col gap-3 rounded-xl border-2 border-foreground p-4">
              <h2 className="font-display text-h3">Schedule</h2>
              <p className="text-xs text-muted-foreground">
                {storedStartsAt || storedEndsAt
                  ? 'This deal is only shown to customers inside its window. Clear both fields to make it always live.'
                  : 'Always live — set a window to limit when customers can see and order this deal.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <DateTimeField
                  label="Starts"
                  value={startsAt}
                  onChange={(v) => patchWindow({ startsAt: v })}
                  min={windowNow}
                  className="flex-1"
                />
                <DateTimeField
                  label="Ends"
                  value={endsAt}
                  onChange={(v) => patchWindow({ endsAt: v })}
                  defaultTime="23:59"
                  min={startsAt || windowNow}
                  className="flex-1"
                />
              </div>
              {windowError ? (
                <p role="alert" className="text-sm font-semibold text-destructive">
                  {windowError}
                </p>
              ) : null}

              {/* DEAL-005 Phase 2 — recurrence NARROWS the window above. */}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={recur.enabled}
                  onChange={(e) => patchRecur({ enabled: e.target.checked })}
                  className="size-4 accent-primary"
                />
                Repeats weekly
              </label>

              {recur.enabled ? (
                <div className="flex flex-col gap-3 rounded-md border-2 border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Live only on the selected days, between the selected times (Manila time). For an
                    overnight deal such as 10pm–2am, create one deal per side of midnight.
                  </p>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Repeat on</span>
                    <DayOfWeekPicker value={recur.days} onChange={(days) => patchRecur({ days })} />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Starts at {recur.startTime}</span>
                      <ClockDial
                        value={recur.startTime}
                        onChange={(startTime) => patchRecur({ startTime })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">Ends at {recur.endTime}</span>
                      <ClockDial
                        value={recur.endTime}
                        onChange={(endTime) => patchRecur({ endTime })}
                      />
                    </div>
                  </div>
                  {recurError ? (
                    <p role="alert" className="text-sm font-semibold text-destructive">
                      {recurError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Button
                  disabled={!windowDirty || !!windowError || !!recurError}
                  isLoading={updateMutation.isPending}
                  onClick={saveWindow}
                >
                  Save schedule
                </Button>
                {windowDirty ? (
                  <Button variant="secondary" onClick={() => setWindowDraft(null)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </section>

            <DealComponentEditor dealId={dealId} components={deal.components} />

            <DealAvailabilityEditor dealId={dealId} />
          </>
        ) : null}
      </QueryStates>

      <ConfirmDialog
        open={confirmOpen}
        title="Change base price"
        description={
          deal && priceValid
            ? `Change “${deal.name}” base price from ${formatPeso(deal.basePriceCents)} to ${formatPeso(
                Math.round(Number(priceInput) * 100),
              )}? Existing orders keep their original prices — only new orders use the new price.`
            : ''
        }
        confirmLabel="Change price"
        pendingLabel="Saving…"
        destructive={false}
        pending={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        onOpenChange={setConfirmOpen}
        onConfirm={handlePriceConfirm}
      />
    </main>
  );
}
