---
name: codebase-audit_21-07-26
description: Cross-cutting code-quality + process-hygiene audit (no UI/UX, no flow, no backend architecture changes) covering packages/api, apps/mobile logic layer, apps/admin logic layer, and process/ plan hygiene
metadata:
  type: audit
  date: 2026-07-21
  status: findings-only, no fixes applied yet
---

# Codebase Audit — 21-07-26

**Status:** Findings only. Nothing in this document has been fixed yet — this is a read-only audit.

**Scope constraint (explicit, per the user's request):** no UI/UX changes, no navigation/flow
changes, no large backend architecture/schema redesigns. Every finding below is a small,
mechanical, low-risk fix — bugs, dead code, missing indexes, inconsistent patterns, and
process/documentation hygiene.

**Method:** 4 parallel read-only audit agents (`vc-code-reviewer` ×3 + `general-purpose` ×1),
each scoped to one area, cross-referenced against the repo's existing 33 backlog "known gap"
notes so nothing already tracked is duplicated. Findings were then synthesized into this report.

## TL;DR

Code health is generally good — no schema redesigns are needed, but four high-severity findings
require follow-up. Money/discount paths are unusually disciplined. The real story is **process
drift**: `process/context/all-context.md` hasn't been updated since 21-07-26 despite 50+
commits/merges since, leaving roughly **20 plan folders sitting in `active/` that are already
merged into `development`**, plus 3 backlog notes that can be closed outright. That's the single
highest-value cleanup here — bigger than any one code fix below.

**Counts:** 4 High-severity code findings · 12 Medium · 7 Low · ~20 stale plan folders · 3
closeable backlog notes · 1 self-contradiction inside `all-context.md` itself.

---

## 1. High severity — fix first

### 1.1 Admin sign-out leaks cached data across sessions
**File:** `apps/admin/src/components/nav-user.tsx:11-14`
**Issue:** `handleSignOut` calls `signOut()` and navigates to `/login` but never clears the
shared `queryClient` (module singleton in `lib/query-client.ts`, mounted once in `__root.tsx`).
All previously cached admin data — **including order rows with `customerName`/`customerPhone`**
— stays in memory and can be served (stale, up to the 30s `staleTime`) to whoever authenticates
next in that browser tab, before any query key changes.
**Fix:** call `queryClient.clear()` in `handleSignOut`, before or after `signOut()`.

### 1.2 No rate limiting anywhere in the API
**File:** `packages/api/src/index.ts` (route mounts) — repo-wide grep confirms absence.
**Issue:** `express-rate-limit`/`helmet`-style throttling is absent from every route, including
`/api/auth/*` (login/signup/magic-link) and `POST /coupons/apply` (a coupon-code guessing
surface). The codebase's own comment at `packages/api/src/lib/reward-coupon-code.ts:16`
acknowledges "there is no rate limit on /coupons/apply yet" as an accepted risk offset only by
code entropy — but the auth endpoints have no such offset at all.
**Fix:** add `express-rate-limit` on `/api/auth/*` (login/signup) and `/coupons/apply` at minimum.
**Note:** distinct from the already-tracked `api-helmet-security-headers` backlog item — that one
is about response headers, this is about request throttling.

### 1.3 Reorder loop silently swallows failed cart-adds
**File:** `apps/mobile/src/features/orders/hooks/use-reorder.ts:83-85`
**Issue:** `addItem(...)` returns `Promise<boolean>` by design — its own doc comment says "a
caller that shows a success toast MUST await this... or the toast lies about what happened" — but
it's called without `await` inside the reorder `for` loop. If any individual `addItem` call fails
(network error, session expiry mid-loop), the failure is silently swallowed: the item never even
reaches the "unavailable/conflict" list, so the user is told nothing and just gets a smaller cart
than expected.
**Fix:** `await addItem(...)` in the loop and collect any `false` results into the conflicts list
(or surface a partial-failure error).

### 1.4 Admin branch "Reactivate" shares a mutation instance with the edit dialog
**File:** `apps/admin/src/routes/(dashboard)/branches.tsx:31,60-62`
**Issue:** `handleReactivate` reuses the same `updateMutation` instance used by the create/edit
form dialog. This is inconsistent with the identical reactivate pattern in `products.index.tsx`,
`categories.tsx`, and `deals.index.tsx`, which each deliberately allocate a **separate**
`reactivateMutation` — `products.index.tsx:37-38` has an explicit comment explaining why.
Consequence: reactivating a branch from the list sets `updateMutation.isPending`/`.error`, which
also drives the New/Edit dialog's `formSubmitting`/`formError` state — opening "New branch" while
a reactivate is in flight shows the form as submitting, and a failed reactivate's error can leak
into the edit dialog's error slot.
**Fix:** add a dedicated `useUpdateBranch()` instance for `handleReactivate`, matching the other 3
screens.

---

## 2. Medium severity

### Backend (`packages/api`)

| # | File | Issue | Fix |
|---|---|---|---|
| M1 | `packages/api/src/routes/staff.ts:135-140`, `:168-173` | `GET /api/staff/orders` and `GET /api/staff/orders/completed` fetch order rows then run one `db.select().from(orderItems).where(eq(orderItems.order_id, order.id))` **per order** inside `Promise.all(...)` — an N+1. Sibling routes `orders.ts` (`GET /orders`) and `admin/orders.ts` (`GET /`) both already batch this with a single `inArray(orderItems.order_id, orderIds)` query. | Mirror the batched pattern already used elsewhere in the same file family. |
| M2 | `packages/api/src/db/schema/orders.ts:55-59` | Only `(branch_id, status)`, `(user_id)`, `(order_number)` are indexed. `orders.ts:371-386` runs `COUNT(*) WHERE deal_id = ? [AND user_id = ?]` on every order placement carrying a `dealId` (per-user + total usage-limit checks) — a hot path with no index on `deal_id`. | Add `index('orders_deal_idx').on(t.deal_id)` (optionally composite `(deal_id, user_id)`). |
| M3 | `packages/api/src/db/schema/cart_items.ts` | Every cart mutation route (`GET /cart`, `POST /cart/items` line-merge lookup, `DELETE /cart`) filters `where(eq(cartItems.cart_id, cart.id))` repeatedly, with zero index on that column. Small table today, but it's the single most-filtered column in the table. | Add `index('cart_items_cart_idx').on(t.cart_id)`. |
| M4 | `packages/api/src/lib/star-earning.ts:265` | `reverseStarForRefundedOrder` is unreachable — nothing outside its own test calls it, and nothing sets `orders.payment_status` to `'refunded'`. If a real refund flow is ever added without wiring this, customers who got a star for a later-refunded order will never have it reversed — a silent correctness gap, not just dead code. | Either wire it into a future refund path, or leave an explicit `// UNWIRED — see backlog` marker. |
| M5 | `packages/api/src/lib/star-earning.ts:31-34` | Module docblock says "This module has NO live caller yet — STAFF-003 owns wiring these" for *both* functions, but `creditStarForCompletedOrder` **is** already wired (`staff.ts:55`, `:383`). Only the refund half (M4) is still unwired. | Update the comment so it doesn't imply star-crediting itself is dormant. |

### Mobile (`apps/mobile`)

| # | File | Issue | Fix |
|---|---|---|---|
| M6 | `apps/mobile/src/features/notifications/lib/notification-factory.ts:96-259` | `buildOrderNotification`, `buildMarketingNotifications`, `mergeNotification`, `filterMarketingByOptIn`, `ORDER_COPY`, `STATUS_TO_ORDER_TYPE`, `MarketingInputs` are all dead in production (zero call sites outside this file and its own test). PUSH-004 rewrote the consuming hook to hit `GET /notifications` directly. The file's header comment ("`useNotifications()` is a thin wrapper over these") is now false. All hardcode `userId: 'mock-user'`, another sign of stale mock-round code. | Delete the dead builders (verify `sortNewestFirst` is also unused and remove it too); fix the stale header comment. |
| M7 | `apps/mobile/src/features/cart/hooks/use-cart.ts:334-337` | The displayed `discountTotalCents` (`cart.appliedDiscount?.amountCents ?? 0`) is never clamped to `subtotalCents`, unlike the optimistic-cache helper `recomputeTotals` in the same file (line 82: `Math.max(0, Math.min(rawDiscount, subtotalCents))`). `totalCents` is floored at 0 but the discount line itself isn't capped — a stale/oversized discount (coupon applied, then lines removed before the next `GET /cart` refetch) can visually show a discount bigger than the subtotal. | Reuse `recomputeTotals`-style clamping here, or dedupe into one shared totals function. |
| M8 | `apps/mobile/src/features/branches/api.ts:19-34` | `mapApiBranch` never sets `isOpen` on the returned `PickupBranch`, unlike the sibling mapper in `lib/api-client.ts`'s `getBranches()` (`isOpen: branch.isAcceptingPickup`). Compiles silently since `isOpen` is optional. Not exploited today (the sole consumer recomputes it locally) but a landmine for the next consumer. | Set `isOpen: row.is_accepting_pickup` for parity with the other mapper. |

### Admin (`apps/admin`)

| # | File | Issue | Fix |
|---|---|---|---|
| M9 | `apps/admin/src/features/products/hooks/use-admin-products.ts:67-73` | `useDeactivateProduct` invalidates only `PRODUCTS_KEY` (`['admin','products']`). The individual product key is `['admin','product', id]` — not a prefix, so never invalidated. `useUpdateProduct` (lines 55-65) correctly invalidates both. Deactivating from the list leaves a cached detail view showing stale `isActive: true`. | Also invalidate `['admin','product', id]` in the deactivate `onSuccess`. |
| M10 | 9 files under `apps/admin/src/features/*/lib/admin-*-api.ts` | `AdminApiError` + the `request<T>()` fetch-wrapper helper (`credentials:'include'`, JSON-or-status-message error parsing) is copy-pasted near-verbatim into all 9 feature API clients. Any shared fix (non-JSON 5xx body, session-expiry redirect, timeout) must be applied 9 times or silently misses some. | Extract one `apps/admin/src/lib/admin-api-client.ts`. Distinct from the already-tracked `adm-shared-ui-composite-extraction-deferred` note (that one is about UI composites, not this data-fetch layer). |
| M11 | 8 files across `apps/admin/src` | `formatPeso` is redefined locally in 8 places (`orders.$orderId.tsx`, `offers.$offerId.tsx`, `offer-list.tsx`, `deals.$dealId.tsx`, `deal-create-wizard.tsx`, `deal-list.tsx`, `order-list.tsx`, `product-list.tsx`) instead of importing the canonical export in `features/analytics/lib/format.ts` — which is already imported by 2 analytics components (`top-products-table.tsx`, `analytics-dashboard.tsx`), so it's not dead, just not reused outside that feature. | Point all 8 duplicate sites at the existing `features/analytics/lib/format.ts` export (or promote it to a shared `apps/admin/src/lib/format.ts` if analytics shouldn't own it). |
| M12 | `apps/admin/src/features/orders/hooks/use-admin-orders.ts:18-26` | `useAdminOrders` combines `useInfiniteQuery` with a 15s `refetchInterval`. React Query re-requests every already-loaded page on each interval — as an admin clicks "Load more" repeatedly, per-poll request cost grows unbounded for the session (10 loaded pages → 10 requests every 15s). | Cap pages (`maxPages`) or poll only page 1 and merge/de-dupe manually. |

