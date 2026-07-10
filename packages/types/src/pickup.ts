export interface PickupBranch {
  id: string;
  name: string;
  slug: string;
  address: string;
  latitude: number; // converted from API string by mobile mapping layer
  longitude: number; // converted from API string by mobile mapping layer
  phone: string;
  openingHours: string; // raw JSON string from API — parsed by getIsOpenNow
  isActive: boolean;
  isAcceptingPickup: boolean;
  estimatedPrepMinutes: number;
  priority: number;
  // Client-computed, optional — populated only when location status is 'granted'
  distanceKm?: number;
}
