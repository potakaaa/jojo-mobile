---
name: plan:cart-persistence
description: "Implementation plan for CART-003 (#99) — persist the shopping cart server-side (DB CRUD) so it survives app restarts, sign-out/in, and device switches"
date: 20-07-26
feature: ordering-cart
---

# PLAN: Persist Cart Server-Side (CART-003, GitHub #99)

Date: 20-07-26
Status: CODE DONE — EVL-confirmed green — NOT VERIFIED (see Validate Contract below; EXECUTE
report: `cart-persistence_REPORT_20-07-26.md` in this task folder). Stays in `active/` per Phase
Completion Rules — 4 Agent-Probe manual walkthroughs (AC1/AC2/AC6/AC9) owed before VERIFIED.

Complexity: **COMPLEX** (new schema/migration, new session-gated API surface, ownership/security
boundary, existing-hook rewrite with a byte-identical public contract requirement).

SPEC: `process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_SPEC_20-07-26.md`
(10 ACs, all proven-by/strategy tagged — carried forward verbatim into Verification Evidence below).

INNOVATE Decision Summary: locked in the orchestrator's spawn prompt (this session) — "Precedent-
mirrored persistence." All 6 design questions resolved; Q7 (migration number) is mechanical and
resolved at EXECUTE time against the live journal, not here.

## Overview

Today `apps/mobile`'s cart is `useState<Cart>` inside `CartSessionProvider` — pure client memory,
gone on force-quit. This plan adds real `carts`/`cart_items` tables, a session-gated
`packages/api` route family mirroring the existing `orders.ts`/`branches.ts` pattern, and rewrites
`use-cart.ts`'s internals onto react-query while keeping its exported `useCart()` surface
byte-identical so every existing screen consumer needs zero changes.

## Goals

1. Cart state is durable per-user in Postgres — survives restart, sign-out/in, and device switch.
2. One cart per user, enforced at the DB level (unique constraint), never two to reconcile.
3. Every cart mutation is ownership-checked (403 on cross-user access) — mirrors `orders.ts`'s
   `order.user_id !== userId` check.
4. Read-time re-validation (availability + live price) mirrors MENU-003's single-shared-function
   pattern so list and truth can never disagree.
5. Branch switch hard-clears the cart (items + discount) — same rule as today's client-only
   `setBranch()`, now persisted.
6. `useCart()`'s public API is unchanged; failed mutations must not leave a phantom item
   (optimistic-update rollback).
7. `POST /orders`'s existing request contract is unchanged — client still assembles `items[]`.

## Scope

In scope: new `carts`/`cart_items` schema + migration, new `packages/api/src/routes/cart.ts` +
serializer, a shared cart-revalidation helper, `apps/mobile` hook rewrite (internals only), new
API integration tests (AC1-AC10), an order-snapshot-integrity regression check against the
existing ADM-003 invariant.

Out of scope (verbatim from SPEC): screen/UI redesign, `POST /orders` pricing-decision logic,
new discount mechanics, payment-method persistence, guest carts, multi-cart/wishlist,
real-time cross-device push sync, star/rewards/deal-eligibility logic changes, admin cart views.

## Touchpoints

**New files:**
- `packages/api/src/db/schema/carts.ts` — `carts` table
- `packages/api/src/db/schema/cart_items.ts` — `cart_items` table
- `packages/api/drizzle/<NNNN>_<generated-name>.sql` — migration (generated, do not hand-author;
  see "Migration Number" step below)
- `packages/api/src/routes/cart.ts` — the new route family
- `packages/api/src/routes/lib/cart-revalidation.ts` — shared read-time re-validation helper
- `packages/api/src/routes/__tests__/cart.test.ts` (or `cart.integration.test.ts` — match whichever
  suffix convention `orders.test.ts`'s sibling files use for a NEW hermetic self-seeding integration
  suite; check `staff-order-status.integration.test.ts` naming precedent and follow it — this repo
  mixes `.test.ts` and `.integration.test.ts` (VALIDATE note: the dominant convention by count is
  `.integration.test.ts` — 8 of 11 files in `packages/api/src/routes/__tests__/`; `orders.test.ts`
  is one of only 3 legacy holdouts — prefer `.integration.test.ts` unless a concrete reason argues
  otherwise), confirm the dominant DB-touching convention at EXECUTE time by running
  `ls packages/api/src/routes/__tests__/` fresh)
- `apps/mobile/src/features/cart/lib/cart-api.ts` — typed fetch wrapper for the new `/cart`
  endpoints. **VALIDATE correction:** mirror `features/shared/lib/api-request.ts`'s `apiRequest()`
  helper (which rides `authClient.$fetch` and carries the persisted better-auth session), NOT
  `lib/api-client.ts`'s `getJson()` (that wrapper is a plain unauthenticated `fetch()` used only by
  the public `/branches`, `/branches/:id/menu`, `/deals` routes). Every `/cart` route is
  session-gated — a `cart-api.ts` built on `getJson()`'s style would 401 on every real call.

**Modified files:**
- `packages/api/src/db/schema/index.ts` — export `carts`, `cartItems`
- `packages/api/src/index.ts` — mount `cartRouter` at `/cart` (see corrected "Route Mounting" note
  under Route Handler Design Notes — `requireSession` is NOT a factory, do not call it as
  `requireSession(auth)`)
- `packages/api/src/routes/lib/serializers.ts` — add `ApiCart`, `ApiCartItem`, `serializeCart`
- `apps/mobile/src/features/cart/hooks/use-cart.ts` — internals rewritten onto react-query +
  mutations; exported `useCart()` shape (`cart`, `subtotalCents`, `discountTotalCents`,
  `totalCents`, `itemCount`, `addItem`, `updateQuantity`, `removeItem`, `applyDiscount`,
  `clearDiscount`, `clearCart`, `setBranch`) stays byte-identical
- `packages/types/src/cart.ts` — check whether `Cart`/`CartItem` need additive fields for
  conflict-flags (see "Conflict Flag Shape" below); additive only, never remove/rename existing
  fields (screens read them today)

**Read-only reference during EXECUTE (do not modify unless named above):**
- `packages/api/src/routes/lib/deal-availability.ts` (`resolveAvailableDealProductIds` — the exact
  pattern `cart-revalidation.ts` must mirror)
