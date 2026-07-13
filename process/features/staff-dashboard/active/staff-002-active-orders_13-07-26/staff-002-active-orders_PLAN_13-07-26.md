---
name: plan:staff-002-active-orders
description: "COMPLEX plan for STAFF-002 — staff Active Orders dashboard with polling and read-only Order Details"
date: 13-07-26
feature: staff-dashboard
phase: "STAFF-002"
status: active
---

# STAFF-002: Active Orders Dashboard — Implementation Plan

**GitHub Issue**: #32
**Date**: 2026-07-13
**Branch**: development
**Complexity**: COMPLEX
**Status**: EXECUTED — all phases A–H complete; gates green (62 API tests, typecheck, lint, format, idempotent seed×2); risk pack 5/5 valid. Awaiting independent EVL re-run + closeout.
**SPEC**: `process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/staff-002-active-orders_SPEC_13-07-26.md`

---

## Overview

**Context**: Read  for project architecture. STAFF-001 (auth + staff shell) is complete and merged. The  at  is mounted at  behind the  guard in . Branch scope primitives (, ) live in . The  and  tables are fully migrated with . Real customer order placement exists ( behind ).  is already wired in  via  (from the ordering-cart feature).

**Goal**: Wire two read-only API endpoints to the existing staff shell so branch staff can see and inspect live pickup orders without manual refresh.

---

## Objective

Replace the hardcoded mock in `apps/mobile/src/app/(staff)/active-orders.tsx` with a real,
branch-scoped, polling order feed from two new API endpoints (`GET /api/staff/orders` and
`GET /api/staff/orders/:orderId`). Add a pushed read-only Order Details screen at
`(staff)/order-detail/[orderId].tsx`. Seed ~5 varied-status active orders for QA. Wire
hermetic integration tests covering branch isolation, non-terminal filtering, and item/option
shape.

**Ties to SPEC ACs:**
- AC-1: New orders surface within ≤2 polling intervals (~20s) without manual refresh (Agent-Probe).
- AC-2: Branch isolation on list endpoint is server-enforced (Fully-Automated vitest).
- AC-3: Terminal statuses never appear in list (Fully-Automated vitest).
- AC-4: Detail endpoint returns full item list with confirmed `selectedOptions` shape (Hybrid: Fully-Automated API + Agent-Probe mobile).
- AC-5: Cross-branch detail ID → 403/404 (Fully-Automated vitest).

---

## In / Out of Scope

**IN scope:**
- `GET /api/staff/orders` — branch-scoped active orders list (non-terminal statuses, newest-first)
- `GET /api/staff/orders/:orderId` — branch-scoped order detail with full items + options
- Two new TypeScript types: `StaffOrderSummary` and `StaffOrderDetail` in `packages/types/src/staff.ts`
- Seed ~5 sample active orders with `order_items` and `selected_options` in `packages/api/src/db/seed/seed.ts`
- Hermetic vitest integration tests in `packages/api/src/routes/__tests__/staff-orders.integration.test.ts`
- Mobile: replace mock `active-orders.tsx` with real polled feed using `useQuery` + `refetchInterval: 10_000`
- Mobile: new `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` (read-only, inert action buttons)
- Register new route in `apps/mobile/src/app/(staff)/_layout.tsx`
- Update `NAV_CARDS` subtitle in `(staff)/index.tsx` to reflect real order count (or static "View orders")
- Staff-specific status label map (see OC-6 decision below)
- Typecheck + lint gates; Expo typed-routes codegen step before mobile typecheck

**OUT of scope:**
- STAFF-003 write endpoints (Accept, Mark Ready, etc.)
- Completed Orders screen
- SSE / WebSocket
- Push notifications
- Product availability (STAFF-004)
- `POST /dev/orders` injection endpoint (removed by A2)
- Admin/super_admin multi-branch scope bypass
- Order filtering/sorting UI controls
- Order cancellation by staff

---

## Acceptance Criteria

These acceptance criteria are directly traced from the locked SPEC. Each AC names the proving strategy.

| AC | Criterion | Proving strategy |
|---|---|---|
| AC-1 | New order for assigned branch appears within ≤2 polling intervals (~20s) without manual refresh | Agent-Probe (no RN runner) |
| AC-2 |  returns only the caller's assigned branch orders; client cannot override branch_id | Fully-Automated (vitest) |
| AC-3 |  and  orders never appear in  | Fully-Automated (vitest) |
| AC-4 |  returns full item list with , , ,  | Hybrid: Fully-Automated (API vitest) + Agent-Probe (mobile render) |
| AC-5 |  with a different branch's order ID returns 403 or 404 | Fully-Automated (vitest) |

-  Vitest integration test  (AC-2, AC-3, AC-4 API layer, AC-5), strategy: 
-  Agent-Probe scenario (AC-1, AC-4 mobile render), strategy: 

---


## Open Contracts — Locked Decisions

These contracts were open in the SPEC (OC-2 through OC-6). All are locked here:

**OC-2 — List endpoint response schema:**
`GET /api/staff/orders` returns `{ orders: StaffOrderSummary[] }`. Each `StaffOrderSummary`
contains `id`, `orderNumber`, `status`, `placedAt`, `totalCents`, and an `itemSummary` string
(server-computed — OC-3 decision below). Full `order_items` array is NOT included in the list
response to avoid over-fetching.

**OC-3 — Item summary format:**
Computed server-side as a concatenated string: `"2× Loaded Fries, 1× Classic Soda"` (format:
`qty× name` joined by `, `, max 3 items then "+ N more"). This avoids sending full item arrays
in the list and matches the mock's display pattern.

**OC-4 — Polling interval:**
`refetchInterval: 10_000` (10 000ms / 10s). Hard-coded constant in `useStaffOrders` hook.
Matches SPEC's "~10s" requirement exactly.

**OC-5 — Sort order:**
`ORDER BY placed_at DESC` (newest first). No status-priority weighting — simplest correct
behavior; staff naturally act on oldest pending first by visual scan.

