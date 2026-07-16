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
 * Deal status COMBINES `is_active` and branch availability — either one can hide
 * the deal from customers. An active deal with zero available branches is flagged
 * as a warning ("Not available at any branch"), never a plain "Active". When the
 * availability count is unknown (e.g. the create response omits it), fall back to
 * the plain active/inactive state rather than a false warning.
 */
export function dealStatus(deal: {
  isActive: boolean;
  availableBranchCount?: number;
  activeBranchCount?: number;
}): StatusDescriptor {
  if (!deal.isActive) return { label: 'Inactive', tone: 'muted' };
  if (deal.availableBranchCount === 0) {
    return { label: 'Not available at any branch', tone: 'warning' };
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
