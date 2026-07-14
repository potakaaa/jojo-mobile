---
name: plan:staff-004-product-availability
description: "COMPLEX plan for STAFF-004 — staff product availability toggles + Branch Pickup Settings (API+types, then mobile)"
date: 14-07-26
feature: staff-dashboard
phase: "STAFF-004"
---

# STAFF-004: Product Availability + Branch Pickup Settings — Implementation Plan

**GitHub Issue**: #34 (STAFF-004)
**Feature**: staff-dashboard
**Date**: 14-07-26
**Status**: PLAN (pending VALIDATE)
**Complexity**: COMPLEX (2 phases, multi-package, integration-tested)
**Risk class**: HIGH — staff writes directly control customer-visible ordering (`mustStopBeforeFinalize: true`, same class as STAFF-003)
**Blast-radius packages**: `packages/types`, `packages/api`, `apps/mobile`
**SPEC**: `process/features/staff-dashboard/active/staff-004-product-availability_14-07-26/staff-004-product-availability_SPEC_14-07-26.md`

---

## Overview

Give branch staff two new server-backed controls — a Product Availability screen (per-branch product on/off) and a Branch Pickup Settings screen (pause/resume pickup + edit prep time) — both taking effect on the customer side immediately, with no schema migration. Context routing came from `process/context/all-context.md` (staff-dashboard routing row) and `process/context/tests/all-tests.md` (vitest in `packages/api`).

### TL;DR

- Phase 1: add `StaffProduct`/`StaffBranchSettings` types + 4 new staff API routes + one hermetic vitest integration test file. Gate = full API suite green.
- Phase 2: add mobile API-client wrappers, 4 react-query hooks, 2 screens, wire `_layout.tsx` + `index.tsx`. Gate = mobile typecheck clean.
- No migration. All columns already exist since `0000`. Absent availability row = product available (LEFT JOIN + COALESCE).

---

## ⚠️ Schema Reality Correction (read before implementing)

The locked decision summary described `products.base_price_cents` (integer) and `categoryId: string | null`. **The actual schema differs — follow the schema, not the summary:**

- `products.base_price` is `numeric(10, 2)` (a **decimal string** like `"120.00"`, PHP pesos), NOT an integer cents column. There is no `base_price_cents` column.
- `products.category_id` is `uuid(...).notNull()` — NOT nullable.

Decision for this plan (locked here, do not re-open):

- `StaffProduct.basePrice` is typed as `string` (the raw `numeric` value from Drizzle), matching how the row is stored. The staff screen only displays it; no arithmetic is performed on it. Do NOT invent a cents conversion.
- `StaffProduct.categoryId` is typed as `string` (non-null), matching the schema.

This keeps `StaffProduct` faithful to the DB and avoids a lossy/incorrect cents cast. If a future consumer needs cents, that is a separate concern.

---

## Touchpoints

### Read for context
- `packages/api/src/routes/staff.ts` — existing staff router; route-ordering rules; `resolveBranchScope` usage pattern
- `packages/api/src/lib/require-staff.ts` — `resolveBranchScope`, `assertBranchScope`
- `packages/api/src/db/schema/{branches,products,branch_product_availability,categories}.ts` — column names
- `packages/api/src/routes/branches.ts` + `orders.ts` — customer read/enforcement (already live; not modified — asserted against in tests)
- `packages/api/src/routes/__tests__/staff-order-status.integration.test.ts` — the hermetic self-seeding test pattern to mirror
- `apps/mobile/src/features/staff/lib/staff-api.ts` — `staffFetch` wrapper pattern
- `apps/mobile/src/features/staff/hooks/use-completed-orders.ts` + `use-update-order-status.ts` — react-query query/mutation patterns to mirror
- `apps/mobile/src/app/(staff)/{_layout,index,completed-orders}.tsx` — screen + nav registration pattern

### Modify
- `packages/types/src/staff.ts` — add `StaffProduct` + `StaffBranchSettings` types
- `packages/api/src/routes/staff.ts` — add 4 routes
- `apps/mobile/src/features/staff/lib/staff-api.ts` — add 4 API-client functions
- `apps/mobile/src/app/(staff)/_layout.tsx` — register 2 Stack.Screens
- `apps/mobile/src/app/(staff)/index.tsx` — wire 2 nav cards

### Create
- `packages/api/src/routes/__tests__/staff-product-availability.integration.test.ts`
- `apps/mobile/src/features/staff/hooks/use-staff-products.ts`
- `apps/mobile/src/features/staff/hooks/use-toggle-product-availability.ts`
- `apps/mobile/src/features/staff/hooks/use-staff-branch-settings.ts`
- `apps/mobile/src/features/staff/hooks/use-patch-branch-settings.ts`
- `apps/mobile/src/app/(staff)/product-availability.tsx`
- `apps/mobile/src/app/(staff)/branch-pickup-settings.tsx`

---

## Public Contracts

### New types (`packages/types/src/staff.ts`)

```ts
/** A product row on the staff Product Availability screen (GET /api/staff/products). */
export interface StaffProduct {
  id: string;
  name: string;
  categoryId: string;      // products.category_id (uuid, NOT NULL)
  basePrice: string;       // products.base_price — numeric(10,2) decimal string, e.g. "120.00"
  isAvailable: boolean;    // COALESCE(bpa.is_available, true) for the assigned branch
}

/** Branch pickup settings (GET/PATCH /api/staff/branch). */
export interface StaffBranchSettings {
  isAcceptingPickup: boolean;
  estimatedPrepMinutes: number;
}
```