---

## 3. Low severity — polish, not urgent

| # | File | Issue |
|---|---|---|
| L1 | `packages/api/src/routes/admin/coupons.ts:137-169` | `POST /generate` (cap 500) inserts coupons one at a time in a `for` loop, each in its own nested savepoint. Correct and safe, just not batched. Low priority given admin-only/rare/bounded use. |
| L2 | `apps/mobile/src/features/staff/hooks/use-staff-me.ts:18-41` | Reimplements the fetch-on-mount + mounted-guard pattern that `features/shared/hooks/use-async-data.ts` already provides, duplicating ~15 lines of boilerplate. |
| L3 | `apps/mobile/src/features/shared/lib/api-request.ts:35` | `return data as T;` is an unchecked cast — if `authClient.$fetch` ever resolves `{data: null, error: null}` (e.g. a 204), callers silently get `null` typed as `T`. No known 204 endpoint today. |
| L4 | `apps/mobile/src/features/cart/hooks/use-cart.ts` | API asymmetry: `addItem` is `await`-able (`Promise<boolean>`) but `updateQuantity`/`removeItem`/`clearCart`/`setBranch`/`applyDiscount`/`clearDiscount` are all fire-and-forget `void`, despite going through the identical optimistic+rollback recipe and being equally capable of failing. |
| L5 | `apps/mobile/src/features/deals/lib/deal-product-to-card.ts:14-30` | `dealProductToCard` hardcodes `dealType: 'bundle'` on every mapped deal-product view-model regardless of the real type. Harmless today (only `title/description/imageUrl/discountLabel` are read) but a landmine for the next `dealType`-driven branch added to `DealCard`. |
| L6 | `apps/admin/src/features/offers/components/benefit-product-field.tsx:30` | `draft` is seeded once via `useState(offer.benefitProductId ?? '')` with no re-sync on a background refetch. `dirty` recomputes against the live `offer` value every render, so a stale `draft` can read as "dirty" (Save enabled) with zero user interaction. The sibling `deals.$dealId.tsx` explicitly documents avoiding this exact bug class ("the STAFF-005 prep-time bug") — this component doesn't apply the same guard. |
| L7 | `apps/admin/src/features/auth/hooks/use-admin-auth.ts:61-68` | `sessionUser`/`role` are obtained via `as` casts rather than a runtime-validated shape. If the better-auth session payload ever drifts, TypeScript won't catch it (fails closed to `'customer'`, not urgent). |

