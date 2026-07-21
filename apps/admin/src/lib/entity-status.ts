import type { StatusTone } from '@/components/status-badge';

/**
 * Pure status derivations for the admin visibility indicators (ADM-008 post-merge
 * Fix 3). Each function maps an entity's raw fields to a `{ label, tone }`
 * descriptor the `StatusBadge` renders. Structurally typed (no feature-type
 * imports) so this shared lib stays decoupled from the deals/offers/promotions
 * feature modules.
 *
 * IMPORTANT — the three entities do NOT share visibility mechanics (see the
 * backlog note's asymmetry table); do not unify them:
 *  - Deal: `is_deal` product, visible only where it has an available BPA row →
 *    an active deal with zero available branches is INVISIBLE everywhere.
 *  - Offer: `is_active` + validity window; empty `offer_branches` = valid
 *    EVERYWHERE (branch-agnostic), so branch scope is not a "hidden" signal.
 *  - Promotion: window only (no active flag, no branch scope).
 */
export interface StatusDescriptor {
  label: string;
  tone: StatusTone;
}

/** Where `now` falls relative to a [startAt, endAt] window (ISO strings). */
export type WindowPhase = 'upcoming' | 'active' | 'expired';

export function windowPhase(startAt: string, endAt: string, now: Date = new Date()): WindowPhase {
  const t = now.getTime();
  if (t < new Date(startAt).getTime()) return 'upcoming';
  if (t > new Date(endAt).getTime()) return 'expired';
  return 'active';
}

/**
 * Where `now` sits relative to a possibly-open-ended DEAL-005 window. Returns
 * `null` when the deal is UNSCHEDULED (both bounds absent) — the caller then keeps
 * its pre-DEAL-005 labels, which is what makes the badge no-backfill-safe.
 *
 * Open-ended bounds are resolved here rather than in `windowPhase`, which requires
 * two concrete bounds and is shared with offers/promotions (both of which always
 * have both). Substituting a sentinel keeps that shared helper untouched.
 */
function resolveWindowPhase(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: Date,
): WindowPhase | null {
  if (!startsAt && !endsAt) return null;
  // A missing bound is open on that side: "already started" / "never ends".
  const start = startsAt ?? new Date(-8640000000000000).toISOString();
  const end = endsAt ?? new Date(8640000000000000).toISOString();
  return windowPhase(start, end, now);
}

/**
 * Asia/Manila is a fixed +08:00 offset with no DST — the same documented fact the
 * server's `routes/lib/deal-schedule.ts` and `routes/admin/lib/analytics-range.ts`
 * rely on. Cosmetic-only local copy so the admin badge can decide "active right
 * now"; the SERVER stays the authority on customer visibility.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Convert a UTC instant to its Asia/Manila WALL-CLOCK day-of-week (0=Sun..6=Sat,
 * matching `Date#getDay()`) and `"HH:mm"` time-of-day. Cosmetic-only local copy of
 * the server's `toManilaWallClock` (packages/api/src/routes/lib/deal-schedule.ts) —
 * the admin client cannot import server code, so ~6 lines are mirrored here.
 *
 * DANGER (same warning as the server): after shifting the epoch by the fixed offset,
 * read ONLY `getUTC*` accessors — NEVER `getDay()`/`getHours()`, which read the host
 * timezone and are correct only by coincidence on a Manila-set machine. Manila
 * Saturday 07:00 is Friday 23:00 UTC, so a host-local read fires on the wrong day.
 */
