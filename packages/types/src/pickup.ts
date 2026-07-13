export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  /**
   * Client-computed from the branch's opening hours — not API-sourced.
   * Optional because the API response shape does not carry it.
   */
  isOpen?: boolean;
}