**Confirmed still-open (already tracked, not re-reported in detail):** `api-helmet-security-headers`,
`api-test-db-concurrency-guard` — both verified still present/unaddressed during this audit.

---

## 4. Process / plan hygiene — the biggest single win

`process/context/all-context.md`'s recorded "last delta" is 21-07-26, but the git history has
moved well past it (dozens of merged PRs, several predating that date and never reconciled).
This single fact is the root cause of nearly every item below.

### 4.1 Stale/inaccurate claims in `all-context.md` and plan-folder headers

| Plan / claim | Doc says | Reality |
|---|---|---|
| CART-003 cart persistence | "uncommitted... branch: development" | Merged via **PR #129** (`2f392f2`) + CodeRabbit fix `67f6116` |
| Order tab enhancement | "uncommitted... branch feat/product-ux-enhance" | Merged via **PR #139** (commit `5be825b`) |
| mobile-dark-mode-audit | "NOT YET MERGED, no PR" | Merged via **PR #119** (`cd21689`), 20-07-26 |
| NAV-005 route move | Plan header: "VALIDATED — awaiting EXECUTE (no source file touched)" | `all-context.md`'s own prose says it's committed (`f2eed0a`); merged via **PR #120** + follow-up fix **PR #122** (`e600986`) — **self-contradiction within the same doc** |
| push-marketing-triggers | Plan header: "VALIDATED — CONDITIONAL, awaiting ENTER EXECUTE MODE" | Co-located REPORT says `COMPLETE`; merged via **PR #133** (`4eb3741`) |
| font-tone-payment-overflow | "DRAFT — VALIDATE PASS" | Merged via **PR #131** (`cc51bb9`) |
| STAFF-004 product availability | "PLAN (pending VALIDATE)" | Merged via **PR #77**, 14-07-26 — 7 days stale |
| push-notifications-ui | "⏳ PLANNED" | Merged via **PR #78**, 14-07-26 |
| push-notifications-api | "VALIDATED — see Validate Contract below" | Merged via **PR #83**, 16-07-26 |
| shared-ui-component-library | "CODE NOT STARTED — ready for EXECUTE" | Merged **the same day** via **PR #54** (`56a0019`) — 12 days stale, largest doc/reality gap found |
| BRN-001/002/003 (branch locator/details/map) | "PLANNED" / "⏳ PLANNED" (×3) | All 3 confirmed merged ancestors of HEAD, 11 days stale |
| STAR-004 reward redemption | "PLAN written — not executed" | Commit `3c9d3ac` confirmed merged |
| mobile-alert-toast-consistency | "PLAN — PVL cycle 1 in progress" | Toast component/hook/migration/tests all confirmed merged |
| NAV-002/003/004/006 | Various pre-EXECUTE states | NAV-002/003/004 via **PR #110**; NAV-006 via **PR #126** (`8e58cd0`) |
| fix-tab-bar-visibility-nav-trap | "VALIDATE PASS (cycle 2), ready for EXECUTE" | Merged via **PR #91**, 15-07-26 |
| kid-friendly-ui-deals-unification | "DRAFT — pending VALIDATE" | Merged via **PR #93** — `all-context.md` documents this merge elsewhere in the same file, but the plan folder header was never updated |
| STAFF-002 active orders | "EXECUTED... awaiting independent EVL + closeout" | Merged via **PR #71**, 14-07-26 — 7 days stale, oldest untouched claim found |