### New API endpoints (all under `/api/staff/*`, inherit `requireStaff(auth)` at mount — NO re-application)

| Method + path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/staff/products` | — | `200 { products: StaffProduct[] }` | `403` unassigned staff |
| `PATCH /api/staff/products/:productId/availability` | `{ isAvailable: boolean }` | `200 { product: StaffProduct }` | `403` unassigned; `404` invalid UUID / product not found / product not globally active; `422` bad body |
| `GET /api/staff/branch` | — | `200 StaffBranchSettings` | `403` unassigned staff |
| `PATCH /api/staff/branch` | `{ isAcceptingPickup?: boolean, estimatedPrepMinutes?: number }` (≥1 field via `.refine`) | `200 StaffBranchSettings` | `403` unassigned; `422` empty body OR `estimatedPrepMinutes` outside 1–120 |

Branch scope for ALL 4 is always `resolveBranchScope(db, req.staffSession!.userId)` — never from client body. No `branchId` param anywhere.

---

## Blast Radius

- **Files touched**: 5 modified + 7 created = 12 files across 3 packages.
- **Packages**: `packages/types` (1 file), `packages/api` (2 files), `apps/mobile` (9 files).
- **Risk class**: HIGH — trust-boundary write path affecting customer-visible menu + order acceptance. `mustStopBeforeFinalize: true`. Human review of the risk evidence pack required before production deploy.
- **No migration**: zero schema change. `branch_product_availability`, `branches.is_accepting_pickup`, `branches.estimated_prep_minutes` all exist since `0000`.
- **Customer read path unchanged**: `GET /branches/:id/menu` and `POST /orders` enforcement already live — asserted against in tests but NOT edited.

---

## Implementation Checklist

The checklist is organized into two phases. Phase 2 depends on Phase 1 (types + live endpoints); do not start Phase 2 until the Phase 1 gate is green.

### Phase 1 — API + Types Layer

**Goal**: 4 server endpoints + `StaffProduct`/`StaffBranchSettings` types, fully covered by one hermetic integration test file. Exit gate: full `packages/api` vitest suite green.

**Strategy (vc-agent-strategy-compare, Simple Mode)**: Signals — S2 (API surface), S6 (trust-boundary) present; S1/S7 not (2 pkgs, <5 files this phase). Score 2/7, but tight interdependency (types→routes→tests) → **Sequential** (one execute-agent). No independent partition worth fanning out.

1. **Add types to `packages/types/src/staff.ts`**
   - Append `StaffProduct` interface (fields exactly as in Public Contracts: `id`, `name`, `categoryId: string`, `basePrice: string`, `isAvailable: boolean`).
   - Append `StaffBranchSettings` interface (`isAcceptingPickup: boolean`, `estimatedPrepMinutes: number`).
   - Place alongside `StaffMe`/`StaffBranch` (do NOT define locally in the route or mobile).

2. **Add imports + zod schemas to `packages/api/src/routes/staff.ts`**
   - Import `products`, `branchProductAvailability` from `../db/schema/index` (add to existing import).
   - Import `sql` from `drizzle-orm` (for `COALESCE`) alongside existing `and, desc, eq, inArray`.
   - Import `StaffProduct`, `StaffBranchSettings` from `@jojopotato/types`.
   - Add module-level zod schemas:
     - `patchProductAvailabilityBodySchema = z.object({ isAvailable: z.boolean() })`
     - `patchBranchBodySchema = z.object({ isAcceptingPickup: z.boolean().optional(), estimatedPrepMinutes: z.number().int().min(1).max(120).optional() }).refine((b) => b.isAcceptingPickup !== undefined || b.estimatedPrepMinutes !== undefined, { message: 'At least one field required' })`
     - Note: `.min(1).max(120)` on the number itself makes an in-body out-of-range value a `422` via `safeParse` failure. The `.refine` covers the empty-body `422`.

3. **Add `GET /api/staff/products`** (register with the other `GET` routes; ordering note in step 7)
   - Resolve branch scope; `!branchId` → `403 { error: 'No branch assigned' }`.
   - Query: FROM `products` LEFT JOIN `branchProductAvailability` ON `and(eq(bpa.product_id, products.id), eq(bpa.branch_id, branchId))`, WHERE `eq(products.is_active, true)`. Select `isAvailable: sql<boolean>\`COALESCE(${branchProductAvailability.is_available}, true)\``, plus `id`, `name`, `category_id`, `base_price`.
   - Serialize each row to `StaffProduct` (`basePrice` = the raw `base_price` string). Respond `200 { products }`.

4. **Add `PATCH /api/staff/products/:productId/availability`**
   - Resolve branch scope; `!branchId` → `403`.
   - Validate `productId` is a UUID (mirror the `/orders/:orderId` pattern) → `404` on failure.
   - `safeParse` body against `patchProductAvailabilityBodySchema` → `422` on failure.
   - Load product: `SELECT id FROM products WHERE id = productId AND is_active = true`. Not found / not active → `404 { error: 'Product not found' }`.
   - **UPSERT** into `branch_product_availability` via `onConflictDoUpdate({ target: [branchProductAvailability.branch_id, branchProductAvailability.product_id], set: { is_available, updated_at: new Date() } })` — matches `bpa_branch_product_idx`. Insert values: `{ branch_id: branchId, product_id: productId, is_available, updated_at: new Date() }`.
   - Re-select the product joined with its (now-present) availability row; respond `200 { product: StaffProduct }` (isAvailable = value just written).

