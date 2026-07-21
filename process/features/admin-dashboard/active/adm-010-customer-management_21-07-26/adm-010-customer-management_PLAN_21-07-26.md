---
name: plan:adm-010-customer-management
description: "Admin Customer Management — read-only list/search/detail for role=customer accounts (issue #125)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-010 — Customer Management: List, Search, View (PLAN)

Complexity: **mid-COMPLEX** single standalone plan (NOT a phase program). ~9-10 files, `packages/api`
+ `apps/admin`, zero schema change.

SPEC: `adm-010-customer-management_SPEC_21-07-26.md` (same folder). All product decisions (D1 PII
field set, D2 detail composite scope, D3 single `q=` search) are LOCKED there — this plan is
mechanical "how," not further design debate.

**Date**: 21-07-26
**Status**: PLAN — VALIDATE complete (Gate: PASS), awaiting EXECUTE

## Acceptance Criteria

Carried verbatim from SPEC (`adm-010-customer-management_SPEC_21-07-26.md`) — see that file for
full `proven by:`/`strategy:` detail per criterion; summarized here for plan self-containment:

1. `GET /api/admin/customers` cursor-paginated, role=customer only, newest-first, correct fields.
2. Cursor pagination round-trips with no dupes/gaps; null cursor on the final page.
3. `q=` search filters by name OR email OR phone (partial, case-insensitive), composes with pagination.
4. `GET /api/admin/customers/:id` returns the full locked field set + star balance + recent orders; no auth-internal fields ever appear.
5. `GET /api/admin/customers/:id` 404s for a non-customer id and for a nonexistent id.
6. Zero mutating verb exists anywhere under `/api/admin/customers*`.
7. Only admin/super_admin can reach any `/api/admin/customers*` route (403 staff/customer, 401 unauthenticated).
8. The Customers screen renders/behaves correctly in a real browser (search, pagination, detail render, zero editable controls, light/dark legibility) — Agent-Probe, standing project-wide gap.

## Phase Completion Rules

- **CODE DONE**: all Implementation Checklist items 1-19 complete, all 6 automated test gate
  commands (see Test Gate Commands) green, zero regressions in existing admin/api suites.
- **VERIFIED**: CODE DONE, plus the AC8 Agent-Probe manual browser walkthrough has been performed
  and passed by the user. Until then the plan stays in `active/`, status stays CODE DONE — do not
  mark VERIFIED on automated-green alone (matches the standing convention for every prior
  admin-dashboard phase with a UI-layer Agent-Probe gate, e.g. ADM-005 G10, ADM-006, ADM-007 AC9).
- Task-folder archival (`active/` → `completed/`) only happens after VERIFIED.

## Overview

Admins currently have no way to look up a customer account in the dashboard. This plan adds a
read-only Customers module mirroring ADM-006 Orders structurally: a cursor-paginated, searchable
list (`GET /api/admin/customers`) and a composite detail view (`GET /api/admin/customers/:id`)
showing full profile + star balance + last-10 orders. Zero mutation verbs. Zero schema change.

## Goals

- `GET /api/admin/customers` — cursor list, `role='customer'` only, `q=` search across
  name/email/phone (ILIKE, OR-combined), newest-signup-first.
- `GET /api/admin/customers/:id` — composite detail: full profile (per SPEC D1) + `user_stars`
  balance + last-10 orders (via `serializeAdminOrderSummary` reused verbatim). 404 for
  non-customer roles and unknown ids.
- `apps/admin` Customers screen: search input (debounced) + paginated table + read-only detail
  view. New `customers` nav entry, distinct from ADM-009's `staff`/`users` entry.
- Zero write path anywhere under `/api/admin/customers*`.

## Scope

In scope: 1 new backend route file, 2 new serializers + 1 helper reused, 1 aggregator mount line,
1 integration test file, ~6 new `apps/admin` files, 1 nav-config append. Out of scope: everything
listed in SPEC's "Out Of Scope" section (no writes, no staff/role management, no full order
history pagination in-detail, no search-relevance tuning, no bulk actions).

---

## Pre-EXECUTE Note (mandatory first EXECUTE step)

**Re-scan `apps/admin/src/config/nav-config.ts` and `packages/api/src/routes/admin/index.ts`
immediately before editing either file.** Both were confirmed on disk at PLAN time (and
re-confirmed at VALIDATE time, 21-07-26 — see `## Validate Contract`) to already carry ADM-009's
landed shape:
- `nav-config.ts` Management group already has `{ id: 'users', label: 'Staff', icon: Users, to: '/staff' }` (ADM-009 renamed it from the old disabled `Users & Roles` placeholder). Do NOT touch this entry.
- `routes/admin/index.ts` already mounts `adminRouter.use('/staff', staffRouter)` as the 12th
  aggregator consumer. ADM-010 appends as the 13th — do not restructure, do not renumber existing
  comments.

**VALIDATE-time note:** at VALIDATE (21-07-26), ADM-009's changes were confirmed present in the
working tree but still **uncommitted** on branch `feat/adm-009-staffmngmt`. If EXECUTE runs in a
fresh session/branch and these files do NOT show ADM-009's shape, the checklist below still works
correctly (append after whatever the live tail is) — just re-derive the exact insertion point and
consumer-number comment from the live file, never assume this plan's line numbers or "13th"
literally.

