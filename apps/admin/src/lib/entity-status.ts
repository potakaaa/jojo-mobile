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
  },
  now: Date = new Date(),
): DealStatusDescriptor {
  return {
    ...dealStatusLabel(deal, now),
    recurring: Array.isArray(deal.recurDays) && deal.recurDays.length > 0,
  };
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