5. **Add `GET /api/staff/branch`**
   - Resolve branch scope; `!branchId` → `403`.
   - `SELECT is_accepting_pickup, estimated_prep_minutes FROM branches WHERE id = branchId`.
   - Respond `200 { isAcceptingPickup, estimatedPrepMinutes }` (StaffBranchSettings).

6. **Add `PATCH /api/staff/branch`**
   - Resolve branch scope; `!branchId` → `403`.
   - `safeParse` body against `patchBranchBodySchema` → `422` (covers empty body AND out-of-range prep minutes).
   - Build partial patch with only present fields (`is_accepting_pickup` and/or `estimated_prep_minutes`) + `updated_at: new Date()`.
   - `UPDATE branches SET ... WHERE id = branchId`. Re-select; respond `200` with updated `StaffBranchSettings`.

7. **Route-ordering safety**
   - `GET /products` and both `/branch` routes are static paths — no collision with `/orders/:orderId` (distinct prefixes). Register grouped after the `/orders*` block.
   - `PATCH /products/:productId/availability` has a static `/availability` suffix → cannot collide with `/orders/:orderId`. Safe.
   - Confirm no bare `/:param` at the `/api/staff` root swallows `/products` or `/branch`. Current routes (`/me`, `/orders`, `/orders/completed`, `/orders/:orderId`) do not collide.

8. **Write `packages/api/src/routes/__tests__/staff-product-availability.integration.test.ts`**
   - Mirror `staff-order-status.integration.test.ts`: port-0 Express `app`, hermetic self-seeding in `beforeAll`, teardown in `afterAll`. Seed: branch-1 + branch-2, a staff user assigned to branch-1 (+ session cookie), a category, several `is_active=true` products, ≥1 product with NO availability row, one with explicit `is_available=false`, and one globally-inactive product (`is_active=false`).
   - Cover the AC → test map in Verification Evidence: absent-row→`isAvailable:true`; toggle-off then `GET /branches/:id/menu` excludes it; toggle-on restores it; cross-branch PATCH→`403`; pickup off→`POST /orders` `400`; pickup on→`POST /orders` `201`; prep-time PATCH persisted + used at `pending→accepted` ETA (±5s); empty body→`422`; prep out of range→`422`; invalid productId UUID→`404`; inactive product not in list.

9. **Run the API suite (Phase 1 exit gate)** — see Verification Gates. Fix inline until green.

### Phase 2 — Mobile Layer

**Goal**: API-client wrappers + hooks + 2 screens + nav wiring. Exit gate: mobile typecheck clean (no new errors beyond the 3 documented pre-existing BRN-* stub errors).

**Strategy (vc-agent-strategy-compare, Simple Mode)**: 9 files, one package, two feature slices sharing `staff-api.ts` + 2 wiring files. Score 2/7 → **Sequential**. Shared `staff-api.ts`/`_layout.tsx`/`index.tsx` edits are serialization points; a fan-out would collide.

10. **Add 4 functions to `apps/mobile/src/features/staff/lib/staff-api.ts`** (reuse existing `staffFetch`)
   - `fetchStaffProducts(): Promise<StaffProduct[]>` — GET `/api/staff/products`; throw on non-OK; return `data.products ?? []`.
   - `patchStaffProductAvailability(productId, isAvailable): Promise<StaffProduct>` — PATCH with JSON body `{ isAvailable }`; throw with `.status` attached on non-OK (mirror `patchStaffOrderStatus`); return `data.product`.
   - `fetchStaffBranchSettings(): Promise<StaffBranchSettings>` — GET `/api/staff/branch`; throw on non-OK; return parsed body.
   - `patchStaffBranchSettings(payload: Partial<StaffBranchSettings>): Promise<StaffBranchSettings>` — PATCH with JSON body; throw with `.status` on non-OK; return parsed body.
   - Import `StaffProduct`, `StaffBranchSettings` from `@jojopotato/types`.

11. **`use-staff-products.ts`** — `useQuery({ queryKey: ['staff','products'], queryFn: fetchStaffProducts })`. Return `{ data, isLoading, error }`. No polling.

12. **`use-toggle-product-availability.ts`** — `useMutation` calling `patchStaffProductAvailability`. On success: `invalidateQueries({ queryKey: ['staff','products'] })`. Screen owns optimistic flip + revert-on-error. Keep hook thin; document the invalidation.

13. **`use-staff-branch-settings.ts`** — `useQuery({ queryKey: ['staff','branch'], queryFn: fetchStaffBranchSettings })`.

14. **`use-patch-branch-settings.ts`** — `useMutation` calling `patchStaffBranchSettings`. On success: `invalidateQueries({ queryKey: ['staff','branch'] })`.