**OC-6 — Staff status labels:**
Staff screens use a **staff-specific status label map** (not `OrderStatusBadge` which renders
customer-facing labels). The mock's existing `STATUS_CONFIG` constant is the reference. Keep it
as a module-level constant in `active-orders.tsx` (renamed `STAFF_STATUS_CONFIG`) shared
between the list and detail screens via a small helper. Rationale: one-line decision, no new
component, avoids surprising staff with customer-facing copy ("Frying now" vs "Preparing").
The `OrderStatusBadge` component from `@jojopotato/ui` is NOT used on staff screens.

---

## Response Schema Contract

### `StaffOrderSummary` (list row)

```typescript
// packages/types/src/staff.ts
export interface StaffOrderSummary {
  id: string;
  orderNumber: string;    // e.g. "JP-260713-0001"
  status: OrderStatus;    // non-terminal only in list response
  placedAt: string;       // ISO 8601
  totalCents: number;
  itemSummary: string;    // server-computed: "2× Loaded Fries, 1× Classic Soda"
}
```

### `StaffOrderDetail` (detail screen)

```typescript
// packages/types/src/staff.ts
export interface StaffOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt: string;       // ISO 8601
  estimatedReadyAt: string | null;
  totalCents: number;
  items: StaffOrderItem[];
}

export interface StaffOrderItem {
  productId: string;
  productName: string;    // from product_name_snapshot
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  selectedOptions: Array<{
    optionId: string;
    optionType: 'size' | 'flavor' | 'add_on';
    name: string;
    priceDeltaCents: number;
  }>;
}
```

`StaffOrderItem.selectedOptions` mirrors `SelectedOption` from `packages/api/src/routes/lib/serializers.ts:27-32` (confirmed by A3).

### API response envelopes

```
GET /api/staff/orders        → { orders: StaffOrderSummary[] }
GET /api/staff/orders/:id    → StaffOrderDetail   (flat, no envelope)
```

Both respond 403 if `resolveBranchScope` returns null (unassigned staff).
Detail responds 404 if the order ID does not exist, 403 if it belongs to a different branch.

---

## Touchpoints

| File | Change type | Package |
|---|---|---|
| `packages/api/src/routes/staff.ts` | Add 2 routes (GET /orders, GET /orders/:id) | api |
| `packages/api/src/routes/lib/serializers.ts` | Add `serializeStaffOrderSummary`, `buildItemSummary` helpers (re-use `serializeOrderItem`) | api |
| `packages/api/src/routes/__tests__/staff-orders.integration.test.ts` | New file | api |
| `packages/api/src/db/seed/seed.ts` | Add `seedSampleOrders` function | api |
| `packages/types/src/staff.ts` | Add `StaffOrderSummary`, `StaffOrderDetail`, `StaffOrderItem` | types |
| `packages/types/src/index.ts` | Re-export new types | types |
| `apps/mobile/src/features/staff/lib/staff-api.ts` | Add `fetchStaffOrders`, `fetchStaffOrderDetail` | mobile |
| `apps/mobile/src/features/staff/lib/staff-status-config.ts` | New file: shared `STAFF_STATUS_CONFIG` constant | mobile |
| `apps/mobile/src/features/staff/hooks/use-staff-orders.ts` | New file: `useStaffOrders()` hook with polling | mobile |
| `apps/mobile/src/features/staff/hooks/use-staff-order-detail.ts` | New file: `useStaffOrderDetail(orderId)` hook | mobile |
| `apps/mobile/src/app/(staff)/active-orders.tsx` | Full replacement (mock → real) | mobile |
| `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` | New file: detail screen | mobile |
| `apps/mobile/src/app/(staff)/_layout.tsx` | Register `order-detail/[orderId]` route | mobile |
| `apps/mobile/src/app/(staff)/index.tsx` | Update NAV_CARDS Active Orders subtitle | mobile |

**Total**: ~14 files across 3 packages. No schema migration needed (orders/order_items tables exist; `orders_branch_status_idx` already present).

---

## Public Contracts

| Contract | Consumers | Breaking-change risk |
|---|---|---|
| `GET /api/staff/orders` | `apps/mobile` (useStaffOrders) | New endpoint — additive only |
| `GET /api/staff/orders/:id` | `apps/mobile` (useStaffOrderDetail) | New endpoint — additive only |
| `StaffOrderSummary` type | `apps/mobile` | New type |
| `StaffOrderDetail` / `StaffOrderItem` types | `apps/mobile` | New type |
| `serializeStaffOrderSummary` / `buildItemSummary` | `staff.ts` routes (internal) | api-internal only |

No existing endpoints or types are modified. Existing `serializeOrder` / `serializeOrderItem` in `serializers.ts` are reused, not changed.

---

## Blast Radius

- **Packages touched**: `packages/api`, `packages/types`, `apps/mobile`
- **Files modified**: 4 (staff.ts, serializers.ts, seed.ts, _layout.tsx, index.tsx, staff-api.ts, staff.ts types, types/index.ts)
- **Files new**: 6 (staff-orders.integration.test.ts, staff-status-config.ts, use-staff-orders.ts, use-staff-order-detail.ts, active-orders.tsx replacement, order-detail/[orderId].tsx)
- **Risk class**: MEDIUM — new routes behind existing `requireStaff` guard; no schema changes; no auth surface changes; no billing
- **Rollback**: revert `staff.ts` route additions; drop new test file; revert mobile files to mock version (tracked in git)

---

## Implementation Checklist

### Phase A — API Routes (staff.ts + serializers.ts) ✅ DONE

**A1.** In `packages/api/src/routes/lib/serializers.ts`, add after the existing `serializeOrder` function:
- `buildItemSummary(items: OrderItemRow[]): string` — formats `"Qty× Name, Qty× Name"`, cap at 3 items then `+ N more`
- `serializeStaffOrderSummary(order: OrderRow, items: OrderItemRow[]): StaffOrderSummary` — calls `buildItemSummary`, maps fields to the `StaffOrderSummary` interface (import type from `@jojopotato/types`)
- `serializeStaffOrderDetail(order: OrderRow, items: OrderItemRow[]): StaffOrderDetail` — maps to `StaffOrderDetail`; reuses `serializeOrderItem` for items array