- `packages/api/src/routes/orders.ts` (ownership-check + transaction-locking precedent; confirmed
  during VALIDATE: `GET /orders/:orderId` uses `403` — not `404` — for "exists but not caller's",
  matching this plan's Public Contracts assumption exactly)
- `packages/api/src/routes/branches.ts`, `apps/mobile/src/features/branch/hooks/use-branch.ts`
  (Context+react-query structural template)
- `packages/api/src/routes/__tests__/orders.test.ts` (hermetic fixture pattern to replicate)
- `packages/api/src/db/schema/user_stars.ts` (confirmed during VALIDATE: exact precedent for a
  `.references(() => users.id).unique().notNull()` one-row-per-user FK — the pattern `carts.user_id`
  should copy verbatim)
- `apps/mobile/src/features/shared/lib/api-request.ts` (VALIDATE-added: the `apiRequest()`
  authenticated fetch wrapper `cart-api.ts` must mirror — see Touchpoints correction above)
- `packages/api/src/lib/__tests__/admin-products.integration.test.ts` (confirmed during VALIDATE:
  the exact "AC1 — order price snapshot integrity" test shape, `describe('AC1 — order price
  snapshot integrity', ...)`, this plan's AC8 regression test must mirror)

## Public Contracts

New session-gated (`requireSession`, same middleware as `orders.ts`/`branches.ts` — NOT the staff
role-gated chain) REST surface, mounted at `/cart`:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/cart` | Fetch-or-create the caller's cart; runs read-time re-validation; returns `ApiCart` with per-line conflict flags |
| `POST` | `/cart/items` | Add item; merges into an existing line if same `product_id` + same `selected_options` (app-level merge, ported `lineIdFor()` logic — NOT DB-enforced) |
| `PATCH` | `/cart/items/:lineId` | Update quantity (`qty <= 0` → 400; use `DELETE` to remove, matching the existing hook's `updateQuantity` semantics where `qty<=0` currently routes to remove — confirm exact status code at EXECUTE, default to removing the line server-side to match today's client behavior rather than 400ing) |
| `DELETE` | `/cart/items/:lineId` | Remove one line |
| `DELETE` | `/cart` | Clear all items + discount |
| `PUT` | `/cart/branch` | Set/switch branch; hard-clears items + discount when the branch actually changes (no-op if same branch, matching today's `setBranch` early-return) |
| `POST` | `/cart/discount` | Apply the single active discount (`AppliedDiscount` shape) |
| `DELETE` | `/cart/discount` | Clear the active discount |

**`POST /cart/items` request body (VALIDATE addition — was unspecified):**
```
{
  productId: string (uuid, required)
  selectedOptions: Array<{ optionId: string (uuid) }> (default [])
  quantity: number (int, positive, default 1)
  notes?: string
}
```
The request body MUST NOT accept a client-supplied price field. `unitPriceCents` is always computed
server-side from the live `product.base_price` plus each selected option's `price_delta`, mirroring
`orders.ts`'s per-line price computation (`unitPriceFor`-equivalent logic, server-side only) — never
trust a client-sent price, even though this is a non-money-authoritative cart layer (defense in
depth, and keeps the cart's own displayed price honest).

Every route: `cart.user_id !== req.session.userId` → `403` (never 404 — matches `orders.ts`'s
existing ownership-check status code; VALIDATE confirmed `orders.ts`'s `GET /:orderId` uses exactly
this convention — see Touchpoints).

`ApiCart` response shape (serializer-produced, cents-at-boundary):
```
{
  id: string
  pickupBranchId: string | null
  items: Array<{
    lineId: string
    productId: string
    quantity: number
    productNameSnapshot: string
    unitPriceCents: number       // live-priced at read time (re-checked, see AC8)
    selectedOptions: CartItemOption[]
    notes?: string
    conflict?: { reason: 'unavailable' | 'price_changed'; ... }  // AC7/AC8
  }>
  appliedDiscount?: AppliedDiscount
  subtotalCents: number
  discountTotalCents: number
  totalCents: number
}
```

`useCart()` mobile-side public contract: UNCHANGED (see Constraints). Internally becomes
`useQuery(['cart'])` + one `useMutation` per action, each following the Q6 optimistic-update
recipe (`onMutate` snapshot+apply, `onError` restore, `onSettled` invalidate `['cart']`).

## Blast Radius

- `packages/api` — new schema (2 tables), 1 migration, 1 new route file, 1 new lib helper, 1
  serializer addition, 1 router-mount line, new integration test file. Risk class: **schema/
  migration** + **auth/session** (both flagged per SPEC Constraints — see High-Risk Classes below).
- `packages/types` — additive-only field changes to `Cart`/`CartItem` if conflict-flag fields are
  needed (see "Conflict Flag Shape").
- `apps/mobile` — one file's internals rewritten (`use-cart.ts`); zero screen-file changes expected.
  **VALIDATE-verified consumer sweep (`grep -rln "useCart(" apps/mobile/src`)** — the actual set of
  files that INVOKE `useCart()` (not just mention it in a comment) is:
  `(tabs)/cart/checkout.tsx`, `(tabs)/cart/index.tsx`, `(tabs)/deals/deal/[dealId].tsx`,
  `(tabs)/index.tsx` (Home add-to-cart-bar), `(tabs)/product/index.tsx` (product-detail),
  `features/deals/hooks/use-deal-products.ts` (reads `cart` for branch context),
  `features/deals/hooks/use-deals.ts` (reads `cart` for branch context), and
  `features/orders/hooks/use-reorder.ts` (calls `addItem`/`setBranch`/`clearCart` — a MUTATION
  consumer). The last three were not named in the original prose list — Implementation Checklist
  step 10's grep sweep is the authoritative check, not this prose enumeration; this correction just
  makes the written list match what the grep already found during VALIDATE.
- File count estimate: ~9 touched/created files in `packages/api`, 1-2 in `packages/types`, 1 in
  `apps/mobile`. This crosses the VALIDATE high-risk-class threshold (schema + auth/session) —
  VALIDATE applied a hybrid-minimum test gate to AC1-AC4 per the High-Risk Classes table in
  `vc-test-coverage-plan` (see Test Gates in the Validate Contract below).

## Migration Number (mechanical — do not hardcode)

Latest journal entry as of this PLAN write: `idx: 16, tag: "0016_rename_offer_fk_constraints"`
(`packages/api/drizzle/meta/_journal.json`, VALIDATE re-confirmed this is still the tip). EXECUTE
MUST re-read this file fresh (do not trust this snapshot) and run
`pnpm --filter @jojopotato/api db:generate` to produce the next migration in sequence — never
hand-author a migration file with a guessed number. This repo's migration numbering has shifted
across merges multiple times (see `all-context.md`'s deals-unification merge delta) — always verify
fresh.

## Table Shapes (locked by INNOVATE)

**`carts`:**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `user_id` | `uuid` FK → `users.id` | **UNIQUE** (Q3 — one-cart-per-user DB constraint; VALIDATE confirmed the exact precedent already exists at `user_stars.user_id`: `.references(() => users.id).unique().notNull()` — copy that idiom verbatim) |
| `branch_id` | `uuid` FK → `branches.id`, nullable | matches today's `pickupBranchId: string` but nullable pre-first-branch-select |
| `discount_source` | `varchar`, nullable | `'coupon' \| 'deal' \| 'reward'` — no pgEnum needed, mirror `AppliedDiscount.source`'s plain string union (check whether other similar denormalized fields in this schema use pgEnum vs varchar+app-level union; `orders.ts` uses pgEnum for `status`/`payment_method` but those are DB-meaningful; a display-only discount source is closer to a free varchar — decide at EXECUTE by checking one more precedent, default varchar if none found) |
| `discount_ref_id` | `uuid`, nullable | no FK constraint (may reference `coupons.id`, `offers.id`, or a rewards table depending on `source` — polymorphic, same as `AppliedDiscount.refId` today having no DB backing) |
| `discount_label` | `varchar`, nullable | |
| `discount_amount` | `numeric(10,2)`, nullable | Q4 — decimal, `numericToCents`-converted at boundary, matching every other money column |
| `created_at` | `timestamp` | `defaultNow()` |
| `updated_at` | `timestamp` | updated on every mutation (app-level, VALIDATE confirmed this is the established idiom repo-wide — every admin route sets `updated_at: new Date()` explicitly on write, e.g. `admin/products.ts`, `admin/branches.ts`, `staff.ts` — there is no drizzle `$onUpdate()` auto-trigger anywhere in this schema; do not invent one) |

**`cart_items`:**
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `cart_id` | `uuid` FK → `carts.id`, `onDelete: 'cascade'` | |
| `product_id` | `uuid` FK → `products.id` | NO ACTION, matches `orders.deal_id`/`coupon_id` precedent |
| `quantity` | `integer` | `> 0` enforced app-level (VALIDATE confirmed this exact precedent at `deal_components.quantity` — `integer().default(1).notNull()`, no DB CHECK, app-layer only — mirror it, do NOT add a DB CHECK) |
| `product_name_snapshot` | `varchar` | mirrors `order_items.product_name_snapshot` |
| `unit_price` | `numeric(10,2)` | price AT ADD-TIME (re-checked live at every `GET /cart`, per AC8 — this column is a cache/last-known value, not authoritative) |
| `selected_options` | `jsonb`, default `[]` | mirrors `order_items.selected_options` / `CartItemOption[]` shape |
| `notes` | `varchar`, nullable | |
| `created_at` / `updated_at` | `timestamp` | |

Line-merge-on-add (same `product_id` + same `selected_options`) is an **app-level** check inside
`POST /cart/items` (port `lineIdFor()`'s logic — stable id from product + sorted option ids), not a
DB constraint. **Flagged for an explicit regression test** — this is app logic, not DB-enforced, so
it can silently regress if the handler is refactored later.

## Conflict Flag Shape

`packages/types/src/cart.ts` likely needs one additive field for the API-returned conflict
annotation (AC6/AC7/AC8). Mirror `use-reorder-conflicts.ts`'s existing conflict-row shape
(`packages/utils/src/reorder.ts`) rather than inventing a new one — read that file at EXECUTE start
and reuse its conflict-reason vocabulary (`'unavailable' | ...`) if it already fits, adding
`'price_changed'` if not already covered. This is additive to `CartItem` (e.g. an optional
`conflict?: {...}` field) — existing consumers that don't read it are unaffected.

**VALIDATE path correction:** the live reorder-conflicts module is
`apps/mobile/src/features/cart/hooks/use-reorder-conflicts.ts` (moved there by NAV-005) — NOT
`apps/mobile/src/features/orders/hooks/use-reorder-conflicts.ts` as the SPEC's Background section
states (stale path in a research doc, non-blocking, corrected here for EXECUTE's benefit).

## Route Handler Design Notes

- **Route mounting (VALIDATE correction — the original text below was factually wrong):**
  `requireSession` (`packages/api/src/middleware/require-session.ts`) is a **plain middleware
  function**, NOT a factory — it does not take `auth` as an argument (unlike `requireStaff(auth)`/
  `requireAdmin(auth)`, which ARE factories). VALIDATE confirmed neither `orders.ts` nor
  `branches.ts` is actually gated at the `index.ts` mount line at all — `orders.ts` applies
  `requireSession` (bare, no `(auth)` call) per-route inline (e.g.
  `ordersRouter.post('/', requireSession, async (req, res) => {...})`); `/coupons`, `/rewards`, and
  `/notifications` DO gate at the mount line, also with the bare reference:
  `app.use('/coupons', requireSession, couponsRouter)`. For `cart.ts`, either convention is fine —
  mount-level (`app.use('/cart', requireSession, cartRouter)`, matching `/coupons`) or per-route
  (matching `orders.ts`) — but NEVER write `requireSession(auth)`; that is a call-signature error
  that does not match the exported function.
- **Find-or-create (`GET /cart` and any mutation on a not-yet-existing cart):** Q3 chose a DB
  unique constraint as the enforcement mechanism; the app-level access pattern is an atomic
  find-or-create — use drizzle's `.insert(carts).values({user_id}).onConflictDoNothing()` followed
  by a `SELECT`, OR a single `INSERT ... ON CONFLICT (user_id) DO UPDATE SET updated_at = updated_at
  RETURNING *` (idempotent no-op update to always get a row back in one round trip) — prefer the
  `ON CONFLICT ... DO UPDATE ... RETURNING` form if drizzle supports it cleanly for this schema, it
  avoids a second query; fall back to insert-then-select if not. (VALIDATE confirmed
  `.onConflictDoUpdate()` is a proven, already-used drizzle idiom in this codebase —
  `admin/products.ts`'s branch-availability upsert, `notifications.ts`'s device-token upsert,
  `staff.ts`'s availability upsert, `admin/deals.ts`'s category find-or-create.)
- **Ownership check:** every route re-derives `cart` from `req.session.userId` via the find-or-create
  helper — there is no `:cartId` route param anywhere, which structurally eliminates the
  cross-user-access vector for GET/mutations at the cart level. `cart_items` mutations
  (`PATCH/DELETE /cart/items/:lineId`) must additionally verify the `lineId` belongs to the CALLER's
  cart (join or explicit `cart_id` check) — this is the one place a naive implementation could leak
  cross-user access (guessing another user's `lineId` uuid) — **explicit AC4 test must cover both
  the cart-level AND the line-level ownership boundary**, not just the cart level. **VALIDATE note:**
  this is the FIRST customer-facing `:id`-scoped mutate route in this codebase (`orders.ts`/
  `branches.ts`/`deals.ts` have no PATCH/DELETE/PUT-by-id customer routes to copy) — there is no
  existing line-level-ownership query to mirror; write it fresh (a `cart_items` row join or
  `WHERE cart_id = :callerCartId AND id = :lineId`, never trust `:lineId` alone) and lean on the
  required AC4 sub-case test to lock it in.
- **Revalidation helper (`cart-revalidation.ts`):** one exported function, signature-mirroring
  `resolveAvailableDealProductIds(dbOrTx, branchId, productIds)` — given a cart's line items and
  branch, returns per-line conflict info (unavailable / price-changed) in ≤2-3 batched queries (not
  N+1). Called by `GET /cart` only for now (SPEC doesn't require it on the write path this round,
  unlike MENU-003's deal-availability which both read and write paths call — `POST /orders` already
  does its own independent re-validation and is the true authority per SPEC Constraints, so this
  helper does NOT need a second call site inside `orders.ts` for this plan; note this explicitly as
  a deliberate divergence from the MENU-003 "same function, two call sites" framing — the SPEC's own
  precedent language describes the PATTERN of one-shared-function, not a literal requirement that
  `orders.ts` must call this specific helper).
- **Branch switch (`PUT /cart/branch`):** if `branch_id` unchanged → no-op (200, cart unchanged). If
  changed → single transaction: update `carts.branch_id`, delete all `cart_items` rows for that
  cart, clear `discount_*` columns to null. Mirrors `setBranch`'s existing early-return + hard-clear
  shape exactly.
- **Discount apply/clear:** `POST /cart/discount` writes the 4 `discount_*` columns from the request
  body (validated `AppliedDiscount` shape) — server does NOT re-derive/re-validate the discount
  amount itself at apply-time (that stays `POST /orders`'s job at placement per SPEC Constraints);
  this endpoint is a dumb store, matching how today's client-side `applyDiscount()` is also a dumb
  setter with no server round-trip. `DELETE /cart/discount` nulls all 4 columns. **VALIDATE security
  note (informational, non-blocking):** because this is a dumb store, a customer could in principle
  `POST /cart/discount` with an arbitrary `amountCents`/`label`, but this can never affect what they
  are actually charged — `POST /orders` never reads `carts.discount_*`; it always independently
  re-derives every discount server-side from `couponCode`/`dealId` (see `orders.ts`'s
  `resolveCouponDiscount`/`computeDealDiscountCents`). At worst a manipulated value makes the
  customer's OWN cart screen display a wrong total for their own cart — cosmetic only, not a money
  or cross-user boundary issue. No code change required; documented so a future reader does not
  mistake this for an unaddressed vulnerability.
- **Field-name reconciliation (VALIDATE addition):** the wire `ApiCart`/`ApiCartItem` shape uses
  `productId` (matching the DB column and `orders.ts`'s convention), but the existing, UNCHANGED
  `packages/types/src/cart.ts` `CartItem` type uses `menuItemId` (screens already read this field
  name and it must not be renamed per Touchpoints). The rewritten `use-cart.ts`'s react-query
  `select`/mapping step MUST translate the API response's `productId` → the client `CartItem`'s
  `menuItemId` field when constructing the value returned to consumers. This is a pure naming
  reconciliation at the hook boundary, not a behavior change — call it out explicitly so it isn't
  missed as "just pass the response through."

## Order-Snapshot-Integrity Regression (AC8, hard gate)

Mirror the exact ADM-003 test pattern (VALIDATE located and confirmed the live precedent at
`packages/api/src/lib/__tests__/admin-products.integration.test.ts`, `describe('AC1 — order price
snapshot integrity', ...)` — the file lives under `packages/api/src/lib/__tests__/`, not
`routes/admin/__tests__/`, mirror its structure from there): place an order (`POST /orders`)
sourced from a persisted cart, then mutate the underlying product's `base_price`, then re-fetch the
already-placed order and assert `order_items.unit_price`/`total_price` are UNCHANGED. This is a
regression lock on an existing invariant, not new invariant — `orders.ts`'s
snapshot-at-placement-time logic is untouched by this plan (Open Question #1 locked: client still
assembles the `POST /orders` payload; the cart is a UI convenience layer, not order placement's
source of truth). Known-Gap is BANNED for this test — it must be a real passing Fully-Automated
test.

## Implementation Checklist

1. **Schema:** create `packages/api/src/db/schema/carts.ts` and `cart_items.ts` per the table
   shapes above; export both from `packages/api/src/db/schema/index.ts`.
2. **Migration:** run `pnpm --filter @jojopotato/api db:generate` fresh (after re-checking the
   journal); review the generated SQL for correctness (unique constraint on `carts.user_id`, cascade
   delete on `cart_items.cart_id`); apply via `db:migrate` against local Postgres.
3. **Revalidation helper:** write `packages/api/src/routes/lib/cart-revalidation.ts`, structurally
   mirroring `deal-availability.ts` (batched queries, doc comment explaining scope, single exported
   function). Read `packages/api/src/routes/lib/coupon-apply.ts`'s `Queryer` type for the
   db-or-transaction parameter convention.
4. **Serializer:** add `ApiCart`, `ApiCartItem`, `serializeCart(cartRow, itemRows, conflictMap)` to
   `serializers.ts`, following `serializeOrder`'s cents-conversion pattern exactly (`numericToCents`/
   `centsToNumeric`).
5. **Route file:** write `packages/api/src/routes/cart.ts` implementing all 8 endpoints from the
   Public Contracts table (including the `POST /cart/items` request schema defined above — no
   client-supplied price field), `requireSession`-gated (bare reference, never `requireSession(auth)`
   — see Route Handler Design Notes), using the find-or-create + ownership-check (cart-level AND
   line-level) + revalidation-on-GET design above.
6. **Mount:** add the router to `packages/api/src/index.ts` using the corrected mounting guidance
   above (bare `requireSession`, mount-level or per-route — either is precedented, `requireSession(auth)`
   is not valid).
7. **Types:** check `packages/types/src/cart.ts` for whether `CartItem` needs an additive
   `conflict?` field (see Conflict Flag Shape); add if needed, additive only.
8. **Integration tests:** write the new cart test file (naming convention resolved at EXECUTE per
   Touchpoints note — prefer `.integration.test.ts`, the dominant convention) with hermetic
   self-seeding fixtures matching `orders.test.ts`'s `beforeAll`/`makeUser`/`makeBranch`/
   `makeProduct` style. Cover, at minimum, one case per AC1-AC9 (AC10 is the full-suite gate, not
   its own test) — see Verification Evidence table below for the exact scenario list.
9. **Mobile hook rewrite:** rewrite `apps/mobile/src/features/cart/hooks/use-cart.ts` internals onto
   `useQuery(['cart'])` + per-action `useMutation`s with the Q6 optimistic-update recipe
   (`onMutate`/`onError`/`onSettled`), following `use-branch.ts`'s Context+react-query structural
   template. Keep the exported `CartSessionState` interface and `useCart()` function signature
   byte-identical (including the `productId`→`menuItemId` reconciliation from Route Handler Design
   Notes). Add a small API client module
   (`apps/mobile/src/features/cart/lib/cart-api.ts`) mirroring `features/shared/lib/api-request.ts`'s
   `apiRequest()` wrapper style (authenticated, session-carrying) for the new `/cart` endpoints —
   do NOT mirror `lib/api-client.ts`'s `getJson()` (that wrapper is unauthenticated, used only by
   public routes, and would 401 on every real `/cart` call).