If either file has changed shape further since this plan was written (ADM-009 continuing to land
in parallel), re-derive the exact insertion point from the live file — never assume line numbers
from this plan.

---

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/routes/admin/customers.ts` | **NEW** — `GET /` (list) + `GET /:id` (detail) |
| `packages/api/src/routes/admin/index.ts` | append `adminRouter.use('/customers', customersRouter)` |
| `packages/api/src/routes/lib/serializers.ts` | append `AdminCustomerSummary`, `AdminCustomerDetail`, `serializeAdminCustomerSummary`, `serializeAdminCustomerDetail` |
| `packages/api/src/routes/admin/__tests__/admin-customers.integration.test.ts` | **NEW** — full AC1-AC7 coverage |
| `apps/admin/src/features/customers/lib/admin-customers-api.ts` | **NEW** — fetch wrapper + types |
| `apps/admin/src/features/customers/hooks/use-debounced-value.ts` | **NEW** — ~10-line debounce hook |
| `apps/admin/src/features/customers/hooks/use-admin-customers.ts` | **NEW** — react-query hooks |
| `apps/admin/src/features/customers/components/customer-list.tsx` (+ `.test.tsx`) | **NEW** — search input + table + pagination |
| `apps/admin/src/features/customers/components/customer-detail.tsx` (+ `.test.tsx`) | **NEW** — read-only detail view |
| `apps/admin/src/routes/(dashboard)/customers.tsx` | **NEW** — thin `<Outlet/>` layout |
| `apps/admin/src/routes/(dashboard)/customers.index.tsx` | **NEW** — list screen |
| `apps/admin/src/routes/(dashboard)/customers.$customerId.tsx` | **NEW** — detail screen |
| `apps/admin/src/config/nav-config.ts` | append `customers` nav entry (Management group) |

**Not touched, reused verbatim:** `require-admin.ts`/`requireAdmin` guard, `routes/admin/lib/errors.ts` (`handleAdminError`), `serializeAdminOrderSummary` (recent-orders rows), `db/schema/users.ts`, `db/schema/user_stars.ts`, `db/schema/branches.ts`, shared `apps/admin` composites (`data-table.tsx`, `query-states.tsx`, `page-header.tsx`, `status-badge.tsx` if useful for verified badges — optional), `apps/admin/src/lib/query-client.ts`.

## Public Contracts

### `GET /api/admin/customers`

Query params: `q?: string` (free-text, ILIKE across name/email/phoneNumber, OR-combined),
`cursor?: string` (ISO `createdAt` of last row), `limit?: number` (default 20, clamp 1-50, lenient
— out-of-range clamped not rejected, matching ADM-006 D3).

Response `200`:
```json
{ "customers": [ { "id": "...", "name": "...", "email": "...", "phoneNumber": "...|null", "createdAt": "ISO" } ], "nextCursor": "ISO|null" }
```

Role gate: inherited `requireAdmin` — `admin`/`super_admin` only (403 staff/customer, 401
unauthenticated). No per-route reimplementation.

### `GET /api/admin/customers/:id`

Response `200`:
```json
{
  "customer": {
    "id": "...", "name": "...", "email": "...", "phoneNumber": "...|null", "createdAt": "ISO",
    "birthday": "date|null", "address": "...|null", "marketingOptIn": true,
    "emailVerified": true, "phoneNumberVerified": false,
    "favoriteBranchName": "...|null", "onboardedAt": "ISO|null",
    "starsBalance": { "current": 0, "lifetime": 0 } | null,
    "recentOrders": [ /* AdminOrderSummary[], max 10, newest-first */ ]
  }
}
```

`404` (generic body, no discriminating message) when: id is not a valid uuid, id doesn't exist,
OR id exists but `role !== 'customer'` — a staff id and a nonexistent id are indistinguishable by
design (id-enumeration prevention, mirrors ADM-006 `orders.ts:163-166` malformed-id-→-404
pattern).

No mutating verb (`POST`/`PATCH`/`PUT`/`DELETE`) exists anywhere under `/api/admin/customers*`.

## Blast Radius

- **Packages touched:** `packages/api` (new route file, 4 new serializer exports, 1 aggregator
  line), `apps/admin` (new feature folder, 3 new route files, 1 nav-config line).
- **Risk class:** none of the standing high-risk classes (auth/billing/schema-migration/public-API-
  breaking-change/deploy) apply — this is additive-only, read-only, zero schema change, zero
  existing-endpoint modification. `~9-10` net-new files, no existing test file edited except the
  aggregator append and nav-config append (both single-line, additive).
- **Zero schema/migration.** `users`/`user_stars`/`orders` tables read-only, no new columns.
- **Zero existing route modified.** `GET /api/admin/me`, `POST /api/admin/users/:id/role`,
  ADM-009's `staff.ts`, ADM-006's `orders.ts` are all untouched.

## Implementation Checklist

### Backend (`packages/api`)

1. **Re-scan `routes/admin/index.ts`** (Pre-EXECUTE Note above) to confirm insertion point.
2. In `packages/api/src/routes/lib/serializers.ts`, append (near the existing Admin order
   serializers section, following the same local-declaration convention as `AdminOrderSummary`):
   - **[VALIDATE P1]** `UserRow`/`UserStarsRow` are NOT pre-existing exported types — define them
     locally in `serializers.ts` following the exact same convention as the existing `OrderRow`
     alias (`type OrderRow = InferSelectModel<typeof orders>;`, confirmed at
     `packages/api/src/routes/lib/serializers.ts:36`): add `type UserRow =
     InferSelectModel<typeof users>;` and `type UserStarsRow = InferSelectModel<typeof
     userStars>;` (import `users`/`userStars` from `../../db/schema/index` alongside the existing
     imports — `userStars` is exported from that index via `export * from './user_stars'`).
   - `AdminCustomerSummary` interface: `{ id: string; name: string; email: string; phoneNumber: string | null; createdAt: string }`.
   - `AdminCustomerDetail` interface: extends the summary fields, adds `birthday: string | null; address: string | null; marketingOptIn: boolean; emailVerified: boolean; phoneNumberVerified: boolean; favoriteBranchName: string | null; onboardedAt: string | null; starsBalance: { current: number; lifetime: number } | null; recentOrders: AdminOrderSummary[]`.
   - `serializeAdminCustomerSummary(user: UserRow): AdminCustomerSummary` — trivial field mapping,
     `createdAt` via `.toISOString()`.
   - `serializeAdminCustomerDetail(user: UserRow, starsRow: UserStarsRow | null, branchName: string | null, recentOrders: AdminOrderSummary[]): AdminCustomerDetail` — spreads
     `serializeAdminCustomerSummary(user)`, adds the extra fields; `birthday` — drizzle `date()`
     columns come back as `string | null` already (confirm at EXECUTE — no `.toISOString()` needed
     for a `date` column, only for `timestamp`); `onboardedAt` is a `timestamp`, needs
     `?.toISOString() ?? null`; `starsBalance` is `null` when no `user_stars` row exists (a user
     who has never earned/spent a star may have zero rows — do not assume a row always exists).
3. Create `packages/api/src/routes/admin/customers.ts`:
   - File-header comment mirroring `orders.ts`'s style: ADM-010 #125, READ-ONLY, `GET` only, 13th
     append-only aggregator consumer, PII scope per SPEC D1.
   - `const uuidSchema = z.string().uuid()`, `DEFAULT_LIST_LIMIT = 20`, `MAX_LIST_LIMIT = 50` (copy
     ADM-006 constants verbatim).
   - `GET /`:
     - Parse `limit`/`cursor` leniently OUTSIDE Zod (verbatim ADM-006 pattern — unparseable cursor
       = no cursor, out-of-range limit clamped).
     - Build `conditions = [eq(users.role, 'customer')]`; if `q` present, push
       `or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phoneNumber, `%${q}%`))`.
       **Add a one-line comment:** `phoneNumber` is nullable — `ILIKE` against `NULL` evaluates to
       `NULL` (not a match), which is the correct, desired behavior, not a bug to guard against.
     - If cursor present, push `lt(users.createdAt, cursor)`.
     - `db.select().from(users).where(and(...conditions)).orderBy(desc(users.createdAt)).limit(limit + 1)`.
     - `hasMore` / `page` / `nextCursor` exactly as ADM-006's pattern (ISO string of last row's
       `createdAt`, `null` on the final page).
     - Map `page` through `serializeAdminCustomerSummary`. Respond
       `{ customers: [...], nextCursor }`.
   - `GET /:id`:
     - `uuidSchema.safeParse` — fail → `404` (never `400`, matches SPEC criterion 5 + the
       id-enumeration-prevention design).
     - Fetch the user row; if absent OR `row.role !== 'customer'` → `404` with a generic body
       (same message either way — do not let the body text differ between "not found" and "not a
       customer", or the 404 becomes distinguishable and leaks role information).
     - Fetch `user_stars` row by `user_id` (may be absent → `null`).
     - If `favoriteBranchId` is set, fetch the branch name (`select({name: branches.name})...`);
       else `null`.
     - Fetch last 10 orders for this `user_id`: `db.select().from(orders).where(eq(orders.user_id, id)).orderBy(desc(orders.placed_at)).limit(10)`, batch-load their `orderItems` via
       `inArray` (mirror ADM-006's item batch-load), then map each through
       `serializeAdminOrderSummary(order, items, { name: user.name, phoneNumber: user.phoneNumber }, { name: branchName ?? 'Unknown' })` — **reuse verbatim, do not reimplement.**
       Note: `serializeAdminOrderSummary` needs a branch name per order (each order may be at a
       different branch than the customer's favorite branch) — batch-load ALL distinct
       `branch_id`s from the fetched orders the same way ADM-006's list route does, not just the
       customer's favorite branch.
     - Respond `{ customer: serializeAdminCustomerDetail(...) }`.
   - Wrap both handlers in `try/catch` → `handleAdminError(err, res, '...')`, matching ADM-006.
4. In `packages/api/src/routes/admin/index.ts`, append (after the `staff` mount, preserving the
   existing comment style): `import customersRouter from './customers';` at the top with the other
   imports, and `adminRouter.use('/customers', customersRouter);` with a one-line comment noting
   ADM-010 #125, 13th append-only aggregator consumer.
5. **Test gate:** `pnpm --filter @jojopotato/api typecheck` — green before writing tests.
6. Create `packages/api/src/routes/admin/__tests__/admin-customers.integration.test.ts` using the
   `makeUser(role)` self-seeding fixture (copy the helper import/setup pattern from
   `admin-orders.integration.test.ts` verbatim — same DB, same cookie-auth flow). Seed at minimum:
   2+ `customer` users (one fully-populated profile incl. birthday/address/favoriteBranch/orders/
   user_stars row, one sparsely-populated with nulls and zero orders/no user_stars row), 1 `staff`
   user, 1 `admin` user (for the role matrix), enough customers to exercise pagination (5+),
   customers with distinguishing name/email/phone substrings for the search tests. Cover exactly
   the 7 automated ACs from SPEC (see Verification Evidence below) — do not invent additional
   scope.
   - **[VALIDATE P2]** The AC4 negative field-absence assertion must **NOT** mirror ADM-006's
     exact denylist verbatim. ADM-006's own denylist test (`admin-orders.integration.test.ts` AC6)
     asserts `not.toHaveProperty('email')` AND `not.toHaveProperty('emailVerified')` — correct for
     ADM-006's narrower D2 boundary (name+phone only). ADM-010's D1 boundary is different: `email`,
     `emailVerified`, and `phoneNumberVerified` are explicitly LOCKED-IN allowed detail fields here
     — assert their **presence**, not absence, for a fully-populated customer. The negative
     assertion in THIS suite should instead target genuine auth-internal field names that must
     never appear on any `users`-row-derived response regardless of surface — e.g. `password`,
     `passwordHash`, `hashedPassword`, `sessionToken`, `verificationToken`. None of these exist as
     columns on the `users` table today (confirmed via schema read — they live on better-auth's
     separate `session`/`account`/`verification` tables), so this assertion locks that
     non-exposure going forward, exactly as SPEC criterion 4 intends. Also include a companion
     `expect(JSON.stringify(res.body)).not.toContain(<the seeded staff user's email>)` style check
     is NOT needed here (unlike ADM-006) since email IS meant to appear for the customer in
     question — do not add a cross-contamination string check that would falsely fail.
7. **Test gate:** `pnpm --filter @jojopotato/api test` — full suite green (new suite + zero
   regressions in existing admin suites, especially `admin-orders`/`admin-staff` since this touches
   the shared `index.ts` aggregator).

### Frontend (`apps/admin`)

8. **Re-scan `nav-config.ts`** (Pre-EXECUTE Note) — confirm the exact current shape before editing.
9. Create `apps/admin/src/features/customers/lib/admin-customers-api.ts` — mirror
   `admin-orders-api.ts`'s shape exactly: `AdminApiError` class (or import/reuse if a shared one
   exists — check `admin-branches-api.ts`/`admin-orders-api.ts` for duplication before adding a
   third copy; if duplicated 2+ times already, keep the pattern consistent, do not extract
   speculatively this phase — **confirmed at VALIDATE: `AdminApiError` is already independently
   duplicated in 10 existing `apps/admin/src/features/*/lib/*.ts` files, so a fresh local copy here
   is the established convention, not a new debt**), `request<T>()` helper, `AdminCustomerSummary`/`AdminCustomerDetail`
   client-side types (mirroring the server serializer shapes), `CustomersPage { customers: AdminCustomerSummary[]; nextCursor: string | null }`, `listCustomers(q: string, cursor: string | null): Promise<CustomersPage>`, `getCustomer(id: string): Promise<AdminCustomerDetail>`.