**A2.** In `packages/api/src/routes/staff.ts`, add after the existing `/me` route:

`GET /api/staff/orders`:
1. Call `resolveBranchScope(db, req.staffSession!.userId)` — if null, `res.status(403).json({ error: 'No branch assigned' })` and return.
2. Query: `SELECT orders WHERE branch_id = branchId AND status IN ('pending','accepted','preparing','flavoring','ready') ORDER BY placed_at DESC` using Drizzle's `inArray` + `eq` + `orderBy(desc(orders.placed_at))`.
3. For each order, query its `order_items` rows.
4. Map each order through `serializeStaffOrderSummary` (from serializers).
5. Return `res.json({ orders: serializedOrders })`.

`GET /api/staff/orders/:orderId`:
1. Call `resolveBranchScope(db, req.staffSession!.userId)` — if null, 403.
2. Fetch order by `req.params.orderId`. If not found, 404.
3. If `order.branch_id !== branchId`, return 403 (branch isolation AC-5).
4. Fetch `order_items` for the order.
5. Return `res.json(serializeStaffOrderDetail(order, items))`.

**A3.** Add imports to `staff.ts`: `desc`, `inArray` from `drizzle-orm`; `orders`, `orderItems` from `../db/schema/index`; `serializeStaffOrderSummary`, `serializeStaffOrderDetail` from `./lib/serializers`.

### Phase B — Types ✅ DONE

**B1.** In `packages/types/src/staff.ts`, add after existing exports:
- Import `OrderStatus` from `./order`
- Export `StaffOrderSummary` interface (fields per schema contract above)
- Export `StaffOrderItem` interface (fields per schema contract above)
- Export `StaffOrderDetail` interface (fields per schema contract above)

**B2.** In `packages/types/src/index.ts`, add re-exports for `StaffOrderSummary`, `StaffOrderItem`, `StaffOrderDetail`.

**B3.** In `packages/api/src/routes/lib/serializers.ts`, import `StaffOrderSummary`, `StaffOrderDetail`, `StaffOrderItem` from `@jojopotato/types` as return types for the new serializer functions.

### Phase C — Seed Sample Orders ✅ DONE (idempotent, seeded 2× green)

**C1.** In `packages/api/src/db/seed/seed.ts`, add function `seedSampleOrders(branchIdBySlug: Map<string, string>, productIdBySlug: Map<string, string>, userIdByEmail: Map<string, string>): Promise<void>`:
- Derive the first branch ID (`branchIdBySlug.values().next().value`).
- Derive the test user ID for `jojo@test.com` from `userIdByEmail`.
- Derive the first product ID from `productIdBySlug` (needed for `order_items.product_id` FK — NOT NULL constraint).
- Use fixed synthetic `order_number` values (`JP-260713-S001` through `JP-260713-S005`) for idempotency.
- For each synthetic order: `INSERT INTO orders ... ON CONFLICT (order_number) DO NOTHING`. Skip if already inserted.
- For each inserted/existing order: delete its existing `order_items` rows, then insert 1–3 fresh `order_items` rows with the resolved `product_id`, `product_name_snapshot` (e.g. "Loaded Fries"), `quantity`, `unit_price`, `total_price`, and `selected_options` in the confirmed `SelectedOption[]` shape (e.g. `[{ optionId: 'opt-1', optionType: 'flavor', name: 'BBQ Ranch', priceDeltaCents: 0 }]`).
- Assign non-terminal statuses (`pending`, `accepted`, `preparing`, `flavoring`, `ready`) across the 5 orders, each with `placed_at` spaced 3–5 minutes apart (so newest-first sort is visible).
- **Note**: `product_name_snapshot` uses hardcoded strings — the `product_id` FK still requires a real UUID from `productIdBySlug` (the FK is NOT NULL). Use `productIdBySlug.values().next().value` for all seeded order items.

**C2.** Call `seedSampleOrders` from the main `runSeed()` function in `seed.ts`, passing `branchIdBySlug`, `productIdBySlug`, and a new `userIdByEmail` map populated during `seedTestUser`.

**C3.** Update `seedTestUser` to return the `jojo@test.com` user ID (change return type to `Promise<void>` is preserved — collect the ID in the caller via a separate `db.select` query in `runSeed()`, keyed on `TEST_USER.email` after `seedTestUser()` completes). The test `dev-auto-login.test.ts` imports `seedTestUser()` and ignores its return value — no breaking change.

### Phase D — Integration Tests ✅ DONE (6 new tests green — D2-D7)

**D1.** Create `packages/api/src/routes/__tests__/staff-orders.integration.test.ts`. Template from `branches.test.ts` and `require-staff.integration.test.ts`:
- Set env vars at top (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, etc.).
- In `beforeAll`: import `db`, `schema`, `auth`, full `app` (VITEST=true guard). Sign up + sign in a staff user via `auth.api.signUpEmail` + real HTTP sign-in to get session cookie. Create a branch, assign the staff user to it. Create a second branch (branch-2). Insert fixture orders for both branches in varied statuses including terminal ones.
- In `afterAll`: delete fixture orders + order_items, users, branches in reverse FK order.

**D2.** Write test: `GET /api/staff/orders` — AC-2 branch isolation.
- Insert 2 orders for branch-1, 1 order for branch-2, all non-terminal.
- Authenticated as branch-1 staff session.
- Assert response contains exactly the branch-1 order IDs; branch-2 order ID is absent.

**D3.** Write test: `GET /api/staff/orders` — AC-3 non-terminal filtering.
- Insert 1 `pending` order and 1 `completed` + 1 `cancelled` order for branch-1.
- Assert only the `pending` order appears; `completed`/`cancelled` are absent.

**D4.** Write test: `GET /api/staff/orders/:id` — AC-4 item + options shape.
- Insert an order for branch-1 with 2 `order_items`, each having `selected_options` in the confirmed shape.
- Call detail endpoint.
- Assert response includes `items[0].productName`, `items[0].quantity`, `items[0].unitPriceCents`, `items[0].selectedOptions[0].optionId`, `.optionType`, `.name`, `.priceDeltaCents`.