10. **Consumer sweep:** grep every `useCart()` call site (cart screen, checkout, product detail,
    home add-to-cart bar, deal-apply flow, `use-deal-products.ts`, `use-deals.ts`, `use-reorder.ts`
    — see the VALIDATE-verified list in Blast Radius) and confirm zero changes needed; if any
    consumer breaks typecheck, that is a deviation to flag in the EXECUTE report, not a silent scope
    expansion.
11. **Test gates:** run `pnpm --filter @jojopotato/api test` (full suite, existing + new cart tests
    green) and `pnpm --filter @jojopotato/mobile test` (vitest) + the `packages/ui`/`apps/mobile`
    jest suite for any touched consumer, plus both typechecks.
12. **Format:** run `pnpm format:check` per repo commit hygiene before considering EXECUTE done.

## High-Risk Classes Present

| Class | Where | Minimum tier |
|---|---|---|
| Schema/migration | new `carts`/`cart_items` tables, new migration | Hybrid (real migration applied + tested against live local Postgres) |
| Auth/session (ownership boundary) | every `/cart/*` route's `user_id`/`lineId` ownership check | Fully-Automated (AC4) — Known-Gap banned |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| API test: add item → force-reload equivalent (fresh fetch, no client cache) returns same cart | Hybrid | AC1 |
| Agent-Probe: on-device force-quit + reopen shows same cart | Hybrid (manual half) | AC1 |
| API test: cart persists across two separate authenticated sessions, same user | Hybrid | AC2 |
| Agent-Probe: sign-out/sign-in on-device walkthrough | Hybrid (manual half) | AC2 |
| API test: two independent sessions for the same user resolve to identical cart state | Fully-Automated | AC3 |
| API test: cross-user GET/PATCH/DELETE on cart and on cart_items lineId → 403, not another user's data | Fully-Automated | AC4 |
| API test ×4: add / update-quantity / remove / clear, each followed by fresh-fetch assertion | Fully-Automated | AC5 |
| API/unit test: branch-switch hard-clear rule (items + discount cleared on real branch change; no-op on same branch) | Fully-Automated (Hybrid overall per SPEC due to Agent-Probe half) | AC6 |
| Agent-Probe: branch-switch on-screen experience | Hybrid (manual half) | AC6 |
| API test: mark a cart item's product unavailable at the branch → GET /cart flags conflict | Fully-Automated | AC7 |
| API test: product price changes after cart-add → GET /cart reflects live price | Fully-Automated | AC8 |
| API test (regression): order placed from a persisted-cart-sourced payload keeps its snapshot price after a later product price change (mirrors ADM-003, Known-Gap banned) | Fully-Automated | AC8 |
| API test: full add-to-cart → checkout → POST /orders round trip against the persisted-cart path, correct items/totals | Hybrid | AC9 |
| Agent-Probe: on-device checkout walkthrough sourced from a persisted cart | Hybrid (manual half) | AC9 |
| `pnpm --filter @jojopotato/api test` full suite green (existing + new) | Fully-Automated | AC10 |
| `apps/mobile` vitest/jest suites green, zero `useCart()` consumer regressions | Fully-Automated | AC10 |
| API test: line-merge-on-add (same product + same options merges quantity; different options creates a new line) | Fully-Automated | Constraint — app-level line-merge regression lock (flagged above, not DB-enforced) |
| API test: line-level ownership boundary (`lineId` from another user's cart → 403) | Fully-Automated | AC4 (explicit sub-case) |
| API test: failed mutation (simulated 500/rejection) does not leave a phantom item in a subsequent GET | Fully-Automated | Constraint — no-phantom-item on failed mutation |

## Test Infra Improvement Notes

(none identified yet)

## Dependencies / Risks

- **Migration numbering drift** — mitigated by re-checking the journal fresh at EXECUTE (see
  "Migration Number" above), not hardcoding here.
- **Line-merge-on-add correctness** — flagged by vc-predict as the sole non-blocking risk (5-persona
  review, GO verdict); addressed by an explicit regression test (see Verification Evidence).
- **Optimistic-update rollback correctness** — genuinely new pattern for this codebase (no existing
  precedent); the react-query `onMutate`/`onError`/`onSettled` recipe is standard but this repo has
  never used it before — EXECUTE should double-check the exact rollback behavior against a forced
  mutation failure (e.g. temporarily throw in a test double) before considering AC-adjacent
  "no phantom item" constraint proven.
- **`discount_source` column type ambiguity** (varchar vs pgEnum) — left as an EXECUTE-time judgment
  call with a documented default (varchar) rather than blocking PLAN on it; low risk either way,
  does not affect the public contract.
- **Two AC9 halves (Hybrid)** — the API round-trip half is Fully-Automated-provable; the on-device
  checkout walkthrough remains an owed Agent-Probe item like every other on-device UX in this
  codebase (per SPEC Constraints, no RN/E2E runner exists). This plan does not block CODE DONE status
  on that manual half completing.
- **Line-level ownership check has no existing precedent in this codebase** (VALIDATE finding) —
  `cart.ts`'s `PATCH/DELETE /cart/items/:lineId` is the first customer-facing `:id`-scoped mutate
  route; there is no prior query pattern to copy verbatim. Mitigated by the explicit, required AC4
  sub-case test (line-level ownership boundary) already in Verification Evidence — Known-Gap banned
  for this case per the High-Risk Classes table.

## Acceptance Criteria

This plan implements the 10 Acceptance Criteria locked in the SPEC verbatim (see
`cart-persistence_SPEC_20-07-26.md` §Acceptance Criteria for full text with `proven by:`/`strategy:`
tags). Summary:

1. Cart survives an app restart. 2. Cart survives sign-out/sign-in on the same device.
3. Cart is visible across devices for the same account. 4. A customer cannot read or modify
another customer's cart. 5. Add/update-quantity/remove/clear each persist correctly.
6. Switching branch never leaves an unfulfillable cart. 7. An item that became unavailable is
flagged, not silently kept. 8. A cart item reflects the live price; placed orders still snapshot
correctly. 9. Checkout from a persisted cart still places a correct order end-to-end.
10. All existing and new automated tests pass together.

Each is mapped to concrete implementation steps in the Implementation Checklist and to test gates
in Verification Evidence above.

## Testing Context

`packages/api` uses vitest + supertest with hermetic self-seeding fixtures
(`beforeAll`/`makeUser`/`makeBranch`/`makeProduct` local helpers) per
`process/context/tests/all-tests.md` — this plan's new cart tests follow the same convention (see
Implementation Checklist step 8 and Verification Evidence). `apps/mobile` uses vitest (pure-TS,
node env) for hook/logic coverage; screen-level cart UX has no RN/E2E runner and is Agent-Probe
only, per SPEC Constraints. Full runner/command reference: `process/context/tests/all-tests.md`.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist steps complete, all Fully-Automated and Hybrid
  automated-half test gates green (`pnpm --filter @jojopotato/api test`,
  `pnpm --filter @jojopotato/mobile test`, both typechecks, `pnpm format:check`), AC4 and AC8's
  snapshot-integrity regression proven by real passing tests (Known-Gap banned for both per the
  High-Risk Classes table).
