---
name: spec:adm-010-customer-management
description: "Product-discovery SPEC for ADM-010 — admin customer list, search, and read-only account detail (issue #125)"
date: 21-07-26
feature: admin-dashboard
---

# ADM-010 — Customer Management: List, Search, View (SPEC)

## Summary

Right now, an admin has no way to look up a customer in the dashboard at all — not their profile,
not their order history, not their rewards balance. If a customer calls in with a question ("did my
order go through?", "how many stars do I have?"), the only way to find out is a direct database
query. This phase gives admins a real, read-only Customers screen: a searchable, paginated list of
every customer account, and a detail view for one customer showing their full profile, star
balance, and recent orders. Nothing is editable here — this is a lookup tool, not an account-editing
tool. It closes the same kind of operational gap ADM-009 closes for staff, but for the customer
side of the user table.

## User Stories / Jobs To Be Done

1. **As an admin**, I want to see a list of all customer accounts, so I can browse who has signed up
   without needing database access.
2. **As an admin**, I want to search for a customer by name, email, or phone number, so I can find
   one specific person quickly when they contact support.
3. **As an admin**, I want to open a customer's full profile — including birthday, address, and
   marketing preference — so I can answer questions about their account without guessing.
4. **As an admin**, I want to see a customer's current star balance, so I can confirm their rewards
   status when they ask.
5. **As an admin**, I want to see a customer's recent orders, so I can quickly confirm whether an
   order was placed, without switching to the separate Orders screen and filtering by hand.
6. **As an admin**, I want this to be strictly look-up-only, so there's no risk of an admin
   accidentally changing a customer's account data from this screen.

## What The User Wants (Behavioral Outcomes)

- A new "Customers" screen in the admin dashboard lists every account whose role is `customer` —
  staff/admin/super_admin accounts never appear here (that's the separate ADM-009 Staff screen).
- The list shows, per customer: name, email, phone, and the date they joined.
- A single search box filters the list by name, email, or phone — typing "maria" or "0917" or
  "@gmail.com" narrows the list to matching accounts. Search and pagination compose (searching
  resets to the first page of matching results).
- The list loads more results as the admin scrolls/pages further — it doesn't try to load every
  customer at once.
- Clicking a customer opens a read-only detail view showing: full profile (name, email, phone,
  birthday, address, marketing opt-in, whether email/phone are verified, favorite branch, when they
  finished onboarding), their current star balance, and their most recent orders.
- Nothing on the detail screen is editable — no save button, no toggle, no "disable account"
  control. It is purely informational.
- A staff/admin/super_admin account is never reachable through this screen or its detail route —
  opening a non-customer id here shows a not-found state, not their (differently-scoped) staff
  record.

## Flow / State Diagram

```
Admin opens dashboard → clicks "Customers" (new nav entry)
                │
                ▼
      Customer list screen loads
      GET /api/admin/customers
                │
                ▼
   Table: name | email | phone | joined date
   (only role = customer; staff/admin never appear)
                │
        ┌───────┴────────────────────┐
        │                            │
  Admin types in search box    Admin scrolls / clicks
  (debounced)                  "load more" (cursor page)
        │                            │
        ▼                            ▼
  GET /api/admin/customers    GET /api/admin/customers
  ?q=<term>                   ?cursor=<...>
  → list re-filters,          → next page appended,
    resets to page 1            search term (if any) preserved
        │                            │
        └──────────────┬─────────────┘
                        ▼
              Admin clicks a customer row
                        ▼
        GET /api/admin/customers/:id
                        │
              ┌─────────┴─────────┐
              │                   │
     id belongs to a          id belongs to staff/
     customer                 admin/super_admin,
              │                or doesn't exist
              ▼                   │
     Detail screen renders:       ▼
     - full profile          404 / not-found state
     - star balance           (never shows a staff
     - recent orders           record here)
              │
              ▼
     Read-only — no edit
     controls anywhere on
     this screen
```

## Acceptance Criteria (Testable Outcomes)

1. **`GET /api/admin/customers` returns a cursor-paginated list of role=`customer` users**,
   newest-signup-first, each row exposing name/email/phone/joined-date. Staff/admin/super_admin
   accounts are never included.
   `proven by:` a new admin-customers integration test suite asserting the returned set matches
   exactly the seeded customer users (excluding seeded staff/admin fixtures), correct field
   presence, and correct sort order.
   `strategy:` Fully-Automated.

2. **Pagination round-trips correctly, tie-safe.** Requesting a small page size, following the
   returned cursor, and requesting again returns the next page with no duplicates and no gaps; the
   final page returns a null/absent cursor. The cursor is a tie-safe composite `(createdAt, id)`, so
   rows sharing an identical `createdAt` still paginate gap-free.
   `proven by:` integration test seeding N customers — INCLUDING at least two with an identical
   `createdAt` straddling a page boundary — paginating in pages smaller than N, and asserting the
   concatenated pages equal the full expected set with no overlap and no gap.
   `strategy:` Fully-Automated.

3. **The `q=` search parameter filters by name, email, OR phone (partial, case-insensitive
   match)**, combining correctly with pagination (search narrows the result set that gets paginated).
   `proven by:` integration test asserting a search term matching only a customer's email returns
   that customer and excludes non-matching customers; same for a name-only match and a phone-only
   match; confirms search + cursor together do not silently drop or duplicate rows.
   `strategy:` Fully-Automated.

4. **`GET /api/admin/customers/:id` returns the full locked field set for a customer**: name, email,
   phone, birthday, address, marketing opt-in, email-verified flag, phone-verified flag, favorite
   branch (name, not just id), onboarded-at, PLUS current star balance and a bounded list of recent
   orders (order number, status, placed date, total). No auth-internal fields (password hashes,
   session/verification tokens) appear anywhere in the response — there are none stored on the user
   row today, and this criterion locks that non-exposure going forward.
   `proven by:` integration test performing a positive field-presence assertion (every locked field
   is present with the correct value for a fully-populated seeded customer, including a null-safe
   check for an incomplete profile) AND a negative field-absence assertion (no field name matching
   the auth-internal denylist appears in the JSON response), mirroring the ADM-006 PII field-shape
   test pattern.
   `strategy:` Fully-Automated.

5. **`GET /api/admin/customers/:id` returns 404 for a non-customer id** (staff, admin, or
   super_admin) and for a nonexistent id — a staff/admin account is never reachable through this
   route.
   `proven by:` integration test hitting the route with a seeded staff user's id and a random uuid,
   asserting 404 in both cases, plus a customer id succeeding for contrast.
   `strategy:` Fully-Automated.

6. **The route family is read-only**: no mutating verb (`POST`/`PATCH`/`PUT`/`DELETE`) exists
   anywhere under `/api/admin/customers*`.
   `proven by:` a mutation-absence probe test asserting each mutating verb against the base and
   `:id` paths returns 404/not-handled, mirroring the ADM-006 mutation-absence pattern.
   `strategy:` Fully-Automated.

7. **Only `admin`/`super_admin` roles can reach any `/api/admin/customers*` route**; `staff` and
   `customer` roles are rejected (403), unauthenticated requests are rejected (401) — the existing
   `requireAdmin` guard applies with zero per-route reimplementation.
   `proven by:` integration test running the standard ADM-001 role matrix (super_admin/admin pass,
   staff/customer 403, unauthenticated 401) against both the list and detail routes.
   `strategy:` Fully-Automated.

8. **The Customers screen (search box, paginated list, read-only detail view) renders and behaves
   correctly in a real browser**: typing in the search box narrows the visible list without a full
   page reload, paging/scrolling loads more rows, clicking a row opens the detail view with all
   locked fields visible and no editable controls anywhere, and light/dark rendering is legible.
   `proven by:` a user-run manual walkthrough in a real browser (search-then-clear, page-through,
   open a fully-populated customer's detail, open a sparsely-populated customer's detail to confirm
   null fields render gracefully).
   `strategy:` Agent-Probe. (Standing, already-tracked project-wide gap: `apps/admin` has no
   browser/E2E runner — same residual class as every prior admin-dashboard phase's UI-layer gate,
   e.g. ADM-005 G10, ADM-007 AC9. Not new debt.)

## Out Of Scope

- **Any write path.** No editing a customer's profile fields, no toggling `marketingOptIn`, no
  disabling/banning an account, no manually adjusting star balance, no manual order actions — this
  phase is look-up only, full stop.
- **Staff/admin account management.** Listing, editing, or branch-assigning staff-level accounts is
  ADM-009's scope entirely; ADM-010 explicitly excludes role ∈ {staff, admin, super_admin} from its
  list and 404s them from its detail route.
- **Role changes.** The existing `POST /api/admin/users/:id/role` route is untouched and unrelated;
  this phase does not add a second way to change roles.
- **Full, paginated order history inside the detail view.** The detail view shows a bounded
  "recent orders" list (most-recent-N), not a fully paginated order history — an admin who needs
  deeper order history should use the existing Orders screen (ADM-006) filtered appropriately. The
  exact bound (e.g. 5 or 10 most recent) is left to PLAN/INNOVATE, not fixed here.
- **Search relevance tuning / fuzzy matching.** Search is a plain case-insensitive partial (ILIKE)
  match across name/email/phone — no ranking, no typo-tolerance, no trigram/GIN indexing this
  phase (see Constraints).
- **Customer-initiated account changes.** Nothing here affects what a customer can see or do in the
  mobile app; this is an admin-only, read-only lookup surface.
- **Bulk actions** (export, bulk email, bulk tagging) — not requested, not built.

## Constraints

- **Coordination with ADM-009 (parallel, in-flight work — hard constraint):** ADM-009 is landing
  concurrently and claims the existing disabled `Users & Roles` nav entry (`id: 'users'`, renaming
  it to `Staff` → `/staff`) plus a new `routes/admin/staff.ts` scoped to role ∈
  {staff, admin, super_admin}. ADM-010 MUST:
  - Add a **brand-new** nav entry (`id: 'customers'`, label `Customers`, `to: '/customers'`) —
    never touch or repurpose the `users`/`staff` entry.
  - Scope its route family to role = `customer` **only** — zero row-set overlap with ADM-009's
    staff route. This is a clean partition of the same `users` table by `role`, not a shared query.
  - Use feature folder name `customers` (`apps/admin/src/features/customers/`), not `users`, to
    avoid any naming collision with ADM-009's work.
  - PLAN must re-check `apps/admin/src/config/nav-config.ts` immediately before EXECUTE, in case
    ADM-009 lands first and the file has already changed shape.
- **D1 (LOCKED, user, this session) — PII field set is full profile including email.** List:
  name, email, phone, joined date. Detail adds: birthday, address, marketing opt-in, email-verified,
  phone-verified, favorite branch (name), onboarded-at. This explicitly resolves ADM-006's
  previously-deferred "should email be exposed?" question — ADM-006 excluded email from the
  *orders* surface only (pickup/dispute-contact scoped, not a repo-wide ban); email is a customer's
  login/account identifier and belongs in a dedicated Customers module. Excluded: any auth-internal
  field (password hash, session token, verification token) — none currently live on the `users` row
  itself, and criterion 4 locks that non-exposure as a going-forward guarantee, not just a
  today-true fact.
- **D2 (LOCKED, user, this session) — detail is the fullest read-only view.** Full profile (per D1)
  + current star balance (single-row `user_stars` lookup) + recent order history (reusing the
  existing order-summary shape, scoped to this customer's `user_id`). Order history in the detail
  view is a genuine cross-feature read (touches the `orders`/`order_items` tables already owned by
  ADM-006/staff order routes) — how exactly it's composed (inline join vs. sub-route) is an
  INNOVATE/PLAN decision, not fixed here; the requirement is only that recent orders are visible in
  the detail response.
- **D3 (LOCKED, user, this session) — search is a single `q=` parameter.** One text input,
  server-side `ILIKE '%q%'` unioned (OR) across name, email, and phone number columns. No separate
  per-field search inputs. Accepted, documented tradeoff: no trigram/GIN index exists on these
  columns today, so this is a sequential scan at query time — acceptable at current dev-seed scale;
  revisit indexing if/when the customer table grows large enough to matter (not blocking for this
  phase).
- Must reuse the existing `requireAdmin` guard and the append-only `adminRouter` aggregator
  pattern (`routes/admin/index.ts`) — no new auth mechanism.
- Must follow the existing cursor-pagination convention (`limit`+1 fetch, `{ items, nextCursor }`
  envelope) established by ADM-006's orders list — but with a tie-safe composite `(createdAt, id)`
  cursor rather than ADM-006's `createdAt`-only cursor (a deliberate correctness improvement to
  guarantee gap-free pagination when `createdAt` values tie), not a wholly new pagination shape.
- Must NOT modify `users` table schema, `packages/types/src/admin.ts` conventions, or any existing
  route (`GET /api/admin/me`, `POST /api/admin/users/:id/role`, ADM-009's staff routes) — purely
  additive.
- No new external dependency for search (no search-service integration) — plain SQL ILIKE only.

## Open Questions

None — all three product-decision dimensions (PII field set, detail scope, search shape) were
locked with the user this session (D1/D2/D3 above). The bounded "recent orders" count in the
detail view is deferred to PLAN, not an open product question (SPEC intentionally leaves an
implementation-level number unfixed).

## Background / Research Findings

- **No customer list route exists today.** `routes/admin/users.ts` currently has only
  `GET /api/admin/me` and `POST /api/admin/users/:id/role` — no list/search/detail endpoint of any
  kind for the `users` table.
- **`users` table (better-auth model, confirmed via schema read)** — all roles share one table,
  partitioned only by `role`. Relevant columns: `id`, `name`, `email` (unique), `emailVerified`,
  `phoneNumber` (unique, nullable), `phoneNumberVerified`, `image` (nullable), `birthday` (date,
  nullable), `address` (varchar, nullable), `onboardedAt` (nullable), `marketingOptIn` (default
  false), `favoriteBranchId` (nullable FK → branches), `assignedBranchId` (staff-only, irrelevant
  here), `role` (default `customer`), `createdAt`, `updatedAt`.
- **ADM-006 (`GET /api/admin/orders`) is the direct structural precedent for this phase's list
  route**: cursor = ISO string of the last row's sort column, fetch `limit+1` to compute `hasMore`,
  filters AND-composed via `and(...conditions)`, related rows batch-loaded via `inArray()`,
  response envelope `{ items: [...], nextCursor: string | null }`. `limit`/`cursor` are parsed
  leniently OUTSIDE Zod — a malformed cursor is treated as "no cursor" and an out-of-range limit is
  clamped, rather than 400-rejected. ADM-010's list route mirrors this pattern, paginating on
  `createdAt` instead of `placed_at`.
- **ADM-006's PII field-shape test (its AC6)** is the direct precedent for this SPEC's criterion 4:
  a single test asserting BOTH presence of every allowed field AND absence of every disallowed
  field — a positive+negative shape assertion, not just a presence check.
- **No free-text search precedent exists anywhere in this codebase.** No `ILIKE` usage in
  `packages/api`, and no debounced text-search input anywhere in `apps/admin` (every existing
  filter is a `<select>` or a date input). Both the ILIKE query and the debounced search box are
  net-new UI/API patterns for this repo — flagged for INNOVATE/PLAN to design carefully (e.g.
  debounce timing, empty-search behavior), not because the requirement itself is unclear.
- **`user_stars` table** — one row per user (`user_id` unique), `current_stars`, `lifetime_stars`,
  `updated_at`. Cheap, single-row lookup for the detail view's star balance.
- **`orders` table** has a plain `user_id` FK — recent order history for a customer is a
  straightforward scoped re-run of the existing order-summary serialization logic (already built
  for ADM-006/staff), filtered to one `user_id`.
- **Admin CRUD append-only aggregator pattern** (confirmed durable across P1–P7 and ADM-008/009):
  a new admin domain mounts its own sub-router onto the existing `routes/admin/index.ts`
  aggregator; `requireAdmin` + CORS are inherited automatically from the top-level `/api/admin`
  mount — no per-route reimplementation.
- **Frontend precedent (ADM-006 `features/orders/**`):** fetch wrapper (`lib/*-api.ts`) + react-
  query hooks (`hooks/use-admin-*.ts`) + list/filter-bar components, with the list↔detail
  `<Outlet/>` route split living at `apps/admin/src/routes/(dashboard)/` (`orders.tsx` layout +
  `orders.index.tsx` + `orders.$orderId.tsx`) — NOT inside the feature folder itself. ADM-010
  mirrors this exact split for `customers.tsx` / `customers.index.tsx` / `customers.$customerId.tsx`.
  This is also the fix for the TanStack Start "nested-detail-route needs a parent `<Outlet/>`"
  gotcha discovered during ADM-003/Phase 3.
- **ADM-009 is running in parallel** (separate SPEC/PLAN already on disk:
  `process/features/admin-dashboard/active/adm-009-staff-management_21-07-26/`), claiming the
  currently-disabled `id: 'users'` nav entry (`Users & Roles` → renamed `Staff`, `/users` →
  `/staff`) and adding `routes/admin/staff.ts` scoped to staff-level roles. Confirmed by direct
  read of `apps/admin/src/config/nav-config.ts` (the `users` entry is currently
  `disabled: true`, under the `Management` group) and the ADM-009 SPEC's own flow diagram. ADM-010
  must add a distinctly-named, distinctly-routed `customers` entry — see Constraints above.
- **8-phase admin-dashboard program (ADM-001..007) is fully COMPLETE (8/8 VERIFIED)** — this is a
  net-new, standalone scope, not a resumption of that umbrella. Task folder created fresh at
  `process/features/admin-dashboard/active/adm-010-customer-management_21-07-26/`.