**D5.** Write test: `GET /api/staff/orders/:id` — AC-5 cross-branch ID → 403.
- Insert an order for branch-2.
- Authenticate as branch-1 staff.
- Call `GET /api/staff/orders/:branch2OrderId`.
- Assert status is **403** (implementation returns 403 for branch mismatch per A2 step 3; assert exactly 403 not 404 for deterministic test).

**D6.** Write test: `GET /api/staff/orders` — 403 when staff has no assigned branch.
- Use a staff user with `assignedBranchId = null` (not yet assigned).
- Assert response is 403.

**D7.** Write test: `GET /api/staff/orders` — empty list when no active orders exist for branch.
- Branch with no orders → assert `orders` array is empty, status 200.

### Phase E — Mobile API Layer ✅ DONE (throws-on-error per P2)

**E1.** In `apps/mobile/src/features/staff/lib/staff-api.ts`, add:

```typescript
export async function fetchStaffOrders(): Promise<StaffOrderSummary[]>
export async function fetchStaffOrderDetail(orderId: string): Promise<StaffOrderDetail | null>
```

Both use `authClient.$fetch` pattern matching `fetchStaffMe`. Parse `{ data, error }` from
better-fetch response.

**Critical behavior difference from `fetchStaffMe`**: `fetchStaffOrders` and `fetchStaffOrderDetail`
must THROW on error (not return an empty value) so react-query can set `isError: true`. If the
error is swallowed and an empty `[]` is returned, `useQuery`'s `error` field will never be truthy
and the error state in the screen will never render. Implementation:

```typescript
// fetchStaffOrders — throws on error so react-query surfaces isError
export async function fetchStaffOrders(): Promise<StaffOrderSummary[]> {
  const result = await authClient.$fetch('/api/staff/orders');
  const { data, error } = result as { data: { orders: StaffOrderSummary[] } | null; error: unknown };
  if (error || !data) throw new Error('Failed to fetch staff orders');
  return data.orders ?? [];
}

// fetchStaffOrderDetail — returns null for 404 (order not found); throws for other errors
export async function fetchStaffOrderDetail(orderId: string): Promise<StaffOrderDetail | null> {
  const result = await authClient.$fetch(`/api/staff/orders/${orderId}`);
  const { data, error } = result as { data: StaffOrderDetail | null; error: { status?: number } | unknown };
  if (!data && (error as { status?: number })?.status === 404) return null;
  if (error || !data) throw new Error('Failed to fetch order detail');
  return data;
}
```

Import `StaffOrderSummary`, `StaffOrderDetail` from `@jojopotato/types`.

**E2.** Create `apps/mobile/src/features/staff/hooks/use-staff-orders.ts`:

```typescript
export const STAFF_ORDERS_POLL_INTERVAL = 10_000; // 10s — OC-4

export function useStaffOrders(): UseQueryResult<StaffOrderSummary[], Error>
```

Uses `useQuery` from `@tanstack/react-query`:
- `queryKey: ['staff', 'orders']`
- `queryFn: fetchStaffOrders`
- `refetchInterval: STAFF_ORDERS_POLL_INTERVAL`
- `refetchIntervalInBackground: false` (pause polling when app is backgrounded)

**E3.** Create `apps/mobile/src/features/staff/hooks/use-staff-order-detail.ts`:

```typescript
export function useStaffOrderDetail(orderId: string): UseQueryResult<StaffOrderDetail | null, Error>
```

Uses `useQuery`:
- `queryKey: ['staff', 'orders', orderId]`
- `queryFn: () => fetchStaffOrderDetail(orderId)`
- No `refetchInterval` (detail screen is transient; user navigates back to list which polls)
- `enabled: Boolean(orderId)`

### Phase F — Active Orders Screen Replacement ✅ DONE (mock + MOCK_ORDERS removed; STAFF_STATUS_CONFIG extracted)

**F1.** Replace `apps/mobile/src/app/(staff)/active-orders.tsx` entirely.

Keep from the mock:
- Custom compact header (arrow-back + "Active Orders" title using `Ionicons`)
- `useStaffMe()` for branch name display
- `useColorScheme()` + `useTheme()` pattern
- `SafeAreaView` + `ScrollView` layout structure
- `FontFamily`, `Spacing`, `TypeScale`, `Palette` theme constants

Replace / add:
- Import `useStaffOrders` and `STAFF_ORDERS_POLL_INTERVAL`
- Import `StaffOrderSummary` from `@jojopotato/types`
- Remove all `MOCK_ORDERS` and `MockOrder`/`MockLineItem` types
- Remove mock banner `View`
- `useStaffOrders()` replaces the mock array; destructure `{ data: orders = [], isLoading: ordersLoading, error: ordersError }`
- `Badge` in branchRow shows real order count: `orders.length` (not hardcoded 5)
- Loading state: show `ActivityIndicator` while `ordersLoading && orders.length === 0`
- Error state: show a brief error text if `ordersError` and no cached data
- Empty state: when `orders.length === 0 && !ordersLoading`, show "No active orders right now" text
- Each `OrderCard` taps → `router.push('/(staff)/order-detail/' + order.id)` (typed href once codegen runs)
- `OrderCard` now accepts `StaffOrderSummary` (not `MockOrder`); show `itemSummary` string (server-provided) instead of mapping mock items
- `OrderActions` component: remove from this file — action buttons move to the detail screen (STAFF-003 surface); list cards are tap-to-detail only
- Format `order.placedAt` (ISO 8601) as relative time using a small helper or `Intl.RelativeTimeFormat`; or display absolute time as `HH:mm`
- Import `STAFF_STATUS_CONFIG` from `../lib/staff-status-config` (not inline in this file)

