export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  // Additive fields from `GET /api/branches` (real DB shape). Optional so
  // existing mock/showcase usages that predate the real API keep compiling
  // unchanged; the API client populates them for live data.
  slug?: string;
  phone?: string;
  /** JSON-encoded weekly hours (opaque string as stored in `branches.opening_hours`). */
  openingHours?: string;
  isActive?: boolean;
  isAcceptingPickup?: boolean;
  estimatedPrepMinutes?: number;
}