- **VERIFIED**: CODE DONE, plus the Agent-Probe manual halves of AC1, AC2, AC6, AC9 (on-device
  restart, sign-out/in, branch-switch, and checkout walkthroughs) confirmed by the user. Until then
  this plan MUST stay in `active/`, not `completed/`, even if all automated gates are green — mirrors
  the standing convention used by every other on-device-UX-adjacent plan in this codebase (e.g.
  MENU-003, MENU-004, mobile-dark-mode-audit).
- If VALIDATE grants CONDITIONAL rather than PASS, the accepted gaps must be listed explicitly in
  this plan's Validate Contract section before EXECUTE begins.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_PLAN_20-07-26.md`
2. **Last completed phase or step:** VALIDATE — PASS. INNOVATE decision summary is locked; SPEC is
   locked at
   `process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_SPEC_20-07-26.md`.
3. **Validate-contract status:** written below — Gate: PASS.
4. **Supporting context files loaded during PLAN/VALIDATE:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `packages/api/src/routes/lib/deal-availability.ts`,
   `apps/mobile/src/features/cart/hooks/use-cart.ts`, `packages/types/src/cart.ts`,
   `packages/api/src/routes/orders.ts`, `packages/api/src/db/schema/orders.ts`,
   `packages/api/src/db/schema/user_stars.ts`, `packages/api/src/db/schema/deal_components.ts`,
   `packages/api/src/routes/lib/serializers.ts`, `packages/api/src/routes/lib/coupon-apply.ts`,
   `packages/api/src/middleware/require-session.ts`, `packages/api/src/index.ts`,
   `packages/api/drizzle/meta/_journal.json`,
   `packages/api/src/routes/__tests__/orders.test.ts`,
   `packages/api/src/lib/__tests__/admin-products.integration.test.ts`,
   `apps/mobile/src/lib/api-client.ts`, `apps/mobile/src/features/shared/lib/api-request.ts`,
   `apps/mobile/src/features/orders/hooks/use-checkout.ts`.