**F2.** Extract `STAFF_STATUS_CONFIG` to `apps/mobile/src/features/staff/lib/staff-status-config.ts`:
```typescript
import { Palette } from '@/constants/theme';
import type { OrderStatus } from '@jojopotato/types';

export const STAFF_STATUS_CONFIG: Record<
  Extract<OrderStatus, 'pending' | 'accepted' | 'preparing' | 'flavoring' | 'ready'>,
  { label: string; bg: string; text: string }
> = {
  pending: { label: 'Pending', bg: Palette.jorange, text: Palette.ink },
  accepted: { label: 'Accepted', bg: Palette.jyellow, text: Palette.ink },
  preparing: { label: 'Preparing', bg: Palette.jgold, text: Palette.ink },
  flavoring: { label: 'Flavoring', bg: Palette.jbrown, text: Palette.cream },
  ready: { label: 'Ready', bg: Palette.green, text: Palette.cream },
};
```
Both `active-orders.tsx` and `order-detail/[orderId].tsx` import from this file.

### Phase G — Order Detail Screen + Layout + Nav Card ✅ DONE (inert STAFF-003 buttons; route registered; NAV_CARDS updated)

**G1.** Create `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx`:
- Route params: `const { orderId } = useLocalSearchParams<{ orderId: string }>()`.
- Hook: `useStaffOrderDetail(orderId)`.
- Same custom compact header pattern (arrow-back + `order.orderNumber` or "Order Detail").
- Sections:
  1. Order header: `orderNumber`, `placedAt` formatted, `status` pill using `STAFF_STATUS_CONFIG`
  2. Total: `formatCurrency(order.totalCents)` from `@jojopotato/utils`
  3. Items list: for each `item` in `order.items`, show `productName`, `quantity`, `unitPriceCents` formatted; then each `selectedOption` as `"optionType: name"` (e.g. "Flavor: BBQ Ranch" / "Size: Large")
  4. Inert action buttons: match the mock `OrderActions` component patterns (Accept/Reject for pending, Mark Flavoring, Mark Ready, etc.) — all `onPress={noop}`. Add a comment `// STAFF-003: wire real mutations here`.
- Loading state: `ActivityIndicator` while fetching.
- Error / not found: brief "Order not found" text with back button.
- Use `@jojopotato/ui` components: `Card`, `Button`, `Badge`; no one-off inline UI.
- The `order-detail/` subdirectory must be created manually before writing the file.

**G2.** In `apps/mobile/src/app/(staff)/_layout.tsx`, register the new route:
```typescript
<Stack.Screen name="order-detail/[orderId]" options={{ headerShown: false }} />
```
Remove the comment `{/* MOCK PREVIEW — remove/replace when STAFF-002 lands */}` on the `active-orders` screen registration.

**G3.** In `apps/mobile/src/app/(staff)/index.tsx`, update `NAV_CARDS`:
```typescript
{ title: 'Active Orders', subtitle: 'View orders', navigateTo: '/(staff)/active-orders' as const }
```
(Replaces `'5 active (preview)'` — the real badge count appears inside the Active Orders screen itself.)

### Phase H — Gates (Typecheck / Codegen / Lint) ✅ DONE (codegen ran → order-detail/[orderId] typed; typecheck/lint/format/tests all green)

**H1.** Run Expo typed-routes codegen for the new `[orderId]` dynamic route:
```bash
# In apps/mobile directory — start then immediately stop Expo to trigger codegen
cd apps/mobile && npx expo start --clear &
# Wait ~5s then Ctrl-C; the .expo/types/router.d.ts will include order-detail/[orderId]
```
This is required before `tsc --noEmit` can resolve `/(staff)/order-detail/${id}` as a typed href.

**H2.** Run typecheck across all packages:
```bash
pnpm typecheck
```
Fix any type errors before proceeding to tests.

**H3.** Run lint:
```bash
pnpm lint
```
Fix any lint errors.

**H4.** Run the API integration tests:
```bash
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
```
All tests (existing 42 plus new staff-orders tests) must pass.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Polling battery / network traffic at 10s | Low (background polling paused via `refetchIntervalInBackground: false`) | Accept; document in hook comment |
| `req.staffSession.assignedBranchId` stale | Medium — SPEC-documented | Routes always call `resolveBranchScope(db, userId)` — never trust session field |
| Empty state: no active orders for branch | Low | Explicit empty state renders; not a perpetual spinner |
| Unassigned staff (`assignedBranchId = null`) | Low | `resolveBranchScope` returns null → routes return 403; mobile shows "Branch not assigned" (inherited from `useStaffMe` error path) |
| `selected_options` legacy rows with `[]` | Low (real orders always write the shape) | `serializeOrderItem` already guards: `(item.selected_options as SelectedOption[]) ?? []` |
| Expo typed-routes codegen not run before typecheck | Medium | Checklist step H1 explicit; typecheck will fail with "no overload matches" on push href |
| `packages/ui/src/components/order-status-badge.tsx` mis-used on staff screen | — | OC-6 decision locked: use `STAFF_STATUS_CONFIG` only; `OrderStatusBadge` not imported in staff screens |
| `inArray` import from drizzle-orm not available | Low (drizzle-orm already in api deps) | Confirm import from `drizzle-orm` not `drizzle-orm/pg-core` |
| `fetchStaffOrders` silently returns `[]` on API error | Mitigated in E1 | E1 now throws on error so react-query sets `isError: true` |
| Seed `order_items.product_id` FK violation | Mitigated in C1 | C1 now passes `productIdBySlug` and uses first real product UUID |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Vitest: branch-1 session returns only branch-1 orders | Fully-Automated | AC-2 (branch isolation on list) |
| Vitest: terminal-status orders absent from list response | Fully-Automated | AC-3 (non-terminal filter) |
| Vitest: detail endpoint returns `selectedOptions` with confirmed field names | Fully-Automated | AC-4 (item shape API layer) |
| Vitest: cross-branch order ID → 403 on detail endpoint | Fully-Automated | AC-5 (branch isolation on detail) |
| Vitest: unassigned staff → 403 on list | Fully-Automated | AC-2 (unassigned edge case) |
| Vitest: empty branch → 200 + empty orders array | Fully-Automated | AC-3 (no-orders state) |
| `pnpm typecheck` passes (all 3 packages) | Fully-Automated | Type contract for both endpoints |
| `pnpm lint` passes | Fully-Automated | Code quality gate |
| Agent-Probe: place real order via jojo@test.com, observe on staff dashboard within ~20s | Agent-Probe | AC-1 (polling live demo) |
| Agent-Probe: tap order row → detail screen shows items + selected options | Agent-Probe | AC-4 (mobile render) |
| Agent-Probe: seeded orders visible on first screen load (varied statuses) | Agent-Probe | AC-1 + AC-3 visual confirmation |
| Agent-Probe: no active orders → empty state shows ("No active orders right now") | Agent-Probe | SPEC behavioral outcome |