15. **`product-availability.tsx`** — new screen under `(staff)/`.
   - Compact brand header (match shell; native header off).
   - `useStaffProducts()` → loading / error / list states.
   - Products grouped by `categoryId`; each row = name + `₱${basePrice}` + a toggle (RN `Switch` or shared `@jojopotato/ui` control — no one-off custom toggle).
   - Tap → optimistic flip → `useToggleProductAvailability().mutate(...)`; on error revert + brief error (Alert/inline).
   - `@jojopotato/ui` `Card`/`Badge`/`Text`; no hardcoded theme tokens.

16. **`branch-pickup-settings.tsx`** — new screen under `(staff)/`.
   - `useStaffBranchSettings()` → loading / error / loaded.
   - Control 1: "Accepting Pickup Orders" toggle → `usePatchBranchSettings().mutate({ isAcceptingPickup })`.
   - Control 2: "Estimated Prep Time" numeric `Input` + Save `Button`. Validate 1–120 on-screen before sending; on Save → `mutate({ estimatedPrepMinutes })`; dismiss keyboard on success; show validation/server error on failure.
   - `@jojopotato/ui` components only.

17. **Register screens in `apps/mobile/src/app/(staff)/_layout.tsx`**
   - `<Stack.Screen name="product-availability" options={{ headerShown: false }} />`
   - `<Stack.Screen name="branch-pickup-settings" options={{ headerShown: false }} />`

18. **Wire nav cards in `apps/mobile/src/app/(staff)/index.tsx`**
   - Product Availability card: `subtitle: 'Manage menu items'`, `navigateTo: '/(staff)/product-availability' as const`.
   - Branch Pickup Settings card: `subtitle: 'Pickup & prep time'`, `navigateTo: '/(staff)/branch-pickup-settings' as const`.
   - (Both currently `navigateTo: null`; the existing `NAV_CARDS.map` already renders tappable cards for non-null `navigateTo` — no render-logic change needed.)

19. **Run mobile typecheck (Phase 2 exit gate)** — see Verification Gates. New route files need an Expo typed-routes codegen pass (`expo start` once, then stop) before `tsc --noEmit` resolves the new `/(staff)/...` hrefs.

---

## Phase Completion Rules

A phase is **CODE DONE** when its checklist items are implemented. A phase is only **VERIFIED** when its exit gate is green AND (for the HIGH-risk finalize) the risk evidence pack has been human-reviewed.

- **Phase 1 VERIFIED** requires: full `packages/api` vitest suite green (all AC-1..AC-8 tests + edge tests passing), zero new failures vs the pre-STAFF-004 baseline of 84 tests.
- **Phase 2 VERIFIED** requires: mobile `tsc --noEmit` produces no NEW errors beyond the 3 documented pre-existing BRN-* stub errors, AND the Agent-Probe scenarios AC-9..AC-12 are walked and confirmed by a human.
- **Program VERIFIED** requires both phases VERIFIED. Because this is a `mustStopBeforeFinalize: true` HIGH-risk trust-boundary feature, a human review of the risk evidence pack is required before production deploy — code-green alone is NOT VERIFIED.
- Do not mark any phase `✅ VERIFIED` on code-completion alone; gate evidence must be recorded, and user-confirmed for the Agent-Probe surfaces.

---

## Verification Gates (exact commands)

Phase 1 (API):
```bash
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
```

Phase 2 (mobile) — run the codegen priming pass first if typecheck reports unknown hrefs:
```bash
# prime typed-routes codegen for the 2 new route files (start, then Ctrl-C once ready):
#   pnpm --filter @jojopotato/mobile exec expo start
pnpm --filter @jojopotato/mobile exec tsc --noEmit
```

Repo-wide (optional, before finalize):
```bash
pnpm --filter @jojopotato/types exec tsc --noEmit
```

Note: `apps/mobile` typecheck has 3 documented pre-existing errors (BRN-001/002/003, missing type stubs for `@gorhom/bottom-sheet`, `expo-maps`, `expo-location`) that are NOT STAFF-004 regressions. The gate is "no NEW errors beyond those 3."

Test context source: `process/context/tests/all-tests.md` — `packages/api` uses vitest + supertest; `apps/mobile` has no RN component/E2E runner (mobile ACs are Agent-Probe).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `GET /api/staff/products` returns all active products; absent bpa row → `isAvailable:true`; stored value otherwise | Fully-Automated (vitest) | AC-1 |
| PATCH product `{isAvailable:false}` → product absent from `GET /branches/:id/menu` | Fully-Automated (vitest, cross-route) | AC-2 |
| PATCH product `{isAvailable:true}` (from false) → product present on `GET /branches/:id/menu` | Fully-Automated (vitest) | AC-3 |
| Branch-1 session PATCH on branch-2's product → `403` | Fully-Automated (vitest) | AC-4 |
| PATCH branch `{isAcceptingPickup:false}` → `POST /orders` `400`; `GET /branches/:id` shows `isAcceptingPickup:false` | Fully-Automated (vitest, cross-route) | AC-5 |
| PATCH branch `{isAcceptingPickup:true}` (from false) → `POST /orders` `201` | Fully-Automated (vitest) | AC-6 |
| PATCH branch `{estimatedPrepMinutes:30}` persisted; `pending→accepted` sets `estimated_ready_at ≈ NOW()+30m` (±5s); N<1/N>120 → `422` | Fully-Automated (vitest) | AC-7 |
| PATCH branch resolves branch from session (no body `branchId`); branch-1 session only affects branch-1 | Fully-Automated (vitest) | AC-8 |
| Empty body → PATCH `/api/staff/branch` → `422` | Fully-Automated (vitest) | Constraint #5 / AC-8 edge |
| Invalid productId UUID → PATCH availability → `404` | Fully-Automated (vitest) | AC-4 edge |
| Globally-inactive product (`is_active=false`) absent from products list | Fully-Automated (vitest) | Out-of-scope guard (products.is_active) |
| Product Availability screen renders toggles matching per-branch availability | Agent-Probe | AC-9 |
| Tapping a toggle optimistically flips + sends PATCH; reverts on error | Agent-Probe | AC-10 |
| Branch Pickup Settings shows real pickup status + prep time | Agent-Probe | AC-11 |
| Pickup toggle + prep-time save persist and take effect customer-side | Agent-Probe | AC-12 |