### 4.2 Archival candidates (code already merged — only needs the folder moved + header updated)

Confident, ready to archive to `completed/`:

- `process/features/ordering-cart/active/cart-persistence_20-07-26/` (PR #129)
- `process/general-plans/active/order-tab-enhance_21-07-26/` (PR #139)
- `process/general-plans/active/mobile-dark-mode-audit_17-07-26/` (PR #119)
- `process/features/rewards-notifications/active/push-marketing-triggers_20-07-26/` (PR #133)
- `process/general-plans/active/font-tone-payment-overflow_20-07-26/` (PR #131)
- `process/features/staff-dashboard/active/staff-004-product-availability_14-07-26/` (PR #77)
- `process/features/rewards-notifications/active/push-notifications-ui_14-07-26/` (PR #78)
- `process/features/rewards-notifications/active/push-notifications-api_14-07-26/` (PR #83)
- `process/general-plans/active/shared-ui-component-library_09-07-26/` (PR #54, 12 days stale)
- `process/features/pickup-branches/active/brn-001-branch-locator_10-07-26/`
- `process/features/pickup-branches/active/brn-002-branch-details_10-07-26/`
- `process/features/pickup-branches/active/brn-003-map-view_10-07-26/`
- `process/features/rewards-notifications/active/star-004-reward-redemption_15-07-26/`
- `process/general-plans/active/mobile-alert-toast-consistency_17-07-26/`
- `process/general-plans/active/nav-002-notifications-route_17-07-26/`
- `process/general-plans/active/nav-003-screenheader-rollout_17-07-26/`
- `process/general-plans/active/nav-004-tracking-top-level-route_17-07-26/`
- `process/general-plans/active/nav-005-shared-routes-top-level_17-07-26/`
- `process/general-plans/active/nav-006-product-branch-backstack_20-07-26/`
- `process/general-plans/active/fix-tab-bar-visibility-nav-trap_15-07-26/`
- `process/general-plans/active/kid-friendly-ui-deals-unification_16-07-26/`
- `process/features/staff-dashboard/active/staff-002-active-orders_13-07-26/` (PR #71, oldest orphan)
- `process/general-plans/active/db-schema_09-07-26/` (PR #55, 12 days stale)
- `process/general-plans/active/jojopotato-design-system_08-07-26/` (13 days stale, foundational)

Conditional — archive only once the stated check passes (do NOT archive yet):

- `process/features/admin-dashboard/active/adm-route-guard-ssr_20-07-26/` — code merged and the
  doc's claim is not contradicted (the one genuinely accurate case found), but the 3-scenario
  Agent-Probe SSR walkthrough is still owed. Archive after that walkthrough is confirmed, not before.

Lower confidence — worth a manual spot-check before archiving (merged-ancestor commits match
scope, but not traced line-by-line against acceptance criteria in this audit):

- `process/features/auth-accounts/active/dev-temp-login-button_13-07-26/` (likely shipped
  alongside PR #64 `feat/pickup-order-flow-and-dev-temp-login`)

**Confirmed still genuinely pending — do NOT archive:**
`process/features/pickup-branches/active/branches-map-bottom-sheet_13-07-26/`,
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/` (VERIFIED, deliberately kept
per doc), `adm-008-coupons_16-07-26/` and `adm-008-free-mechanics_16-07-26/` (explicitly held open
by user decision), `process/general-plans/active/home-tab-navigation_08-07-26/` (Phase 6 genuinely
in progress).

### 4.3 Backlog notes safe to close

Safe to close now (verified resolved against current source, no further check needed):

- `process/features/staff-dashboard/backlog/staff-002-replace-active-orders-mock_NOTE_13-07-26.md`
  — resolved by STAFF-002 (PR #71, commit `ac6b750`). Verified against current source.
- `process/features/staff-dashboard/backlog/staff-002-order-status-type-reconciliation_NOTE_13-07-26.md`
  — requested `OrderStatus` shape verified to match `packages/types/src/order.ts` exactly (plus
  `rejected`, added later by STAFF-003).

Conditional — close only after the stated check passes (do NOT close yet):

- `process/features/staff-dashboard/backlog/guard-theme-mode-branch-not-merged_NOTE_20-07-26.md`
  — its precondition ("once mobile-dark-mode-audit merges into development") is now met (PR #119),
  but `guard:theme-mode` itself has not been re-run in this audit. Re-run it first; close only if
  it passes.

### 4.4 Duplicate/conflicting folders

No genuine same-scope duplication found — every apparent overlap (e.g. NAV-005 plan vs. its
follow-up fix PR #122, mobile-dark-mode-audit vs. the guard-theme-mode backlog note) is staleness
(already-done work not yet archived), not two competing efforts. Once the archival pass in §4.2
runs, these resolve themselves.

### 4.5 Prioritized quick wins

1. Archive the 4 oldest orphan initiatives / 6 folders (10-13 days stale):
   `jojopotato-design-system_08-07-26`, `db-schema_09-07-26`, `shared-ui-component-library_09-07-26`,
   and all 3 branch-locator folders `brn-001-branch-locator_10-07-26`, `brn-002-branch-details_10-07-26`,
   `brn-003-map-view_10-07-26`.
2. Archive the 5 `nav-00X` plans (all merged via PR #110/#120/#122/#126).
3. Archive the 14-07-26 batch: `staff-002-active-orders`, `staff-004-product-availability`,
   `push-notifications-api`, `push-notifications-ui`.
4. Archive the 15-to-21-07-26 batch: `cart-persistence`, `order-tab-enhance`,
   `mobile-dark-mode-audit`, `push-marketing-triggers`, `font-tone-payment-overflow`,
   `fix-tab-bar-visibility-nav-trap`, `kid-friendly-ui-deals-unification`,
   `mobile-alert-toast-consistency`, `star-004-reward-redemption`.
5. Close the 2 verifiably-resolved backlog notes in §4.3 now; close the 3rd
   (`guard-theme-mode-branch-not-merged`) only after re-running `guard:theme-mode`.
6. Archive `adm-route-guard-ssr_20-07-26` separately, only after its owed SSR walkthrough is confirmed.
6. Rewrite `all-context.md`'s delta history to cover everything since 21-07-26 (PR #129 through
   at least #140 — CART-003, order-tab-enhance, AUTH-003 terms/privacy split, DEAL-005 Phase 2/3,
   PUSH-005, and more).
7. Fix the NAV-005 self-contradiction inside `all-context.md` specifically (prose says committed,
   plan header says untouched).

---

## Appendix — full findings-by-agent (raw)

The 4 findings above are synthesized from 4 independent audit passes. Raw per-agent output is
preserved in this session's transcript if deeper file-by-file trace detail is needed beyond what's
captured in §1-§4 (each finding above already carries its file:line reference and suggested fix).

- **Agent 1** — `packages/api`, `packages/types`, `packages/utils` (backend/shared logic)
- **Agent 2** — `apps/mobile/src` business-logic layer (hooks/lib, excluding screen UI)
- **Agent 3** — `apps/admin/src` business-logic layer (hooks/lib/route-guards, excluding UI)
- **Agent 4** — `process/` plan and backlog-note hygiene vs. actual git history

## Next steps (not yet actioned)

This document is findings-only. Suggested order of work:

1. Process hygiene (§4) — zero code risk, restores `all-context.md`'s trustworthiness.
2. The 4 High-severity fixes (§1) — each is a small, isolated, single-file change.
3. Medium items (§2) as a batch cleanup pass.
4. Low items (§3) opportunistically, next time each touched file is already open.