**Known gap (mobile render):** No RN test runner exists. AC-1 and AC-4 mobile layers are Agent-Probe only. Backlog note: `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`. This is consistent with STAFF-001 and the project-wide mobile testing gap.

---

## Test Infra Improvement Notes

No new test infrastructure is introduced. Existing vitest pattern (hermetic self-seeding, real Postgres, port-0 Express) is extended with the new `staff-orders.integration.test.ts` file following the `branches.test.ts` + `require-staff.integration.test.ts` template.

The mobile-side RN runner gap remains open (existing backlog). The polling behavior (`refetchInterval`) cannot be integration-tested without a RN test runner — this is a known-gap consistent with the project-wide testing situation documented in `process/context/tests/all-tests.md`.

---

## Phase Completion Rules

| Phase | Done when |
|---|---|
| A (API routes) | `GET /api/staff/orders` and `GET /api/staff/orders/:id` return correct JSON shape from a manual curl/httpie call with a valid session cookie |
| B (Types) | `pnpm typecheck` passes with new type exports visible |
| C (Seed) | Running `pnpm --filter @jojopotato/api db:seed` inserts ~5 orders visible in psql |
| D (Integration tests) | `pnpm --filter @jojopotato/api test` green; all 6 new staff-orders tests pass |
| E (Mobile API layer) | `pnpm typecheck` passes for `apps/mobile`; no TS errors in hooks/api files |
| F (Active Orders screen) | Screen compiles; `pnpm typecheck` passes; mock banner and `MOCK_ORDERS` entirely removed |
| G (Detail screen + layout + nav) | New route renders; `_layout.tsx` registers it; NAV_CARDS subtitle updated |
| H (Gates) | `pnpm typecheck` + `pnpm lint` + `pnpm --filter @jojopotato/api test` all green |

---

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/staff-002-active-orders_PLAN_13-07-26.md`
2. **Last completed phase or step**: None — plan not yet executed.
3. **Validate-contract status**: Written — see `## Validate Contract` section below.
4. **Supporting context files loaded**:
   - `process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/staff-002-active-orders_SPEC_13-07-26.md`
   - `packages/api/src/routes/staff.ts`
   - `packages/api/src/routes/lib/serializers.ts`
   - `packages/api/src/lib/require-staff.ts`
   - `packages/api/src/db/schema/orders.ts` + `order_items.ts`
   - `packages/api/src/db/seed/seed.ts`
   - `packages/api/src/routes/__tests__/branches.test.ts` + `require-staff.integration.test.ts`
   - `apps/mobile/src/features/staff/lib/staff-api.ts`
   - `apps/mobile/src/features/staff/hooks/use-staff-me.ts`
   - `apps/mobile/src/app/(staff)/active-orders.tsx` (mock to replace)
   - `apps/mobile/src/app/(staff)/_layout.tsx`
   - `apps/mobile/src/app/(staff)/index.tsx`
   - `apps/mobile/src/lib/query-client.ts`
   - `packages/types/src/staff.ts`
   - `process/context/tests/all-tests.md`
5. **Next step for a fresh agent picking up mid-execution**: Read this plan from the top. Check `process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/` for any REPORT file that records completed phases. Start from the first unchecked phase in the Implementation Checklist. Confirm local Postgres is running (`docker compose up -d`) and migrations are applied (`pnpm --filter @jojopotato/api db:migrate`) before Phase D.

---

## Deviations (EXECUTE)

Two within-blast-radius deviations (documented, no scope/contract impact — both remain inside the staff-orders blast radius):

1. **Detail route uuid-guard** — `GET /api/staff/orders/:orderId` validates the param with `z.string().uuid().safeParse` → 404 for a malformed id, before the DB query. Not in the plan letter, but matches the existing `orders.ts` convention and prevents an unhandled Postgres error (500) on a bad id. Impact: strictly hardening; no behavior change for valid ids. D5 (valid UUID) unaffected.
2. **seedTestUser signature unchanged** — C3 suggested optionally returning the test-user id / a `userIdByEmail` map. I used the plan's explicitly-stated alternative: resolve the test user's id via a follow-up `db.select` on `TEST_USER.email` in `runSeed()` after `seedTestUser()`. `seedTestUser` signature stays `Promise<void>` → no breaking change to `dev-auto-login.test.ts` / `seed-test-user.test.ts`.

Both are within-blast-radius (no auth/API-contract/schema surface change). No hard-stop class deviations occurred.

