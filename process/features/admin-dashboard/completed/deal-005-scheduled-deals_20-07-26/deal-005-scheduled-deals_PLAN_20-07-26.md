---
name: plan:deal-005-scheduled-deals-phase1
description: "DEAL-005 Phase 1 — nullable starts_at/ends_at window on deal-products, enforced at menu + order placement, admin CRUD + badge"
date: 20-07-26
feature: admin-dashboard
---

# DEAL-005 Phase 1 — Scheduled Deals: Simple Window

Issue: [#127](https://github.com) (DEAL-005, P2). This plan covers **Phase 1 only** —
nullable start/end window on deal-products. Phase 2 (`deal_schedules` recurrence) and
Phase 3 (mobile surfacing) are explicitly out of scope and are separate future issues/plans.

Branch: `adm-deal-005-p2` (already checked out).

Date: 20-07-26
Status: ✅ VERIFIED (EVL-confirmed 20-07-26 — commit `5e9261b4`; user manual admin-UI walkthrough performed and passed; see co-located `deal-005-scheduled-deals_REPORT_20-07-26.md`)
Complexity: COMPLEX (schema migration + two server-authoritative enforcement points + admin CRUD/UI/badge; money-adjacent surface)

## Overview

Add a nullable time window to deal-products so admins can schedule a deal to start/end at a
specific instant, without changing customer-facing wire contracts (out-of-window deals are simply
absent from the deal menu — see Decision D2). This is Phase 1 of the 3-phase DEAL-005 program
(issue #127); Phase 2 (recurring `deal_schedules` rows) and Phase 3 (mobile "Starts Friday"
surfacing) are out of scope for this plan.

## Decisions (locked with the user — do not re-litigate)

**D1 — Proceed now, despite issue #127's stated dependency on #104.**
Rationale: Phase 1's schema change is two nullable timestamp columns on `products`, and its sole
enforcement point is the `is_deal` branch of the `?isDeal=true` query in
`packages/api/src/routes/branches.ts` (the same file/query #127 itself identifies as "the single
enforcement point"). Whatever #104 decides about branch-scoping or a possible offers/deals model
unification, it does not touch this table or this query shape in a way that would invalidate a
nullable-column addition — worst case, a future migration renames a column, which is cheap. The
schema and its enforcement point survive #104 regardless of its outcome.

**D2 — Out-of-window = HIDDEN, not "visible but not orderable".**
A deal outside its window is absent from the `?isDeal=true` menu response — a `WHERE`-clause
change only. No window dates are added to the customer-facing wire contract (`GET /deals`,
`GET /deals/:id`, or the menu response's deal-product shape) and no serializer touches those
paths. This is the cheapest option and nothing leaks.
**Consequence recorded (per issue #127):** this makes Phase 3 (mobile "Starts Friday" / "Ends
tonight" affordances) a **contract change**, not an additive one — Phase 3 will need to add window
fields to the public wire shape from scratch. Accepted.

**D3 — `deal_schedules` TABLE from the start, not flat columns that later migrate into it.**
The user explicitly chose the table over flat `starts_at`/`ends_at` columns on `products`, to
avoid a second data migration when Phase 2 (recurrence) lands. See "Schema shape" below for how
this resolves issue #127's stated Phase 1/Phase 2 column-overlap question — the two nullable
columns still exist, but they live on the new table, not on `products`.

## The semantic rule this plan builds to

- A deal-product with **zero** `deal_schedules` rows is **always live** (subject to `is_active`
  and branch/component availability exactly as today). This is the literal no-backfill guarantee
  from issue #127's AC3 — every existing deal has zero rows on day one and must behave identically
  to pre-Phase-1 behavior.
- A deal-product with **one or more** rows is live only inside the **union** of those rows'
  `[starts_at, ends_at)` windows (see "Inclusivity" below for the boundary semantics).
- `is_active` remains an independent kill switch: an in-window deal with `is_active = false` stays
  hidden. The window narrows visibility; it never overrides the active flag.
- Phase 2 will add recurrence columns (day-of-week, time-of-day) to this same table additively —
  rows already exist in the right place, so Phase 2 needs no data migration. This plan does **not**
  build any recurrence support — no day-of-week column, no time-of-day column, no RRULE. YAGNI:
  Phase 2 is a separate issue and may never happen.
- Union-of-windows semantics also satisfies issue #127's Phase 2 AC ("overlapping schedule rows
  produce one continuous live period") for free, once Phase 2 exists — noted for the record, not
  built here.

## Codebase-vs-issue corrections found during RESEARCH

1. **The issue's suggested "reuse the Asia/Manila analytics timezone convention" does not apply
   the way it's worded.** `manilaDateRangeToUtc` (`packages/api/src/routes/admin/lib/
   analytics-range.ts`) converts a **date-only** (`YYYY-MM-DD`) calendar-day range into a UTC
   instant interval, for KPI bucketing. Deal windows are **real timestamps** (a specific admin
   picks "start 6pm Friday", not a whole day), captured via the existing `DateTimeField` naive-local
   `"YYYY-MM-DDTHH:mm"` contract — identical to how `offers.start_at`/`end_at` already work
   (`packages/api/src/routes/admin/offers.ts`, `z.coerce.date()` on the same naive-local string).
   There is no date-only bucketing step for deal windows, so `manilaDateRangeToUtc` is the wrong
   tool — it would silently coerce a precise timestamp into midnight-to-midnight day boundaries and
   reintroduce the exact off-by-one risk the issue is worried about. **Fix: do not import or call
   `manilaDateRangeToUtc`. Store and compare `deal_schedules.starts_at`/`ends_at` as real
   `timestamp` values and compare directly against `new Date()` at query time — bytewise identical
   convention to `offers.start_at`/`end_at`, which already works correctly and has never needed a
   Manila-specific comparison helper.** This resolves the issue's own inclusivity worry: because
   comparison is against a real instant, not a day bucket, there is no midnight rounding to get
   wrong in the first place. **VALIDATE confirmed this correction directly against source** — see
   Dimension Findings, Breaking Changes.
2. **`is_deal` products already return the FULL `products` row shape everywhere they're read** (the
   `products` schema is selected whole, never column-picked) in both `branches.ts`'s menu query and
   `orders.ts`'s per-line product load. Once `deal_schedules` exists as a separate table, the menu
   query needs an explicit new join/subquery (it is NOT auto-included by adding table columns, since
   this is a new table, not new columns on `products` — see Touchpoints below). This differs from a
   flat-column approach, which the issue also considered; recorded here so a future reader does not
   assume the window arrives for free.

## Schema shape

New table `deal_schedules` (migration, generated via `drizzle-kit generate`, expected `0017` —
**confirmed at VALIDATE**: latest migration on disk is `0016_rename_offer_fk_constraints.sql`, so
`0017` is the correct next slot):

```ts
export const dealSchedules = pgTable('deal_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  deal_product_id: uuid('deal_product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  // Window is a real half-open UTC instant interval: [starts_at, ends_at).
  // NULLABLE and independently so: either bound alone means "open" on that side
  // (e.g. starts_at set + ends_at null = starts Friday, never ends on its own).
  // A row with BOTH null is meaningless (rejected at the API boundary, see below)
  // — the "always live" case is expressed by having ZERO rows, not one all-null row.
  starts_at: timestamp('starts_at'),
  ends_at: timestamp('ends_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
```

**VALIDATE correction (P1 — filename, not table/variable naming):** every existing multi-word
schema file in `packages/api/src/db/schema/` uses **snake_case filenames**
(`deal_components.ts`, `offer_products.ts`, `offer_branches.ts`, `branch_product_availability.ts`,
`order_items.ts`, `product_options.ts`, `star_transactions.ts`, `user_stars.ts`,
`device_tokens.ts` — confirmed exhaustively, 0 kebab-case exceptions). The new schema file must be
named `packages/api/src/db/schema/deal_schedules.ts`, not `deal-schedules.ts` as originally drafted.
The `routes/lib/` directory uses the opposite (kebab-case) convention — confirmed via the sibling
`routes/lib/deal-availability.ts` — so `packages/api/src/routes/lib/deal-schedule.ts` (kebab-case)
is correctly named as originally drafted and needs no change. The `dealSchedules` camelCase
exported variable name is also correctly drafted (matches `dealComponents`, `offerBranches`, etc.).

**Inclusivity (pinned per issue #127's explicit ask):** the window is **half-open**,
`starts_at <= now < ends_at`. `starts_at` is inclusive (the deal is live at the exact instant it
starts); `ends_at` is exclusive (the deal is NOT live at the exact instant it ends — it was live for
every instant strictly before). This is documented verbatim in a schema-file comment above the
table definition. Practically: an admin who wants a deal to run "through end of day Sunday" sets
`ends_at` to `00:00 Monday` (mirrored via the same `DateTimeField` "End of day" `23:59` preset used
by offers — `23:59:00` on the last live day, which is `< 00:00` the next day and therefore correctly
still counted as within-window for the entire last minute). No Manila-specific arithmetic is needed
anywhere — see correction #1 above.

**Why a junction-style table and not one row per product:** Phase 2 adds recurrence rows (e.g. "every
Friday 4–8pm" = many rows per deal). Building the *table* now, even though Phase 1 only ever writes
0 or 1 rows per deal, means Phase 2 adds columns to existing rows and new rows to the same table —
zero data migration. This is decision D3's entire rationale, restated at the schema level.

**Phase 1 write constraint (enforced at the API boundary, not a DB CHECK):** Phase 1's admin UI only
ever creates **zero or one** `deal_schedules` row per deal (a single "Details" form, not a repeatable
list). The admin route enforces "at most one row per deal" at the API layer by ALWAYS treating a
create/update-with-window write as an insert-or-replace of the single row for that deal (see
Execute-Agent Instruction E2 for the exact mechanism) — there is no separate "add a schedule row"
endpoint in Phase 1 that could be called twice, so no explicit 409-reject branch is actually needed;
the single-row invariant is structural (replace, never append), not a runtime guard. Documented in
the route file as a Phase-1-only restriction (Phase 2 lifts it by adding a real multi-row
create-schedule-row endpoint that does not replace).

## Enforcement points (exactly two, per issue #127's own scoping — no third path)

1. **Menu read path** — `packages/api/src/routes/branches.ts`, the `?isDeal=true` branch of the
   product query (~line 106–128). Add a left join to `deal_schedules` filtered to rows whose window
   contains `now`, and require **either** zero schedule rows exist for the product **or** at least
   one matching row does. Applied **only** when `isDealMenu` is true — the regular (non-deal) menu
   query path must remain byte-identical, since regular products never have `deal_schedules` rows
   and window logic is deal-only per issue #127's explicit scope ("Window applies only to
   `is_deal = true` rows this phase"). **VALIDATE confirmed by direct read**: this filter is
   naturally scoped inside the existing `if (isDealMenu && productIds.length)` block (branches.ts),
   so it is structurally impossible for it to run on the regular-catalog path — see Dimension
   Findings.
2. **Order-placement path** — `packages/api/src/routes/orders.ts`, the per-line product-load loop
   (~line 165–175, right after the existing `if (!product) throw new OrderError(...)` check). Since
   `orders.ts` already does a full products-row select (see correction #2), the check here needs its
   own targeted query for the deal-products in the cart (parallel to how `resolveAvailableDealProductIds`
   already does a second targeted query for component availability) — reject with a specific
   `OrderError(400, ...)` message when a cart-line's deal-product's window has closed since it was
   added to cart. This satisfies issue #127's explicit AC: "Ordering a deal whose window closed
   between cart-add and placement is rejected server-side with a specific reason." **VALIDATE
   confirmed by direct read**: the real insertion point is immediately after the existing MENU-003
   component-availability check block (`orders.ts`, ends at the closing `}` following the
   `resolveAvailableDealProductIds` loop, currently ~line 267) — the plan's own preferred location
   ("after the existing `is_deal` component-availability check") is exactly right; approximate line
   numbers above may drift slightly by EXECUTE time but the anchor (immediately after that block) is
   correct.

No third enforcement point (e.g. `apps/mobile`, staff availability) is touched — matches the
existing MENU-003 precedent where `orders.ts` placement and `staff.ts` availability are deliberately
window/availability-blind for the customer-catalog page but window/availability-aware specifically
at the deal-consuming code paths. **VALIDATE independently confirmed there is no third read path**:
`useDealProduct()` (the mobile Deal Details screen) is a pure client-side derivation over
`useDealProducts()`, which itself calls `getMenu(branchId, {isDeal:true})` — the SAME menu route as
enforcement point 1, not a separate per-ID endpoint (mirrors `use-product-details.ts`'s existing
pattern). The reorder path (`use-reorder.ts`) also calls `getMenu(..., {isDeal:true})`. The public
`GET /deals`/`GET /deals/:id` routes and the `GET /api/branches/:id` inline handler in `index.ts`
both read the LEGACY `offers` table (a separate discount-object model, unrelated to
`products.is_deal`) — confirmed by direct read of `packages/api/src/routes/deals.ts` and
`packages/api/src/index.ts` — so neither is a deal-product read path at all, and D2's "confirmed
dormant" claim about `GET /deals`/`GET /deals/:id` is accurate. No enforcement gap found.

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/db/schema/deal_schedules.ts` (new — **corrected filename, was `deal-schedules.ts`, see P1**) | New `deal_schedules` table definition + doc comment pinning half-open inclusivity |
| `packages/api/src/db/schema/index.ts` | Export the new table |
| `packages/api/drizzle/0017_*.sql` (generated) | `drizzle-kit generate` output — do not hand-author |
| `packages/api/src/routes/lib/deal-schedule.ts` (new) | Shared pure helper(s): `isDealScheduleLive(rows, now)` (union-of-windows check, used by BOTH enforcement points so they can never disagree — same pattern as `deal-availability.ts`); `assertValidWindow(startsAt, endsAt)` (the `starts_at < ends_at`-where-both-present Zod-level check, reused by create + update) |
| `packages/api/src/routes/branches.ts` | `?isDeal=true` query: add scheduling filter. **VALIDATE locks this to the second-query (targeted batch) shape — see Execute-Agent Instruction E1; the inline-SQL-predicate alternative is no longer open.** |
| `packages/api/src/routes/orders.ts` | Per-line deal-product load: reject with `OrderError(400, 'Deal "X" is not currently available (its scheduled window is closed)')` when window closed |
| `packages/api/src/routes/admin/deals.ts` | `createDealSchema`/`updateDealSchema` gain optional `startsAt`/`endsAt` (mirrors `offers.ts`'s `z.coerce.date()` + `endAt <= startAt` rejection, but BOTH optional here — see "Window applies only" note above); create/update handlers write to `deal_schedules` (insert-or-replace-the-single-row — see Execute-Agent Instruction E2 for the required mechanism, respecting the "at most one row" Phase-1 guardrail); list/detail/create/update responses include the resolved window via the serializer |
| `packages/api/src/routes/lib/serializers.ts` | `AdminDealProduct` (or a new `AdminDealSchedule` sub-shape) gains `startsAt: string \| null`, `endsAt: string \| null` — admin-only, does NOT touch `AdminProduct`/`serializeAdminProduct` (regular products never have schedule rows) and does NOT touch the public `ApiDeal`/`serializeDeal` (D2 — customer wire stays frozen) |
| `apps/admin/src/features/deals/components/deal-create-wizard.tsx` | Step 1 gains two `DateTimeField`s (Starts / Ends), following `offer-form.tsx`'s exact convention: `const [now] = useState(localNow)`, `min={now}` on Starts, `min={startsAt \|\| now}` on Ends (renamed `endMin` pattern) — **VALIDATE confirmed by direct read**: Step 1 is a plain controlled form (Name/Slug/Description), mechanically identical in shape to `offer-form.tsx`'s fields, and `handleCreate()`'s `DealCreateInput` object literal is the exact place `startsAt`/`endsAt` get added to the submit payload |
| `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx` | Manage page gains the same two `DateTimeField`s for editing an existing deal's window — **VALIDATE confirmed by direct read**: this route file holds its own inline form state (no separate `DealForm` component is used here, unlike the file name might suggest — `deal-form.tsx` exists in the tree but is not imported by this route), so the new fields and their save handler are added directly in this file, following the existing `priceInput`/`updateMutation.mutate({id, input:{...}})` pattern |
| `apps/admin/src/lib/entity-status.ts` | Extend `dealStatus` to also incorporate `windowPhase` when a window is present — see "Badge" below; `windowPhase` itself is REUSED verbatim (already handles non-null ISO strings; the nullable case is handled by the caller). **VALIDATE note (informational, non-blocking — see Execute-Agent Instruction E3):** `windowPhase` treats its boundary as CLOSED at `endAt` (`t > endAt` → expired, i.e. `t === endAt` still reads "active"), which differs from this plan's half-open `[starts_at, ends_at)` enforcement semantics by exactly one instant. This is a cosmetic-only divergence in the admin badge display, not a correctness gate — no AC in this plan tests the badge at the exact boundary instant. |
| `apps/admin/src/features/deals/lib/admin-deals-api.ts` (existing — **corrected from the vague `lib/*` reference in the original draft**) | Add `startsAt: string \| null` / `endsAt: string \| null` to `DealCreateInput` (flows automatically into `DealUpdateInput = Partial<DealCreateInput> & {isActive?: boolean}` and `AdminDealProduct`, confirmed by direct read — no separate edit needed to the `Update` type) |
| `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` (existing — **corrected path, was `packages/api/src/routes/admin/__tests__/...`**, extend) | New AC cases (see Verification Evidence) |
| `packages/api/src/routes/__tests__/orders.test.ts` (existing, extend — confirmed on disk at this exact path) | Window-closed-at-placement rejection case |
| `packages/api/src/routes/__tests__/branches.test.ts` (existing, extend — confirmed on disk at this exact path) | Menu-hidden-when-out-of-window case + zero-rows regression case |
| `apps/admin/src/features/deals/components/deal-create-wizard.test.tsx` (**NEW file — corrected, no such test exists today and `apps/admin` tests are co-located next to their source, no `__tests__/` subdirectory anywhere in the app**) | Wizard persists both dates |
| `apps/admin/src/lib/entity-status.test.ts` (existing — **corrected path, was `apps/admin/src/lib/__tests__/entity-status.test.ts`**, extend) | Badge Scheduled/Live/Expired cases |

## Public Contracts

- **`GET /branches/:id/menu?isDeal=true`** — response shape UNCHANGED (D2: hidden, not annotated).
  Only the row *set* changes (fewer rows when a deal is out-of-window); no new fields.
- **`POST /orders`** — no request-shape change. New rejection case: 400 with a specific message when
  a cart-line deal-product's window has closed. This is additive (a new way to get a 400 that could
  not happen before), not a breaking change to the existing contract.
- **`POST /api/admin/deals`, `PATCH /api/admin/deals/:id`** — additive optional `startsAt`/`endsAt`
  (ISO datetime strings or `null`) in both request body and response, following the exact optionality
  and validation convention of `offers.ts`'s `startAt`/`endAt` (coerced dates, `endAt <= startAt`
  rejected as 400) with the difference that **both fields stay optional/nullable here** (offers
  requires both; deals do not, since "always live" = no row at all is a first-class Phase-1 state).
- **`GET /deals`, `GET /deals/:id`** (public, legacy discount-model routes, unrelated to deal-products
  — confirmed dormant per `all-context.md`'s ADM-004 pivot notes) — UNTOUCHED. Confirmed out of scope;
  these do not serve deal-products and never did. **VALIDATE independently re-confirmed by direct
  read of `packages/api/src/routes/deals.ts`**: both routes query the `offers` table exclusively.
- **`GET /api/branches/:id`** (inline handler, `packages/api/src/index.ts`) — also UNTOUCHED and also
  out of scope, for the same reason: **VALIDATE confirmed by direct read** it serves a UNION over the
  legacy `offers`/`offerBranches` tables (the ADM-008 discount-coupon model), not `products.is_deal`
  rows. Not previously called out explicitly in this plan; added here for completeness since it is
  the endpoint referenced in the project's own `api-branches-two-handler-precedence` memory note.
- **Public `ApiDeal`/`serializeDeal`** (the customer-facing deal-product shape reused inside the menu
  response) — UNTOUCHED, per D2.

## Blast Radius

- **Packages touched:** `packages/api` (schema, 2 route files, 1 new lib file, serializers), `apps/admin` (2 feature files, 1 shared lib file).
- **Risk class:** none of auth/billing/schema-migration(destructive)/public-API-breaking/secrets apply strictly, BUT this is an **additive, non-destructive** schema migration (new nullable table) touching a money-adjacent surface (deal ordering/pricing eligibility) — treat as medium risk. Money math itself (`base_price`, discount computation) is untouched; this plan only gates *visibility and orderability*, not price.
- **File count:** ~13 files (7 new/modified in `packages/api`, 1 new schema file, 1 new lib file, 4 modified test files, 2 admin UI files, 1 admin lib file — see Touchpoints table for the authoritative list; test files come in ADDITION to the ~10 source files above).
- Regular (non-deal) product ordering and browsing: **zero behavior change** — verified via explicit regression tests (see Verification Evidence). **VALIDATE additionally confirmed this structurally, not just by test intent**: the existing `is_active` filter (`eq(products.is_active, true)`) already runs on the outer product query BEFORE any deal-schedule check would be added, so an in-window deal with `is_active=false` is excluded by the pre-existing filter alone — AC4 is satisfied by construction, not solely by the new code being written correctly.

## Implementation Checklist

1. **Schema first.** Create `packages/api/src/db/schema/deal_schedules.ts` (snake_case filename —
   see schema-shape correction P1) with the `deal_schedules` table + the half-open-inclusivity doc
   comment. Export from `schema/index.ts`. Run `pnpm --filter @jojopotato/api db:generate` to
   produce migration `0017_*`. Do NOT hand-author the SQL. Run `pnpm --filter @jojopotato/api
   db:migrate` locally to apply it.
   - Verify: migration file exists, `_journal.json` has a new `0017` entry, local migrate succeeds with zero errors.
2. **Shared window-check helper.** Create `packages/api/src/routes/lib/deal-schedule.ts` exporting a pure `isDealScheduleLive(rows: {starts_at: Date | null; ends_at: Date | null}[], now: Date): boolean` (empty array → `true`; else union-of-windows check against `now`) and `assertValidWindow(startsAt: Date | undefined, endsAt: Date | undefined): void` (throws/returns a Zod-style issue when both present and `startsAt >= endsAt`). Unit-test this file directly — it is the one piece of logic both enforcement points must share so they can never disagree (mirrors the `deal-availability.ts` precedent cited in Touchpoints).
   - Verify: new unit test file, pure-function coverage for empty/one-row/no-window-set cases, `starts_at >= ends_at` rejection.
3. **Enforce at the menu read path.** Modify `branches.ts`'s `?isDeal=true` branch to exclude products whose `deal_schedules` rows exist but none is live at `now`, using a targeted second query (mirroring `resolveAvailableDealProductIds`'s two-query batching style) that fetches raw schedule rows and calls `isDealScheduleLive()` per product — **per Execute-Agent Instruction E1, do NOT use an inline SQL join predicate for this check; this is no longer left open at EXECUTE's discretion.**
   - Verify: regular-catalog integration tests unchanged (0 regressions); new tests for future-window (absent), past-window (absent), zero-rows (present, unchanged), in-window-but-inactive (absent).
4. **Enforce at order placement.** Modify `orders.ts`'s per-line loop: after the existing `is_deal` component-availability check, add a targeted `deal_schedules` lookup for the deal-products in this cart, call the SAME shared `isDealScheduleLive()` helper (per E1 — never a re-derived boundary check), and reject via `OrderError(400, ...)` for any that are out-of-window at placement time (re-check against `now`, not against cart-add time — this is the literal AC).
   - Verify: new integration test placing an order for a deal whose window has already closed → 400 with the specific message; existing deal-order tests unaffected.
5. **Admin API — create/update.** Extend `createDealSchema`/`updateDealSchema` in `admin/deals.ts` with optional `startsAt`/`endsAt` (`z.coerce.date().optional()`), call `assertValidWindow` when both present, and write/replace the single `deal_schedules` row **using a transactional select-then-branch (or delete-then-insert) — per Execute-Agent Instruction E2, do NOT add a unique constraint on `deal_product_id` and do NOT use Drizzle's `.onConflictDoUpdate()`.** Enforce "at most one row per deal" (Phase-1 guardrail) inline via this replace-not-append mechanism, not as a DB constraint.
   - Verify: create-with-window persists row; update replaces window; update clearing window (both null) deletes the row (returns to "always live"); `startsAt >= endsAt` → 400.
6. **Serializer.** Add `startsAt`/`endsAt` to the admin deal-product response shape in `serializers.ts` (new fields on `AdminDealProduct`, NOT on `AdminProduct`), resolved from a joined/second-queried `deal_schedules` row per deal in list/detail/create/update responses.
   - Verify: response shape assertion test, `null` when no row exists.
7. **Admin badge.** Extend `dealStatus` in `entity-status.ts`: when a deal has a window (`startsAt`/`endsAt` both present — Phase 1 never has an open-ended single-row case in practice but handle it defensively per the schema's nullable-independently design) AND `is_active`, layer `windowPhase(startsAt, endsAt, now)` on top of the existing active/branch-availability logic → label becomes `Scheduled` (upcoming), `Live`/existing active label (active), or `Expired`. No window rows → existing behavior unchanged (falls through to the current `dealStatus` logic untouched).
   - Verify: new unit tests for Scheduled/Live/Expired states layered against each existing `dealStatus` branch (inactive, no-branches, active).
8. **Admin UI — wizard Step 1.** Add two `DateTimeField`s to `deal-create-wizard.tsx` Step 1, copying `offer-form.tsx`'s exact `localNow`/`min`/`endMin` pattern verbatim (both fields optional — no `required` prop, unlike offers).
   - Verify: component test asserting both fields render, submit includes `startsAt`/`endsAt` in the POST payload when filled, omits them when left blank.
9. **Admin UI — manage page.** Add the same two `DateTimeField`s to `deals.$dealId.tsx`, wired to `useUpdateDeal()`'s existing `mutate({id, input:{...}})` call shape.
   - Verify: component test asserting existing window pre-fills the fields (grandfathering per `DateTimeField`'s own documented behavior) and edits PATCH correctly.
10. **Full regression pass.** Run the complete `packages/api` and `apps/admin` suites, both typechecks, `pnpm format:check`.
    - Verify: all green, zero regressions, no new lint/format issues.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Deal with future `starts_at` absent from `?isDeal=true`, order rejected | Fully-Automated | AC1 |
| Deal with past `ends_at` absent from `?isDeal=true`, order rejected | Fully-Automated | AC2 |
| Deal with zero `deal_schedules` rows behaves exactly as before (explicit regression) | Fully-Automated | AC3 (no-backfill guarantee) |
| In-window deal with `is_active=false` remains hidden | Fully-Automated | AC4 |
| `startsAt >= endsAt` rejected 400 at admin API boundary | Fully-Automated | AC5 |
| Order for a deal whose window closed between cart-add and placement rejected with specific message | Fully-Automated | AC6 |
| Window boundary correct at exact `ends_at` instant (half-open: live at `ends_at - 1s`, not live at `ends_at`) | Fully-Automated | AC7 (Manila-midnight AC — see correction #1: satisfied by real-timestamp half-open comparison, no day-bucket arithmetic involved) |
| Admin wizard Step 1 persists both dates; manage page edits them | Fully-Automated (component test) | AC8 |
| Admin list badge distinguishes Scheduled / Live / Expired | Fully-Automated (component/unit test) | AC9 |
| Regular (non-deal) menu query unaffected — regression | Fully-Automated | (implicit AC — "Window applies only to is_deal=true rows") |
| Full `packages/api` suite green, zero regressions | Fully-Automated | AC10 (**corrected from "AC13" — the plan's Acceptance Criteria list only has 11 items; this row matches item 10 verbatim, see P4**) |
| `apps/admin` suite green | Fully-Automated | AC11 (**corrected from "AC14"**, matches item 11 verbatim) |

Known-Gap is banned for every row above — this is the correctness core (visibility + orderability +
money-adjacent gating) and the issue explicitly requires all of these as automated ACs. Phase 2/3 ACs
(recurrence overlap, cart-expiry mobile message) are out of scope for this plan and are not listed
here — they belong to future Phase 2/3 plans.

## Test commands

- `pnpm --filter @jojopotato/api test` (requires `docker compose up -d` — actually confirm at EXECUTE per `process/context/tests/all-tests.md`; local dev DB is native Postgres per project memory, not docker — then `pnpm --filter @jojopotato/api db:migrate`)
- `pnpm --filter @jojopotato/admin test`
- `pnpm --filter @jojopotato/api typecheck`
- `pnpm --filter @jojopotato/admin typecheck`
- `pnpm format:check`

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/deal-005-scheduled-deals_20-07-26/deal-005-scheduled-deals_PLAN_20-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (V1–V7, single pass). All Touchpoints/file-path claims independently re-verified against live source (not taken on trust) — see Dimension Findings and the inline `**VALIDATE ...**` annotations added throughout this plan.
3. **Validate-contract status:** written — **PASS** (20-07-26).
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/development-protocols/implementation-standards.md`, plus this VALIDATE pass's direct reads of every touched/reused source file: `packages/api/src/routes/{branches,orders,deals}.ts`, `packages/api/src/index.ts` (inline `GET /api/branches/:id` handler), `packages/api/src/routes/admin/{deals,offers}.ts`, `packages/api/src/routes/lib/{serializers,deal-availability}.ts`, `packages/api/src/db/schema/{deal_components,offers,products,index}.ts`, `apps/admin/src/lib/entity-status.ts`, `apps/admin/src/components/date-time-field.tsx`, `apps/admin/src/features/offers/components/offer-form.tsx`, `apps/admin/src/features/deals/{components/deal-create-wizard.tsx,lib/admin-deals-api.ts}`, `apps/admin/src/routes/(dashboard)/deals.$dealId.tsx`, `apps/mobile/src/features/deals/hooks/use-deal-products.ts`, plus a full `find` sweep confirming every claimed test-file path either exists or does not (3 path corrections found — see P2/P3/P5/P6). Also confirmed live: latest drizzle migration on disk is `0016`, so `0017` is correct.
5. **Next step for a fresh agent:** the mechanical EXECUTE gate is satisfied (`Gate: PASS` present in this file). Orchestrator may route to EXECUTE on explicit "ENTER EXECUTE MODE". EXECUTE starts at Implementation Checklist step 1 (schema), and MUST follow Execute-Agent Instructions E1/E2/E3 below — they are binding, not optional guidance.

## Acceptance Criteria

Mirrors the Phase-1 subset of issue #127's checklist (Phase 2/3 items excluded — out of scope):

1. A deal with `starts_at` in the future is absent from `?isDeal=true` and cannot be ordered.
2. A deal with `ends_at` in the past is absent from `?isDeal=true` and cannot be ordered.
3. A deal with zero `deal_schedules` rows behaves exactly as before this change (no-backfill regression test).
4. A deal in-window but `is_active = false` remains hidden.
5. `starts_at >= ends_at` is rejected at the admin API boundary.
6. Ordering a deal whose window closed between cart-add and placement is rejected server-side with a specific reason.
7. Window boundary is correct (half-open `[starts_at, ends_at)`, no day-bucket rounding — see correction #1).
8. Admin wizard Step 1 persists both dates; deal manage page edits them.
9. Admin list badge distinguishes Scheduled / Live / Expired.
10. Full `packages/api` suite green, zero regressions.
11. `apps/admin` suite green.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist steps complete, all automated gates green (see Test commands), zero regressions in either suite.
- **VERIFIED**: CODE DONE, plus every Verification Evidence row's Fully-Automated test is real and passing (Known-Gap banned per this plan's own gate table) — since every Phase-1 gate is Fully-Automated, there is no separate Agent-Probe walkthrough gating VERIFIED for this plan (unlike prior admin-dashboard phases with a UI-only residual). VERIFIED is reached purely by automated evidence plus a user glance at the admin UI (optional, not blocking).
- Do not mark this plan `✅ VERIFIED` without EVL-confirmed (independently re-run, not execute-agent's own report) green gates.

**✅ VERIFIED reached 20-07-26.** Commit `5e9261b4` on `adm-deal-005-p2`. EVL-confirmed by an
independently spawned tester (not execute-agent's self-report): API 505→547 tests, admin
111→127 tests, both typechecks clean, `pnpm format:check` clean, migration `0017` applies
cleanly. All 11 ACs Fully-Automated and passing (AC3/AC6 Known-Gap-banned per this plan's own
table, honored — no Known-Gap used anywhere). The optional user glance at the admin UI was also
performed and passed (empty-window, future-start hidden+Scheduled, past-end hidden+Expired,
in-window visible+Live, cleared-window visible, in-cart expiry rejection, inverted-window wizard
block). See `deal-005-scheduled-deals_REPORT_20-07-26.md` (co-located in this task folder) for
the full phase report. Task folder archived to `process/features/admin-dashboard/completed/`.

## Validate Contract

Status: PASS
Date: 20-07-26
date: 2026-07-20
generated-by: outer-pvl

Parallel strategy: sequential (single structured pass)
Rationale: signal score 3/7 (S2 admin API + new-table schema surface touched; S5 orchestrator
explicitly requested a focused, evidence-based fan-out across 6 named risk areas — read as a depth
request; S7 ~13-file blast radius) — MEDIUM by count, which would normally recommend parallel
subagents. This VALIDATE session has no Agent/Task tool available (Read/Bash/Write only), so the
Layer 1 (4 dimensions) and Layer 2 (per-section feasibility) roles were executed as a single
structured pass backed entirely by direct source reads and `find`/`grep` verification — not
inference, and not a rubber-stamp of the plan's own claims. Every enforcement-point, file-path, and
naming-convention claim below was independently re-checked against the live tree.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | deal with future `starts_at` absent from `?isDeal=true`, order rejected | Fully-Automated | `packages/api/src/routes/__tests__/branches.test.ts` — new case + `orders.test.ts` — new case | B |
| AC2 | deal with past `ends_at` absent from `?isDeal=true`, order rejected | Fully-Automated | `branches.test.ts` + `orders.test.ts` — new cases | B |
| AC3 (HARD, Known-Gap banned) | zero-`deal_schedules`-rows deal behaves exactly as before (no-backfill regression) | Fully-Automated | `branches.test.ts` — new explicit regression case | B |
| AC4 | in-window deal with `is_active=false` stays hidden | Fully-Automated | `branches.test.ts` — new case (structurally guaranteed by the pre-existing `is_active` filter — see Blast Radius note) | B |
| AC5 | `startsAt >= endsAt` rejected 400 at admin API boundary | Fully-Automated | `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` — new case | B |
| AC6 (HARD, Known-Gap banned) | order for a deal whose window closed between cart-add and placement rejected with specific reason | Fully-Automated | `orders.test.ts` — new case | B |
| AC7 | half-open boundary correct at exact `ends_at` instant | Fully-Automated | `branches.test.ts` and/or `packages/api/src/routes/lib/__tests__/deal-schedule.test.ts` (new file, step 2) — boundary-instant case | B |
| AC8 | admin wizard Step 1 persists both dates; manage page edits them | Fully-Automated (component test) | `apps/admin/src/features/deals/components/deal-create-wizard.test.tsx` (new file) + a manage-page edit case (co-located with `deals.$dealId.tsx`, exact filename TBD at EXECUTE) | B |
| AC9 | admin list badge distinguishes Scheduled / Live / Expired | Fully-Automated (unit test) | `apps/admin/src/lib/entity-status.test.ts` — new cases | B |
| implicit — regular-menu no-diff | regular (non-deal) menu query byte-identical to today | Fully-Automated | existing `branches.test.ts` suite unmodified (regression lock) | A |
| AC10 | full `packages/api` suite green, zero regressions | Fully-Automated | `pnpm --filter @jojopotato/api test` | A |
| AC11 | `apps/admin` suite green | Fully-Automated | `pnpm --filter @jojopotato/admin test` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle, pre-existing suite)
- B — fixed in this plan (gate added by this plan's Implementation Checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: every `strategy` value above is `Fully-Automated`. Known-Gap is never used —
AC3 and AC6 (both explicitly banned from Known-Gap by this plan's own Verification Evidence
section) are honored as real Fully-Automated gates, and every other AC follows the same standard.

Failing stubs (Fully-Automated rows, new-test rows only — B-resolution):
```
test("should exclude a deal with a future starts_at from the ?isDeal=true menu and reject placing it", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC1") })
test("should exclude a deal with a past ends_at from the ?isDeal=true menu and reject placing it", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC2") })
test("should list and allow ordering a deal with zero deal_schedules rows, unchanged from pre-Phase-1 behavior", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC3 no-backfill regression") })
test("should keep an in-window deal hidden when is_active is false", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC4") })
test("should reject startsAt >= endsAt with 400 at POST/PATCH /api/admin/deals", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC5") })
test("should reject POST /orders for a deal whose window closed between cart-add and placement, with a specific message", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC6") })
test("should treat a deal as live at starts_at exactly and not live at ends_at exactly (half-open boundary)", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC7") })
test("should persist startsAt/endsAt from the create wizard Step 1 and from the manage-page edit form", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC8") })
test("should render Scheduled/Live/Expired on the admin deal badge based on the resolved window", () => { throw new Error("NOT IMPLEMENTED — TDD stub: AC9") })
```

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/api` deal-schedule read/write/enforcement paths: Fully-automated: `pnpm --filter @jojopotato/api db:migrate && pnpm --filter @jojopotato/api test`
- `apps/admin` wizard/manage/badge UI: Fully-automated: `pnpm --filter @jojopotato/admin test`
- Typechecks: Fully-automated: `pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/admin typecheck`
- Formatting: Fully-automated: `pnpm format:check`

Dimension findings:
- Infra fit: PASS — no container/infra/runtime/port surface touched; additive nullable table via
  the standard `drizzle-kit generate` flow (confirmed `0017` is the correct next migration slot,
  latest on disk is `0016`); standard Express route + admin React form edits, no new service.
- Test coverage: PASS (after 3 path corrections applied directly to this plan — P2/P3/P5/P6) — all
  11 ACs correctly tiered Fully-Automated, Known-Gap explicitly banned for AC3/AC6 and honored (no
  Known-Gap used anywhere in this plan). Original Touchpoints table cited 3 test-file paths that do
  not match the real filesystem: `packages/api/src/routes/admin/__tests__/admin-deals.integration.test.ts`
  (real path is `packages/api/src/lib/__tests__/admin-deals.integration.test.ts`),
  `apps/admin/src/features/deals/components/__tests__/deal-create-wizard.test.tsx` marked "existing"
  when no such file exists at all (apps/admin tests are 100% co-located next to source, no
  `__tests__/` subdirectory exists anywhere in the app — confirmed via a full directory scan), and
  `apps/admin/src/lib/__tests__/entity-status.test.ts` marked "existing" when the real path is
  `apps/admin/src/lib/entity-status.test.ts` (also co-located, no subdirectory). All 3 corrected
  directly in the Touchpoints table above.
- Breaking changes: PASS — D2 confirmed: `GET /branches/:id/menu?isDeal=true` response shape
  unchanged (only row-set shrinks), verified against live `branches.ts` source; admin API changes
  are additive-optional fields only; `GET /deals`/`GET /deals/:id` and `GET /api/branches/:id`
  independently confirmed (by direct read, not by trusting the plan's own claim) to read the
  legacy `offers` table exclusively, not `products.is_deal` — genuinely out of scope, not merely
  asserted to be. Correction #1 (rejecting `manilaDateRangeToUtc` in favor of `offers.start_at`/
  `end_at`'s real-timestamp convention) independently confirmed correct by reading both
  `analytics-range.ts` (date-only bucketing) and `admin/offers.ts` (`z.coerce.date()` on a naive
  local string) side by side.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface touched. Admin routes
  inherit `requireAdmin` via the existing append-only `/api/admin` aggregator (unchanged pattern,
  confirmed live for `admin/deals.ts`'s existing routes). The new order-placement rejection is
  server-side and unconditional (mirrors the existing MENU-003 component-availability check
  immediately preceding its insertion point) — nothing client-supplied can bypass it.
- Schema feasibility (deal_schedules table + migration): PASS, 1 correction applied (P1 — filename
  must be snake_case `deal_schedules.ts` to match the 100%-consistent convention of every other
  multi-word file in `db/schema/`; the `routes/lib/` kebab-case file and the camelCase exported
  variable name were both already correct).
- Enforcement-points feasibility (branches.ts + orders.ts): PASS, with 1 design ambiguity resolved
  via Execute-Agent Instruction E1 — the Touchpoints table originally left "inline SQL join
  predicate vs. targeted second query" open for EXECUTE to decide freely. Independently confirmed
  the second-query approach is the only one that cleanly reuses the shared `isDealScheduleLive`
  helper at BOTH enforcement points (guaranteeing identical half-open boundary semantics at both
  sites — the plan's own stated goal for building that helper in the first place) and that
  naturally avoids the risk of a naive `INNER JOIN` silently excluding every zero-schedule-row deal
  (which would directly break AC3, the no-backfill guarantee). The plan's own Implementation
  Checklist step 3 already stated a preference for the second-query shape; E1 makes that preference
  binding rather than optional, closing the residual risk named in the VALIDATE brief.
- Admin API feasibility (create/update + serializer): PASS, with 1 design ambiguity resolved via
  Execute-Agent Instruction E2 — the schema as drafted has no unique constraint on
  `deal_product_id`, so Drizzle's `.onConflictDoUpdate()` ("upsert" in the strict sense) cannot
  target it without adding one. Adding such a constraint would directly contradict D3's entire
  rationale (Phase 2 needs MULTIPLE rows per deal for recurrence, so a Phase-1 unique constraint
  would have to be dropped again in a Phase 2 migration — the exact "second migration" D3 was
  chosen to avoid). E2 forbids adding the constraint and directs EXECUTE to the transactional
  select-then-branch (or delete-then-insert) technique instead, which needs no schema change and
  is fully compatible with D3.
- Admin UI feasibility (wizard Step 1 + manage page): PASS — both touchpoints confirmed mechanically
  buildable by direct read: `deal-create-wizard.tsx` Step 1 is a plain controlled form with a clear
  insertion point matching `offer-form.tsx`'s `DateTimeField`/`localNow`/`endMin` pattern exactly;
  `deals.$dealId.tsx` holds its own inline form state (not a separate `DealForm` component) and
  already has the exact `updateMutation.mutate({id, input:{...}})` shape the new fields slot into.
  `DealCreateInput`/`DealUpdateInput` type-flow confirmed: `DealUpdateInput = Partial<DealCreateInput>
  & {isActive?: boolean}`, so adding `startsAt`/`endsAt` to `DealCreateInput` alone (in
  `admin-deals-api.ts`, the exact file — corrected from the original vague `lib/*` reference)
  automatically covers both create and update payload types.
- Admin badge feasibility (entity-status.ts): PASS, with 1 informational note (Execute-Agent
  Instruction E3, non-blocking) — `windowPhase`'s boundary is closed at `endAt` (`t === endAt` still
  reads "active"), one instant different from this plan's half-open enforcement semantics. Cosmetic
  only; no AC in this plan tests the badge at the exact boundary instant, and `windowPhase` needs no
  code change — only the caller (`dealStatus`) needs the nullable-guard the plan already specifies.
- Test-file-path feasibility: CONCERN found and RESOLVED directly in this plan (3 wrong paths
  corrected, see Test coverage finding above) — not deferred as an Execute-Agent Instruction because
  these are objective filesystem facts, not judgment calls.

Open gaps: none. All findings above were either (a) already correct in the original plan, (b)
directly corrected in the plan text (file paths, filename), or (c) converted into a binding
Execute-Agent Instruction (E1, E2) or a non-blocking informational note (E3). No Known-Gap rows
exist in this contract.

What this coverage does NOT prove:
- AC1–AC9 gates prove the DB-level window logic (list filtering, order rejection, badge
  derivation) is correct against a real Postgres instance with the exact schema shape described.
  They do not prove the mobile app surfaces any window-related messaging — Phase 3 (out of scope)
  owns that, and this plan deliberately keeps the customer wire contract unchanged (D2).
- This VALIDATE pass confirms every enforcement-point insertion location, file path, and naming
  convention against the LIVE tree as of 20-07-26. It does not (and cannot, since the new code
  does not exist yet) prove the new AC1–AC9 test cases themselves pass — that proof happens at
  EXECUTE/EVL, against the real new code.
- E1/E2's binding instructions reduce, but do not eliminate, ordinary implementation risk — EXECUTE
  must still write the second-query/`isDealScheduleLive` integration and the transactional
  single-row-replace logic correctly; VALIDATE has confirmed the SHAPE is right, not that the
  eventual code is bug-free.
- No adversarial/concurrency probe was run against the new order-placement rejection (e.g. a
  window closing in the exact instant between the targeted `deal_schedules` lookup and the order
  insert, inside the same transaction). This mirrors the plan's own accepted precedent (MENU-003's
  unlocked, non-`FOR UPDATE` component-availability read) and is not treated as a new gap.

Gate: PASS (0 FAILs, 0 unresolved CONCERNs — 3 objective path/filename corrections applied directly
to this plan file, 2 design ambiguities converted into binding Execute-Agent Instructions (E1, E2),
1 cosmetic-only note recorded (E3). No FAIL was found in any dimension or enforcement-point check.)

## Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | For the `branches.ts` menu-query enforcement point, use a targeted second query (mirroring `resolveAvailableDealProductIds`'s two-query batching shape in `deal-availability.ts`) that fetches raw `deal_schedules` rows per candidate deal-product and calls the shared `isDealScheduleLive(rows, now)` helper from `deal-schedule.ts`. Do NOT implement this as an inline SQL join predicate reimplementing the half-open boundary logic in raw SQL — the two enforcement points (menu query, order placement) must call the exact same JS function so their boundary semantics can never diverge, and a naive `INNER JOIN` shape risks silently excluding every zero-schedule-row deal (breaking AC3). | Implementation Checklist step 3 |
| E2 | For the admin create/update single-row write (`admin/deals.ts`), do NOT add a unique constraint on `deal_schedules.deal_product_id` and do NOT use Drizzle's `.onConflictDoUpdate()`. Implement the "at most one row per deal" replace via a transactional select-then-branch (fetch existing row for this deal, then UPDATE or INSERT accordingly) or delete-then-insert. A unique constraint would make Phase 2's multi-row recurrence rows impossible without a follow-up migration to drop it — directly undermining D3's "zero data migration for Phase 2" rationale. | Implementation Checklist step 5 |
| E3 (informational, non-blocking) | `windowPhase()` in `entity-status.ts` uses a closed-at-`endAt` boundary (`t === endAt` reads "active"), one instant different from this plan's half-open `[starts_at, ends_at)` enforcement. No code change is required — this is a cosmetic admin-badge-only divergence and no AC tests the exact boundary instant on the badge. If a future plan ever needs the badge to match enforcement exactly at the instant boundary, `windowPhase` will need its own half-open variant; not needed for Phase 1. | Implementation Checklist step 7, awareness only |

## Plan Updates Applied

| # | What changed | Where in plan | Why |
|---|---|---|---|
| P1 | `deal-schedules.ts` → `deal_schedules.ts` (schema filename) | Schema shape section, Touchpoints table, Implementation Checklist step 1 | Every other multi-word file in `db/schema/` is snake_case (confirmed exhaustively); kebab-case would be the only exception |
| P2 | `packages/api/src/routes/admin/__tests__/admin-deals.integration.test.ts` → `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` | Touchpoints table | Wrong path in original draft — confirmed the real file location via `find` |
| P3 | `apps/admin/src/features/deals/components/__tests__/deal-create-wizard.test.tsx` (existing, extend) → same path minus `__tests__/` (NEW file) | Touchpoints table | No such file exists at all; `apps/admin` tests are 100% co-located, no `__tests__/` subdirectory exists anywhere in the app |
| P4 | Verification Evidence table's last two rows: "AC13"/"AC14" → "AC10"/"AC11" | Verification Evidence | Off-by-numbering bug — the Acceptance Criteria section only has 11 items, and items 10/11 are exactly "full API suite green"/"admin suite green", matching what the table mislabeled as AC13/AC14 |
| P5 | `apps/admin/src/lib/__tests__/entity-status.test.ts` (existing) → `apps/admin/src/lib/entity-status.test.ts` (existing) | Touchpoints table | Wrong path — real file is co-located, no `__tests__/` subdirectory |
| P6 | `apps/admin/src/features/deals/lib/*` (vague, "exact path confirmed at EXECUTE") → `apps/admin/src/features/deals/lib/admin-deals-api.ts` (exact) | Touchpoints table | The exact file was trivially discoverable and is the one file that needs the type addition; no reason to leave it open |

## Autonomous Goal Block

SESSION GOAL: Ship DEAL-005 Phase 1 — a nullable `[starts_at, ends_at)` window on deal-products,
enforced identically at the menu-read path and order-placement path via one shared helper, with
admin CRUD/UI/badge support. Out-of-window deals are hidden, not annotated (D2); zero-schedule-row
deals stay always-live (no-backfill guarantee, AC3, Known-Gap banned).
Charter + umbrella plan: N/A — single COMPLEX plan, not part of a phase program (the
`admin-dashboard_14-07-26` 8-phase program is separately COMPLETE and does not govern this work).
Autonomy: standard RIPER-5 autonomy rules — CONDITIONAL findings from this VALIDATE pass were
already resolved in-plan (3 path corrections applied directly, 2 design ambiguities locked via
Execute-Agent Instructions E1/E2); EXECUTE requires explicit "ENTER EXECUTE MODE" per
plan-lifecycle.md; irreversible/outward-facing actions (migration apply against a shared dev DB,
any production-adjacent step) require explicit confirmation before running.
Hard stop conditions / safety constraints:
- AC3 (zero-schedule-rows deal behaves exactly as before) and AC6 (window-closed-at-placement
  rejection) must be proven by real, passing Fully-Automated tests — Known-Gap is explicitly banned
  for both by this plan's own Verification Evidence table.
- Both enforcement points (menu query, order placement) MUST call the same shared
  `isDealScheduleLive()` helper (Execute-Agent Instruction E1) — never two independently
  re-derived boundary checks.
- Do NOT add a unique constraint on `deal_schedules.deal_product_id` (Execute-Agent Instruction
  E2) — it would silently undermine Phase 2's planned multi-row recurrence design (D3).
- Do NOT add window fields to any public/customer-facing wire contract (`GET /deals`,
  `GET /deals/:id`, `GET /branches/:id/menu`'s deal-product shape, `GET /api/branches/:id`) — D2 is
  locked; Phase 3 owns the customer-facing contract change if it ever happens.
- No schema change to `products`; the window lives exclusively on the new `deal_schedules` table.
- Work lands on `adm-deal-005-p2` (already checked out) — do not create a new branch.
Test gates: `pnpm --filter @jojopotato/api test` (needs local Postgres migrated to `0017`),
`pnpm --filter @jojopotato/admin test`, `pnpm --filter @jojopotato/api typecheck`,
`pnpm --filter @jojopotato/admin typecheck`, `pnpm format:check` — all must be green before EXECUTE
reports done; EVL independently re-runs all five before UPDATE PROCESS.
Validate contract: inline in this plan file (see `## Validate Contract` above). Gate: PASS.
Next phase: EXECUTE — Gate: PASS confirmed (VALIDATE, single pass, 20-07-26). Awaiting explicit
"ENTER EXECUTE MODE". EXECUTE starts at Implementation Checklist step 1 (schema) and must honor
Execute-Agent Instructions E1/E2/E3 above as binding, not advisory.
