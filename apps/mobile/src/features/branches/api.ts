import type { Deal, PickupBranch } from '@jojopotato/types';

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

/** Raw API deal shape — snake_case fields plus the server-computed label. */
export interface ApiBranchDeal {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  deal_type: string;
  discount_value: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  discountLabel: string;
}

export function mapApiBranchDeal(row: ApiBranchDeal): Deal {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    discountLabel: row.discountLabel,
    imageUrl: row.image_url ?? undefined,
    validUntil: row.end_at
      ? new Date(row.end_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : undefined,
  };
}

/** Combined response shape from `GET /api/branches/:id`. */
export interface BranchDetailResponse {
  branch: ApiBranch;
  deals: ApiBranchDeal[];
}