3. **Sample orders re-pointed off `jojo@test.com` to a dedicated demo customer (EVL supplement, 13-07-26)** — After merging `origin/development`, dev's new `seed-test-user.test.ts` deletes `jojo@test.com` in teardown, which collided with deviation #2 above: `seedSampleOrders` owned its 5 orders via `TEST_USER`'s id, so the delete hit `orders_user_id_users_id_fk` and failed the whole api suite. Dev's test legitimately owns the `jojo@test.com` lifecycle. Fix (in `seed.ts` only): added a `DEMO_CUSTOMER` constant + `seedDemoCustomer(): Promise<string>` (same better-auth signUpEmail + NODE_ENV prod-guard + idempotent pattern as `seedTestUser`/`seedStaffUser`), returning the owning id; `runSeed()` now feeds that id into `seedSampleOrders`. `seedTestUser()` is unchanged (dev's surface). The sample-orders upsert changed from `onConflictDoNothing` to `onConflictDoUpdate` with `SET user_id = demoUserId`, so a single `db:seed` run migrates existing local DBs (re-points the 5 orders off jojo@test.com) without a wipe — verified: seed runs twice green, full suite 62/62 green, and the 5 sample orders resolve to `orders-demo@jojopotato.local`. Within-blast-radius (seed data only; no auth/API-contract/schema surface change).

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 4/7 signals (S1 multi-package, S2 security surface, S6 high-risk class, S7 5+ files) — single plan, no fan-out coordination needed; sequential synthesis is correct.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-2-list | Branch-1 staff session returns only branch-1 orders; branch-2 order absent | Fully-Automated | `pnpm --filter @jojopotato/api test` — D2 test in `staff-orders.integration.test.ts` | A |
| AC-3-filter | terminal-status orders (`completed`, `cancelled`) absent from list response | Fully-Automated | `pnpm --filter @jojopotato/api test` — D3 test | A |
| AC-4-api | detail endpoint returns `selectedOptions` with `optionId`, `optionType`, `name`, `priceDeltaCents` | Fully-Automated | `pnpm --filter @jojopotato/api test` — D4 test | A |
| AC-5-403 | cross-branch order ID returns exactly 403 (not 404) | Fully-Automated | `pnpm --filter @jojopotato/api test` — D5 test | A |
| AC-2-unassigned | unassigned staff (no branch) returns 403 on list | Fully-Automated | `pnpm --filter @jojopotato/api test` — D6 test | A |
| AC-3-empty | branch with no orders returns 200 + empty orders array | Fully-Automated | `pnpm --filter @jojopotato/api test` — D7 test | A |
| type-contract | `pnpm typecheck` passes across all 3 packages | Fully-Automated | `pnpm typecheck` | A |
| lint-contract | `pnpm lint` passes across all packages | Fully-Automated | `pnpm lint` | A |
| AC-1-polling | new order appears within ~20s without manual refresh | Agent-Probe | place real order via jojo@test.com; observe on staff dashboard without tapping refresh | D |
| AC-4-mobile | detail screen shows item list + selectedOptions rendered correctly | Agent-Probe | tap seeded order row; verify productName, quantity, options visible on device | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is a named residual row, never a strategy.

Failing stubs (Fully-Automated rows only — NOT on-disk files; TDD starting points for execute-agent):

```
test("should return only branch-1 orders for branch-1 staff session", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-2-list branch isolation")
})
test("should exclude completed and cancelled orders from list response", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-3-filter non-terminal filter")
})
test("should return selectedOptions with all confirmed field names in detail response", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-4-api item shape")
})
test("should return 403 for cross-branch order ID on detail endpoint", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-5-403 branch isolation detail")
})
test("should return 403 for unassigned staff on list endpoint", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-2-unassigned edge case")
})
test("should return 200 and empty orders array for branch with no active orders", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-3-empty empty branch")
})
test("should pass pnpm typecheck with new staff types exported", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: type-contract")
})
test("should pass pnpm lint with no errors", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: lint-contract")
})
```

Legacy line form:
- API integration (AC-2, AC-3, AC-4, AC-5): Fully-automated: `pnpm --filter @jojopotato/api test` (docker compose up -d + db:migrate prereq)
- Type contract: Fully-automated: `pnpm typecheck`
- Lint: Fully-automated: `pnpm lint`
- AC-1 polling (mobile): Agent-Probe: place real order via customer app; observe on staff screen within ~20s
- AC-4 mobile render: Agent-Probe: tap order row; verify item list + selectedOptions on device

Dimension findings:
- Infra fit: PASS — resolveBranchScope confirmed correct; inArray/desc from drizzle-orm confirmed present; react-query v5 wired in mobile; 2 CONCERNs fixed in-plan (seed product_id FK + fetchStaffOrders error-throw)
- Test coverage: PASS — 6 Fully-Automated vitest gates + 2 Fully-Automated static gates; mobile Agent-Probe Known-Gap documented in backlog; polling Known-Gap consistent with project-wide RN runner absence
- Breaking changes: PASS — all additions are additive; no existing endpoint/type/serializer signatures modified; seedTestUser void return preserved
- Security surface: PASS — resolveBranchScope called fresh on both endpoints; no client-supplied branch_id honored; unassigned staff → 403; customer PII minimalism confirmed (no user_id/name/email in staff responses); requireStaff guard inherited at router mount

Section findings:
- Phase A (API Routes): PASS — mechanical feasibility confirmed; all imports traceable; 403-before-items ordering correct
- Phase B (Types): PASS — additive; OrderStatus import confirmed; selectedOptions shape matches serializers.ts
- Phase C (Seed): PASS (after supplement) — product_id FK gap fixed: C1 now accepts productIdBySlug and uses first real product UUID; idempotency upgraded to fixed order_number + ON CONFLICT DO NOTHING + delete-then-reinsert items
- Phase D (Tests): PASS (after supplement) — D5 now asserts exactly 403
- Phase E (Mobile API): PASS (after supplement) — fetchStaffOrders and fetchStaffOrderDetail now throw on error; react-query isError state will be set correctly
- Phase F (Screen): PASS — STAFF_STATUS_CONFIG extraction to staff-status-config.ts added to touchpoints; error state now reachable via react-query isError
- Phase G (Detail screen): PASS — order-detail/ directory creation noted for execute-agent
- Phase H (Gates): PASS — commands confirmed from all-tests.md; test count corrected to 42 existing