5. **Next step for a fresh agent picking up mid-execution:** EXECUTE is complete and
   EVL-confirmed green (see `cart-persistence_REPORT_20-07-26.md` in this task folder). All 10
   ACs' automated/Hybrid-automated halves are met by real passing tests; AC4 and AC8-snapshot
   (the two Known-Gap-banned hard gates) were independently confirmed non-vacuous. Remaining work
   is exclusively the 4 owed Agent-Probe manual walkthroughs (AC1/AC2/AC6/AC9) — no further code
   changes are planned. Once those are performed and confirmed by the user, this plan moves from
   CODE DONE to VERIFIED and the task folder can archive to `completed/`.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential (single vc-execute-agent, opus)
Rationale: Score 4/7 (S1 multi-package, S2 schema/auth surface, S6 high-risk class, S7 5+ files) —
this crosses into the "workflow/agent-team" threshold band by raw signal count, but the actual work
is a strict dependency chain (schema → migration → revalidation helper → serializer → routes →
mount → types → tests, then only afterward the mobile hook rewrite, which itself depends on the API
contract being stable) with a single high-stakes correctness surface (auth/ownership + snapshot
integrity) that benefits from one continuous author rather than a fan-out. This repo has a
documented precedent for exactly the failure mode parallel-split risks here — `all-tests.md`'s
Known Gaps note: "No live-integration check between parallel EXECUTE phases building opposite sides
of a network contract" (pickup-order-flow's EVL cycle 1 caught API/mobile field-name drift only via
an independent confirmation run). Given the API and mobile sides of this plan are exactly that kind
of network-contract pair, sequential (backend fully built + tested before the mobile hook rewrite
begins) is the fit-appropriate choice over splitting them across parallel agents/team members.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | cart survives app restart (persists across a fresh, cacheless fetch) | Hybrid | new cart integration test: add item via API, re-fetch with no client cache, assert identical cart | B |
| AC1-manual | on-device force-quit + reopen shows same cart | Agent-Probe | user walkthrough: add items, force-quit app, reopen, compare | B |
| AC2 | cart survives sign-out/sign-in, same device | Hybrid | integration test: cart persists across two separate authenticated sessions for the same user | B |
| AC2-manual | on-device sign-out/sign-in walkthrough | Agent-Probe | user walkthrough: sign out, sign back in, compare cart | B |
| AC3 | cart visible across devices for the same account | Fully-Automated | integration test: two independent sessions for the same user resolve to identical cart state | B |
| AC4 | cart-level cross-user isolation | Fully-Automated | integration test: cross-user GET/PATCH/DELETE on `/cart` → 403, not another user's data | B |
| AC4-line | line-level cross-user isolation (`lineId` from another user's cart) | Fully-Automated | integration test: PATCH/DELETE `/cart/items/:lineId` with another user's lineId → 403 | B |
| AC5 | add/update-quantity/remove/clear each persist | Fully-Automated | integration tests ×4, each followed by a fresh-fetch assertion | B |
| AC6 | branch switch hard-clears items+discount (real change) / no-op (same branch) | Fully-Automated | integration test on `PUT /cart/branch`, both branches | B |
| AC6-manual | branch-switch on-screen experience | Agent-Probe | user walkthrough: switch pickup branch with items in cart | B |
| AC7 | unavailable product flagged as conflict, not silently kept | Fully-Automated | integration test: mark a cart item's product unavailable at the branch, GET /cart, assert conflict flag | B |
| AC8 | live price reflected on GET /cart after a product price change | Fully-Automated | integration test: change product base_price after cart-add, GET /cart, assert updated unitPriceCents | B |
| AC8-snapshot | placed-order snapshot price is unchanged by a later product price edit (mirrors ADM-003, Known-Gap banned) | Fully-Automated | integration test mirroring `admin-products.integration.test.ts`'s AC1 pattern, sourced from a persisted-cart checkout | B |
| AC9 | full add-to-cart → checkout → POST /orders round trip via the persisted-cart path | Hybrid | integration test: build cart via API, place order, assert items/totals correct | B |
| AC9-manual | on-device checkout walkthrough from a persisted cart | Agent-Probe | user walkthrough: add items, checkout, confirm order | B |
| AC10 | full `packages/api` suite green (existing + new) | Fully-Automated | `pnpm --filter @jojopotato/api test` | B |
| AC10-mobile | `apps/mobile` vitest/jest suites green, zero `useCart()` consumer regressions | Fully-Automated | `pnpm --filter @jojopotato/mobile test` | B |
| line-merge | same product+options merges quantity; different options creates a new line | Fully-Automated | integration test: two `POST /cart/items` calls, same vs different `selectedOptions` | B |
| no-phantom | failed mutation never leaves a phantom item in a subsequent GET | Fully-Automated | integration test: simulate a rejected mutation (e.g. invalid `lineId` mid-request), assert GET /cart shows no partial state | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` cart route family: Fully-Automated: `pnpm --filter @jojopotato/api test` | Hybrid: same command, precondition local Postgres migrated via `db:migrate` | Agent-Probe: on-device restart/sign-out-in/branch-switch/checkout walkthroughs (AC1/AC2/AC6/AC9 manual halves) | known-gap: none — Known-Gap is not used anywhere in this contract.
- `apps/mobile` cart hook rewrite: Fully-Automated: `pnpm --filter @jojopotato/mobile test` (vitest + jest, zero consumer regressions) | Agent-Probe: on-device UX walkthroughs (see above, same 4 manual halves) | known-gap: none.

**Failing stubs (Fully-Automated rows only):**

AC3:
```
test("should return identical cart state for two independent sessions of the same user", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: two independent sessions for the same user resolve to identical cart state")
})
```
AC4:
```
test("should reject cross-user GET/PATCH/DELETE on /cart with 403, not another user's data", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: cross-user GET/PATCH/DELETE on /cart and cart_items lineId returns 403")
})
```
AC4-line:
```
test("should reject PATCH/DELETE /cart/items/:lineId when lineId belongs to another user's cart", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: line-level ownership boundary returns 403")
})
```
AC5:
```
test("should persist add/update-quantity/remove/clear, each reflected on a fresh fetch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: add/update-quantity/remove/clear each persist correctly")
})
```
AC6:
```
test("should hard-clear items and discount on a real branch change, and no-op on the same branch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: PUT /cart/branch hard-clear rule")
})
```
AC7:
```
test("should flag a cart item as a conflict when its product becomes unavailable at the branch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: GET /cart flags unavailable-product conflict")
})
```
AC8:
```
test("should reflect the live price on GET /cart after the product's base_price changes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: GET /cart reflects live price after base_price edit")
})
```
AC8-snapshot:
```
test("should not mutate order_items.unit_price/total_price when base_price is edited after a persisted-cart-sourced order is placed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC8 order-snapshot-integrity regression, Known-Gap banned")
})
```
AC10:
```
test("should pass the full packages/api suite (existing + new cart tests) after the migration is applied", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: full packages/api suite green")
})
```
AC10-mobile:
```
test("should pass apps/mobile vitest+jest suites with zero useCart() consumer regressions", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: apps/mobile suites green, zero consumer regressions")
})
```
line-merge:
```
test("should merge quantity into an existing line for the same product+options, and create a new line for different options", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: line-merge-on-add regression lock")
})
```
no-phantom:
```
test("should not leave a phantom item in GET /cart after a failed mutation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: no-phantom-item on failed mutation")
})
```

Dimension findings:
- Infra fit: CONCERN (resolved via plan update) — original plan text pointed `cart-api.ts` at the
  wrong precedent (`lib/api-client.ts`'s unauthenticated `getJson()` instead of
  `features/shared/lib/api-request.ts`'s authenticated `apiRequest()`) and used an invalid call
  signature for the route guard (`requireSession(auth)` — `requireSession` is not a factory). Both
  corrected directly in the plan text above (Touchpoints, Route Handler Design Notes,
  Implementation Checklist steps 6 and 9). No remaining infra-fit gap.
- Test coverage: PASS — Verification Evidence/Test Gates already satisfy the High-Risk Class
  minimum tiers (Hybrid minimum for schema/migration, Fully-Automated + Known-Gap-banned for
  auth/session AC4 and the AC8 snapshot regression); no developed behavior rests on Known-Gap alone
  (vacuous-green check: every row above is Fully-Automated, Hybrid, or Agent-Probe — zero
  Known-Gap rows in this contract).
- Breaking changes: CONCERN (resolved via plan update) — the original Blast Radius prose list of
  `useCart()` consumers was incomplete (missing `use-reorder.ts`, `use-deals.ts`,
  `use-deal-products.ts`, found via a live grep during VALIDATE). Corrected in the Blast Radius
  section above; Implementation Checklist step 10's grep sweep remains the authoritative
  verification at EXECUTE time regardless.
- Security surface: CONCERN (informational, non-blocking, documented) — `POST /cart/discount`'s
  "dumb store" design lets a customer persist an arbitrary discount value in their OWN cart, but
  `POST /orders` never reads `carts.discount_*` and always independently re-derives every discount
  server-side — confirmed by reading `orders.ts` line-by-line during VALIDATE. Cosmetic-only for the
  customer's own cart display, not a money or cross-user boundary issue. No code change required;
  documented in Route Handler Design Notes. Also added an explicit `POST /cart/items` request
  schema (was unspecified) that forbids a client-supplied price field, closing a latent "what if a
  future caller starts trusting the cart" risk before it can exist.
- Section — Schema & Migration (Checklist 1-2): PASS — mechanically feasible; exact drizzle
  precedents confirmed live (`user_stars.ts` for the unique-FK-per-user idiom,
  `deal_components.ts` for app-level `quantity > 0`, multiple `admin/*.ts` routes for the
  app-level `updated_at: new Date()` idiom). No gaps, no conflicts. Highest-risk edit: the unique
  constraint on `carts.user_id` — mitigated by copying the `user_stars.ts` precedent verbatim.
- Section — Revalidation Helper & Route Handlers (Checklist 3, 5, 6): CONCERN (resolved via plan
  update) — router-mount example was wrong (see Infra fit above, now corrected); POST /cart/items
  request schema was unspecified (now added). Highest-risk edit: line-level ownership check on
  PATCH/DELETE /cart/items/:lineId has no existing precedent in this codebase (first customer-facing
  `:id`-scoped mutate route) — mitigated by the required, Known-Gap-banned AC4-line test.
- Section — Serializer & Types (Checklist 4, 7): PASS — `serializeOrder`'s cents-conversion pattern
  (`numericToCents`/`centsToNumeric`) is a clean, confirmed precedent to mirror. One execute-agent
  instruction added: the API's `productId` field must be mapped to the client `CartItem`'s existing
  `menuItemId` field name at the hook boundary (naming reconciliation, not a behavior change).
- Section — Mobile Hook Rewrite & API Client (Checklist 9, 10): CONCERN (resolved via plan update)
  — `cart-api.ts` precedent corrected (see Infra fit above). Optimistic-update rollback remains
  genuinely new to this codebase (already flagged by the plan's own Dependencies/Risks) — no
  precedent to mirror, mitigated by the explicit no-phantom-item test already required.
- Section — Tests (Checklist 8, 11, 12): PASS — hermetic self-seeding fixture convention
  (`orders.test.ts`) and the AC8 snapshot-regression precedent (`admin-products.integration.test.ts`)
  were both located and confirmed live during VALIDATE.

Open gaps: none unresolved. All CONCERNs found during the V2 fan-out were fixed directly in the
plan text (Plan Updates) — see Dimension findings above for the before/after of each. No FAILs at
any point. No Known-Gap rows anywhere in this contract — both HARD gates (AC4, AC8-snapshot) are
proven by real Fully-Automated tests per the High-Risk Classes table.

What this coverage does NOT prove:
- The Hybrid rows (AC1, AC2, AC9 automated halves) prove the API-level behavior against a live
  local Postgres; they do NOT prove the on-device experience (app-restart timing, OS
  sign-out/sign-in UX, real checkout screen flow) — those remain the paired Agent-Probe rows
  (AC1-manual, AC2-manual, AC9-manual), owed by the user per this plan's own Phase Completion
  Rules before the plan can move from CODE DONE to VERIFIED.
- `pnpm --filter @jojopotato/api test` (AC10) proves the new cart routes coexist correctly with
  every existing suite on a freshly migrated local Postgres; it does NOT prove behavior against a
  production-scale dataset, concurrent-load correctness beyond the exact race conditions each test
  simulates, or any environment other than the CI/local Postgres configuration.
- The line-level ownership test (AC4-line) proves the specific "guess another user's lineId uuid"
  vector is rejected; it does not constitute a full penetration-test-style adversarial review of the
  new route family (no `adversarial-validation.json` artifact was produced for this plan — this is
  a session-auth CRUD surface, not the deploy/proxy/payment class of risk that
  `vc-risk-evidence-pack` reserves the 5-artifact evidence pack for; judged proportionate given the
  ownership boundary is structurally narrow — no `:cartId` param anywhere, only `:lineId`).
- Agent-Probe rows are performed once by the user on one device/platform; they do not constitute
  a repeatable regression gate the way the Fully-Automated/Hybrid rows do (standing, project-wide
  limitation, not specific to this plan — see `all-tests.md` Known Gaps).

Gate: PASS (no FAILs, plan updated)
Accepted by: N/A — Gate is PASS; no CONCERNs remain unresolved (all fixed via plan updates during VALIDATE, see Dimension findings above).

## Autonomous Goal Block

SESSION GOAL: Persist the shopping cart server-side (CART-003, GitHub #99) — new `carts`/
`cart_items` schema, session-gated `/cart` API, mobile hook rewrite behind an unchanged
`useCart()` public contract.
Charter + umbrella plan: N/A — single plan (not a phase program).
Autonomy: standing autonomy granted through VALIDATE (this session) — self-decide at V5-equivalent
gates; BLOCKED items go to backlog and continue; irreversible/outward-facing actions without
explicit contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- Known-Gap is BANNED for AC4 (cross-user + line-level cart isolation) and AC8's order-snapshot-
  integrity regression — both must be real passing Fully-Automated tests before CODE DONE.
- `POST /orders`'s existing request contract must not change — client still assembles `items[]`;
  the persisted cart is a UI convenience layer, never order-placement's source of truth.
- `useCart()`'s exported `CartSessionState` interface and function signature must stay
  byte-identical — zero screen-file changes are expected; any consumer break is a deviation to
  flag in the EXECUTE report, not silently absorbed.
- Never accept a client-supplied price field on `POST /cart/items` — `unitPriceCents` is always
  server-computed from the live product price.
- Migration number must be re-verified fresh against `packages/api/drizzle/meta/_journal.json` at
  EXECUTE time — never hand-authored or hardcoded.
Next phase: EXECUTE — `process/features/ordering-cart/active/cart-persistence_20-07-26/cart-persistence_PLAN_20-07-26.md`
Validate contract: inline in plan (see `## Validate Contract` above)
Execute start: `pnpm --filter @jojopotato/api test` (Fully-Automated/Hybrid gates) | Agent-Probe:
AC1/AC2/AC6/AC9 on-device walkthroughs (owed before VERIFIED, not before CODE DONE) | high-risk
pack: no (session-auth CRUD surface judged proportionate without the 5-artifact evidence pack —
see "What this coverage does NOT prove" in the Validate Contract)
