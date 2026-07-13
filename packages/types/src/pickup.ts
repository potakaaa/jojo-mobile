export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  /**
   * Client-computed, not API-sourced. Populated at the API-client boundary
   * (`apps/mobile/src/lib/api-client.ts`'s `getBranches()`) as
   * `branch.isAcceptingPickup` — the real backend's `GET /branches` query is
   * already active-only server-side, so `isAcceptingPickup` is the field-accurate
   * equivalent of "open". Optional because the raw API response shape omits it.
   */
  isOpen?: boolean;
  // Additive fields from the real DB branch shape. Optional so existing
  // mock/showcase usages that predate the real API keep compiling unchanged;
  // the API client populates them for live data.
  slug?: string;
  phone?: string;
  /** JSON-encoded weekly hours (opaque string as stored in `branches.opening_hours`). */
  openingHours?: string;
}
