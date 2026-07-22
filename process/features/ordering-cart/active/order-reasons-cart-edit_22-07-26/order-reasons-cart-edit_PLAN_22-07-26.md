---
name: plan:order-reasons-cart-edit
description: "Staff reject reasons (B2), customer self-cancel (B3), and cart-line option edit (B4)"
date: 22-07-26
feature: ordering-cart
---

# PLAN — Order Reasons + Customer Cancel + Cart Line Edit


**Date**: 22-07-26
**Status**: DRAFT — PLAN complete, PVL cycle 3: Gate PASS (4 new gaps found and fixed in-plan this pass; 0 open concerns remain). Ready for EXECUTE.
**Complexity**: COMPLEX

## Overview

**TL;DR:** Three independent, additive server mutations sharing one migration for B2+B3
(`orders.reason_code`/`reason_note`/`reason_actor`), one narrow new staff route
(`PATCH /api/staff/orders/:orderId/reject`), one narrow new customer route
(`PATCH /orders/:orderId/cancel`), and one extended existing route
(`PATCH /cart/items/:lineId` gains optional `selectedOptions`). Every ownership check,
illegal-transition rejection, required-reason gate, and merge-collision outcome is Fully-Automated
with Known-Gap explicitly banned — `packages/api` has a live Postgres integration runner, so there
is no infra excuse. Complexity: **COMPLEX** (3 independently shippable trust-boundary mutations,
1 shared migration, cross-cutting `reason_actor` design decision, HIGH-risk evidence pack
recommended for B2/B3).

## Decision Summary — `reason_actor` ambiguity (resolves ORCHESTRATOR PUSHBACK)

INNOVATE's design let `reason_actor` be inferred by elimination — B3 writes `'customer'`
explicitly, the pre-existing staff generic-PATCH cancel/reject path is left untouched and writes
NULL, so NULL was read as "staff." That inference is genuinely broken: NULL is ALSO what every
row written before this feature shipped looks like, so NULL means "staff" OR "pre-feature
legacy" — not the required binary of "customer" or "staff."

**Chosen: (a) narrowly extend the existing staff-cancel/reject path to write `reason_actor='staff'`
— re-evaluated against the actual SPEC Out-of-Scope text, not assumed forbidden.**