10. Create `apps/admin/src/features/customers/hooks/use-debounced-value.ts`:
    ```
    export function useDebouncedValue<T>(value: T, delayMs = 300): T {
      const [debounced, setDebounced] = useState(value);
      useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
      }, [value, delayMs]);
      return debounced;
    }
    ```
    No debounce library, no `useDeferredValue` (SPEC explicitly rejects both — `useDeferredValue`
    defers render priority, not the network request timing).
11. Create `apps/admin/src/features/customers/hooks/use-admin-customers.ts`:
    - `useAdminCustomers(q: string)` — `useInfiniteQuery` keyed on `['admin', 'customers', q]`
      (mirror `useAdminOrders`'s `useInfiniteQuery` shape; the caller passes the ALREADY-DEBOUNCED
      `q` value into this hook — debouncing happens in the component before the key is built, not
      inside this hook).
    - `useAdminCustomer(id: string)` — plain `useQuery` keyed on `['admin', 'customer', id]`,
      `enabled: id.length > 0` (mirror `useAdminOrder`).
12. Create `apps/admin/src/features/customers/components/customer-list.tsx` (+ `.test.tsx`):
    - Controlled `<input>` for search (raw value in local `useState`, fed through
      `useDebouncedValue` before being passed to `useAdminCustomers`).
    - Reuse `DataTable` (`@/components/data-table`) for the name/email/phone/joined columns and
      `QueryStates` (`@/components/query-states`) for loading/error/empty states — check both
      components' actual prop shapes at EXECUTE time (read `order-list.tsx` for the exact
      `DataTable`/`QueryStates` usage pattern) rather than guessing the API.
    - Empty search → full list (no special-case empty-search branch needed if the query naturally
      omits `q=` when the debounced value is `''`).
    - Row click → caller-supplied `onView` callback (mirror `OrderList`'s `onView` prop).
    - "Load more" button pattern identical to `orders.index.tsx` (only rendered when
      `hasNextPage`).
    - `.test.tsx`: at minimum, render with mock data, assert columns render, assert `onView` fires
      on row click. Do not attempt to test the debounce timing itself in a component test (that's
      the Agent-Probe AC8's job) — a focused hook-level test could optionally verify
      `useDebouncedValue`'s timer behavior with `vi.useFakeTimers()` if time permits, but is not a
      blocking gate.
13. Create `apps/admin/src/features/customers/components/customer-detail.tsx` (+ `.test.tsx`):
    - Pure display component, no editable controls anywhere (SPEC AC8 hard requirement — no
      `<input>`, `<Button>` other than back/nav, no save/toggle).
    - Render every D1/D2 field; null fields render a visible "—" or "Not set" placeholder, never a
      blank/undefined-looking gap (this is what the sparsely-populated-customer walkthrough in
      AC8 checks).
    - Stars balance: if `starsBalance` is `null`, render "No star activity yet" rather than "0/0"
      (distinguishes "never earned a star" from "earned then spent all stars").
    - Recent orders: reuse whatever row-rendering pattern `OrderList`/`order-list.tsx` uses for a
      compact summary row (order number, status via `status-badge.tsx` if convenient, placed date,
      total) — do not build a second bespoke order-row renderer if the existing one can be reused
      or trivially adapted; if not directly reusable, a simple local table is fine (this is a
      read-only summary list, not the full Orders screen).
    - `.test.tsx`: render with a fully-populated customer fixture (assert all fields visible) and a
      sparsely-populated one (assert null fields show a placeholder, not blank); assert exactly
      zero interactive form controls are present (e.g. `screen.queryAllByRole('button')` contains
      only nav/back-type buttons, `screen.queryAllByRole('textbox')` is empty).
14. Create the 3-file route split (mandatory — TanStack Start nested-detail-route `<Outlet/>`
    gotcha, see SPEC Background):
    - `apps/admin/src/routes/(dashboard)/customers.tsx` — thin `<Outlet/>` layout, copy
      `orders.tsx` verbatim structure with `customers` substituted.
    - `apps/admin/src/routes/(dashboard)/customers.index.tsx` — list screen wiring `PageHeader` +
      `customer-list.tsx` + `useAdminCustomers`, mirror `orders.index.tsx` structure (search input
      replaces the filter bar; no branch-filter dropdown — SPEC has no such filter).
    - `apps/admin/src/routes/(dashboard)/customers.$customerId.tsx` — detail screen wiring
      `PageHeader` + `customer-detail.tsx` + `useAdminCustomer`, mirror `orders.$orderId.tsx`'s
      loading/error/not-found handling (a 404 from the API must render a clear not-found state per
      SPEC's flow diagram, not a raw error dump — `QueryStates` renders the server's error message
      text in this case, matching ADM-006's existing precedent exactly; this is not a new gap).
15. In `apps/admin/src/config/nav-config.ts`, append to the `Management` group array (after the
    `users`/`Staff` entry, or wherever the live file's current tail is at EXECUTE time — re-scan
    first per the Pre-EXECUTE Note):
    ```
    {
      id: 'customers',
      label: 'Customers',
      icon: UserRound,
      to: '/customers',
    },
    ```
    **[VALIDATE P3]** `UserRound` is confirmed exported by the installed `lucide-react@1.24.0`
    (checked directly against `apps/admin/node_modules/lucide-react/dist/lucide-react.d.ts`).
    `Users2` does **NOT** exist in this version — do not use it. Re-verify only if the
    `lucide-react` version has changed since VALIDATE (21-07-26). Add `UserRound` to the top
    `lucide-react` import line. **Do NOT touch the existing `users` entry** (label `Staff`,
    `to: '/staff'`) — this is a coordination hard constraint from SPEC.
16. **Test gate:** `pnpm --filter @jojopotato/admin typecheck` — green.
17. **Test gate:** `pnpm --filter @jojopotato/admin test` — green (new component tests + zero
    regressions).
18. **Test gate:** `pnpm --filter @jojopotato/admin build` — green (route tree regenerates cleanly
    for the 3 new file-based routes).
19. **Test gate:** `pnpm format:check` — clean on all touched/new files.

### Backlog note (write during EXECUTE or UPDATE PROCESS, not blocking)

20. File a backlog note recommending a trigram/GIN index on `users.name`/`users.email`/
    `users.phoneNumber` IF the customer table grows large enough that the `q=` ILIKE sequential
    scan becomes a real performance problem — explicitly deferred per SPEC Constraints, not a gap
    to fix now. Suggested path:
    `process/features/admin-dashboard/backlog/adm-010-customers-search-index_NOTE_21-07-26.md`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| List returns only `role='customer'` rows, correct fields, newest-first | Fully-Automated | AC1 |
| Cursor pagination round-trip (small page size, no dupes/gaps, null cursor on last page) | Fully-Automated | AC2 |
| `q=` search matches name-only, email-only, phone-only, and composes with pagination | Fully-Automated | AC3 |
| Detail returns full locked field set (positive presence) + auth-internal denylist absence (negative) for a fully-populated customer, plus null-safe check for a sparse one | Fully-Automated | AC4 |
| Detail 404 for staff/admin id and for unknown id; customer id succeeds (contrast) | Fully-Automated | AC5 |
| Mutation-absence probe: `POST`/`PATCH`/`PUT`/`DELETE` on base + `:id` paths → 404 | Fully-Automated | AC6 |
| Role matrix: admin/super_admin pass, staff/customer 403, unauthenticated 401 on list + detail | Fully-Automated | AC7 |
| Manual browser walkthrough: search-then-clear, page-through, open fully-populated detail, open sparse detail, confirm zero editable controls, light/dark legibility | Agent-Probe | AC8 (standing project-wide no-`apps/admin`-E2E-runner gap — same residual class as ADM-005 G10 / ADM-007 AC9, not new debt) |

### Test Gate Commands (full paths)

```
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin build
pnpm format:check
```

Test runner selection follows `process/context/tests/all-tests.md` (vitest in `packages/api` and `apps/admin`).

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

Status: PASS
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Signal count 3/7 (weak public-API-surface signal — new admin endpoints; PII-adjacent
risk signal — full profile incl. email; 5+ files-in-blast-radius signal — ~13 touchpoints) puts
this in the MEDIUM band by raw score, but the backend→frontend dependency chain is a hard ordering
constraint (frontend client types mirror the server response shape; `apps/admin` items 8-19
cannot usefully start until backend items 1-7 are green) — a single sequential `vc-execute-agent`
walking the checklist in written order is the correct fit; coordination overhead from
parallel/team strategies would not be repaid at this scope (~13 files, 1 backend route file, 1
test file, ~9 net-new frontend files following an exact, already-precedented shape).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `GET /api/admin/customers` returns only role=customer rows, correct fields, newest-first | Fully-Automated | `admin-customers.integration.test.ts` — list-shape + role-exclusion test | A |
| AC2 | Cursor pagination round-trips (small page size, no dupes/gaps, null cursor on final page) | Fully-Automated | `admin-customers.integration.test.ts` — pagination round-trip test | A |
| AC3 | `q=` search matches name-only, email-only, phone-only, and composes correctly with pagination | Fully-Automated | `admin-customers.integration.test.ts` — search-per-field + search+pagination tests | A |
| AC4 | Detail returns full locked D1 field set (positive presence, null-safe for a sparse profile) + auth-internal field absence (negative, corrected denylist per VALIDATE P2) | Fully-Automated | `admin-customers.integration.test.ts` — field-shape presence/absence test | A |
| AC5 | Detail 404s for a non-customer id (staff/admin) and an unknown id; a customer id succeeds (contrast) | Fully-Automated | `admin-customers.integration.test.ts` — 404-contrast test | A |
| AC6 | Zero mutating verb (`POST`/`PATCH`/`PUT`/`DELETE`) exists anywhere under `/api/admin/customers*` | Fully-Automated | `admin-customers.integration.test.ts` — mutation-absence probe | A |
| AC7 | Only admin/super_admin reach the route family; staff/customer 403; unauthenticated 401/403 | Fully-Automated | `admin-customers.integration.test.ts` — role matrix test | A |
| AC8 | Customers screen renders/behaves correctly in a real browser (search, pagination, detail render, zero editable controls, light/dark legibility) | Agent-Probe | manual walkthrough: search-then-clear, page-through, open populated + sparse detail, confirm zero editable controls, light/dark check | C — deferred to the post-CODE-DONE user walkthrough this same plan already requires for VERIFIED status (Phase Completion Rules); standing, already-tracked project-wide `apps/admin`-has-no-E2E-runner gap, same residual class as ADM-005 G10 / ADM-006 / ADM-007 AC9 — not new debt |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: all 8 rows use only the 3 proving strategies (Fully-Automated ×7,
Agent-Probe ×1). Known-Gap is not used anywhere in this contract — every developed behavior in
this plan's blast radius has a real proving gate.

Legacy line form (retained so existing validate-contract consumers still parse):
- API list/pagination/search/detail/404/mutation-absence/RBAC: Fully-automated: `pnpm --filter @jojopotato/api test` (precondition: local Postgres migrated, per `process/context/tests/all-tests.md`)
- API/admin typechecks: Fully-automated: `pnpm --filter @jojopotato/api typecheck` / `pnpm --filter @jojopotato/admin typecheck`
- `apps/admin` component rendering (list/detail): Fully-automated: `pnpm --filter @jojopotato/admin test`
- `apps/admin` build/route-tree regen: Fully-automated: `pnpm --filter @jojopotato/admin build`
- formatting: Fully-automated: `pnpm format:check`
- Customers screen real-browser walkthrough: agent-probe: search/pagination/detail/light-dark manual pass (standing gap)

### Failing stubs (Fully-Automated rows only)

```
test("should return only role=customer rows, correct fields, newest-first", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC1 list role-scope + field-shape + sort order")
})
test("should round-trip cursor pagination with no dupes/gaps and a null cursor on the final page", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC2 cursor pagination round-trip")
})
test("should filter by name-only, email-only, phone-only search terms and compose with pagination", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC3 q= search across name/email/phone")
})
test("should return the full locked detail field set (positive) and never expose auth-internal fields (negative), null-safe for a sparse profile", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC4 detail field-shape presence/absence")
})
test("should 404 for a non-customer id and an unknown id, and succeed for a customer id", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC5 detail 404 contrast")
})
test("should reject POST/PATCH/PUT/DELETE on the collection and on :id with 404 (no mutation handler exists)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC6 mutation-absence probe")
})
test("should allow admin/super_admin and reject staff/customer (403) and unauthenticated (401) on list and detail", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC7 role matrix")
})
```

Dimension findings:
- Infra fit: PASS — pure additive append-only aggregator mount, directly confirmed as the 13th
  consumer against the live `packages/api/src/routes/admin/index.ts` (currently 12 consumers,
  ADM-009's `staff` mount is the 12th); zero new runtime/container/port surface, zero new
  dependency.
- Test coverage: PASS — all 7 API-level SPEC criteria (AC1-AC7) mapped to real Fully-Automated
  integration tests reusing the proven `makeUser(role)` self-seeding fixture (same pattern as
  `admin-orders.integration.test.ts`/`admin-staff.integration.test.ts`); AC8 UI walkthrough
  correctly tiered Agent-Probe — same standing, already-tracked repo-wide gap as every prior
  admin-dashboard phase's UI-layer criterion, not new debt.
- Breaking changes: PASS — zero schema/migration (no new migration file required — `users`,
  `user_stars`, `orders`, `branches` are all read-only in this plan); zero existing route,
  serializer, or nav entry modified (directly confirmed by reading the live `admin/index.ts`,
  `nav-config.ts`, and `admin/users.ts` — all are simple additive appends at their current tail,
  no line inside an existing route is touched).
- Security surface: PASS (after 2 test-design fixes folded into the plan text, see below) —
  `requireAdmin` is reused verbatim (zero new auth mechanism, zero new trust boundary); id
  enumeration is prevented by a single generic-404 code path shared between "unknown id" and
  "id belongs to a non-customer role" (directly mirrors the already-proven
  `orders.ts:163-166` malformed-id pattern); `role='customer'` is AND-composed with every
  search/cursor condition in the same `and(...conditions)` array, so a `q=` search can
  structurally never surface a non-customer row, and a search term is never a bypass of the role
  scope; ILIKE parameters are passed through drizzle's parameterized query builder (no raw SQL
  string concatenation anywhere in the plan) — no injection surface. One real pre-EXECUTE fix was
  made: a naive copy of ADM-006's negative-PII-denylist test would have incorrectly asserted
  `emailVerified`/`phoneNumberVerified` (and `email` itself) are ABSENT, when SPEC's D1 explicitly
  makes all three present, locked fields for this surface — corrected directly in the plan's
  checklist item 6 (VALIDATE P2) so the test as written proves the right thing instead of silently
  asserting something both wrong and self-contradictory with the positive-presence half of the
  same test.

### High-Risk Evidence Pack Decision

**WAIVED — no manual-first 5-artifact evidence pack required.** Reasoning, per the standing
6-class definition in `process/development-protocols/orchestration.md` §High-Risk Execution
Handoff / `.claude/skills/vc-risk-evidence-pack/SKILL.md`:

- This plan does not build a new auth/identity **mechanism** — it reuses `requireAdmin` verbatim,
  the same guard every other admin-dashboard phase (ADM-002 through ADM-009) already relies on.
  The "auth or identity" high-risk class is about authentication flows/session/identity
  resolution, not about which fields an already-fully-authenticated admin session can read.
- Direct precedent: ADM-006 (Orders view) exposed customer name+phone PII on a structurally
  identical read-only admin surface and did **not** require the evidence pack; ADM-009 (Staff
  management) exposes staff email + PATCH-writes `assignedBranchId` and also did not require it.
  ADM-010 exposes a wider PII field set (adds email + verification flags + address/birthday) but
  is READ-ONLY (narrower than ADM-009's write surface) and gated by the identical guard.
- No new trust boundary, no new schema, no new migration, no destructive mutation, no billing
  surface, no deploy/container/proxy change — none of the other 5 high-risk classes apply either.
- The real security-relevant work here (id-enumeration prevention, role-scoped search, the
  positive+negative field-shape assertion) is already captured as a genuine, non-vacuous
  Fully-Automated test gate (AC4/AC5/AC7 above) — equivalent verification rigor to what the
  evidence pack would additionally buy, without the manual-first overhead this repo reserves for
  the 6 named classes.

**Recommendation: proceed without the evidence pack.** If EXECUTE surfaces something this
reasoning didn't anticipate (e.g. a real auth-internal field turns up on the `users` row, or a
role-scope bypass is found), re-open this decision rather than silently overriding it.

Open gaps: none unresolved. The single deferred item (a trigram/GIN search index on
`users.name`/`email`/`phoneNumber`) is explicitly out of scope per SPEC Constraints and is already
tracked as Implementation Checklist item 20 (backlog note during EXECUTE/UPDATE PROCESS,
non-blocking, not a gate).

What this coverage does NOT prove:
- The 7 Fully-Automated API gates prove server-side correctness (role scoping, pagination,
  search, field-shape, 404 behavior, mutation-absence, RBAC) against a real seeded Postgres DB.
  They do NOT prove real browser rendering or interaction — debounce timing feel, table layout,
  click-through navigation, or light/dark legibility. That is exactly AC8's Agent-Probe scope.
- They do NOT prove production-scale query performance under the intentionally un-indexed ILIKE
  scan (explicitly deferred per SPEC Constraints; only a problem at a customer-table size this
  plan does not target).
- They do NOT exercise concurrent-admin-session behavior (no concurrency test written — consistent
  with every other admin CRUD phase in this program, not a gap unique to ADM-010).
- They do NOT prove the copy/wording choices ("No star activity yet", "Not set" placeholders) read
  well to a real admin — that is also AC8's scope, not a server-side assertion.

Gate: PASS (no FAILs, plan updated — 3 fixes folded directly into the Implementation Checklist:
VALIDATE P1 UserRow/UserStarsRow type-alias definition, VALIDATE P2 corrected AC4 denylist field
set, VALIDATE P3 confirmed `UserRound` icon)
Accepted by: N/A — Gate is PASS; no CONCERNs required user acceptance (field required only when Gate is CONDITIONAL).

## Autonomous Goal Block

SESSION GOAL: Ship ADM-010 — read-only admin Customer Management (list, search, detail) for
role=customer accounts, issue #125.
Charter + umbrella plan: N/A — single standalone plan. Not part of the completed 8-phase
admin-dashboard program (`process/features/admin-dashboard/active/admin-dashboard_14-07-26/`,
8/8 VERIFIED, no `## Stable Program Goal` governs new scope) and not part of the open ADM-008
coupons sub-program.
Autonomy: Standard /goal autonomy rules apply per
`process/development-protocols/orchestration.md` §Autonomy Mode — CONDITIONAL findings are
auto-fixed and execution proceeds; BLOCKED items go to backlog with continuation to the next
step; an irreversible or outward-facing action taken without explicit contract instruction is a
hard stop requiring user input.
Hard stop conditions / safety constraints:
- Do NOT add any write/mutation verb under `/api/admin/customers*` — this phase is read-only by
  design (SPEC "Out Of Scope"); a mutation endpoint appearing here is a hard stop, not a judgment
  call.
- Do NOT touch or repurpose the existing `users`/`Staff` nav entry (`to: '/staff'`) or ADM-009's
  `routes/admin/staff.ts` — `customers` is a distinct role-partition (`role='customer'`) with zero
  row-set overlap with `STAFF_ROLES`.
- Do NOT modify the `users` table schema or any existing route (`GET /api/admin/me`,
  `POST /api/admin/users/:id/role`, ADM-006 `orders.ts`, ADM-009 `staff.ts`).
- Re-scan `apps/admin/src/config/nav-config.ts` and `packages/api/src/routes/admin/index.ts`
  immediately before editing either (Pre-EXECUTE Note) — ADM-009 may have landed further, or been
  committed/reverted, since VALIDATE.
Next phase: EXECUTE —
`process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/adm-010-customer-management_PLAN_21-07-26.md`
Validate contract: inline in this plan file (`## Validate Contract` section above)
Execute start: backend Implementation Checklist items 1-7 (packages/api typecheck + test) must be
green before frontend items 8-19 begin (frontend client types mirror the server response shape);
single sequential `vc-execute-agent`, backend-then-frontend order; high-risk evidence pack: NOT
required (waived — see `### High-Risk Evidence Pack Decision` above).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/adm-010-customer-management_PLAN_21-07-26.md`
2. **Last completed phase or step:** VALIDATE — Gate: PASS, validate-contract written (21-07-26).
   3 plan-text fixes were folded in during VALIDATE (checklist items 2, 6, 15). No EXECUTE has
   started.
3. **Validate-contract status:** written, Gate: PASS (`## Validate Contract` section above,
   `generated-by: outer-pvl`).
4. **Supporting context files loaded:** `process/context/all-context.md`, this task folder's SPEC
   (`adm-010-customer-management_SPEC_21-07-26.md`), `packages/api/src/routes/admin/orders.ts`,
   `packages/api/src/routes/lib/serializers.ts` (Admin order serializer section),
   `packages/api/src/routes/admin/index.ts`, `packages/api/src/routes/admin/staff.ts`,
   `packages/api/src/routes/admin/lib/errors.ts`, `packages/api/src/db/schema/users.ts`,
   `packages/api/src/db/schema/user_stars.ts`, `apps/admin/src/features/orders/**`,
   `apps/admin/src/routes/(dashboard)/orders*.tsx`, `apps/admin/src/config/nav-config.ts`,
   `apps/admin/src/components/query-states.tsx`,
   `apps/admin/src/features/orders/lib/admin-orders-api.ts`,
   `packages/api/src/routes/admin/__tests__/admin-orders.integration.test.ts` (read in full — AC
   structure, denylist pattern, mutation-absence pattern),
   `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts` (role-matrix pattern),
   `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent picking up mid-execution:** run EXECUTE on this plan
   (`ENTER EXECUTE MODE`). Re-scan `nav-config.ts` and `routes/admin/index.ts` (Pre-EXECUTE Note)
   before touching either, then resume from the first unchecked Implementation Checklist item —
   backend items (1-7) must complete and be green before frontend items (8-19) begin, since the
   frontend types mirror the server response shape.