function manilaWallClock(now: Date): { day: number; hhmm: string } {
  const shifted = new Date(now.getTime() + MANILA_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { day: shifted.getUTCDay(), hhmm: `${hh}:${mm}` };
}

/**
 * Deal status COMBINES `is_active` and branch availability — either one can hide
 * the deal from customers. An active deal with zero available branches is flagged
 * as a warning ("Not available at any branch"), never a plain "Active". When the
 * availability count is unknown (e.g. the create response omits it), fall back to
 * the plain active/inactive state rather than a false warning.
 */
export interface DealStatusDescriptor extends StatusDescriptor {
  /**
   * DEAL-005 Phase 2 — does this deal repeat weekly? Rendered as a SEPARATE,
   * additional badge next to `label`, never replacing it.
   *
   * Deliberately NOT folded into the `Scheduled`/`Live`/`Expired` derivation: a deal
   * that is inside its absolute window but outside today's recurring hours is not
   * "Scheduled" in any sense an admin would recognise — it is live-but-not-right-now,
   * and will return in a few hours with no admin action. Recomputing the phase
   * per-minute against the recurrence would make the badge flicker and mislead.
   */
  recurring: boolean;
  /**
   * DEAL-005 Phase 2 — for a recurring deal that is otherwise Live/Active RIGHT NOW
   * (primary tone `success`), is `now` inside today's Manila recurring hours?
   *   - `true`  → "Active now"
   *   - `false` → "Not active now" (live in its absolute window, but returns later)
   *   - `null`  → non-recurring, OR not currently Live/Active, so the question is moot.
   * COSMETIC ONLY — the server enforcement (`isDealScheduleLive`) is the authority.
   */
  recurringActive: boolean | null;
}

export function dealStatus(
  deal: {
    isActive: boolean;
    availableBranchCount?: number;
    activeBranchCount?: number;
    /** DEAL-005 window bounds (ISO). Both null/absent = unscheduled = always live. */
    startsAt?: string | null;
    endsAt?: string | null;
    /** DEAL-005 Phase 2 recurrence days (0=Sun..6=Sat). Null/absent = non-recurring. */
    recurDays?: number[] | null;
    /** DEAL-005 Phase 2 recurrence hours, Manila WALL-CLOCK `"HH:mm"`. */
    recurStartTime?: string | null;
    recurEndTime?: string | null;
  },
  now: Date = new Date(),
): DealStatusDescriptor {
  const label = dealStatusLabel(deal, now);
  return {
    ...label,
    recurring: Array.isArray(deal.recurDays) && deal.recurDays.length > 0,
    // Only ask "active right now?" when the deal is genuinely Live/Active in its
    // absolute window (success tone). On Expired/Inactive/Scheduled deals the
    // "Not active now" badge would be noise, so it stays `null` and renders nothing.
    recurringActive: label.tone === 'success' ? recurringActiveNow(deal, now) : null,
  };
}

/**
 * Is a recurring deal inside TODAY'S Manila recurring window at `now`? Returns
 * `null` for a non-recurring deal (no `recurDays`, or the time bounds absent);
 * otherwise `true` iff `now`'s Manila day-of-week is in `recurDays` AND its Manila
 * time-of-day falls in `[recurStartTime, recurEndTime)` — half-open, matching the
 * server's `isDealScheduleLive`. Zero-padded `"HH:mm"` strings compare correctly.
 */
function recurringActiveNow(
  deal: {
    recurDays?: number[] | null;
    recurStartTime?: string | null;
    recurEndTime?: string | null;
  },
  now: Date,
): boolean | null {
  const days = deal.recurDays;
  if (!Array.isArray(days) || days.length === 0) return null;
  if (deal.recurStartTime == null || deal.recurEndTime == null) return null;

  const wall = manilaWallClock(now);
  if (!days.includes(wall.day)) return false;
  if (wall.hhmm < deal.recurStartTime) return false;
  if (wall.hhmm >= deal.recurEndTime) return false;
  return true;
}

/** The pre-Phase-2 label/tone derivation, unchanged. */
function dealStatusLabel(
  deal: {
    isActive: boolean;
    availableBranchCount?: number;
    activeBranchCount?: number;
    startsAt?: string | null;
    endsAt?: string | null;
  },
  now: Date = new Date(),
): StatusDescriptor {
  if (!deal.isActive) return { label: 'Inactive', tone: 'muted' };
  if (deal.availableBranchCount === 0) {
    return { label: 'Not available at any branch', tone: 'warning' };
  }

  // DEAL-005: layered ON TOP of the active/availability logic above, never
  // replacing it — a scheduled deal that is invisible everywhere still reports the
  // more urgent branch warning. An UNSCHEDULED deal (both bounds null/absent) falls
  // straight through to the pre-DEAL-005 labels below, unchanged.
  //
  // `windowPhase` is reused verbatim; the nullable cases are handled here because it
  // requires two non-null bounds. NOTE (Execute-Agent Instruction E3): its boundary
  // is CLOSED at `endAt`, one instant looser than the half-open `[starts_at,
  // ends_at)` the SERVER enforces. This is a cosmetic badge-only divergence — the
  // server is the authority on visibility — and is deliberately not "fixed" here.
  const phase = resolveWindowPhase(deal.startsAt, deal.endsAt, now);
  if (phase === 'upcoming') return { label: 'Scheduled', tone: 'neutral' };
  if (phase === 'expired') return { label: 'Expired', tone: 'muted' };
  if (phase === 'active') {
    return deal.availableBranchCount !== undefined && deal.activeBranchCount !== undefined
      ? {
          label: `Live · ${deal.availableBranchCount}/${deal.activeBranchCount} branches`,
          tone: 'success',
        }
      : { label: 'Live', tone: 'success' };
  }
  if (deal.availableBranchCount !== undefined && deal.activeBranchCount !== undefined) {
    return {
      label: `Active · ${deal.availableBranchCount}/${deal.activeBranchCount} branches`,
      tone: 'success',
    };
  }
  return { label: 'Active', tone: 'success' };
}

/**
 * Offer status from `is_active` + validity window. A deactivated offer is
 * "Inactive" regardless of window; an active offer reads Upcoming / Active /
 * Expired from its window. Branch scope is intentionally not shown — an offer with
 * empty `offer_branches` is valid everywhere, so there is no "hidden" state to
 * flag (unlike deals), and the admin offer serializer carries no branch data.
 */
export function offerStatus(
  offer: { isActive: boolean; startAt: string; endAt: string },
  now: Date = new Date(),
): StatusDescriptor {
  if (!offer.isActive) return { label: 'Inactive', tone: 'muted' };
  switch (windowPhase(offer.startAt, offer.endAt, now)) {
    case 'upcoming':
      return { label: 'Upcoming', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'muted' };
    case 'active':
      return { label: 'Active', tone: 'success' };
  }
}

/**
 * Promotion status from its window only (promotions have no active flag and no
 * branch scope). Upcoming / Active / Expired.
 */
export function promotionStatus(
  promotion: { startAt: string; endAt: string },
  now: Date = new Date(),
): StatusDescriptor {
  switch (windowPhase(promotion.startAt, promotion.endAt, now)) {
    case 'upcoming':
      return { label: 'Upcoming', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'muted' };
    case 'active':
      return { label: 'Active', tone: 'success' };
  }
}