SPEC's Out of Scope says: *"Any change to the existing staff `PATCH /api/staff/orders/:orderId`
transition mechanics, the state machine's transition table (`order-state-machine.ts`) ... [is out
of scope]."* Read literally, this forbids changing **mechanics** — request/response shape,
`canTransition` semantics, the transition table, timestamp side-effects. It does not forbid
writing one additional, purely additive, non-behavior-affecting audit column
(`reason_actor='staff'`, `reason_code=null`, `reason_note=null`) alongside the SAME `status`
write that route already performs for `rejected` and `cancelled` targets. No request shape
changes (the route's body remains `{status, etaMinutes}`), no new branch in `canTransition`, no
new response field beyond what composition already exposes. This is the same class of change as
adding a column to an `INSERT`/`UPDATE` patch object that a route already issues — it is
plumbing, not mechanics.

Therefore: `PATCH /api/staff/orders/:orderId` (`staff.ts`) gets ONE additive line in its existing
patch-building `if (targetStatus === 'cancelled')` / add a new `if (targetStatus === 'rejected')`
branch: set `patch.reason_actor = 'staff'` (code/note stay null — the existing generic route has
no reason input and none is being added to it; B2's dedicated reject route is the only place a
staff-authored reason code/note can be captured). This closes the true ambiguity: going forward,
every row transitioning through EITHER staff path (`PATCH .../reject` new B2 route, or the
existing generic `PATCH .../:orderId` for a direct `cancelled`/`rejected` target — the generic
route still legally permits `pending→cancelled`/`pending→rejected` per the unmodified state
machine) is stamped `'staff'`. Every row transitioning through the new B3 customer-cancel route is
stamped `'customer'`. Only PRE-FEATURE rows (`cancelled`/`rejected` before this migration lands)
keep `reason_actor = NULL`.

**Rejected:** (b) backfill — no reliable way to distinguish historical staff-cancelled from
customer-would-have-cancelled rows retroactively; backfilling all-`'staff'` or all-`'unknown'`
both fabricate certainty that doesn't exist. (c) a distinct `'unknown'` legacy marker — adds a
third enum value whose only purpose is describing data that predates the feature; NULL already
unambiguously means exactly that once (a) closes the *forward* ambiguity, so a fourth state is not
needed.

**What NULL means after this plan ships (state this in the migration file comment and the
`reason_actor` column comment verbatim):** `reason_actor IS NULL` means **this order transitioned
to a terminal `cancelled`/`rejected` state before this feature's migration landed** — it is a
historical marker, never a live ambiguity, because after this migration every NEW transition to
`cancelled`/`rejected` (through any of the three writing paths: B2 reject, B3 cancel, or the
pre-existing generic staff PATCH) sets `reason_actor` to `'staff'` or `'customer'`.

**Cross-reference comment (required in `order-state-machine.ts` header AND in the migration file):**
`// NOTE: B3's customer-cancel window is pending-only (see SPEC Out of Scope). If this window is
// ever widened to permit cancelling an 'accepted' order, re-verify reason_actor is still stamped
// on every code path that can reach 'cancelled' from a wider source status — a new/changed path
// must not reintroduce the by-elimination ambiguity this plan just closed.`

## Sequencing

1. **Migration `0022_*` (additive, shared by B2+B3)** — `orders.reason_code varchar(32) NULL`,
   `orders.reason_note text NULL`, `orders.reason_actor varchar(8) NULL`. Land once.
2. **B2 — staff reject reason** — new route, depends on migration.
3. **B3 — customer cancel** — new route, depends on migration. Independent of B2 (different route,
   different actor), but both depend on step 1 and both touch `staff.ts`'s existing patch-building
   branches for the `reason_actor='staff'` stamp (step 1 of the Decision Summary above) — land B2
   and B3 together to avoid a half-stamped intermediate state where only one of `rejected`/
   `cancelled` gets `reason_actor` on the generic staff route.
4. **B4 — cart line option edit** — fully independent (`cart.ts` only, no migration, no shared
   file with B2/B3). Can land before, after, or interleaved with steps 1-3.

Recommended EXECUTE order: migration → B2 → B3 (shares the `staff.ts` edit with B2, do both in one
pass) → B4.

## Touchpoints

| File | Change |
|---|---|
| `packages/api/drizzle/0022_*.sql` (new) | Additive migration: 3 nullable columns on `orders` |
| `packages/api/src/db/schema/orders.ts` | Add `reason_code`, `reason_note`, `reason_actor` columns |
| `packages/api/src/routes/orders.ts` | New `PATCH /:orderId/cancel` (B3), registered before `GET /:orderId` alongside `/:orderId/complete` |
| `packages/api/src/routes/staff.ts` | New `PATCH /orders/:orderId/reject` (B2); existing generic `PATCH /orders/:orderId` gets 2 additive lines stamping `reason_actor='staff'` on `rejected`/`cancelled` targets |
| `packages/api/src/routes/lib/order-state-machine.ts` | Comment-only: add the cross-reference note (Decision Summary). **No transition-table change.** — see Implementation Checklist step 2b (PVL cycle 2 fix — this touchpoint previously had no corresponding checklist step). |
| `packages/api/src/routes/lib/serializers.ts` | `StaffOrderDetail`/`StaffOrderSummary` (via `@jojopotato/types`) gain `reasonCode`/`reasonNote`/`reasonActor` fields in the staff order serializer(s); `AdminOrderDetail`/`AdminOrderSummary` inherit for free via existing spread |
| `packages/types/src/staff.ts` | `StaffOrderSummary`/`StaffOrderDetail` gain `reasonCode: string \| null`, `reasonNote: string \| null`, `reasonActor: 'staff' \| 'customer' \| null` |
| `packages/types/src/order.ts` | The client-facing `Order` interface (confirmed at `order.ts:30` — NOT `ApiOrder`, see the corrected step 5 note) gains the same 3 fields so the tracking screen can show the reason |
| `packages/api/src/routes/lib/serializers.ts` | The server-side `ApiOrder` interface (confirmed at `serializers.ts:275` — a SEPARATE, locally-declared wire type, this repo's established convention, same as `ApiBranch`) also gains the same 3 fields; both interfaces must be widened, not just one (see the corrected step 5 note) |
| `packages/types/src/order-reasons.ts` (new) | Shared reason-code lookup: `STAFF_REJECT_REASONS`, `CUSTOMER_CANCEL_REASONS` (code→display string), both arrays typed as readonly tuples |
| `packages/api/src/routes/cart.ts` | `PATCH /items/:lineId` (B4): optional `selectedOptions` in body; shared option-validate+price+merge helper extracted from `POST /items` |
| `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` | Reject button opens a new reason-picker dialog instead of the existing yes/no `ConfirmDialog`; calls new `patchStaffOrderReject`. **PVL cycle 2 fix: also renders `reasonCode`/`reasonNote` when `order.status` is `'rejected'` or `'cancelled'` — see Implementation Checklist step 13b.** |
| `apps/mobile/src/features/staff/lib/staff-api.ts` | New `patchStaffOrderReject(orderId, reasonCode, note?)` |
| `apps/mobile/src/features/staff/hooks/use-reject-order.ts` (new — **PVL cycle 2 fix**) | Mutation hook wrapping `patchStaffOrderReject`, mirroring `useUpdateOrderStatus`'s 3-key invalidation exactly — see Implementation Checklist step 14. |
| `apps/mobile/src/app/(staff)/components/` or co-located in `order-detail/` (new) | `RejectReasonDialog` component (preset list + optional note, "Other" gates note) |
| `apps/mobile/src/app/(tabs)/tracking/index.tsx` | New "Cancel order" action, visible only while `status === 'pending'`; opens a confirm-with-optional-reason dialog |
| `apps/mobile/src/features/orders/lib/api-client.ts` | New `cancelOrder(orderId, reasonCode?, note?)` calling `PATCH /orders/:orderId/cancel` |
| `apps/mobile/src/features/orders/hooks/use-cancel-order.ts` (new) | Mutation hook mirroring `use-complete-order.ts` exactly (invalidate `['order', orderId]` + `['orders','history']`) |
| `apps/mobile/src/app/(tabs)/cart/index.tsx` | `<CartItem>` rows gain a tap-to-edit handler navigating to Product Details pre-filled |
| `apps/mobile/src/app/(tabs)/product/index.tsx` | Accepts optional `lineId`/prefill params; on Save, if `lineId` present, calls a DISTINCT edit-save handler instead of `handleAdd` (see step 18 — must not reuse `handleAdd`'s branch-switch-confirm/`clearCart` logic) |
| `apps/mobile/src/features/cart/hooks/use-cart.ts` (confirmed live at this exact path — `CartSessionProvider`/`useCart()`, `cartKey = ['cart', userId]`) | New `editCartLine` mutation wrapping `PATCH /cart/items/:lineId` with `selectedOptions` |
| `apps/mobile/src/features/cart/lib/cart-api.ts` (NEW ROW — **PVL cycle 3 fix**, closes a missing-touchpoint gap) | New client function (e.g. `updateCartItemOptions(lineId, selectedOptions)`), matching `updateCartItemQuantity`'s exact `apiRequest<CartEnvelope>(...).then(unwrap)` shape (confirmed live at line 71). `updateCartItemQuantity` only accepts `{quantity}`, not `{selectedOptions}` — `editCartLine` (below) has no existing function to wrap without this. |

**File-path verification note — RESOLVED this VALIDATE pass (was: pending re-confirmation before
EXECUTE):** both flagged paths were independently confirmed live by direct `Read` during this V2
pass — `apps/mobile/src/features/cart/hooks/use-cart.ts` exports `CartSessionProvider`/`useCart()`
at lines 199/367 with `cartKey = ['cart', userId]` at line 209; `apps/mobile/src/app/(tabs)/
product/index.tsx` confirmed to have `handleAdd` at line 123, `isSwitchingBranch` at line 138,
`clearCart()` at line 162 — exact match to this plan's prior estimated line numbers. No remaining
file-path uncertainty for B4's mobile touchpoints.

## Public Contracts

**New: `PATCH /api/staff/orders/:orderId/reject`** (staff/admin/super_admin, branch-scoped)
- Body: `{ reasonCode: string, note?: string }` — zod: `reasonCode` must be one of the 6 locked
  staff codes; `note` optional string UNLESS `reasonCode === 'other'`, in which case `note` is
  required non-empty (server-side, independent of any client gate — B2.2/B2.8 HARD).
- No `status` field accepted — target is always `rejected`, matching the `/complete` precedent.
- Responses: `200 { order: StaffOrderDetail }` · `403` cross-branch or unassigned staff ·
  `404` malformed/missing id · `409` order not currently `pending` (mirrors `canTransition`
  guard already in `staff.ts` — `pending→rejected` is the only legal source) · `422` invalid body
  (missing reasonCode, invalid code, or `other` with empty note).
- Ownership/branch-scope check BEFORE status check (matches `/complete` and the generic staff
  PATCH ordering).
- Compare-and-swap on `order.status === 'pending'` inside a `db.transaction()`, matching every
  prior staff/customer status-mutation route in this codebase.

**New: `PATCH /orders/:orderId/cancel`** (customer, `requireSession`)
- Body: `{ reasonCode?: string, note?: string }` — BOTH optional; zod: if `reasonCode` provided it
  must be one of the 6 locked customer codes, `note` may be provided independent of code (no
  "other requires note" rule for B3 — see SPEC B3.5, deliberately un-gated).
- No `status` field accepted — target is always `cancelled`.
- Responses: `200 { order: Order }` (customer serializer, matching `/complete`) · `403` not the
  caller's order (checked BEFORE status, matching `/complete`'s ordering rationale exactly — never
  let a 409-vs-403 split leak existence of someone else's order) · `404` malformed/missing id ·
  `409` order not currently `pending` (including the race case: staff's `accepted` transition
  commits first).
- Compare-and-swap on `order.status === 'pending'` inside `db.transaction()`.

**Extended: `PATCH /cart/items/:lineId`** (customer, existing route)
- Body becomes `{ quantity?: number, selectedOptions?: { optionId: string }[] }` — BOTH optional,
  at least one must be present (zod `.refine`); quantity-only behavior is UNCHANGED (existing
  callers pass `{quantity}` only and see zero behavior change — confirmed no consumer today sends
  `selectedOptions`).
- When `selectedOptions` is present: server re-validates every option against the line's EXISTING
  `product_id` (never the client — there is no `productId` field in this body, structurally
  preventing a product-swap), re-prices from live product+option rows (same logic as `POST
  /items`), and either (a) no collision → updates the line's `selected_options`/`unit_price` in
  place, keeping its existing `quantity` untouched by the edit itself (quantity edits, if also
  sent, apply independently — same as today), or (b) collision with a DIFFERENT existing line
  (same `product_id`, same resulting `optionKey()`) → deletes the edited line, adds its quantity
  onto the matching line, matching `POST /items`'s existing merge rule exactly (SPEC Constraint:
  "must reuse the existing merge-by-identical-option-set behavior").
- Ownership (`requireOwnedLine`) unchanged, still gates first.
- Responses: `200 { cart: ApiCart }` (existing shape, unchanged) · `400` invalid option for this
  product (mirrors `POST /items`'s existing `CartError(400, ...)`) · `403` not the caller's line ·
  `404` malformed/missing line id.

## Blast Radius

- **Risk class: HIGH** — order-state trust boundary. This explicitly includes: (1) the two NEW
  routes (B2 `PATCH /api/staff/orders/:orderId/reject`, B3 `PATCH /orders/:orderId/cancel`), AND
  (2) the 2-line additive edit to the EXISTING, LIVE `PATCH /api/staff/orders/:orderId` generic
  route (`staff.ts`) — this is a modification to a live trust-boundary route already handling
  `pending→cancelled`/`pending→rejected` transitions today, not merely new-route surface. Plus a
  separate, lower-risk cart-mutation trust boundary (B4 extended route). Per SPEC Constraints,
  every ownership check, illegal-transition rejection, collision/merge rule, and required-field
  gate marked HARD must be Fully-Automated with Known-Gap banned.
- Files touched: 1 new migration, 1 schema file, 2 route files (`orders.ts`, `staff.ts`) + 1
  extended route file (`cart.ts`), 1 state-machine file (comment-only), 1 serializer file, 2
  `packages/types` files + 1 new shared-reasons file, ~10 `apps/mobile` files (3 new hooks/
  components — including the new `use-reject-order.ts` mutation hook added by PVL cycle 2, ~7
  edited). No new package, no new external dependency, no new runtime surface.
- Zero changes to `POST /orders`, `GET /orders`, `GET /orders/:orderId`,
  `PATCH /orders/:orderId/complete`, `order-state-machine.ts`'s transition table, `POST
  /cart/items`, `DELETE /cart/items/:lineId` (quantity-only PATCH semantics preserved), the
  `OrderStatus` union, and every other `/api/staff/*` route not named above — confirmed by direct
  read this pass, matching SPEC's explicit freeze list.
- High-risk evidence pack: **RECOMMENDED for B2+B3** (new customer/staff order-state mutation
  routes AND the existing generic staff PATCH route's `reason_actor='staff'` stamp edit — see the
  widened scope above — following `customer-mark-picked-up`/STAFF-003 precedent). **NOT
  recommended standalone for B4** (extends an existing, already-covered route; no new trust
  boundary — ownership gate is reused verbatim, not introduced). VALIDATE's final call: **YES,
  required before finalize/PR** — confirmed this pass, matching the ADM-011/ADM-012 precedent for
  new customer/staff-facing order-state mutation routes.

## Cross-Plan Coordination Note

A sibling active plan, `process/features/pickup-branches/active/closed-branch-order-gate_22-07-26/`,
also edits `packages/api/src/routes/orders.ts` — its edits live in the `POST /orders`
branch-validation block (~lines 126-135); this plan's edits are near line 635+ (`PATCH
/:orderId/complete`'s neighborhood, where the new `PATCH /:orderId/cancel` is added). There is no
line-level collision today, but both plans touch the same file, so parallel EXECUTE carries a
real same-file merge/staleness risk. **Recommendation:** either (a) serialize EXECUTE for these two
plans relative to each other (run one to completion, `git pull`/re-`Read` `orders.ts`, then run the
other), or, if run in parallel, (b) each EXECUTE pass must re-`Read` `orders.ts` immediately before
editing to confirm no line-number drift from the other plan's concurrent changes.

**Re-confirmed this VALIDATE pass (cycle 3 — corrects a stale claim from cycle 2):**
`closed-branch-order-gate_22-07-26`'s status has ADVANCED since this plan's cycle-2 read — it is
now **Gate: PASS (its own cycle 2), explicitly "Ready for EXECUTE"** (its plan text literally says
"Say `ENTER EXECUTE MODE` against this plan to begin implementation"), NOT "Gate: BLOCKED" as this
plan's prior text stated. Its Verified Facts independently confirm `orders.ts:126-135`/`L63`/
`L564-570` as its exact target block (`OrderError` class, `is_accepting_pickup` check, catch
handler) — direct read of the CURRENT live `orders.ts` this cycle confirms the sibling's edits have
NOT yet landed (no `NOT_ACCEPTING_PICKUP` reason code present today), so there is still zero actual
line/symbol overlap with this plan's `PATCH /:orderId/complete`-neighborhood edits at L635+. **What
changed: the collision risk is no longer hypothetical-for-later — the sibling could enter EXECUTE
in the same session as this plan, any time from now on.** The mitigation is unchanged (re-grep
before editing; both plans' own checklist steps are already symbolic/position-relative — "insert
after `/complete`'s registration", "grep for `is_accepting_pickup`" — not hardcoded-line-number
reliant, so each tolerates the other landing first), but its priority is elevated from
informational to active.

## Verification Log (facts confirmed by direct read during this PLAN pass — corrects/confirms inherited claims)

- `PATCH /orders/:orderId/complete` is LIVE at `packages/api/src/routes/orders.ts:635-701`
  (confirmed exact line range; SPEC's `:635` reference is accurate). Registered before `GET
  /:orderId` (line ~721) as SPEC states.
- `PATCH /api/staff/orders/:orderId` is at `packages/api/src/routes/staff.ts:280` (not the SPEC's
  cited `:279` — off-by-one, corrected here; harmless, does not change design).
- `order-state-machine.ts` transition table confirmed exact: `pending→{accepted,rejected,
  cancelled}`. No `rejected_at` timestamp column exists (confirmed — only `accepted_at,
  ready_at, completed_at, cancelled_at`); B2's route does not need one (status alone marks
  terminal, matching the existing `rejected` handling comment at staff.ts's patch-building step).
- `orders` schema (`packages/api/src/db/schema/orders.ts:23-40`) confirmed to have no reason/note/
  actor column — new migration surface is genuinely additive.
- Migration head confirmed: `packages/api/drizzle/0021_add_notifications_user_created_idx.sql` is
  the latest file on disk (ls confirmed) — new migration must be `0022_*`.
- `cart.ts`'s merge-by-identical-option-set logic confirmed at lines ~171-229 (`optionKey()` at
  line ~110, `POST /items` handler ~148-232, existing `PATCH /items/:lineId` at ~240-265,
  `requireOwnedLine` at ~119-124). SPEC's cited line range (171-229) is accurate.
- `serializeStaffOrderDetail`/`serializeStaffOrderSummary` confirmed at
  `serializers.ts:788`/`:818`; `AdminOrderSummary`/`AdminOrderDetail` interfaces at `:1139`/`:1149`
  spread `StaffOrderSummary`/`StaffOrderDetail` verbatim at `:1171`/`:1195` — SPEC's "spread" claim
  and approximate line numbers (1161-1200) are confirmed accurate (actual: 1139-1195+).
  **Correction to plan design implication:** because `AdminOrderSummary extends StaffOrderSummary`
  and `AdminOrderDetail extends StaffOrderDetail` at the TYPE level (not just the serializer
  function spreading values), the new `reasonCode`/`reasonNote`/`reasonActor` fields MUST be added
  to `StaffOrderSummary`/`StaffOrderDetail` in `packages/types/src/staff.ts` (confirmed at lines
  35/63) for the admin interfaces to type-check with zero additional admin-side edits, exactly as
  SPEC Constraints requires.
- **Correction (PVL cycle 1 supplement, re-confirmed by direct read this VALIDATE pass):** `Order`
  (the client-facing type consumers import) is declared at `packages/types/src/order.ts:30`.
  `ApiOrder` is a SEPARATE, LOCALLY-DECLARED interface inside
  `packages/api/src/routes/lib/serializers.ts:275` — this repo deliberately declares boundary wire
  types locally in `serializers.ts` rather than importing them from `packages/types` (the same
  convention already used for `ApiBranch`). Both interfaces must be widened with the 3 new fields —
  they are two different types in two different packages, not one type under two names. See the
  corrected Touchpoints rows and Implementation Checklist step 5.
- **Correction (PVL cycle 1 supplement, re-confirmed by direct read this VALIDATE pass):**
  `notifyCustomer` (`staff.ts:70`) is a bare, module-private `async function notifyCustomer(...)` —
  it is NOT exported and cannot be imported from `orders.ts`. It is a thin wrapper over the
  exported `dispatchOrderNotification(order, event)`
  (`packages/api/src/routes/lib/notification-dispatch.ts:94`, `event: OrderNotificationEvent` at
  line 96). `OrderNotificationEvent` already includes `'cancelled'` (confirmed at
  `notification-dispatch.ts:21`) — no type widening needed, only the import target and call site
  were wrong. See the corrected Implementation Checklist step 10.
- **Correction (PVL cycle 1 supplement, re-confirmed by direct read this VALIDATE pass):**
  `apps/mobile/src/app/(tabs)/product/index.tsx`'s `handleAdd` (line 123, exact) contains
  branch-switch-confirm logic: `isSwitchingBranch = cart.items.length > 0 && cart.pickupBranchId
  !== selectedBranch.id` (line 138, exact) → if true, opens a `pendingSwitch` confirm dialog
  instead of adding; on confirm, calls `clearCart()` (line 162, exact) THEN adds the new item. An
  edited cart line is, by construction, already in the cart's current branch — reusing
  `handleAdd`'s structure for the edit-save path risks either a nonsensical "switch branches?"
  prompt mid-edit, or (worse) an accidental `clearCart()` wiping the entire cart while the user
  believed they were editing one line. See the corrected Implementation Checklist step 18 and the
  new B4 acceptance note below.
- `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx`: Reject button at line 104-108 (exact,
  re-confirmed) calls `confirmThenTransition('rejected', 'Reject')` via a themed `ConfirmDialog`
  (yes/no only, imported from `@jojopotato/ui` at line 9) — confirmed no text/reason input exists
  today, exactly as SPEC states. **No `(staff)/components/` shared folder currently exists**
  (confirmed by directory listing this pass) — `order-detail/` is the only subfolder under
  `(staff)/`; `RejectReasonDialog` should be co-located near `order-detail/[orderId].tsx` unless
  EXECUTE creates a new shared components dir.
- Customer order tracking screen is `apps/mobile/src/app/(tabs)/tracking/index.tsx` (not a
  `[orderId].tsx` dynamic route — it reads `orderId` via `useLocalSearchParams`). Uses
  `useOrderQuery` (poll) + `useCompleteOrder` (mutation) as its pattern —
  `apps/mobile/src/features/orders/hooks/use-complete-order.ts` confirmed at 39 lines, the exact
  mutation-hook shape (invalidate `['order', orderId]` + `['orders','history']` on success) B3's
  `use-cancel-order.ts` must mirror.
- `completeOrder()` in `apps/mobile/src/features/orders/lib/api-client.ts:46-50` confirmed as the
  exact `apiRequest` pattern (body-less PATCH) `cancelOrder()` should follow, except cancelOrder's
  body carries the optional `{reasonCode, note}`.
- `apps/mobile/src/features/staff/lib/staff-api.ts` confirmed to use a `staffFetch(path, init)`
  wrapper (line 29) already used by the existing `patchStaffOrderStatus`-equivalent call at line
  112 — `patchStaffOrderReject` should follow the identical wrapper pattern.
- **NEW finding this VALIDATE pass (V2 Layer 2, PVL cycle 2):** `apps/mobile/src/features/staff/
  hooks/use-update-order-status.ts` confirmed to invalidate 3 keys on success —
  `['staff','orders']`, `['staff','order',orderId]` (note: `use-staff-order-detail.ts`'s actual
  query key is `['staff','orders',orderId]`, plural — the singular `'order'` invalidation is a
  harmless pre-existing no-op, covered anyway by the broader `['staff','orders']` prefix-match
  invalidation), `['staff','completed']`. `useStaffOrderDetail` (confirmed, `use-staff-order-
  detail.ts`) has no polling and no focus-based refetch; the global `queryClient`
  (`apps/mobile/src/lib/query-client.ts`) pins `staleTime: 30_000`. **The plan's original B2
  mobile-wiring steps (13-14) never created an equivalent invalidating mutation hook for
  `patchStaffOrderReject`** — see Implementation Checklist step 14 (new) for the fix.
- **NEW finding this VALIDATE pass (V2 Layer 2, PVL cycle 2):** SPEC's B3.9 acceptance criterion
  states verbatim: "staff see the order as cancelled with the reason (if any) visible." SPEC's B2
  Flow diagram's final step states: "Customer sees 'Rejected' + the reason." Neither the original
  Implementation Checklist nor the Touchpoints table contained any step that renders
  `reasonCode`/`reasonNote` on any screen — the API/serializer plumbing (B2.6) proves the fields
  reach the wire, but nothing displays them. See Implementation Checklist step 13b (new) and the
  SPEC-ambiguity resolution below.
- **SPEC-ambiguity resolution (this VALIDATE pass):** SPEC's "What The User Wants" section commits
  only to staff+admin visibility of the reject reason ("visible on the order afterward, to staff
  ... and, by composition, to the admin dashboard's order view"); its Flow diagram separately shows
  a customer-facing reason display. Per SPEC's own drafting convention (the prose "What The User
  Wants" section is the locked behavioral contract; flow diagrams are illustrative, not additive
  requirements — consistent with how B3's flow diagram omits several already-locked Constraints
  details without those being read as scope cuts), this plan resolves the ambiguity by building the
  narrower, explicitly-committed surface (staff order-detail screen shows the reason for
  rejected/cancelled orders — satisfies B2.6 and B3.9 unambiguously) and does NOT add reason display
  to the customer tracking screen this pass. This is recorded as a plan decision, not a silent
  guess — if a future session wants customer-facing reason display, it is a small additive
  follow-up, not a re-open of this decision.

## Migration Design (`0022_*.sql`)

```sql
ALTER TABLE "orders" ADD COLUMN "reason_code" varchar(32);
ALTER TABLE "orders" ADD COLUMN "reason_note" text;
ALTER TABLE "orders" ADD COLUMN "reason_actor" varchar(8);
-- reason_actor ∈ {'staff','customer'} enforced app-layer (not a DB CHECK — matches this
-- repo's existing convention of app-layer enum enforcement for narrow lookup columns).
-- NULL reason_actor means: this order reached a terminal cancelled/rejected state BEFORE
-- this migration landed (a historical marker, never a live ambiguity — every code path that
-- can write cancelled/rejected AFTER this migration stamps 'staff' or 'customer'; see
-- order-reasons-cart-edit_PLAN_22-07-26.md Decision Summary).
-- NOTE: B3's customer-cancel window is pending-only (see SPEC Out of Scope). If this window is
-- ever widened to permit cancelling an 'accepted' order, re-verify reason_actor is still stamped
-- on every code path that can reach 'cancelled' from a wider source status.
```

Run `drizzle-kit generate` to produce the real migration + snapshot rather than hand-authoring the
SQL verbatim above — the block is the CONTENT contract EXECUTE must match, not a literal file to
copy (this repo's drizzle setup expects generated snapshots in `drizzle/meta/`).

## Shared Reason Lookup (`packages/types/src/order-reasons.ts`, new)

```ts
export const STAFF_REJECT_REASONS = [
  { code: 'out_of_stock', label: 'Item(s) out of stock' },
  { code: 'branch_busy', label: 'Branch too busy / at capacity' },
  { code: 'outside_hours', label: 'Outside service hours / closing soon' },
  { code: 'payment_issue', label: 'Payment issue' },
  { code: 'customer_requested', label: 'Customer requested' },
  { code: 'other', label: 'Other' },
] as const;
export type StaffRejectReasonCode = (typeof STAFF_REJECT_REASONS)[number]['code'];

export const CUSTOMER_CANCEL_REASONS = [
  { code: 'ordered_by_mistake', label: 'Ordered by mistake' },
  { code: 'changed_my_mind', label: 'Changed my mind' },
  { code: 'wrong_item_options', label: 'Wrong item or options' },
  { code: 'wrong_branch', label: 'Wrong branch' },
  { code: 'taking_too_long', label: 'Taking too long' },
  { code: 'other', label: 'Other' },
] as const;
export type CustomerCancelReasonCode = (typeof CUSTOMER_CANCEL_REASONS)[number]['code'];
```

Both `packages/api` (zod enum validation, importing the `code` values) and `apps/mobile` (dialog
option lists, importing the `label` values) import from this single module — a copy wording change
never touches server validation or vice versa.

## Implementation Checklist

1. Run `drizzle-kit generate` against a schema edit adding `reason_code varchar(32)`,
   `reason_note text`, `reason_actor varchar(8)` (all nullable) to
   `packages/api/src/db/schema/orders.ts`; confirm output filename is `0022_*` and the generated
   SQL contains only 3 `ADD COLUMN` statements (additive-only, per repo convention).
2. Add the file-header comment block from `## Migration Design` above (NULL semantics + the
   forward-widening cross-reference note) to the generated migration file.
2b. **(NEW — PVL cycle 2 fix, closes a Touchpoints/Checklist mismatch.)** Add the verbatim
   cross-reference comment from the Decision Summary's "Cross-reference comment" block to
   `packages/api/src/routes/lib/order-state-machine.ts`'s file header (above or alongside the
   existing STAFF-003 doc comment). Comment-only — no transition-table change.
3. Create `packages/types/src/order-reasons.ts` with `STAFF_REJECT_REASONS`/
   `CUSTOMER_CANCEL_REASONS` exactly as specified above; export from `packages/types/src/index.ts`.
4. Add `reasonCode: string | null`, `reasonNote: string | null`,
   `reasonActor: 'staff' | 'customer' | null` to `StaffOrderSummary` (staff.ts:35) and
   `StaffOrderDetail` (staff.ts:63) in `packages/types/src/staff.ts`.
5. **Two separate types, two separate files — do both:**
   5a. Add the same 3 fields (`reasonCode: string | null`, `reasonNote: string | null`,
       `reasonActor: 'staff' | 'customer' | null`) to the client-facing `Order` interface in
       `packages/types/src/order.ts` (confirmed at line 30 — this plan's original text incorrectly
       called this `ApiOrder`; the correct name in this file is `Order`).
   5b. SEPARATELY, add the same 3 fields to the server-side `ApiOrder` interface declared locally
       inside `packages/api/src/routes/lib/serializers.ts` (confirmed at line 275 — this is a
       DIFFERENT interface in a DIFFERENT package, matching this repo's existing convention of
       declaring wire types locally in `serializers.ts` rather than importing from
       `packages/types`, same as `ApiBranch`). This matters because `serializeOrder()`
       (`serializers.ts:451`) returns an object literal typed against `ApiOrder` — if the 3 new
       fields are added to the return value without first widening the local `ApiOrder` interface,
       TypeScript's excess-property check on the object literal fails the build.
6. Update `serializeStaffOrderSummary`/`serializeStaffOrderDetail`
   (`packages/api/src/routes/lib/serializers.ts:788`/`:818`) to map `order.reason_code`→
   `reasonCode`, `order.reason_note`→`reasonNote`, `order.reason_actor`→`reasonActor`. Confirm
   `AdminOrderSummary`/`AdminOrderDetail` (`:1139`/`:1149`) inherit with ZERO additional edits
   (type-level `extends` + the existing spread at `:1171`/`:1195` — verify by running `tsc
   --noEmit` after this step, no admin-serializer edit expected).
7. Add the customer-facing serializer equivalent: update `serializeOrder()`
   (`packages/api/src/routes/lib/serializers.ts:451`, returning the `ApiOrder` type widened in step
   5b) to map `order.reason_code`→`reasonCode`, `order.reason_note`→`reasonNote`,
   `order.reason_actor`→`reasonActor` — this must also surface the 3 fields for the tracking
   screen to render B2/B3's reason.
8. **B2 — staff reject route.** Add `PATCH /orders/:orderId/reject` to `staff.ts`, placed BEFORE
   the existing generic `PATCH /orders/:orderId` (same registration-order rationale as
   `/complete` vs `GET /:orderId` — more specific path must win). Body schema:
   `z.object({ reasonCode: z.enum([...STAFF_REJECT_REASONS codes]), note: z.string().optional() })`
   with a `.refine()` requiring non-empty `note` when `reasonCode === 'other'`. Follow the exact
   ownership→status→CAS pattern from `/complete` (branch-scope check first via
   `resolveBranchScope`, then order lookup, then branch-match 403, then `order.status !== 'pending'`
   → 409, then transactional CAS update setting `status: 'rejected', reason_code, reason_note:
   note ?? null, reason_actor: 'staff', updated_at`). Return `{ order: StaffOrderDetail }` via
   `serializeStaffOrderDetail`.
9. **B2 — staff.ts generic PATCH stamp.** In the existing `PATCH /orders/:orderId` handler's
   patch-building block (staff.ts:~320-335), add: when `targetStatus === 'rejected'` OR
   `targetStatus === 'cancelled'`, additionally set `patch.reason_actor = 'staff'` (no code/note —
   this route has no reason input). This is the 2-line additive change from the Decision Summary.
   Note: no existing `targetStatus === 'rejected'` branch exists in the patch-building block today
   (confirmed by direct read) — this step adds a NEW branch for `'rejected'` alongside extending
   the existing `'cancelled'` branch.
10. **B3 — customer cancel route.** Add `PATCH /orders/:orderId/cancel` to `orders.ts`, registered
    immediately after `/complete` (same file section, same registration-before-`GET /:orderId`
    requirement). Body schema: `z.object({ reasonCode: z.enum([...CUSTOMER_CANCEL_REASONS
    codes]).optional(), note: z.string().optional() })` — no `.refine()`, both fields fully
    optional per B3.5. Follow `/complete`'s exact ownership-before-status pattern (malformed-id →
    404 first, then order lookup → 404, then `order.user_id !== userId` → 403 BEFORE any status
    check, then `order.status !== 'pending'` → 409, then transactional CAS update setting
    `status: 'cancelled', cancelled_at: now, reason_code: reasonCode ?? null, reason_note: note ??
    null, reason_actor: 'customer', updated_at`). Return `{ order: Order }` via the customer
    serializer. After commit, re-select the updated row (matching `/complete`'s `refreshedOrder`
    pattern) and call `dispatchOrderNotification(refreshedOrder, 'cancelled')`
    (import from `packages/api/src/routes/lib/notification-dispatch.ts` — NOT `notifyCustomer`,
    which is a bare, non-exported, module-private helper inside `staff.ts` and cannot be imported
    from `orders.ts`; `dispatchOrderNotification` is the exported function `notifyCustomer` itself
    wraps). `OrderNotificationEvent` already includes `'cancelled'` — no type widening needed.
11. **B4 — extract shared cart option-validate+price+merge helper.** In `cart.ts`, extract the
    option-validation, live-repricing, and `optionKey()`-collision-merge logic currently inline in
    `POST /items` (lines ~171-229) into a shared function
    `resolveOptionSelectionAndMerge(tx, product, selectedOptions)` returning
    `{ unitPriceCents, selectedSnapshot }`, reused by both `POST /items` (unchanged behavior) and
    the extended `PATCH /items/:lineId`.
12. **B4 — extend `PATCH /items/:lineId`.** Change `updateQuantitySchema` (currently
    `z.object({ quantity: z.number().int() })` — `quantity` is REQUIRED today, confirmed by direct
    read) to
    `z.object({ quantity: z.number().int().optional(), selectedOptions:
    z.array(z.object({ optionId: z.string().uuid() })).optional() }).refine(b => b.quantity !==
    undefined || b.selectedOptions !== undefined, 'at least one field required')`. Inside the
    existing transaction (after `requireOwnedLine`): if `selectedOptions` present, load the line's
    OWN `product_id` (never client-sent), call the shared helper from step 11, compute the new
    `optionKey()`, and check for a DIFFERENT existing line (same `cart_id`, same `product_id`,
    same new option key, `id !== lineId`) — collision found → delete the edited line, `UPDATE`
    the matching line's `quantity = matching.quantity + editedLine.quantity` (using the edited
    line's CURRENT quantity, or the newly-requested quantity if `quantity` was also sent in the
    same PATCH), no collision → `UPDATE` the edited line's `selected_options`/`unit_price` in
    place. If `quantity` present (with or without `selectedOptions`), apply the existing
    `quantity <= 0` → delete / else → set logic unchanged.
13. **B2 mobile — reason dialog.** Create `RejectReasonDialog` (new file, co-located near
    `order-detail/[orderId].tsx` — confirmed no `(staff)/components/` dir exists today, see
    `## Verification Log`) rendering `STAFF_REJECT_REASONS` as a preset picker (radio/segmented,
    matching existing `@jojopotato/ui` primitives) + an optional (required-when-`other`) text
    input. Replace the Reject button's `confirmThenTransition('rejected', 'Reject')` call in
    `order-detail/[orderId].tsx:104-108` with opening this dialog; on submit call new
    `useRejectOrder()` mutation (step 14) with `(orderId, reasonCode, note)`.
13b. **(NEW — PVL cycle 2 fix, closes the missing reason-display gap.)** In
    `order-detail/[orderId].tsx`, when `order.status === 'rejected'` or `order.status ===
    'cancelled'` and `order.reasonCode` is non-null, render a small reason block (label via
    `STAFF_REJECT_REASONS`/`CUSTOMER_CANCEL_REASONS` code→label lookup keyed off
    `order.reasonActor`, plus `order.reasonNote` if present) above or below the existing order
    status/items display. This closes B3.9's explicit requirement ("staff see the order as
    cancelled with the reason (if any) visible") and B2.6's staff-order-detail half. Per the
    SPEC-ambiguity resolution in `## Verification Log`, this plan does NOT add reason display to
    the customer tracking screen this pass.
14. **(NEW — PVL cycle 2 fix, closes the missing cache-invalidation gap.)** Create
    `apps/mobile/src/features/staff/hooks/use-reject-order.ts` — a `useMutation` wrapping
    `patchStaffOrderReject(orderId, reasonCode, note)`, invalidating the same 3 query keys
    `useUpdateOrderStatus` invalidates on success (`['staff','orders']`, `['staff','order',
    orderId]`, `['staff','completed']`) — see `## Verification Log`'s new finding for why this is
    required (no polling/focus-refetch on the staff order-detail screen; without invalidation, a
    successful reject would not visibly update the screen for up to the 30s global `staleTime`).
    Wire this hook into step 13's dialog submit handler instead of a bare `patchStaffOrderReject`
    call.
15. **(renumbered from original step 14) B2 mobile — API client.** Add
    `patchStaffOrderReject(orderId, reasonCode, note?)` to `staff-api.ts` following the exact
    `staffFetch(path, init)` pattern at line 112.
16. **(renumbered from original step 15) B3 mobile — cancel action + dialog.** Add a "Cancel
    order" `Button` to `tracking/index.tsx`, rendered only when `order.status === 'pending'`
    (derive from the existing `useOrderQuery` result already on that screen). Tapping opens a
    confirm dialog with an optional preset-or-freetext reason field (may render
    `CUSTOMER_CANCEL_REASONS` as a picker plus a free-text fallback, or a single optional text
    input if the picker is deferred — confirm exact UI shape against `@jojopotato/ui` primitives
    available; SPEC only requires "pick a reason from a short preset list, or type their own", not
    a specific component).
17. **(renumbered from original step 16) B3 mobile — API client + hook.** Add
    `cancelOrder(orderId, reasonCode?, note?)` to
    `apps/mobile/src/features/orders/lib/api-client.ts` mirroring `completeOrder()` at lines
    46-50 (body-less becomes body-carrying: `{method: 'PATCH', body: {reasonCode, note}}`). Create
    `apps/mobile/src/features/orders/hooks/use-cancel-order.ts` byte-mirroring
    `use-complete-order.ts` (same 2 invalidation keys, same `UseMutationResult<Order, Error,
    {orderId, reasonCode?, note?}>` shape, same doc-comment style explaining the 409-vs-poll
    interaction).
18. **(renumbered from original step 17) B4 mobile — cart tap-to-edit.** In
    `apps/mobile/src/app/(tabs)/cart/index.tsx`, add an `onPress` to each `<CartItem>` row
    navigating to Product Details (`/(tabs)/product?productId=...&lineId=...` or equivalent
    typed-route param shape — confirm exact route param contract via `Read` on `product/index.tsx`
    at EXECUTE start) passing the line's current `productId`, `selectedOptions`, and `quantity` as
    prefill.
19. **(renumbered from original step 18) B4 mobile — Product Details prefill + save-as-edit.** In
    `apps/mobile/src/app/(tabs)/product/index.tsx`, accept the optional prefill params from step
    18; when present, initialize the option-selector state from them instead of empty defaults.
    **The edit-save path must be a DISTINCT handler, not a reuse of `handleAdd` (confirmed at
    line 123, exact).** `handleAdd` contains branch-switch-confirm logic (`isSwitchingBranch =
    cart.items.length > 0 && cart.pickupBranchId !== selectedBranch.id` at line 138, exact → opens
    a `pendingSwitch` dialog → on confirm, `clearCart()` at line 162, exact, THEN adds). An edited
    line is, by construction, already in the cart's current branch, so the edit-save handler must
    SKIP the `isSwitchingBranch` check, the `setPendingSwitch` dialog, and the `clearCart()` call
    entirely — it must never trigger a branch-switch prompt and must never clear the cart. On
    Save: if a `lineId` param is present, call this new distinct handler, which calls the cart-hook
    `editCartLine(lineId, selectedOptions)` mutation; if `lineId` is absent, existing `handleAdd`
    behavior is completely unchanged. Back-navigation without Save performs no mutation (existing
    screen behavior — confirm no auto-save-on-unmount side effect exists before assuming this is a
    no-op). **Acceptance note: editing a cart line must never clear the cart** — add this as an
    explicit assertion in the B4.5 test gate (see Verification Evidence).
20. **(renumbered from original step 19) B4 mobile — cart hook.** (**PVL cycle 3 fix — original
    text under-specified this step; closes a real EXECUTE-breaker.**) Add `editCartLine` mutation
    to `apps/mobile/src/features/cart/hooks/use-cart.ts` (confirmed live path this pass), following
    the file's own `useCartMutation<V>(cartKey, mutationFn, optimistic)` factory (confirmed live at
    lines 175-197 — every existing mutation in this file, e.g. `updateMutate`/`removeMutate`/
    `setBranchMutate`, is built this way; `optimistic` is a REQUIRED third argument, not optional —
    omitting it does not compile). This requires TWO new pieces neither of which exists yet:
    (a) a new `cart-api.ts` client function (`updateCartItemOptions(lineId, selectedOptions)` — see
    the new Touchpoints row) since `updateCartItemQuantity` (line 71) only accepts `{quantity}`;
    (b) a matching `optimisticEditLine(cart, vars)` function (mirroring `optimisticSetQuantity`'s
    shape) returning a best-effort client-side guess at the edited line's new state. The optimistic
    guess does NOT need to predict a server-side collision-merge correctly — `useCartMutation`'s
    shared `onSettled` already invalidates `cartKey` unconditionally, so the authoritative
    post-merge cart replaces the optimistic guess within one round-trip regardless; this is a UX
    smoothing step, not a correctness dependency. Wire the resulting mutate function into
    `CartSessionState`'s exposed API following the existing `updateQuantity`/`removeItem` callback
    pattern.
21. **(renumbered from original step 20)** Run `pnpm --filter @jojopotato/api db:migrate` against
    the local dev DB to apply the new migration before running any `packages/api` tests.
22. **(renumbered from original step 21)** Write/run all Fully-Automated `packages/api` test gates
    (see Verification Evidence) — TDD-red stubs first per the Test Gates section, then implement
    until green.
23. **(renumbered from original step 22)** Write/run all Fully-Automated `apps/mobile` jest gates
    (see Verification Evidence), including the new step 13b/14 coverage (reason-display render
    assertion + reject-mutation cache-invalidation assertion).
24. **(renumbered from original step 23)** Run the full verification command sequence (see
    Verification Evidence) and confirm all green before declaring CODE DONE.
25. **(renumbered from original step 24)** Update `process/context/all-context.md`'s ordering-cart
    implementation-state section is UPDATE-PROCESS's job, not this plan's — do not touch it during
    EXECUTE.

## Acceptance Criteria

This plan implements SPEC acceptance criteria B2.1-B2.8, B3.1-B3.9, B4.1-B4.6 verbatim
(see the locked SPEC's Acceptance Criteria tables) plus the freeze-list regression
requirement. The Verification Evidence table below maps each SPEC criterion ID to its
exact proving gate and strategy -- treat that table as this plan's Acceptance Criteria
in testable-outcome form.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `apps/mobile` jest — reject submit disabled with no reason selected | Fully-Automated | B2.1 |
| `packages/api` vitest — `PATCH .../reject` with no `reasonCode` in body → 422, order unchanged | Fully-Automated **(HARD, Known-Gap BANNED)** | B2.2 |
| `packages/api` vitest — `PATCH .../reject` with valid code + note → 200, `status='rejected'`, `reason_code`/`reason_note` persisted, `reason_actor='staff'` | Fully-Automated | B2.3 |
| `packages/api` vitest — `PATCH .../reject` on an order outside staff's assigned branch → 403, order unchanged | Fully-Automated **(HARD, Known-Gap BANNED)** | B2.4 |
| `packages/api` vitest — `PATCH .../reject` on a non-`pending` order → 409, order + any prior reason unchanged | Fully-Automated **(HARD, Known-Gap BANNED)** | B2.5 |
| `packages/api` vitest — staff detail response + admin detail response both expose `reasonCode`/`reasonNote`/`reasonActor` after a reject, admin serializer requires zero extra code (field-presence assertion on both serializer outputs from one shared fixture) | Fully-Automated | B2.6 |
| `apps/mobile` jest (NEW — step 14) — `useRejectOrder()` mutation invalidates `['staff','orders']`/`['staff','order',orderId]`/`['staff','completed']` on success (mirrors the existing `useUpdateOrderStatus` invalidation test, if one exists — else new); `apps/mobile` jest (NEW — step 13b) — order-detail screen renders the reason block when `status` is `rejected`/`cancelled` and `reasonCode` is non-null, and renders nothing when `reasonCode` is null | Fully-Automated | (supports B2.7's prerequisite wiring) |
| Agent-Probe — on-device: open pending order, tap Reject, see picker, blocked with no reason, submit with reason, see Rejected AND the reason text on the same screen without a manual refresh | Agent-Probe | B2.7 |
| `packages/api` vitest — `PATCH .../reject` with `reasonCode='other'` and empty/missing `note` → 422; `apps/mobile` jest — Other-selected submit stays disabled until note is non-empty | Fully-Automated **(HARD, Known-Gap BANNED)** | B2.8 |
| `packages/api` vitest — `PATCH /orders/:orderId/cancel` on caller's own `pending` order → 200, `status='cancelled'`, `cancelled_at` set | Fully-Automated | B3.1 |
| `packages/api` vitest — `PATCH .../cancel` on another user's order → 403, order unchanged | Fully-Automated **(HARD, Known-Gap BANNED)** | B3.2 |
| `packages/api` vitest — `PATCH .../cancel` parameterized over all 7 non-`pending` statuses → 409 each, order unchanged | Fully-Automated **(HARD, Known-Gap BANNED)** | B3.3 |
| `packages/api` vitest — **(PVL cycle 3 fix — original technique was vacuous, see note below)** genuine concurrent race: `Promise.all([staffAcceptRequest, customerCancelRequest])` fired at the same `pending` order, mirroring the existing `orders.test.ts` AC6 same-row-CAS pattern (two real concurrent requests, not a sequential pre-flip simulation); assert exactly one `{200,409}` pair and a single consistent final state (`accepted` XOR `cancelled`, never both, never neither) | Fully-Automated **(HARD, Known-Gap BANNED)** | B3.4 |
| `packages/api` vitest — cancel with no reason → 200, `reason_code`/`reason_note` null; cancel with preset code → stored verbatim; cancel with free-text note only → stored verbatim | Fully-Automated | B3.5 |
| `packages/api` vitest — cancel on nonexistent uuid → 404; cancel on malformed (non-uuid) id → 404 | Fully-Automated | B3.6 |
| `apps/mobile` jest — "Cancel order" button renders iff `status === 'pending'`, absent for all other statuses | Fully-Automated | B3.7 |
| `apps/mobile` jest — tapping Cancel order opens confirm dialog before any network call fires; dismiss triggers zero calls | Fully-Automated | B3.8 |
| `apps/mobile` jest (NEW — step 13b) — staff order-detail screen renders the customer's cancel reason (if any) when `status === 'cancelled'` and `reasonActor === 'customer'` | Fully-Automated | (supports B3.9's prerequisite wiring) |
| Agent-Probe — on-device: cancel with and without reason, tracking screen reflects cancelled + stops polling, staff sees cancelled + reason | Agent-Probe | B3.9 |
| `apps/mobile` jest — tapping a cart line navigates to Product Details pre-filled with that line's flavor/add-ons/quantity | Fully-Automated | B4.1 |
| `packages/api` vitest — edit to a non-colliding option set replaces the line in place, one line, no duplicate, **AND a third, unrelated pre-existing line (different product) in the same cart is byte-identical before/after the edit (PVL cycle 3 fix — closes a "only the edited line was checked" test-design gap)** | Fully-Automated **(HARD, Known-Gap BANNED)** | B4.2 |
| `packages/api` vitest — edit that collides with an existing different line merges quantities, old line gone, exactly one line for that product+option combination afterward, **AND a fourth, unrelated pre-existing line (different product) in the same cart is byte-identical before/after the merge (PVL cycle 3 fix)** | Fully-Automated **(HARD, Known-Gap BANNED)** | B4.3 |
| `packages/api` vitest — edit attempt on a line owned by another user's cart → 403 (reuses `requireOwnedLine`) | Fully-Automated **(HARD, Known-Gap BANNED)** | B4.4 |
| `apps/mobile` jest — leaving prefilled Product Details without Save triggers zero cart mutation calls; SEPARATELY, saving an edit (`lineId` present) triggers zero `clearCart()` calls and never opens the branch-switch confirm dialog, even when the item's own branch happens to equal `selectedBranch` (regression lock for the corrected step 19 handler) | Fully-Automated | B4.5 |
| Agent-Probe — on-device: tap cart line, edit flavor, save, cart shows exactly one line with new selection (and correct merged quantity in the collision case), and the REST of the cart's other lines are still present (not cleared) | Agent-Probe | B4.6 |
| `packages/api` vitest — existing `POST /orders`, `GET /orders`, `GET /orders/:orderId`, `PATCH /orders/:orderId/complete`, all pre-existing staff PATCH tests, `POST /cart/items`, `DELETE /cart/items/:lineId`, existing `PATCH /cart/items/:lineId` quantity-only tests — full regression run, 0 new failures | Fully-Automated | Freeze list (SPEC Constraints) |

**Full verification command sequence:**
```bash
docker compose up -d
pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/mobile test        # jest + vitest gates above
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/types typecheck    # confirmed present: packages/types/package.json:8 has "typecheck": "tsc --noEmit" — run unconditionally
pnpm format:check
```

**Dev-machine contingency (informational, from `process/context/tests/all-tests.md`):** if
`docker compose up -d` fails to bind port 5432, check for an already-running native
`postgresql` service before assuming Docker itself is broken — this repo's `packages/api` vitest
suites work equally well against a native instance once the `jojo` role/`jojopotato` DB exist.

**Non-vacuousness note (required per orchestrator instruction):** for every HARD row above, the
test must fail red if the corresponding guard is removed or weakened — e.g. B2.4's branch-
isolation test must fail if `order.branch_id !== branchId` check is deleted; B4.3's collision test
must fail if the merge branch is replaced with an unconditional insert; B3.4's race test must fail
if the CAS `WHERE status = currentStatus` clause is dropped. EXECUTE must confirm this by briefly
commenting out the guard and observing red before finalizing, for each `(HARD, Known-Gap BANNED)`
row — record this confirmation in the phase report, not just "test passes."

**(PVL cycle 3 additions — both close real vacuousness risks found this pass, not new requirements
for their own sake):**
- **B4.2/B4.3 seeding requirement:** both tests must seed the cart with at least 3 lines (the
  edited/colliding line(s) plus one unrelated line for a different product) so a bug that scopes
  the server's `UPDATE`/`DELETE` too broadly (e.g. accidentally touching the whole cart instead of
  the specific `lineId`) is caught. A cart containing only the 1-2 lines under test would not
  detect this class of regression — this is the same failure mode as the mobile-side `clearCart()`
  cart-wipe risk from PVL cycle 1 (Gap 3), one layer deeper (server-side line-scoping instead of
  client-side full-clear).
- **B3.4 concurrency requirement:** B3.4 MUST use genuinely concurrent requests (`Promise.all`),
  never a sequential "flip status via direct DB write, then call cancel" simulation. The cancel
  route's own pre-transaction `order.status !== 'pending'` explicit check (Public Contracts) would
  independently catch an already-flipped status and return 409 without ever reaching the
  transactional CAS `WHERE status='pending'` clause — so a sequential-flip test would still pass
  green even if that WHERE clause were deleted entirely. Only a true concurrent race exercises the
  CAS itself; this is the exact `orders.test.ts` AC6 technique (`Promise.all` of two real requests
  against the same row), already proven to work in this test runner.

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ordering-cart/active/order-reasons-cart-edit_22-07-26/order-reasons-cart-edit_PLAN_22-07-26.md`
2. **Last completed phase or step:** VALIDATE — PVL cycle 3, `Gate: PASS`. All 3 cycle-2 CONCERNs
   (Gaps 7-9) independently re-confirmed correctly closed against live source; 4 NEW findings this
   cycle (Gaps 10-13, all cheap/mechanical) were found AND fixed directly in this plan's text in the
   same pass — see `## Validate Contract`. No implementation has started.
3. **Validate-contract status:** written this pass — `Gate: PASS`. EXECUTE is authorized.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, the locked
   SPEC at
   `process/features/ordering-cart/active/order-reasons-cart-edit_22-07-26/order-reasons-cart-edit_SPEC_22-07-26.md`,
   both PVL iteration reports (001, 002), the sibling plan
   `process/features/pickup-branches/active/closed-branch-order-gate_22-07-26/` (coordination
   check — re-read this cycle, status has advanced to Gate: PASS/EXECUTE-ready, see the refreshed
   Cross-Plan Coordination Note), and direct reads of `orders.ts`, `staff.ts`, `cart.ts`,
   `order-state-machine.ts`, `serializers.ts` (ApiOrder + serializeOrder + serializeStaffOrderSummary/
   Detail + AdminOrderSummary/Detail spread), `staff.ts` (types), `order.ts` (types),
   `notification-dispatch.ts`, `use-complete-order.ts`, `use-update-order-status.ts`,
   `use-staff-order-detail.ts`, `query-client.ts`, `cart_items.ts` (schema), `cart-api.ts`,
   `use-cart.ts` (incl. the `useCartMutation` factory, lines 175-197), `api-client.ts`,
   `staff-api.ts`, `order-detail/[orderId].tsx`, `tracking/index.tsx`, `product/index.tsx`,
   `cart/index.tsx`, plus test-file scans of `orders.test.ts` (AC6 concurrent-race precedent),
   `cart.integration.test.ts`, `staff-order-status.integration.test.ts` (see `## Verification Log`
   for exact line numbers confirmed).
5. **Next step for a fresh agent picking up mid-execution:** say `ENTER EXECUTE MODE` against this
   plan. Steps 1-10 (migration + B2 + B3) must land together per `## Sequencing`; step 11 onward
   (B4) may run independently. Before editing `orders.ts`, re-read the refreshed `## Cross-Plan
   Coordination Note` — the `closed-branch-order-gate_22-07-26` sibling plan is now Gate: PASS and
   EXECUTE-ready, so re-grep before editing is an ACTIVE precaution, not a hypothetical one.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist steps complete, all Fully-Automated gates in
  Verification Evidence green, `packages/api` migration applied cleanly, zero regressions in the
  freeze-list regression row, all `(HARD, Known-Gap BANNED)` rows independently confirmed
  non-vacuous per the note above.
- **VERIFIED**: CODE DONE, plus all 3 Agent-Probe rows (B2.7, B3.9, B4.6) performed and passed by
  the user, plus the 5-artifact high-risk evidence pack reviewed for B2/B3 (confirmed required by
  this VALIDATE pass — see Blast Radius).
- Do not mark this plan `✅ VERIFIED` on automated-green alone. Task folder stays in `active/`
  until the Agent-Probe walkthroughs are performed, matching this repo's standing convention (see
  `customer-mark-picked-up`, STAFF-005, cart-persistence precedents in `all-context.md`).

## Validate Contract

Status: PASS
Date: 22-07-26
date: 2026-07-22
generated-by: outer-pvl
supersedes: 2026-07-22 (outer-pvl) — this is PVL cycle 3; cycle 2's CONDITIONAL contract is
superseded by this PASS contract, written the same day after a third, deeper full V1-V7 pass.

Parallel strategy: sequential (deep-review pass — no subagent-spawn tool available this session,
same constraint recorded by PVL cycles 1 and 2; the 5/7 signal score would normally call for
parallel Layer-1/Layer-2 fan-out, but a single-agent sequential deep-read with direct `Read`/`Grep`
verification of every touchpoint, every SPEC acceptance-criterion trace, and every test's
non-vacuity claim was substituted, matching both prior cycles' own recorded deviation)
Rationale: HIGH risk class (order-state trust boundary, B2/B3), 5+ blast-radius files, 3
independently-shippable trust-boundary mutations — signal score 5/7 would normally recommend
parallel subagents; ran sequential due to tool availability, flagged transparently (matches PVL
cycles 1-2's precedent, not a new deviation).

### Net Gate Derivation

**Layer 1 dimensions**

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

**Layer 2 sections**

| Layer 2 sections | Status |
|---|---|
| Cross-cutting: migration/types/serializers (`## Migration Design`, steps 1-7) | PASS — re-verified this cycle by direct read of `ApiOrder`/`Order`/`StaffOrderSummary`/`StaffOrderDetail`/`AdminOrderSummary`/`AdminOrderDetail`/`serializeOrder`/`serializeStaffOrderSummary`/`serializeStaffOrderDetail` at their exact confirmed line numbers; the admin-inherits-for-free claim is BOTH type-safe (`extends`) AND runtime-safe (object-literal spread of the staff serializer's return value) |
| B2 — staff reject (steps 8-9, 13-15) | PASS — Gaps 7/8/9 (cycle 2) re-confirmed correctly closed by direct read of `staff.ts`'s patch-building block and `order-detail/[orderId].tsx`; no new B2-specific gap found this cycle |
| B3 — customer cancel (step 10, 16-17) | PASS (fixed this cycle — see Gap 12 below; was CONCERN) — still mirrors `/complete` precedent exactly for ownership/CAS shape, invalidation wired correctly from the start; the ONE defect found this cycle was in the race test's PROVING TECHNIQUE, not the route design itself |
| B4 — cart line edit (steps 11-12, 18-20) | PASS (fixed this cycle — see Gaps 10-11 below; was PASS in cycle 2 but that was an incomplete check) — ownership/merge logic sound, mutation invalidation now fully specified incl. the required `useCartMutation` optimistic-function argument and the missing `cart-api.ts` client function |
| `order-state-machine.ts` comment-only edit (step 2b) | PASS — unchanged since cycle 2's fix, re-confirmed |
| Cross-Plan Coordination Note accuracy | PASS (fixed this cycle — see Gap 13 below; was silently stale) — sibling plan's status re-read and corrected |

**Totals: 0 FAILs / 0 CONCERNs / 7 PASSes**

**→ Net Gate: PASS**

### Findings

| Finding | Severity | Proposed fix |
|---|---|---|
| **[Gap 10 — NEW, real EXECUTE-breaker]** Step 20 (B4 mobile cart hook) told EXECUTE to add an `editCartLine` mutation to `use-cart.ts` "wrapping `PATCH /cart/items/:lineId`," but (a) no client-side API function accepting `selectedOptions` exists — `updateCartItemQuantity` (confirmed live, `cart-api.ts:71`) only accepts `{quantity}` — and (b) `use-cart.ts`'s own `useCartMutation<V>(cartKey, mutationFn, optimistic)` factory (confirmed live, lines 175-197, used by every OTHER mutation in the file) takes `optimistic` as a REQUIRED third argument the original step never mentioned. Following the step literally would either fail to compile or force EXECUTE to invent an unreviewed design mid-implementation. | CONCERN | **Applied this pass**: new Touchpoints row for `cart-api.ts` (new `updateCartItemOptions` client function); step 20 rewritten to name both missing pieces explicitly, including that the optimistic function's imprecision on a collision-merge is not a correctness risk (the shared `onSettled` invalidation self-corrects within one round-trip). |
| **[Gap 11 — NEW, real test-design gap]** B4.2/B4.3's Verification Evidence descriptions ("replaces the line in place, one line, no duplicate" / "old line gone, exactly one line... afterward") only describe the line(s) directly involved in the edit/collision — neither explicitly requires the test to assert that OTHER, unrelated pre-existing cart lines survive untouched. A test written narrowly (cart containing only the 1-2 lines under test) would pass even if the implementation scoped its `UPDATE`/`DELETE` too broadly (e.g. touching the whole cart instead of the specific `lineId`) — the same class of risk as PVL cycle 1's client-side `clearCart()` finding (Gap 3), one layer deeper. Explicitly requested by the orchestrator this cycle. | CONCERN | **Applied this pass**: both Verification Evidence rows amended to require a third/fourth unrelated line in the seeded cart, asserted byte-identical before/after; Non-vacuousness note extended with the explicit seeding requirement and rationale. |
| **[Gap 12 — NEW, real vacuousness defect on a HARD/Known-Gap-BANNED criterion]** B3.4's proving technique was described as "simulated via pre-committed status flip inside the test before the cancel CAS runs" — i.e. directly UPDATE the order's status to `accepted` via a raw DB write, THEN call the cancel route, expect 409. This does NOT exercise the transactional CAS at all: the cancel route's own design (Public Contracts, step 10) performs an explicit pre-transaction `order.status !== 'pending'` check BEFORE ever entering `db.transaction()` — a pre-flipped status is caught by that early check and returns 409 without the request ever reaching the `WHERE status='pending'` clause. Confirmed by direct read of the route's designed control flow: deleting the CAS `WHERE` clause entirely would NOT turn this specific test red, which is exactly the non-vacuousness failure the plan's own note (added at PVL cycle 1) explicitly warns against for this exact row. This ALSO makes B3.4 functionally redundant with B3.3's parameterized non-pending-status sweep (which already includes `accepted` as one of its 7 cases) — as originally described, B3.4 proved nothing B3.3 didn't already prove. | CONCERN | **Applied this pass**: B3.4's Verification Evidence row rewritten to require a genuinely concurrent `Promise.all([staffAcceptRequest, customerCancelRequest])` race against the same `pending` order — mirroring the EXISTING `orders.test.ts` AC6 pattern (`Promise.all` of two real requests against the same row, confirmed live at that file's mark-picked-up race test), asserting exactly one `{200,409}` pair and one consistent final state. Non-vacuousness note extended to state explicitly why the CAS clause can only be proven by a true concurrent race, not a sequential pre-flip. |
| **[Gap 13 — NEW, stale cross-plan documentation]** The Cross-Plan Coordination Note's "Re-confirmed this VALIDATE pass" paragraph (written during cycle 2) cited the sibling `closed-branch-order-gate_22-07-26` plan's status as "VALIDATE ran — Gate: BLOCKED." Direct read of that plan's CURRENT file this cycle shows its status has since advanced to **Gate: PASS (its own cycle 2), explicitly "Ready for EXECUTE"** — its own text literally instructs the next agent to say `ENTER EXECUTE MODE`. There is still zero actual line/symbol overlap in the live `orders.ts` (the sibling's edits have not yet landed, confirmed by direct read — no `NOT_ACCEPTING_PICKUP` reason code present today), so no FAIL results from this — but the same-file collision risk this plan already flags is no longer a "when it eventually validates" hypothetical; it is active starting now. | CONCERN | **Applied this pass**: the Coordination Note's status paragraph rewritten with the current sibling-plan state and an explicit "risk elevated from informational to active" statement. Mitigation (re-grep before editing; both plans' checklist steps are already position-relative, not line-number-reliant) is unchanged — this was a documentation-accuracy fix, not a design fix. |
| Gaps 7-9 (PVL cycle 2) | ✅ RESOLVED | Independently re-verified by direct `Read`/`Grep` against live source this pass — all 3 confirmed correctly closed: `use-reject-order.ts` invalidation design matches `useUpdateOrderStatus`'s 3-key pattern exactly (and the plan's own footnote about the singular/plural `['staff','order'\|'orders',orderId]` key mismatch being a harmless no-op was independently re-confirmed correct — react-query v5's default `invalidateQueries` is prefix/partial-match, not exact, so `['staff','orders']` DOES cover `['staff','orders',orderId]`); step 13b's reason-block placement is structurally sound against the live `order-detail/[orderId].tsx` component shape; step 2b's cross-reference comment target confirmed present in `order-state-machine.ts`. No regression. |
| Gaps 1-6 (PVL cycle 1) | ✅ RESOLVED | Re-verified once more this cycle — `Order`/`ApiOrder` two-file split, `dispatchOrderNotification` import target, `handleAdd`/`isSwitchingBranch`/`clearCart()` line numbers, sibling zero-overlap (superseded by Gap 13's fresher check above), `packages/types` typecheck script, migration head — all still hold, no regression across 3 cycles. |
| CAS/ownership-before-status pattern, B3 pending-only narrowing, B4 product-swap prevention, migration additivity, test-tier assignments, zero-DB-CHECK-constraint convention on `cart_items`/`reason_actor`, varchar-length headroom for both reason columns (max value 19 chars vs. `varchar(32)`; `'customer'` is exactly 8 chars vs. `varchar(8)`, no truncation) | ✅ PASS | Independently re-confirmed by direct read this cycle — no change, no regression. |
| Reason-write-path completeness: confirmed by a repo-wide grep that only 3 code paths can ever write `status='cancelled'`/`'rejected'` — the existing generic staff PATCH (step 9's target), and the two NEW B2/B3 routes. No admin route writes order status (`admin/orders.ts` is GET-only, D1-documented). | ✅ PASS | New verification this cycle — confirms the Decision Summary's `reason_actor` design has no missed fourth write path. |

### III. Test Coverage Plan (C3 5-column table — additive; full detail in `## Verification Evidence` above, now amended per Gaps 10-12)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| B2.2, B2.8 | reject rejects missing/invalid reason, "other" without note | Fully-Automated (HARD) | `packages/api` vitest — reject requires reason / other-requires-note | B |
| B2.4 | reject rejects cross-branch order | Fully-Automated (HARD) | `packages/api` vitest — reject branch isolation | B |
| B2.5 | reject rejects non-pending source | Fully-Automated (HARD) | `packages/api` vitest — reject illegal-transition | B |
| B2.3, B2.6 | reject persists reason/note/actor, surfaces via staff+admin serializers | Fully-Automated | `packages/api` vitest — reject stores reason+note; serializer field-presence | B |
| B2.7-prereq | reject mutation invalidates staff order caches; reason block renders on staff detail screen | Fully-Automated | `apps/mobile` jest — step 14/13b coverage | B |
| B2.7 | on-device reject flow incl. reason visible without manual refresh | Agent-Probe | manual walkthrough | D |
| B3.2, B3.3 | cancel ownership, illegal-transition (7-status sweep) | Fully-Automated (HARD) | `packages/api` vitest — cancel ownership / non-pending source parameterized | B |
| B3.4 (**amended — Gap 12**) | genuine concurrent CAS race: staff-accept vs. customer-cancel on the same `pending` order | Fully-Automated (HARD) | `packages/api` vitest — `Promise.all` concurrent race (mirrors `orders.test.ts` AC6 pattern), NOT a sequential pre-flip | B |
| B3.1, B3.5, B3.6 | cancel happy path, optional-reason storage, unknown/malformed id | Fully-Automated | `packages/api` vitest — cancel happy path / with-without reason / unknown id | B |
| B3.7, B3.8 | cancel button visibility, confirm-before-send | Fully-Automated | `apps/mobile` jest — cancel button visibility / confirm-dialog gate | B |
| B3.9-prereq | staff detail screen renders customer's cancel reason | Fully-Automated | `apps/mobile` jest — step 13b coverage | B |
| B3.9 | on-device cancel flow, tracking stops polling, staff sees reason | Agent-Probe | manual walkthrough | D |
| B4.2 (**amended — Gap 11**) | edit no-collision replace, one line, no duplicate, AND unrelated line survives | Fully-Automated (HARD) | `packages/api` vitest — edit replaces line, 3-line-cart seed | B |
| B4.3 (**amended — Gap 11**) | edit collision merge, old line gone, exactly one merged line, AND unrelated line survives | Fully-Automated (HARD) | `packages/api` vitest — edit collides+merges, 4-line-cart seed | B |
| B4.4 | edit cross-user ownership | Fully-Automated (HARD) | `packages/api` vitest — edit ownership (reuses `requireOwnedLine`) | B |
| B4.1, B4.5 | tap-to-edit prefill, no-save no-op + never-clears-cart regression lock | Fully-Automated | `apps/mobile` jest — prefill from cart line / cancel-edit no-op + `clearCart` mock-call-count regression | B |
| B4.6 | on-device edit-save flow, other lines unaffected | Agent-Probe | manual walkthrough | D |
| Freeze list | zero regressions on existing order/staff/cart routes | Fully-Automated | `packages/api` full regression run | B |

**TDD stub note:** Implementation Checklist step 22 already commits EXECUTE to writing every
Fully-Automated row above as a failing (red) test BEFORE implementing the corresponding guard, then
implementing until green — this is the plan's own TDD-first instruction and functions as the
red-first stub gate for every row in this table; no separate stub block is duplicated here.

**Legacy line form (existing consumers still parse this):**
- B2/B3 order-state trust boundary: `packages/api vitest` (ownership/transition/reason-gate/CAS-race suites) — Fully-Automated, Known-Gap BANNED for all HARD rows.
- B4 cart trust boundary: `packages/api vitest` (ownership/merge suites, now with explicit unrelated-line-survival assertions) — Fully-Automated, Known-Gap BANNED for all HARD rows.
- Mobile UI wiring (B2/B3/B4): `apps/mobile jest` — Fully-Automated for button-gating, confirm-dialogs, prefill, reason-display, and cache-invalidation.
- On-device walkthroughs (B2.7, B3.9, B4.6): Agent-Probe — no project-wide RN E2E/navigation runner exists (standing gap, see `all-tests.md`).

**gap-resolution legend:** A — proven now; **B — fixed in this plan (gate added by this plan's
checklist)** — every Fully-Automated row above is B, since no code exists yet; C — deferred; D —
backlog test-building stub (the 3 Agent-Probe rows — named residual, owed by the user before
`✅ VERIFIED`, not before CODE DONE).

**C-4 reconciliation:** no row above uses Known-Gap as a strategy — the 3 strategies present are
Fully-Automated and Agent-Probe only, exactly matching SPEC's locked tier rule (Known-Gap
explicitly banned for every HARD ownership/transition/collision/required-field/race row).

### Dimension findings

- Infra fit: PASS — additive-only migration (0022), no container/runtime/infra surface change, `packages/api` has a live Postgres vitest+supertest runner (no infra excuse for any HARD row).
- Test coverage: PASS (upgraded from CONCERN this cycle) — all HARD server-side criteria are genuinely Fully-Automated with Known-Gap correctly banned; the two remaining vacuousness risks found this cycle (B3.4's race technique, B4.2/B4.3's missing unrelated-line assertion) are both fixed in-plan; the mobile-side prerequisites (cache invalidation, reason-display UI) fixed in cycle 2 are re-confirmed structurally sound this cycle.
- Breaking changes: PASS — all new/extended surfaces additive; freeze-list explicitly covered by a full regression run; `OrderStatus` union untouched; existing `PATCH /cart/items/:lineId` quantity-only behavior explicitly preserved (schema widened from required to optional, not narrowed).
- Security surface: PASS — every new/extended route reuses an established ownership-before-status-before-CAS pattern verified byte-identical to `PATCH /orders/:orderId/complete` (B3) and the generic staff PATCH (B2); B4 reuses `requireOwnedLine` unchanged; no caller-supplied target status anywhere; no new auth bypass surface identified; repo-wide grep this cycle confirms no 4th path can write `cancelled`/`rejected` status.

### Open gaps

None. Gaps 1-13 across all 3 PVL cycles are all CLOSED (verified fixed against live source, not
merely accepted). The 3 Agent-Probe rows (B2.7, B3.9, B4.6) and the 5-artifact high-risk evidence
pack remain owed before `✅ VERIFIED` (not before CODE DONE, not blocking EXECUTE) — see `##
Phase Completion Rules`.

### What this coverage does NOT prove

- None of the Fully-Automated `packages/api` gates prove the mobile UI actually renders correctly on a real device (font rendering, touch targets, dialog layout, dark-mode legibility) — that is exactly what the 3 Agent-Probe rows (B2.7, B3.9, B4.6) are reserved for, and they remain unperformed until the user runs them.
- The step 13b/14 `apps/mobile` jest coverage proves the invalidation call and the conditional render logic fire correctly in a jsdom/RN-jest environment — it does NOT prove the resulting screen looks correct or that the 30s `staleTime` window doesn't create a visible flash/delay on a real device before invalidation completes; that residual observation is folded into B2.7's Agent-Probe walkthrough (explicitly notes "without a manual refresh").
- The freeze-list regression row proves 0 new failures on the NAMED existing tests; it does not prove every possible interaction between old and new order-state paths (e.g., a customer racing their own cancel against a coupon-apply flow) — no such interaction was identified as in-scope by SPEC and none is asserted here.
- Migration correctness is proven mechanically (`drizzle-kit generate` output shape, additive-only ALTER TABLEs) — this does not prove a smooth production migration on a non-empty `orders` table with existing rows, though all 3 new columns are nullable so no backfill risk exists.
- B3.4's amended `Promise.all` race test proves the CAS resolves a genuine concurrent race consistently (exactly one winner) — it does NOT deterministically prove "staff accept wins" specifically (a true race's winner is nondeterministic by nature, and SPEC's B3.4 criterion does not require a specific winner, only that the loser is told and sees the true state).
- B4's `editCartLine` optimistic-update function proves nothing about UI correctness during the brief window between the mutation firing and `onSettled`'s invalidation completing — a real device may show the optimistic guess for a moment before the authoritative merge result replaces it; this is a UX-polish residual, not a correctness gap (never claimed as Fully-Automated coverage).

Gate: PASS (0 FAILs, 0 CONCERNs after this pass's fixes). Rationale for going straight to PASS
rather than spinning a cycle-4 confirmation pass (per explicit instruction to weigh diminishing
returns): all 4 findings this cycle (Gaps 10-13) were diagnosed AND fixed directly in this same
pass with full live-source grounding — every underlying fact (exact line numbers, function
signatures, control-flow order, existing test precedents) was independently verified by direct
`Read`/`Grep` before being written, not inferred. A cycle-4 pass would only re-read what this pass
already verified first-hand; three of the four fixes (Gaps 10-12) concern REQUIRED SPEC criteria
or Known-Gap-banned HARD rows and were therefore NOT accepted as known-gaps — they are fixed, full
stop. Gap 13 is a documentation-accuracy correction. This is now the third, most exhaustive pass
(full end-to-end trace of every SPEC AC through migration → schema → route → serializer → wire
type → client fetch → client hook/cache → rendered UI → test, plus an explicit non-vacuity audit
of every HARD/Known-Gap-BANNED row) and found no design-level issues — only integration-completeness
and test-technique gaps, all closed.
Accepted by: N/A — Gate: PASS, no concerns remain to accept. All 13 gaps found across 3 PVL cycles
were fixed and independently re-verified, none carried forward as accepted known-gaps.

## Autonomous Goal Block

SESSION GOAL: Ship B2 (staff reject reason), B3 (customer self-cancel), B4 (cart line option edit)
Charter + umbrella plan: N/A — single standalone plan, not a phase program
Autonomy: Standard RIPER-5 gates apply. VALIDATE reached PASS this cycle (PVL cycle 3) — EXECUTE is
now authorized. Steps 1-10 (migration + B2 + B3) must land together per `## Sequencing`; step 11
onward (B4) may run independently.
Hard stop conditions / safety constraints:
- HIGH risk class (order-state trust boundary, B2/B3) — every ownership check, illegal-transition
  rejection, required-reason gate, collision/merge outcome, and the B3.4 concurrent-CAS race must
  stay Fully-Automated with Known-Gap banned (SPEC-locked, re-confirmed this pass).
- 5-artifact high-risk evidence pack required before finalize/PR for B2/B3 (confirmed this pass) —
  NOT required before EXECUTE itself, only before finalize/PR.
- Do not mark this plan VERIFIED on automated-green alone — 3 Agent-Probe walkthroughs (B2.7,
  B3.9, B4.6) must be performed and passed by the user first.
- Every `(HARD, Known-Gap BANNED)` test must be independently confirmed non-vacuous by briefly
  removing the guard and observing red, per the Non-vacuousness note — this now explicitly includes
  the B4.2/B4.3 unrelated-line-survival assertion and B3.4's genuine `Promise.all` concurrency
  requirement (both added this cycle).
- Cross-plan file collision risk on `packages/api/src/routes/orders.ts` with the sibling
  `closed-branch-order-gate_22-07-26` plan is now ACTIVE (that plan is Gate: PASS, EXECUTE-ready) —
  re-grep `orders.ts` for the exact target strings immediately before editing; never trust either
  plan's cited line numbers.
Next phase: EXECUTE — say `ENTER EXECUTE MODE` against this plan file.
Validate contract: inline in plan — see `## Validate Contract` above.
Execute start: full-auto commands are the verification command sequence in `## Verification
Evidence` (`docker compose up -d` → `pnpm --filter @jojopotato/api db:migrate` → `pnpm --filter
@jojopotato/api test` → `pnpm --filter @jojopotato/mobile test` → both typechecks → `packages/types`
typecheck → `pnpm format:check`); e2e/probe scenarios are B2.7/B3.9/B4.6 (owed after CODE DONE, not
blocking EXECUTE); high-risk pack: yes (required for B2/B3 before finalize/PR, not before EXECUTE).