**Known-gap note (vacuous-green ban compliance)**: AC-9..AC-12 are Agent-Probe, NOT Known-Gap. No developed behavior in this plan is left with only a Known-Gap gate. The absence of an RN automated runner is a pre-existing project-wide infra gap (backlog note `staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`), already recorded; Agent-Probe is the accepted proving strategy for mobile surfaces here, consistent with STAFF-001..003. Every server behavior (AC-1..AC-8) is Fully-Automated.

---

## Acceptance Criteria → Coverage Map

| AC | Coverage | Phase |
|---|---|---|
| AC-1 products list + absent-row default | vitest | 1 |
| AC-2 toggle-off removes from customer menu | vitest (cross-route) | 1 |
| AC-3 toggle-on restores on customer menu | vitest | 1 |
| AC-4 cross-branch product PATCH → 403 | vitest | 1 |
| AC-5 pause pickup → POST /orders 400 | vitest (cross-route) | 1 |
| AC-6 resume pickup → POST /orders 201 | vitest | 1 |
| AC-7 prep time editable 1–120 + ETA use + 422 out of range | vitest | 1 |
| AC-8 branch settings session-scoped only | vitest | 1 |
| AC-9 screen renders toggles | Agent-Probe | 2 |
| AC-10 optimistic toggle + revert | Agent-Probe | 2 |
| AC-11 settings screen shows real state | Agent-Probe | 2 |
| AC-12 settings persist + take effect | Agent-Probe | 2 |

---

## Failure Modes and Mitigations

| Failure mode | Mitigation |
|---|---|
| UPSERT targets wrong constraint → duplicate rows | `onConflictDoUpdate({ target: [branch_id, product_id] })` matches `bpa_branch_product_idx`. Test asserts single-row behavior across toggle-off→on→off. |
| `basePrice` mis-typed as number → runtime NaN or lossy cast | Typed as `string` (raw numeric). No arithmetic. Documented in Schema Reality Correction. |
| Route captured by `/orders/:orderId` | New static prefixes (`/products`, `/branch`) don't collide; `:productId` followed by static `/availability`. Verified in checklist step 7. |
| Empty PATCH body silently no-ops | `.refine` forces `422`. Explicit test. |
| Prep minutes out of range corrupts ETA | `.min(1).max(120)` on the zod number → `422` before any write. Explicit test. |
| Typed-routes codegen stale → false typecheck failure on new hrefs | Prime with one `expo start` pass before `tsc --noEmit` (documented in gate). |

---

## Test Infra Improvement Notes

