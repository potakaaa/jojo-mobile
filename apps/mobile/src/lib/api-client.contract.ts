/**
 * Compile-time wire-contract guard for the menu/branch API client.
 *
 * This file has no runtime behaviour — it exists so `tsc` fails loudly if the
 * promoted catalog types in `@jojopotato/types` (`Product`/`Category`/
 * `MenuResponse`/`PickupBranch`) ever drift from the real server wire shape
 * emitted by `packages/api/src/routes/lib/serializers.ts` (`ApiMenuProduct`/
 * `ApiMenuCategory`/`ApiMenu`/`ApiBranch`). It replaces the deleted
 * `features/menu/lib/api-client.contract.ts`, whose purpose (catch a silent
 * `as T` drift like the one found in a prior EVL cycle) must be preserved.
 *
 * The literals below are shaped EXACTLY as the server serializers return them
 * (cents money, `optionId` not `id`, options grouped by type). A field-name or
 * money-unit drift on either side turns the `satisfies` checks red.
 */

import type { Category, MenuResponse, PickupBranch, Product } from '@jojopotato/types';

// A realistic `serializeMenuProduct` output — cents-native, options grouped.
const WIRE_PRODUCT = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Classic Fries',
  description: 'Golden and crispy',
  imageUrl: 'https://cdn.example/fries.png',
  basePriceCents: 8900,
  options: {
    size: [{ optionId: 's1', optionType: 'size', name: 'Regular', priceDeltaCents: 0 }],
    flavor: [{ optionId: 'f1', optionType: 'flavor', name: 'Cheese', priceDeltaCents: 1500 }],
    add_on: [],
  },
} satisfies Product;

// A realistic `serializeMenuCategory` output.
const WIRE_CATEGORY = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Snacks',
  products: [WIRE_PRODUCT],
} satisfies Category;

// A realistic `GET /branches/:id/menu` body (bare `{ branchId, categories }`).
const WIRE_MENU = {
  branchId: '33333333-3333-3333-3333-333333333333',
  categories: [WIRE_CATEGORY],
} satisfies MenuResponse;

// A realistic `serializeBranch` output plus the client-derived `isOpen`.
const WIRE_BRANCH = {
  id: '44444444-4444-4444-4444-444444444444',
  name: 'JojoPotato Downtown',
  address: '1 Test St',
  latitude: 10,
  longitude: 123,
  phone: '+63 32 000 0000',
  openingHours: '{"mon":{"open":"09:00","close":"21:00"}}',
  estimatedPrepMinutes: 20,
  isAcceptingPickup: true,
  isOpen: true,
} satisfies PickupBranch;

// Prevent unused-const lint from stripping the guards; keep them referenced.
export const __apiClientWireContract = {
  WIRE_PRODUCT,
  WIRE_CATEGORY,
  WIRE_MENU,
  WIRE_BRANCH,
} as const;
