import type { Deal, DealType, PickupBranch } from '@jojopotato/types';

/** Raw API branch shape — snake_case, lat/lng as numeric strings. */
export interface ApiBranch {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: string;
  longitude: string;
  phone: string;
  opening_hours: string;
  is_active: boolean;
  is_accepting_pickup: boolean;
  estimated_prep_minutes: number;
  priority: number;
}

export function mapApiBranch(row: ApiBranch): PickupBranch {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    address: row.address,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    phone: row.phone,
    openingHours: row.opening_hours,
    isActive: row.is_active,
    isAcceptingPickup: row.is_accepting_pickup,
    estimatedPrepMinutes: row.estimated_prep_minutes,
    priority: row.priority,
  };
}

/**
 * Raw API deal shape from `GET /api/branches/:id` — the endpoint spreads the full
 * `deals` row (snake_case, numeric columns as strings) plus a server-computed
 * `discountLabel`. Mirrors `packages/api/src/db/schema/deals.ts`.
 */
export interface ApiBranchDeal {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  deal_type: string;
  discount_value: string | null;
  minimum_order_amount: string;
  start_at: string;
  end_at: string;
  usage_limit_per_user: number | null;
  total_usage_limit: number | null;
  is_active: boolean;
  discountLabel: string;
}

/** Server `numeric(10,2)` PHP major units → integer cents (×100, rounded). */
function toCents(value: string | null): number {
  const parsed = value !== null ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function mapApiBranchDeal(row: ApiBranchDeal): Deal {
  const dealType = row.deal_type as DealType;
  // discountValue is polymorphic (see VALUE-UNIT NOTE on Deal): percentage stays
  // as-is for percentage_discount; fixed_discount converts major units → cents;
  // other types are unused (0).
  const rawDiscount = row.discount_value !== null ? Number.parseFloat(row.discount_value) : NaN;
  const discountValue =
    dealType === 'fixed_discount'
      ? toCents(row.discount_value)
      : Number.isFinite(rawDiscount)
        ? rawDiscount
        : 0;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    discountLabel: row.discountLabel,
    imageUrl: row.image_url ?? undefined,
    validUntil: row.end_at
      ? new Date(row.end_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : undefined,
    dealType,
    discountValue,
    minimumOrderAmount: toCents(row.minimum_order_amount),
    startAt: row.start_at,
    endAt: row.end_at,
    isActive: row.is_active,
    usageLimitPerUser: row.usage_limit_per_user ?? undefined,
    totalUsageLimit: row.total_usage_limit ?? undefined,
    // The branch-detail endpoint does not join deal_products/deal_branches, so
    // these arrays aren't available here — empty = all products / branch-agnostic.
    eligibleProductIds: [],
    eligibleBranchIds: [],
  };
}

/** Combined response shape from `GET /api/branches/:id`. */
export interface BranchDetailResponse {
  branch: ApiBranch;
  deals: ApiBranchDeal[];
}