Scope boundary audit:
| Touchpoint | Classification | Verdict |
|---|---|---|
| GET /api/staff/orders (read list) | IN-SCOPE (#32 core) | PASS |
| GET /api/staff/orders/:id (read detail) | IN-SCOPE (#32 core) | PASS |
| StaffOrderSummary / StaffOrderDetail types | IN-SCOPE (foundation for #32) | PASS |
| Seed sample orders (QA only) | IN-SCOPE (SPEC-required) | PASS |
| Hermetic vitest integration tests | IN-SCOPE (SPEC-required) | PASS |
| active-orders.tsx mock replacement | IN-SCOPE (#32 core) | PASS |
| order-detail/[orderId].tsx (read-only + inert buttons) | IN-SCOPE (#32 core + OC placeholder) | PASS |
| STAFF_STATUS_CONFIG (staff labels vs customer labels) | IN-SCOPE (OC-6 locked decision) | PASS |
| serializeStaffOrderSummary / buildItemSummary (internal) | FOUNDATION (enables IN-SCOPE endpoints) | PASS |
| staff-status-config.ts (shared constant) | FOUNDATION (shared between 2 IN-SCOPE screens) | PASS |
| NAV_CARDS subtitle update (index.tsx) | IN-SCOPE (removes preview copy) | PASS |
| _layout.tsx Stack.Screen registration | FOUNDATION (enables routing) | PASS |
| POST /api/staff/orders (status mutations) | SCOPE-CREEP: STAFF-003 | NOT IN PLAN |
| Completed Orders screen | SCOPE-CREEP: STAFF-003 | NOT IN PLAN |
| SSE / WebSocket | SCOPE-CREEP (explicitly deferred) | NOT IN PLAN |
| Product availability (STAFF-004) | SCOPE-CREEP | NOT IN PLAN |
| Admin multi-branch bypass | SCOPE-CREEP (post-MVP) | NOT IN PLAN |
| Customer (tabs)/(onboarding) screens | OUT-OF-SCOPE | NOT TOUCHED |
| orders/order_items schema changes | OUT-OF-SCOPE | NOT TOUCHED |
| OrderStatus reconciliation (Phase 0) | DELIVERED UPSTREAM (A1) | NOT IN PLAN |
| Dev injection endpoint | REMOVED (A2) | NOT IN PLAN |

All amended-SPEC ACs map to plan steps + verification rows. No scope-creep detected. Under-scope check: all 5 ACs (AC-1 through AC-5) have explicit plan phases and gate rows.

Open gaps:
- AC-1 polling (mobile): known-gap: documented as backlog — `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`
- AC-4 mobile render: known-gap: documented as backlog — same note above

What this coverage does NOT prove:
- Fully-Automated API vitest (`pnpm --filter @jojopotato/api test`): does NOT prove mobile render correctness, polling timing, or visual display of status labels on-device. Does NOT prove concurrent-request safety (multiple staff on same branch). Does NOT prove behavior under Postgres connection pool exhaustion. Does NOT prove that `refetchInterval` actually fires at exactly 10s on device.
- Fully-Automated typecheck (`pnpm typecheck`): does NOT prove runtime type correctness of `authClient.$fetch` response body (same limitation as prior EVL note in all-tests.md — `as T` casts are compile-time only). Does NOT prove Expo typed-routes resolve correctly until H1 codegen runs.
- Fully-Automated lint (`pnpm lint`): does NOT prove runtime behavior. Does NOT catch logical errors in query filtering.
- Agent-Probe (AC-1 polling): proves live timing but NOT branch isolation (relies on correct session, not adversarial test). Does NOT prove behavior when network drops mid-poll.
- Agent-Probe (AC-4 mobile render): proves happy-path render only. Does NOT prove error state renders when API is down. Does NOT prove accessibility (a11y labels, screen reader).

Execute-agent instructions:
- E1: Phase C seed — `seedSampleOrders` must receive `productIdBySlug` from the `runSeed()` caller. Do NOT hardcode a product UUID; derive from `productIdBySlug.values().next().value`. If `productIdBySlug` is empty at seed time, throw an error rather than inserting an FK-violating row.
- E2: Phase C seed — for idempotency: use fixed synthetic order_numbers `JP-260713-S001` through `JP-260713-S005`. Insert orders with `ON CONFLICT (order_number) DO NOTHING`. For items: delete existing items for each synthetic order_id (after upsert or select to get the id), then re-insert items fresh. This follows the `seedProductOptionsTable` delete-then-insert pattern.
- E3: Phase D tests — D5 must assert `res.status` equals exactly `403`, not `403 or 404`. The implementation at A2 step 3 returns 403 for branch mismatch; the test must be equally deterministic.
- E4: Phase G — create the `apps/mobile/src/app/(staff)/order-detail/` directory before writing `[orderId].tsx`. The directory does not yet exist.
- E5: Phase H — codegen step H1 is fragile (background process + kill). Use: `cd apps/mobile && timeout 10 npx expo start --clear 2>/dev/null || true` as a more reliable one-liner.
- E6: Scope guard — do NOT add any write endpoint, mutation handler, or `onPress` handler with real side-effects in this plan. All action buttons must be `onPress={noop}` with the `// STAFF-003:` comment. If any STAFF-003 surface is discovered mid-EXECUTE, stop and flag it.

Gate: PASS (1 FAIL fixed in-plan via C1 supplement; 4 CONCERNs resolved via plan supplements and execute-agent instructions; 2 Known-Gaps documented in backlog)
Accepted by: session (vc-validate-agent autonomous — 1 FAIL and 4 CONCERNs resolved in-plan before gate)

## Autonomous Goal Block

```
SESSION GOAL: STAFF-002 — Active Orders Dashboard (real polling feed + read-only Order Details)
Charter + umbrella plan: N/A — single plan
Autonomy: proceed on all reversible decisions; hard-stop on irreversible/outward-facing actions not in contract
Hard stop conditions / safety constraints:
- DO NOT add any write endpoint or status-mutation handler (STAFF-003 boundary)
- DO NOT modify customer (tabs)/(onboarding) screens or orders/order_items schema
- DO NOT use OrderStatusBadge on staff screens (OC-6 locked: use STAFF_STATUS_CONFIG)
- DO NOT make fetchStaffOrders swallow errors — it must throw so react-query sets isError
- DO NOT insert order_items without a real product_id UUID from productIdBySlug
- STOP if scope-creep into SSE/WebSocket/push notifications is detected
Next phase: EXECUTE: process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/staff-002-active-orders_PLAN_13-07-26.md
Validate contract: inline in plan (## Validate Contract section above)
Execute start: pnpm typecheck | pnpm lint | docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test | high-risk pack: no (MEDIUM risk class — new read-only routes behind existing guard, no auth/billing/schema surface)
```
