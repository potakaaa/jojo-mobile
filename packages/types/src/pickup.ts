export interface PickupBranch {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedPrepMinutes: number;
  isAcceptingPickup: boolean;
  // Divergent between the two flows — optional so both compile.
  // `slug` is present in the locator API row but omitted by the order-flow
  // api-client's `serializeBranch` wire shape, so it must be optional for both
  // flows to satisfy this type.
  slug?: string;
  phone?: string;
  openingHours?: string; // raw JSON string from API
  isActive?: boolean;
  priority?: number;
  isOpen?: boolean; // client-computed by development's api-client
  distanceKm?: number; // client-computed when location granted
}