(none identified yet — mobile RN runner gap is pre-existing and tracked at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`; not introduced by this plan.)

---

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/staff-dashboard/active/staff-004-product-availability_14-07-26/staff-004-product-availability_PLAN_14-07-26.md`
2. **Last completed phase or step**: PLAN written (this document). No code changes yet.
3. **Validate-contract status**: pending — vc-validate-agent writes `## Validate Contract` next.
4. **Supporting context files loaded**: `process/context/all-context.md`, SPEC (above), `staff.ts` (types + route), `staff-api.ts`, `(staff)/{_layout,index}.tsx`, schema files (`branches`, `products`, `branch_product_availability`), `process/context/tests/all-tests.md` routing (vitest in packages/api).
5. **Next step for a fresh agent mid-execution**:
   - If types not yet added → start Phase 1 step 1.
   - If Phase 1 gate green but mobile untouched → start Phase 2 step 10.
   - Phase 2 depends on Phase 1; never start Phase 2 before the API suite is green.
   - HIGH-risk: `mustStopBeforeFinalize: true` — human review of the risk evidence pack required before production deploy.

**Next Step**: Run VALIDATE (say `ENTER VALIDATE MODE`) to convert this plan into an executable validate-contract before `ENTER EXECUTE MODE`.

---

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: inner-pvl: phase-1
Complexity: COMPLEX (2 phases) — validated as a single standalone plan (no umbrella program)

Parallel strategy: parallel-subagents (validation fan-out, executed inline — read-only dimension checks, no cross-agent coordination)
Rationale: signal count 4/7 (S1 multi-package, S2 API surface, S6 trust-boundary, S7 ≥5 files); dominant signal S6 (HIGH-risk trust boundary). Fan-out was read-only and self-contained, so inline synthesis (no vc-team) was correct.

### Test gates (C3 5-column table)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | products list returns all active products; absent bpa row → `isAvailable:true` (staff LEFT JOIN + COALESCE); stored value otherwise | Fully-Automated | `pnpm --filter @jojopotato/api test` — `staff-product-availability.integration.test.ts` seeds products with/without a bpa row; asserts response shape | A |
| AC-2 | toggle product `{isAvailable:false}` → product absent from `GET /branches/:id/menu` | Fully-Automated | same suite, cross-route: seed product WITH `is_available=true` row, PATCH off, assert menu excludes it | A |
| AC-3 | toggle product `{isAvailable:true}` (from false or no-row) → product present on `GET /branches/:id/menu` | Fully-Automated | same suite: PATCH on (UPSERT inserts `is_available=true` row satisfying customer INNER JOIN), assert menu includes it | A |
| AC-4 | branch-1 session PATCH on branch-2's product → `403`; invalid productId UUID → `404` | Fully-Automated | same suite: cross-branch PATCH asserts 403; malformed UUID asserts 404 | A |
| AC-5 | PATCH branch `{isAcceptingPickup:false}` → `POST /orders` `400`; `GET /branches/:id` shows `isAcceptingPickup:false` | Fully-Automated | same suite, cross-route: pause pickup, assert POST /orders 400 + GET reflects state | A |
| AC-6 | PATCH branch `{isAcceptingPickup:true}` (from false) → `POST /orders` `201` | Fully-Automated | same suite: resume pickup, assert POST /orders 201 | A |
| AC-7 | PATCH branch `{estimatedPrepMinutes:30}` persisted; `pending→accepted` sets `estimated_ready_at ≈ NOW()+30m` (±5s); N<1/N>120 → `422` | Fully-Automated | same suite: PATCH prep=30, accept order, assert ETA ±5s; PATCH prep=0/121 assert 422 | A |
| AC-8 | branch settings session-scoped only (no body `branchId`); empty body → `422` | Fully-Automated | same suite: assert branch resolved from session; empty-body PATCH asserts 422 | A |
| — | globally-inactive product (`is_active=false`) absent from `GET /api/staff/products` list | Fully-Automated | same suite: seed `is_active=false` product, assert absent from list | A |
| AC-9 | Product Availability screen renders toggles matching per-branch availability | Agent-Probe | Human opens screen with seeded mixed-availability branch (incl. a no-row product); verifies each toggle state | D |
| AC-10 | tapping a toggle optimistically flips + sends PATCH; reverts on error | Agent-Probe | Human taps toggle, observes immediate flip; stops server to observe revert + error | D |
| AC-11 | Branch Pickup Settings shows real pickup status + prep time | Agent-Probe | Human opens screen; verifies displayed values match branch DB state | D |
| AC-12 | pickup toggle + prep-time save persist and take effect customer-side | Agent-Probe | Human toggles pickup + saves prep time; confirms customer-side effect + ETA | D |

gap-resolution legend: A — proven now (gate passes this cycle) · B — fixed by this plan's checklist · C — deferred to a named later phase · D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: `strategy:` column carries ONLY Fully-Automated / Agent-Probe (no Hybrid needed here). Known-Gap is NOT used as a strategy — the 4 mobile ACs are Agent-Probe (an accepted proving strategy for mobile per STAFF-001..003), carried via gap-resolution D against the pre-existing RN-runner infra gap.

Legacy line form (retained for existing consumers):
- API (server, AC-1..AC-8 + edges): Fully-automated: `docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- Mobile typecheck: Fully-automated: `pnpm --filter @jojopotato/mobile exec tsc --noEmit` (gate = no NEW errors beyond the 3 documented pre-existing BRN-* stub errors; prime `expo start` once first if typed-routes hrefs are unresolved)
- Mobile AC-9..AC-12: agent-probe: human walkthrough of the 4 mobile scenarios (no RN runner exists — project-wide gap)

### Failing stubs (Fully-Automated rows only)

```ts
test("AC-1 products list: absent bpa row surfaces isAvailable:true, stored value otherwise", () => { throw new Error("NOT IMPLEMENTED — TDD stub: products list absent-row default") })
test("AC-2 toggle product off removes it from GET /branches/:id/menu", () => { throw new Error("NOT IMPLEMENTED — TDD stub: seed is_available=true row, PATCH off, assert menu excludes") })
test("AC-3 toggle product on restores it on GET /branches/:id/menu", () => { throw new Error("NOT IMPLEMENTED — TDD stub: PATCH on via UPSERT, assert menu includes") })
test("AC-4 cross-branch product PATCH -> 403; invalid UUID -> 404", () => { throw new Error("NOT IMPLEMENTED — TDD stub: branch isolation + malformed UUID") })
test("AC-5 pause pickup -> POST /orders 400; GET /branches/:id shows isAcceptingPickup:false", () => { throw new Error("NOT IMPLEMENTED — TDD stub: pause pickup cross-route") })
test("AC-6 resume pickup -> POST /orders 201", () => { throw new Error("NOT IMPLEMENTED — TDD stub: resume pickup") })
test("AC-7 prep time editable 1-120 + ETA use; out-of-range -> 422", () => { throw new Error("NOT IMPLEMENTED — TDD stub: prep time persist + ETA + 422") })
test("AC-8 branch settings session-scoped; empty body -> 422", () => { throw new Error("NOT IMPLEMENTED — TDD stub: session scope + empty-body 422") })
test("edge: globally-inactive product absent from GET /api/staff/products", () => { throw new Error("NOT IMPLEMENTED — TDD stub: is_active=false excluded from list") })
```

### Dimension findings

- Infra fit: PASS — no migration; `branch_product_availability` + `bpa_branch_product_idx` unique on `(branch_id, product_id)`, `branches.is_accepting_pickup`, `branches.estimated_prep_minutes` all present since 0000; `staffFetch(path, init?)` signature confirmed (plain fetch + Cookie, NOT `authClient.$fetch`); react-query query/mutation templates present; no new deps.
- Test coverage: PASS — 8 server ACs + 3 edges Fully-Automated via hermetic self-seeding vitest (proven `staff-order-status.integration.test.ts` template); 4 mobile ACs Agent-Probe (accepted strategy, no vacuous-green — every developed server behavior has an automated gate).
- Breaking changes: PASS — purely additive (new types after `StaffOrderDetail`, 4 new routes, 7 new files, 5 modified); customer read path (`branches.ts`/`orders.ts`) NOT edited; no existing shared type widened, so no `Record<Enum>`/exhaustive-array consumer breakage.
- Security surface: CONCERN — HIGH-risk trust boundary (`mustStopBeforeFinalize: true`); staff writes control customer-visible menu + order acceptance. Branch isolation is correctly session-derived (`resolveBranchScope(db, req.staffSession!.userId)`) on all 4 routes — no client `branchId` accepted. Risk evidence pack (5 artifacts) + human review required before production finalize.
- Section A (Phase 1 API + Types) feasibility: CONCERN — mechanically feasible (all edit targets + insertion points confirmed; route ordering safe: static `/products` and `/branch` prefixes cannot collide with `/orders/:orderId`; `:productId` has static `/availability` suffix). Highest-risk edit: the UPSERT — must use `onConflictDoUpdate({ target: [branchProductAvailability.branch_id, branchProductAvailability.product_id] })` to match `bpa_branch_product_idx`; a plain INSERT fails on the 2nd toggle. Gap found: SPEC's "no-row appears via LEFT JOIN default on the customer side" claim is FALSE (customer path is INNER JOIN on `is_available=true`) — affects AC-2/AC-3 test seeding (see E1).
- Section B (Phase 2 Mobile) feasibility: PASS — nav-card targets (`navigateTo: null` cards at index.tsx:26-27), `_layout.tsx` `headerShown:false` Stack.Screen pattern, and react-query hook templates (`use-completed-orders.ts`, `use-update-order-status.ts`) all confirmed. Highest-risk edit: shared `staff-api.ts`/`_layout.tsx`/`index.tsx` are serialization points — Sequential execution (per plan strategy) avoids collision. Typed-routes codegen priming (`expo start` once) documented for the 2 new route files.

### Open gaps

- **RN automated test runner (AC-9..AC-12)**: known-gap: pre-existing project-wide infra gap — no Detox/Maestro/jest-expo for `apps/mobile` RN rendering. Tracked at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`. Mobile ACs proven by Agent-Probe (accepted, consistent with STAFF-001..003). NOT a new gap introduced by this plan.

### What this coverage does NOT prove

- **API suite (`pnpm --filter @jojopotato/api test`)** does NOT prove: mobile screen rendering, optimistic-flip UI behavior, toggle-tap → mutation wiring, react-query cache invalidation on the device, or the visual correctness of the two new screens. It also does NOT prove behavior under concurrent staff toggles from two sessions on the same product (single-row UPSERT is asserted across serial toggle-off→on→off, not true concurrency). It does NOT prove production-DB migration path (tests run against local Postgres).
- **Mobile typecheck (`tsc --noEmit`)** does NOT prove: runtime `fetch` response-shape correctness (a bare `as StaffProduct` cast is not runtime-validated — same class of gap that an EVL run caught in `pickup-order-flow`), navigation actually reaching the new screens, or any rendered UI behavior. Typecheck only proves type-level consistency.
- **Agent-Probe (AC-9..AC-12)** does NOT prove: automated regression protection — these scenarios must be re-walked by a human on every future change touching these screens; there is no CI gate for them.
- **Staff/customer availability asymmetry**: no gate proves that a staff member is aware a no-row product they see as "available" is actually customer-invisible until toggled on. This is a documented behavioral note, not an automated assertion.

### Execute-agent instructions

- **E1 (AC-2/AC-3 test seeding correction — REQUIRED)**: The customer read path (`branches.ts:103-109`, `orders.ts:91-98`) uses an **INNER JOIN** on `branch_product_availability WHERE is_available = true`, NOT a LEFT JOIN. A product with NO bpa row is therefore ALREADY ABSENT from the customer menu and un-orderable. SPEC Constraint #6 + Background's "no-row appears via LEFT JOIN default" is WRONG for the customer path. Consequence: the AC-2 test ("toggle-off removes from menu") MUST first seed the product WITH an explicit `is_available=true` row so it is present on the customer menu, THEN toggle off and assert absence. Do NOT seed a no-row product and expect it on the customer menu — it will fail. AC-3 ("toggle-on restores") is fine because the toggle-on UPSERT inserts the `is_available=true` row that satisfies the INNER JOIN. Document this INNER-JOIN reality in the phase report.
- **E2 (staff/customer asymmetry note — REQUIRED in phase report)**: `GET /api/staff/products` correctly uses LEFT JOIN + COALESCE→true, so a no-row product shows as `isAvailable:true` to STAFF. But that same no-row product is INVISIBLE to CUSTOMERS (INNER JOIN). Record this asymmetry explicitly. It is not a bug in this plan's endpoints (both are individually correct), but it is a product-semantic inconsistency between staff view and customer view that a future story may need to reconcile. Do NOT attempt to "fix" the customer INNER JOIN in this plan — it is out of scope (customer read path is not edited).
- **E3 (UPSERT constraint — REQUIRED)**: `PATCH /api/staff/products/:productId/availability` MUST use `onConflictDoUpdate({ target: [branchProductAvailability.branch_id, branchProductAvailability.product_id], set: { is_available, updated_at: new Date() } })`. A plain INSERT will throw a unique-constraint error on the 2nd toggle. The integration test MUST include a toggle-off→on→off sequence to prove single-row idempotency.
- **E4 (`basePrice` type — REQUIRED)**: `StaffProduct.basePrice` is typed `string` (raw `numeric(10,2)` from Drizzle). Do NOT cast to number or convert to cents. No arithmetic is performed. Confirmed against `products.base_price` schema.
- **E5 (branch scope — REQUIRED)**: All 4 new routes resolve scope via `resolveBranchScope(db, req.staffSession!.userId)`; `!branchId → 403`. Never accept a `branchId` from the request body. Mirror the existing `/orders` handler pattern exactly.
- **E6 (mobile API layer — REQUIRED)**: All 4 new `staff-api.ts` functions use the existing `staffFetch(path, init?)` (plain fetch + Cookie), NOT `authClient.$fetch`. Mutations throw with `.status` attached (mirror `patchStaffOrderStatus`) so the hook can distinguish error codes.
- **E7 (HIGH-risk finalize — REQUIRED)**: `mustStopBeforeFinalize: true`. Before treating the work as production-ready, produce the 5-artifact risk evidence pack under `{task-folder}/harness/` (`risk-gate.json`, `context-snippets.json`, `verification.json`, `review-decision.json`, `adversarial-validation.json`) and record a human review decision. Code-green alone is NOT VERIFIED for this trust-boundary feature.
- **E8 (typed-routes codegen)**: After creating `product-availability.tsx` + `branch-pickup-settings.tsx`, prime the Expo typed-routes codegen with one `expo start` pass (then stop) before `tsc --noEmit`, or the new `/(staff)/...` hrefs will report as unknown.

### Accepted concerns (CONDITIONAL)

Accepted by: session (autonomous, /goal-style single-plan validation — no user present in subagent context). Each concern below is documented, non-blocking, and carried into EXECUTE as an instruction or phase-report note:

1. **Security surface — HIGH-risk trust boundary**: accepted with mitigation E7 (risk evidence pack + human review before production finalize). Same risk class as STAFF-003 which shipped under this contract shape.
2. **Section A — SPEC INNER-JOIN vs LEFT-JOIN error affecting AC-2/AC-3 seeding**: accepted with mitigation E1 (test-seeding correction) + E2 (asymmetry note). The endpoints are correct; only the SPEC's customer-path claim and the derived test seed assumption need correction. Not a plan FAIL.
3. **Staff/customer availability asymmetry**: accepted as a documented behavioral note (E2). Out of scope to reconcile in this plan (customer read path not edited).

Gate: CONDITIONAL (3 concerns noted and accepted; all resolvable via execute-agent instructions + phase-report notes; 0 FAILs; plan is mechanically executable as written with the E1 test-seeding correction)

---

## Autonomous Goal Block

```
SESSION GOAL: STAFF-004 — staff Product Availability toggles + Branch Pickup Settings (API+types Phase 1, then mobile Phase 2). Both take effect customer-side immediately; no schema migration.
Charter + umbrella plan: N/A — single standalone plan (no phase program).
Autonomy: proceed on reversible decisions; hard-stop only on irreversible/outward-facing actions not in this contract, and at the pre-production finalize gate (mustStopBeforeFinalize). Cite feedback_autonomous_phase_execution.md.
Hard stop conditions / safety constraints:
- HIGH-risk trust boundary (staff writes control customer-visible menu + order acceptance): do NOT mark VERIFIED on code-green alone. Produce the 5-artifact risk evidence pack under {task-folder}/harness/ and get a human review decision before any production finalize/deploy (E7).
- Do NOT edit the customer read path (branches.ts / orders.ts INNER-JOIN enforcement) — it is out of scope; only the staff write path is added.
- AC-2/AC-3 tests MUST seed products with an explicit is_available=true row (customer path is INNER JOIN, not LEFT JOIN) — see E1.
Next phase: EXECUTE — Phase 1 (API + types) first; Phase 1 gate green before Phase 2 (mobile).
Validate contract: inline in this plan (## Validate Contract) — Gate: CONDITIONAL (3 accepted concerns, 0 FAILs).
Execute start:
  Phase 1 gate: docker compose up -d && pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test
  Phase 2 gate: pnpm --filter @jojopotato/mobile exec tsc --noEmit  (prime `expo start` once for typed-routes)
  Agent-probe: AC-9..AC-12 human walkthrough (mobile, no RN runner)
  high-risk pack: yes (5-artifact evidence pack + human review before finalize)
```
