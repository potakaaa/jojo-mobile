# Jojo Potato - All Context

Last updated: 2026-07-15 (push notification real-delivery hardening delta, merged with admin-dashboard Phase 3 delta from development)

This file is the root context entrypoint for the repo.

Use it for two things:

1. quick routing to the right context pack or root file
2. broad architecture and repository understanding

Start here before loading deeper context files.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick router for that domain. This root file (`all-context.md`) is the top-level router. Context groups each have their own `all-{group}.md` entrypoint.

**The pattern:**

```
process/context/
  all-context.md                      <-- THIS FILE: root router
  planning/
    all-planning.md                   <-- group router for planning
  tests/
    all-tests.md                      <-- group router for tests
```

No other context groups exist yet in this repo — see §Context Group Detection Result below.

**How agents use it:**

1. Agent reads `all-context.md` first (this file)
2. Finds the relevant context group from the routing tables below
3. Reads that group's `all-{group}.md` entrypoint
4. Only then loads the specific deep doc needed

This layered routing keeps context windows small. Never load the whole `process/context/` tree.

---

## Project Description

**Jojo Potato** is an iOS-first, Android-ready mobile food ordering & pickup app, built with
Expo/React Native. This repository is currently a **foundation/skeleton repo**, not the full
product: it wires up the monorepo, tooling, navigation shell, and shared package boundaries so
ordering, cart, checkout, pickup branches, rewards, menu, auth, and notifications can be built on
top of it later without re-plumbing the project.

- Small team (2-5 contributors).
- Backend: `packages/api` (Express + Drizzle + PostgreSQL) exists and now hosts a real auth
  provider (better-auth — see §Current Implementation State and §Open Questions). Database,
  payments, and notifications providers remain open decisions.
- Branding/theme in `packages/ui/src/theme.ts` and `apps/mobile/assets/images/` is placeholder —
  do not treat brand colors, icons, or the bundle identifier (`ph.jojopotato.mobile`) as final.
- Deploy target: EAS Build/Submit is planned but not yet wired up (no `eas.json` in the repo yet).
- PRD reference: `docs/jojo-potato-mobile-prd.md` — the source of truth for product scope,
  navigation structure (§7), and auth flow (§6.1) that current and future plans build against.

## Current Implementation State (as of 16-07-26, incl. admin-dashboard Phase 0 + Phase 1 + Phase 2 + Phase 3 + Sidebar Nav + Phase 4a deals-as-products + STAFF-001 + merge-menu-api-reconciliation + checkout-flow UI)

- **Admin dashboard Deals-as-Products (`apps/admin` + `packages/api`, Phase 4a — ADM-004 RE-PLAN,
  delivered 15/16-07-26, branch `feat/adm-004-deals`, EVL-green — NOT YET MERGED, PR pending review):**
  Phase 4 was PIVOTED mid-program. The original discount-object deals model (a standalone `deals`
  table + `deal_products`/`deal_branches` junctions + a coupon-cascade deactivate flow) was fully
  EXECUTEd on commit `d5070d8` (31/31 tests, 214/214 full suite, Gate: PASS) and is now **SUPERSEDED
  and discarded** — its code was replaced at the same file paths (not `git revert`), preserved only
  in git history; the `deals`/`deal_products`/`deal_branches`/`coupons` schema stays dormant,
  untouched, reserved for a future ADM-008 (Promotion→Offer→Coupon). The new model: a "Deal" is a
  `products` row with `is_deal = true`, described by a new self-referential `deal_components`
  junction table (`deal_product_id`/`component_product_id` → `products.id`, `quantity`, unique on the
  pair) — this is the FIRST self-referential FK in the schema. A deal is priced at its own
  `base_price` exactly like any product; `deal_components` is display/composition metadata only,
  never read by pricing/cart/checkout — this reuses the entire existing product → menu → cart →
  checkout → order_items pipeline with zero new pricing/cart/order code (the single biggest scope
  reduction versus the discarded model). Migration `0007_fearless_crystal.sql` (additive-only: new
  `is_deal` column defaulting `false` + new empty table, zero backfill). `packages/api/src/routes/
  admin/deals.ts` was fully rewritten (same file path) as a sibling of `admin/products.ts` — full CRUD
  (`GET`/`GET :id`/`POST`/`PATCH`) plus `POST/DELETE .../:id/components` attach/detach (app-layer
  self-reference and deal-of-deals guards — Postgres `CHECK` cannot express a cross-row rule, so both
  guards live in the Zod/handler layer). `categoryId` is server-pinned on create to an idempotently
  resolved "Deals" category (route-side find-or-create by reserved slug, since `products.category_id`
  is `NOT NULL` and the integration suite is hermetic — a seed-only approach would 500 on the missing
  FK in a fresh DB). **THREE filter sites were actually modified** (menu query `branches.ts` gains
  `eq(products.is_deal, false)` by default + a `?isDeal=true` flip serving the deals tab on the SAME
  route — no new endpoint; `admin/products.ts` list defaults to excluding deals with an `?isDeal=`
  override) — **TWO more sites were explicitly verified to need NO change** (`orders.ts` placement and
  `staff.ts` availability are deliberately `is_deal`-blind: a deal-product must be orderable and
  branch-availability-toggleable through the exact same path as any other product). **AC9 (snapshot
  integrity, HARD, Known-Gap banned) is proven by a real passing regression test** mirroring P3's AC1
  pattern exactly, against an `is_deal=true` product — editing a deal-product's `base_price` after an
  order containing it has been placed never mutates that order's `order_items.unit_price`/
  `total_price`. `apps/admin` gained a rewritten `features/deals/**` (deleted the discount-shaped
  `junction-chip-editor.tsx`/`deactivate-deal-dialog.tsx`, added a quantity-aware component chip
  editor) reusing all 5 existing shared composites (data-table, form-dialog, confirm-dialog,
  query-states, page-header) — no new composite needed. Public `GET /deals`/`GET /deals/:id` (the old
  discount-model read routes) are left dormant and untouched — the mobile Deals tab keeps reading them
  in the interim, a documented, non-regressing known gap, until a separate mobile workstream executes
  the standalone handoff spec `deals-mobile-repoint_HANDOFF_15-07-26.md`. 28-test
  `admin-deals.integration.test.ts` (AC1-AC11) replaced the old 31-test discount suite at the same
  path; full API suite 211/211, 0 regressions.
  **Enhancement E1 (2-step create wizard + atomic create-with-components, delivered 15-07-26, commit
  `680427f`):** `POST /api/admin/deals` gained an OPTIONAL `components[]` array wrapped in a single
  `db.transaction()` — the deal product and its component rows are created atomically (first
  transactional write in this admin-CRUD family). `deal-create-wizard.tsx` replaced the old
  single-step form dialog with a 2-step wizard (Step 1 Details, Step 2 Items & Pricing — price input
  moved to Step 2, a 2-column sticky layout showing a live per-item price breakdown and savings via a
  new `deal-savings.ts` util). `FormDialog` gained a `size` prop (additive) to accommodate the wider
  wizard. 11 new tests (AC-E1..E5) + 7 `deal-savings` unit cases, all green; full API suite 222/222.
  AC-E6 (wizard UI walkthrough) was user-verified.
  **This session (16-07-26, uncommitted at session start, staged/ready to commit — NOT part of the
  16-07-26 UPDATE PROCESS delta itself, ground-truth only):** a live "Price comparison" panel was
  added to the deal-manage page (`deals.$dealId.tsx`, commit `1ca08f7`) mirroring the wizard's savings
  panel — per-item price breakdown, à-la-carte total, deal price, and saves/costs-more line; follows
  the pending price input live (falls back to the saved base price), recomputes on component
  attach/detach. Plus 3 PR-review fixes (staged, uncommitted as of this UPDATE PROCESS pass):
  (1) the wizard's `step1Valid` now also requires a non-empty `slug`, not just `name`; (2)
  `PATCH /api/admin/deals/:id` now serializes the deal's EXISTING components in its response instead
  of an empty array; (3) deal-detail price formatting was routed through the shared `formatPeso`
  helper instead of inline `.toFixed(2)` math. EVL evidence (this session): admin typecheck ✅, api
  typecheck ✅, API suite 222/222 ✅, admin 8/8 ✅, Prettier clean on the 3 touched files.
  **Known gaps carried forward, each with a backlog note filed this UPDATE PROCESS pass:** (a)
  `deal_components` has no DB `CHECK` constraint for `quantity > 0` or
  `deal_product_id <> component_product_id` (app-layer already enforces both; a `CHECK` needs a NEW
  migration since 0007 is already applied — deferred, not urgent); (b) no partial index on
  `products.is_deal` for the menu/admin filter queries (deferred as premature until a real scale
  problem appears). The malformed-`components[]`-payload 400-vs-422 status-code question remains open
  (currently 400, matching existing codebase convention — leaning toward leaving it as-is).
  **Branch state: `feat/adm-004-deals`, NOT merged — a PR is pending review.** Delivered by:
  `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_PLAN_14-07-26.md`
  (RE-PLANNED in full for the pivot) + co-located
  `phase-04a-deals-as-products_REPORT_15-07-26.md` (the current, authoritative EXECUTE report — the
  original `phase-04-deals_REPORT_15-07-26.md` documents the now-discarded discount-model EXECUTE
  pass and is marked SUPERSEDED, not authoritative).

- **Admin dashboard Products/Categories CRUD (`apps/admin` + `packages/api`, Phase 3 — Products/
  Categories CRUD ADM-003, delivered 15-07-26, ✅ VERIFIED — code-complete, automated-verified, AND
  Agent-Probe-verified):** the program's HIGHEST-STAKES correctness phase, and the third confirmed
  consumer of the append-only `/api/admin` aggregator pattern (after P1's `users.ts` and P2's
  `branches.ts`). `packages/api/src/routes/admin/{products,categories}.ts` (new) — full CRUD for
  products, categories, product_options (`size|flavor|add_on`), and branch_product_availability
  (upsert via Drizzle `.onConflictDoUpdate()` on the composite unique index
  `bpa_branch_product_idx` — no manual select-then-insert-or-update). `handleAdminError`/
  `isUniqueViolation` were relocated from `branches.ts` into `routes/admin/lib/errors.ts` and
  exported, now shared by all three admin route files. `centsToNumeric` was exported from
  `routes/lib/serializers.ts` (previously module-private inside `orders.ts`); `orders.ts`'s 3 real
  call sites were updated to import it, with `orders.test.ts` re-run as a regression guard (31/31
  green, 0 regressions). **AC1 — the program's single hardest correctness bar — is proven by a
  real, passing automated regression test, not Known-Gap:** editing a product's `base_price` via
  the new admin route does not mutate any existing `order_items.unit_price`/`total_price` row for
  orders already placed (the invariant is safe by construction — `order_items` snapshot columns
  are populated once, at order-placement time, from a live read of `product.base_price`; there is
  no later read-path recompute — the test locks this against future regression, not a currently-
  false fact). `apps/admin` gained its FIRST shared-composite extraction (Decision 1, partial):
  `components/{query-states,confirm-dialog,page-header}.tsx` — `confirm-dialog` generalizes P2's
  `deactivate-branch-dialog.tsx`; the Categories feature consumes all 3 as a hard constraint
  (verified no local duplicates built); Products consumes them where they fit and stays
  feature-local for its option/availability sub-editors. `data-table`/`form-dialog` were
  deliberately NOT extracted — the re-eval trigger is now Phase 4's `deal_products`/
  `deal_branches` junction-table UI. 31 new supertest cases (19 `admin-products.integration.
  test.ts` + 12 `admin-categories.integration.test.ts`), reusing the `makeUser(role)` self-seeding
  fixture a third time — full API suite 183/183, 0 regressions, independently EVL-confirmed. Both
  typechecks green. **AC8 (Agent-Probe manual walkthrough) was actually performed this session —
  not left owed like P2's AC7.** The walkthrough found and same-session fixed a real bug —
  **TanStack Start nested-detail-route gotcha (durable, affects P4-P7):** a `foo.$id.tsx` detail
  route file is auto-nested under `foo.tsx` (shared filename prefix); the parent MUST render
  `<Outlet/>` or the child route mounts nowhere (URL changes, screen never paints). The `products`
  "Manage" button hit exactly this — `products.tsx` rendered the list directly with no `<Outlet/>`.
  Fix (commit `79df222`): split `products.tsx` into a thin `<Outlet/>` layout plus a new
  `products.index.tsx` holding the list UI. This layout+index split is now the reference pattern
  for any future admin list→detail screen. **Known gap (documented, not new debt):** Decision 3's
  realtime-sync residual on `branch_product_availability` writes — refetch-on-focus only, no
  optimistic-concurrency guard, consistent with the app's existing 30s `staleTime` staleness model;
  no external mobile-write consumer exists yet (unlike P2's `is_accepting_pickup`, not blocked on
  any future phase). Delivered by: `process/features/admin-dashboard/active/
  admin-dashboard_14-07-26/phase-03-products_PLAN_14-07-26.md` (+ co-located REPORT in the same
  task folder).

- **Admin dashboard Sidebar Navigation (`apps/admin`, cross-cutting — delivered 15-07-26, ✅ COMPLETE):**
  replaced the bare `<Outlet />` dashboard shell with a collapsible, config-driven sidebar using the
  shadcn/ui sidebar primitive, themed to "Tactile Comic Brutalism" (2px ink borders, jyellow active
  state, 3px hard offset shadow on active items, Fredoka group labels). New files:
  - `apps/admin/src/config/nav-config.ts` — `navConfig` array (groups: Main, Management, Dev) driving
    the entire sidebar; adding a route = adding one `NavItem` object. Routes not yet built are marked
    `disabled: true` (grayed, unclickable).
  - `apps/admin/src/components/app-sidebar.tsx` — `AppSidebar` iterating `navConfig`, exact-match
    active-state check (`location.pathname.startsWith(item.to)` with `exact` for root), fully
    brutalist-themed, integrated via `SidebarProvider` wrapper in `(dashboard)/route.tsx`.
  - `apps/admin/src/components/nav-user.tsx` — `NavUser` footer: user initial avatar, email, role
    badge, sign-out button; reads from `useAdminAuth()` — does NOT bypass `beforeLoad` auth guard.
  - shadcn primitives added: `sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx`
    (installed via `npx shadcn@latest add sidebar separator`; `button.tsx`/`input.tsx` were skipped to
    preserve the existing brutalist theming).
  - `(dashboard)/route.tsx` updated: `<Outlet />` now wrapped in `<SidebarProvider><AppSidebar />`.
  - `(dashboard)/index.tsx` updated: old centered-card navigational shell stripped; pure content view.
  Build verified: `pnpm --filter @jojopotato/admin build` succeeds (regenerates TanStack route tree);
  no TS errors. Minor deviation: `import type { LucideIcon }` used in `nav-config.ts` (verbatim module
  syntax rule); `@ts-expect-error` removed from `AppSidebar` after route-tree regeneration.
  Archived: `process/features/admin-dashboard/completed/admin-dashboard_14-07-26/admin-sidebar-nav_PLAN_15-07-26.md`
  (+ co-located REPORT in the same completed folder).

- **Admin dashboard Branches CRUD (`apps/admin` + `packages/api`, Phase 2 — Branches CRUD ADM-002,
  delivered 14-07-26, ✅ VERIFIED — code-complete, automated-verified, AC7 owed):** the program's
  proof-of-pattern phase — the first full real vertical slice (API + `apps/admin` screen + Postgres)
  in the admin dashboard, establishing the reusable admin-CRUD shape Phases 3-7 will reference.
  `packages/api/src/routes/admin/branches.ts` (new) — full CRUD (list incl. inactive / get / create /
  update / soft-deactivate via `PATCH .../deactivate`), appended to the existing `/api/admin`
  aggregator (`routes/admin/index.ts`, append-only per its own doc comment) — the SECOND confirmed
  consumer of Phase 1's append-only-aggregator pattern (no `packages/api/src/index.ts` edit needed;
  the top-level `/api/admin` mount already applies `adminCors` + `requireAdmin` to every sub-router).
  Reuses the existing `AdminApiError` (no new error class) and `numericToCents`. Never `DELETE FROM
  branches` — soft-delete only. `serializers.ts` gained an additive `AdminBranch`/
  `serializeAdminBranch` (local-declaration convention matching `ApiBranch`/`ApiOrder`/`ApiDeal`,
  `packages/types` untouched — extend there only when a second consumer outside `packages/api`
  needs the type). **Durable gotcha (Postgres unique-violation catch under drizzle-orm):** drizzle
  wraps the underlying `pg` driver error in a `DrizzleQueryError` — the Postgres error code (`23505`
  for `unique_violation`) lives on `err.cause.code`, NOT the top-level `err.code`. A top-level-only
  check silently misses the violation (returns 500 instead of the intended 409); always check both
  `err.code` and `err.cause?.code` when catching a Postgres constraint violation through drizzle.
  `apps/admin` gained its first fetch wrapper (`features/branches/lib/admin-branches-api.ts`,
  `credentials:'include'` per the auth-client convention) and its first real consumer of the
  dedicated `queryClient` (`features/branches/hooks/use-admin-branches.ts`, react-query list/detail +
  create/update/deactivate mutations), a full list/create/edit/deactivate screen wired to a new
  `(dashboard)/branches` route (radix-Dialog confirmation gate on deactivate — Safety requirement).
  12 new supertest cases (`admin-branches.integration.test.ts`, reusing the `makeUser(role)`
  self-seeding fixture from Phase 1's `require-admin.integration.test.ts`) — full API suite
  134/134, 0 regressions, independently EVL-confirmed. **Known gaps (documented, not silently
  dropped; each has a backlog note under `process/features/admin-dashboard/backlog/`):** (1) AC7
  Agent-Probe manual browser walkthrough (list→create→edit→deactivate→dup-slug) is owed — no
  `apps/admin` browser/E2E runner exists yet (project-wide gap). (2) `is_accepting_pickup` shared
  mutable state — no separate admin-only flag; the not-yet-built mobile staff shell (STAFF-004)
  writes the SAME column; no optimistic-concurrency guard (`updated_at`/`FOR UPDATE`) exists
  anywhere on `branches` writes; last-write-wins accepted, revisit when STAFF-004 is planned. (3) The
  umbrella's planned §5 shared UI composite extraction (`data-table`/`form-dialog`/`confirm-dialog`/
  `page-header`/`query-states`) was deliberately deferred — feature-folder-local components were
  built instead (no gate exercises the composites; a concurrent unrelated `apps/admin` component
  workstream made speculative shared files a collision risk this phase); revisit at Phase 3
  RESEARCH once a real second CRUD consumer exists (the umbrella's own "second consumer" rule).
  Delivered by: `process/features/admin-dashboard/active/admin-dashboard_14-07-26/
  phase-02-branches_PLAN_14-07-26.md` (+ co-located REPORT in the same task folder).

- **Admin dashboard auth/RBAC (`apps/admin` + `packages/api`, Phase 1 — Auth/RBAC ADM-001,
  delivered 14-07-26, ✅ VERIFIED):** the FIRST protected `/api/admin/*` surface in the repo.
  `packages/api/src/lib/require-admin.ts` exports `requireAdmin(auth)` (mirrors `requireStaff`,
  admits `role ∈ {admin, super_admin}` only — never plain `staff`), mounted once at
  `app.use('/api/admin', cors({origin: ADMIN_WEB_ORIGIN, credentials: true}), requireAdmin(auth),
  adminRouter)` in `packages/api/src/index.ts` — later phases add sibling route files to
  `adminRouter` and inherit the guard automatically. `ADMIN_WEB_ORIGIN` defaults to
  `http://localhost:3100` (the `apps/admin` dev port) and is appended to better-auth's
  `trustedOrigins` (`auth.ts`), never wildcarded. This is also the FIRST **browser-cookie session**
  flow in this repo — contrast with `apps/mobile`'s Expo bearer-token flow
  (`@better-auth/expo`/`expo-secure-store`): `apps/admin/src/features/auth/lib/auth-client.ts` is a
  plain `createAuthClient({baseURL})` from `better-auth/react`, ZERO plugins — a Step 0 feasibility
  probe proved better-auth's default cookie session (`better-auth.session_token`, `HttpOnly`,
  `SameSite=Lax`, 30-day `Max-Age`) works end-to-end with no `nextCookies`/cookie-cache tweak
  needed. `packages/types/src/admin.ts` (new) carries `ADMIN_ROLES`, `AdminRole`, `AdminMe`,
  `AdminUserSummary` — `AdminMe` also carries an additive `mfaPending?: boolean` field, a
  structural-only MFA/TOTP gateway seam (no `twoFactor` plugin, no migration, no enrollment
  routes — deferred to a future unassigned ADM-0xx phase; `login.tsx` has a matching no-op
  comment marking the insertion point). `POST /api/admin/users/:id/role` is the super_admin-only
  role-management route: an inline `req.adminSession.role !== 'super_admin'` check (not a
  `requireSuperAdmin` middleware — promote only when a second consumer appears) runs FIRST, then a
  self-escalation guard (`req.params.id === req.adminSession.userId` → 400), then Zod validation,
  then the Drizzle `UPDATE ... RETURNING` — this exact order is locked and automated-tested
  (AC2/AC3). This route resolves the `TODO(STAFF-ADM)` seam left by STAFF-001:
  `assertBranchScope(assignedBranchId, requestedBranchId, role?)` gained an additive optional
  trailing `role` param that bypasses branch-scope checks when `role ∈ {admin, super_admin}`,
  backward-compatible with every existing 2-arg call site. `apps/admin` gained a real login screen
  (`routes/login.tsx`, unguarded) and a `(dashboard)` pathless route-group shell
  (`routes/(dashboard)/route.tsx`) with a server-verified `beforeLoad` guard — it calls
  `GET /api/admin/me` against the real session, never trusts a client-cached role flag; P2-P7 add
  sibling child routes to this same group and must never restructure it. New integration suite
  `packages/api/src/lib/__tests__/require-admin.integration.test.ts` mirrors
  `require-staff.integration.test.ts`'s hermetic self-seeding pattern (78/78 API suite green,
  independently EVL-confirmed — see CORS fix below). **CORS surface (durable API-shape fact,
  post-AC8 fix):** a browser SPA talking to better-auth cross-origin needs credentialed CORS on
  BOTH `/api/auth/*` (the better-auth handler itself) AND the app's own protected routes
  (`/api/admin`) — `trustedOrigins` is a separate CSRF/redirect allowlist and does NOT emit HTTP
  CORS response headers on its own. A single shared `adminCors` middleware
  (`cors({origin:[ADMIN_WEB_ORIGIN], credentials:true})`) is now mounted on both prefixes in
  `packages/api/src/index.ts`. The first real-browser AC8 walkthrough caught this gap (login hung,
  browser blocked the uncovered `/api/auth/*` responses); the fix added 3 regression tests
  (preflight OPTIONS + real sign-in + no-Origin mobile-path guard), taking the suite from 75→78.
  **Known gap (non-blocking, unrelated to CORS):** a malformed `:id` on the role-management route
  surfaces as a 500 rather than 404 (guard-order side effect, non-exploitable, reachable only by an
  already-authenticated super_admin). AC8 (browser login + dashboard walkthrough) is now
  browser-verified (all 3 roles: super_admin reaches the shell, customer/staff rejected) — no
  longer an open Agent-Probe gap. Delivered by:
  `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_PLAN_14-07-26.md`
  (+ co-located REPORT/FEASIBILITY files in the same task folder).

- **Admin dashboard web app (`apps/admin`, Phase 0 — Scaffold, delivered 14-07-26, ✅ VERIFIED):**
  new workspace app `@jojopotato/admin` scaffolded from empty — TanStack Start (Vite 8) + Tailwind
  v4 + shadcn/ui + a SEPARATE react-query client instance. Brand tokens ported from
  `packages/ui/src/theme.ts` into Tailwind's `@theme` block plus a two-layer shadcn semantic mapping
  (`:root` raw slots + `@theme inline` remap), light-mode only — a stock, unmodified shadcn
  `Button`/`Card` renders on-brand by default (cream bg/ink text/jyellow primary/brand radius/4px
  hard shadow). `apps/mobile`/`packages/ui` are untouched — `packages/ui` (React Native) is
  explicitly NOT reused in `apps/admin` (cannot render in a web app). `turbo.json` was NOT modified —
  the build output (`dist/`) matched the existing glob. First web-app Vitest + `@testing-library/react`
  (jsdom) test runner precedent in the repo. This phase has NO business screens and NO auth yet —
  Phase 1 (ADM-001) adds `requireAdmin` + a browser-cookie session flow (new to this repo — Expo
  only has bearer-token auth today) + admin login. Full 8-phase program plan:
  `process/features/admin-dashboard/active/admin-dashboard_14-07-26/` (umbrella plan +
  phase-00 through phase-07 plan files).
- **Admin dashboard UI foundation (`apps/admin`, delivered 14-07-26):** smart `Button` component refined with `useFormStatus` integration (auto-disables when `pending` is true, eliminating manual boilerplate), universal borders (2px solid ink on all variants to preserve hitboxes and prevent layout shift), the removal of the `outline` variant (redundant with `secondary`), and a `requiresConfirm` prop for dangerous actions (integrates `radix-ui` `AlertDialog` inline). Added a `/components` showcase route (development only) to catalog UI primitives and their variants.

- **Navigation shell:** complete. Full 5-tab bottom nav (Home, Order, Rewards, Branches, Account —
  PRD order), a public `(auth)` stack (Splash → Onboarding → Login/Signup → Terms), and per-tab
  nested `Stack` navigators so deep screens (Product Details, Cart, Checkout, Branch Details, etc.)
  have somewhere to live with correct back-navigation. Root gating is now a FOUR-way, role-aware
  `Stack.Protected` split in `apps/mobile/src/app/_layout.tsx`: staff/admin/super_admin →
  `(staff)` (checked FIRST — staff skip customer profile onboarding); customer with completed
  profile → `(tabs)`; customer without → `(onboarding)` (see the post-auth onboarding entry
  below); unauthenticated → `(auth)`.
- **Auth:** real provider decided and wired — **better-auth**, hosted in `packages/api` (Express +
  Drizzle + Postgres). Server config lives in `packages/api/src/lib/auth.ts` (email/password, phone
  OTP, Google OAuth, magic link), mounted at `/api/auth/*` in `src/index.ts`; the existing `users`
  table IS better-auth's user model (plus new `session`/`account`/`verification` tables, migration
  `0001_daily_carnage.sql`). The mobile app consumes it through a real
  `AuthProvider`/`useAuth()` seam at `apps/mobile/src/features/auth/hooks/use-auth.ts` (backed by
  `authClient.useSession()` in `.../lib/auth-client.ts`), which replaced the old in-memory mock
  (`use-auth-session.ts`, deleted). Sessions now persist across restarts via `expo-secure-store`
  and slide (30-day expiry, 1-day refresh). Phone-OTP SMS delivery is a server-side STUB (the code
  is logged, not texted) and a live Google OAuth round-trip needs real provisioned credentials —
  both flagged as follow-ups. `role` is server-owned (`input: false`), defaulting to `customer`.
  `useAuth()` also exposes `isStaff: boolean` (role ∈ {staff, admin, super_admin}) — STAFF-001.
- **Post-auth onboarding (DELIVERED):** a second, separate onboarding layer sits between login and
  Home — distinct from the existing pre-auth welcome flow, which is unchanged. `users` gains two
  nullable columns (`address`, `onboarded_at`, migration `0002_bored_captain_flint.sql`);
  `birthday`/`address`/`onboardedAt` are now client-writable better-auth `additionalFields`
  (`input:true`; `role` stays `input:false`). `useAuth()` gains `hasCompletedProfile`
  (`user?.onboardedAt != null`) and `completeProfile()` (calls `authClient.updateUser` then
  explicitly `refetch()`s the session so the nav gate flips without an app restart). `_layout.tsx`'s
  root gate is three mutually-exclusive `Stack.Protected` blocks: `isAuthenticated &&
  hasCompletedProfile` → `(tabs)`; `isAuthenticated && !hasCompletedProfile` → new `(onboarding)`
  route group; `!isAuthenticated` → `(auth)` (unchanged). The new `(onboarding)/index.tsx` is a
  single screen with 3 internal steps (feature previews → promo previews, both skippable — Skip
  jumps to the info form, never Home — → a required Full name/birthday/address form; submitting
  completes onboarding). The birthday field is three separate auto-tabbing MM/DD/YYYY numeric
  inputs (not one free-text field) backed by an enhanced shared `@jojopotato/ui` `Input`
  (`forwardRef<TextInput, InputProps>` + optional `maxLength`/`onKeyPress`/`textAlign`/
  `returnKeyType` passthrough props, added additively — existing callers unaffected); the assembled
  value is still validated and submitted as a single `YYYY-MM-DD` string. Server-side persistence
  (self-write + `role`-write-rejection + read-back shape) has real automated coverage
  (`packages/api/src/lib/__tests__/auth.integration.test.ts`); typecheck/lint/migration-sync/AC1
  pre-auth-regression are all automated-green. **Caveat: the mobile runtime behavior — the
  nav-gate flip, Skip semantics, and the MM/DD/YYYY auto-tab form validation — is covered by manual
  Agent-Probe only.** No automated RN-runner coverage exists for this surface (project-wide gap, see
  `tests/all-tests.md`); it remains a tracked backlog gap, not a claimed automated coverage. The
  user's manual Agent-Probe walkthrough (AC1–AC7) confirmed the flow works end to end. Delivered by:
  `process/features/auth-accounts/completed/onboarding-screens_13-07-26/` (archived plan — read for
  full design, validate-contract, and execution/EVL evidence). Note: staff users bypass this
  onboarding entirely — the root gate checks `isStaff` first (STAFF-001 merge decision).
- **Screens:** Home, Order, and Branches tabs now have real, end-to-end-wired business UI — the
  full customer pickup-order journey (branch select → menu → product customize → cart → checkout
  → confirmation → tracking → order history) is implemented and working, not just placeholder.
  Rewards and Account tabs (`rewards/index.tsx`, `account/index.tsx` and everything nested under
  them) remain `<ComingSoon>` placeholders — future work. The role-gated `(staff)` shell exists
  (STAFF-001, see below); STAFF-002 (Active Orders real data) and STAFF-003 (order status actions +
  Completed Orders) are delivered (see dedicated bullets below). STAFF-004 (product availability) is next.
- **Checkout-flow UI rework (CART-002 #18, `feat/checkout-flow` branch — real-API wiring delivered 14-07-26):**
  `feat/checkout-flow` reworked Checkout (`order/checkout.tsx`), Payment-method selection
  (`order/payment-method.tsx` + shared `packages/ui` `payment-method-selector.tsx` with
  `PAYMENT_METHOD_LABELS`/`ICONS`), and Order Confirmation (`order/confirmation/[orderId].tsx`) as
  richer UI. In the development merge, THIS branch's screens were kept; the checkout and
  confirmation screens are now wired to the real `POST /orders`/`GET /orders/:id` API via
  `useCheckout()` (`features/orders/hooks/use-checkout.ts`). The original in-memory
  `mock-order.ts` seam and its vitest unit tests were deleted. `useOrder()` (`features/order/`)
  remains but is trimmed to payment-method selection state only (consumed by
  `order/payment-method.tsx`). App-side `PaymentMethod` (`pay_at_branch|app_wallet|gcash|maya|card`)
  intentionally diverges from the DB enum (`pay_at_branch|online_payment`) — UI-only widening,
  `payment_status` stays `unpaid`; see
  `process/features/ordering-cart/backlog/payment-method-enum-divergence_NOTE_13-07-26.md`.
  `env.ts` gained `onlinePaymentEnabled` (`EXPO_PUBLIC_ONLINE_PAYMENT_ENABLED`, default false).
  `apps/mobile` has a pure-TS **vitest** runner (node env, `--passWithNoTests`; mock-order tests
  removed) — extended by development's HIST-002 config; still no RN component/E2E runner.
- **Order History + Reorder, real-API (HIST-001/HIST-002, delivered 13-07-26, merged PR #73/`399e415`):**
  the Order History list (`order/history.tsx`) shows branch name (client cross-ref via
  `useBranch().branches`, "Unknown branch" fallback) and an item-summary line
  (`packages/utils/src/order-display.ts`'s `summarizeOrderItems`); stars-earned is intentionally
  omitted (no server-side accrual yet — known gap, see backlog note below). Reorder
  (`apps/mobile/src/features/orders/hooks/use-reorder.ts` + `packages/utils/src/reorder.ts`)
  re-checks each past line against today's menu for the order's branch, adds available items to the
  real cart at live prices, and flags now-unavailable items as inline conflict rows in the cart
  screen (`use-reorder-conflicts.ts`'s `ReorderConflictProvider`, mounted in `_layout.tsx`) that
  block checkout until acknowledged — never silently dropped. Reconciliation logic
  (`reorderEligibility`, `reconcileReorder`) is pure and covered by real `packages/utils` vitest
  tests; screen/render behavior is Agent-Probe only (no RN runner, project-wide gap). Superseded an
  earlier mock-data-only plan for the same issues (never executed). Known gap: stars accrual —
  `process/features/ordering-cart/backlog/stars-accrual-and-history-display_NOTE_13-07-26.md`.
  Delivered by: `process/features/ordering-cart/completed/order-history-reorder-api_13-07-26/`.
- **Staff authz layer (STAFF-001, delivered 13-07-26):** first `/api`-prefixed protected app API
  surface. `packages/api/src/lib/require-staff.ts` exports `requireStaff(auth)` middleware (rejects
  non-staff roles with 403), `resolveBranchScope(db, userId)` helper (returns
  `assigned_branch_id`), and `assertBranchScope(assignedBranchId, requestedBranchId)` pure guard.
  Applied at router level: `app.use('/api/staff', requireStaff(auth), staffRouter)` — all future
  `/api/staff/*` routes automatically inherit the guard without re-applying it. `GET /api/staff/me`
  canary returns `{ role, assignedBranch: { id, name, slug } | null }`. `StaffMe`, `StaffRole`, and
  the shared `STAFF_ROLES` runtime constant live in `packages/types/src/staff.ts`. A
  `TODO(STAFF-ADM)` seam in `assertBranchScope` marks where admin bypass logic goes (not yet
  implemented). Migration `0003_lean_kang.sql` added nullable `users.assigned_branch_id`
  (originally generated as `0002_elite_bishop.sql`, renumbered to 0003 when development's
  onboarding migration `0002_bored_captain_flint.sql` took the 0002 slot in the merge); the
  seed creates a staff test user (`staff-branch1@jojopotato.local`, role=staff, assigned to branch
  1) alongside dev's customer test user (`jojo@test.com`).
- **Staff dashboard shell (STAFF-001):** `apps/mobile/src/app/(staff)/` is a role-gated Expo
  Router group. `(staff)/index.tsx` shows: BrandWordmark + "Staff" Badge header; assigned-branch
  name fetched from `GET /api/staff/me` via `useStaffMe()` hook
  (`features/staff/hooks/use-staff-me.ts` → `features/staff/lib/staff-api.ts` using
  `authClient.$fetch`); four PRD §6.13 nav cards (Active Orders / Completed Orders / Product
  Availability / Branch Pickup Settings); sign-out Button. Full
  plan: `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/`.
- **Staff order status actions + Completed Orders (STAFF-003, delivered 14-07-26):** server-side
  order-state-machine and completed orders history. Key deliverables:
  - **DB migration `0005_add_rejected_order_status.sql`** — `ALTER TYPE order_status ADD VALUE
    'rejected'` (standalone, not in a transaction; Postgres constraint). `OrderStatus` union in
    `packages/types/src/order.ts` now has 8 values (adds `'rejected'`). Two exhaustive
    `Record<OrderStatus,...>` literals in `packages/ui` (`STATUS_META` in `order-status-badge.tsx`,
    `STATUS_LABEL` in `order-status-timeline.tsx`) updated for `rejected`. `staff-status-config.ts`
    was `Extract`-narrowed and safe, but widened to full `Record<OrderStatus,...>` this pass to cover
    all 8 statuses in the staff display layer.
  - **State machine** (`packages/api/src/routes/lib/order-state-machine.ts`): pure lookup table,
    no DB import. Exports `canTransition(from, to)` and `isTerminal(status)`. Valid transition map:
    `pending→{accepted,rejected,cancelled}`, `accepted→{preparing,cancelled}`,
    `preparing→{flavoring,cancelled}`, `flavoring→{ready,cancelled}`, `ready→{completed,cancelled}`,
    `completed/cancelled/rejected→{}` (terminal).
  - **`PATCH /api/staff/orders/:orderId`** — session-gated (inherited `requireStaff`), per-request
    `resolveBranchScope`; zod-validated body (`status` required → 422 on failure, `etaMinutes` present
    but IGNORED); state machine guard (409 on illegal/terminal-source transition); per-transition
    timestamps (`accepted_at`, `ready_at`, `completed_at`, `cancelled_at`); ETA derived from branch's
    `estimated_prep_minutes` at accept-time (NOT placed_at-based; see AC-6 note); STAR-001 /
    PUSH-002 are **named no-op stubs** (`creditStarsForOrder`, `notifyCustomer`) — real
    implementations are future work; 200 returns full `StaffOrderDetail`.
  - **`GET /api/staff/orders/completed`** — returns terminal orders (`completed`/`cancelled`/`rejected`)
    for the assigned branch, newest-first. Registered BEFORE `GET /api/staff/orders/:orderId` in
    `staff.ts` (Express route-ordering — `completed` would otherwise be captured as `:orderId`).
  - **Mobile:** `patchStaffOrderStatus` + `fetchCompletedStaffOrders` in `staff-api.ts`; `staffFetch`
    extended to accept `init?: RequestInit` (backward-compatible). `use-update-order-status.ts`
    (`useMutation` with triple cache invalidation: `['staff','orders']`, `['staff','order',orderId]`,
    `['staff','completed']`). `use-completed-orders.ts` (`useQuery`, no polling — historical view).
  - **Screens:** `order-detail/[orderId].tsx` — `InertOrderActions` replaced by `LiveOrderActions`
    (SPEC button matrix per status, confirm alerts for reject/cancel, 409 inline error, loading states).
    `completed-orders.tsx` — new screen, driven by `useCompletedOrders()`, empty state, row → detail.
    `(staff)/index.tsx` "Completed Orders" card wired (`navigateTo: '/(staff)/completed-orders'`).
    `(staff)/_layout.tsx` registers `completed-orders` Stack.Screen.
  - **Integration tests:** 17 new tests in `staff-order-status.integration.test.ts` covering AC-1..AC-6
    (valid transitions + timestamps, illegal/terminal → 409, branch isolation → 403, `rejected`
    terminal, completed-list filtering, ETA derivation). Total API suite: 84 tests, 0 failures.
  - **Known gaps:** AC-7..AC-10 mobile behavior (button rendering, tap→mutation, 409 inline error,
    Completed Orders nav) are Agent-Probe only — no RN runner exists (project-wide gap; backlog:
    `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`).
    AC-8 Active Orders back-list refresh is forward-compatible pending STAFF-002 mock replacement
    with live data. `mustStopBeforeFinalize: true` — HIGH-risk trust-boundary; human review of the
    5-artifact risk evidence pack (`harness/`) required before production deploy.
  - **Pre-existing mobile typecheck errors (NOT STAFF-003 regressions):** `apps/mobile` has 3
    pre-existing typecheck errors in BRN-001/002/003 files tied to missing type stubs for
    `@gorhom/bottom-sheet`, `expo-maps`, and `expo-location`. These existed before STAFF-003 and
    are zero-diff from this plan's blast radius. Do not treat them as STAFF-003 regressions.
  - Full plan: `process/features/staff-dashboard/completed/staff-003-order-status-actions_14-07-26/`
- **Ordering / pickup flow (customer-facing):** real, working end-to-end. New authenticated API
  surface in `packages/api/src/routes/` (`branches.ts`, `orders.ts`) plus
  `middleware/require-session.ts`; new mobile state/data layer in
  `apps/mobile/src/{lib,features/{cart,branch,menu,orders,shared}}/` (see "Menu/branch data layer
  superseded" bullet below — `features/branches/` no longer exists). `orders.order_number` is
  DB-unique/human-readable (`JP-YYMMDD-XXXX`), `estimated_ready_at` is derived from the branch's
  `estimated_prep_minutes` at placement time, each `POST /orders` is a fully independent
  transaction. `packages/types`'s `OrderStatus` enum was rewritten from a 6-value placeholder to
  the real 7-value DB enum (breaking rename, all consumers reconciled). Deferred/out of scope this
  pass: staff-side order-status transitions, star-earning/rewards accrual, coupon redemption
  (`discount_total` stays `0`), live `online_payment` processing (visibly disabled, no processor
  chosen — see §Open Questions), polling/websocket live status updates (fetch-on-focus only). See
  `process/features/ordering-cart/_GUIDE.md` and `process/features/pickup-branches/_GUIDE.md` for
  the per-feature breakdown, and
  `process/general-plans/completed/pickup-order-flow_10-07-26/` for the full plan, validate
  journey, and closeout report.
- **Cart architecture (superseded 13-07-26):** `pickup-order-flow`'s original `CartProvider`/
  `useCart()` (`CartLine`-shaped, backed by `apps/mobile/src/features/cart/lib/cart-totals.ts`) is
  **no longer in the codebase.** `development` independently shipped its own mock-only cart screen
  (PR #62, CART-001 — see `process/features/ordering-cart/completed/cart-screen_09-07-26/`, now
  archived as superseded) with a different, richer type/state model. When the two branches merged,
  the user chose development's model as canonical and this branch's real backend wiring
  (branches/menu/orders API calls) was ported onto it — see
  `process/general-plans/completed/merge-cart-reconciliation_13-07-26/`. The **current, real** cart
  seam is `CartSessionProvider`/`useCart()` in `apps/mobile/src/features/cart/hooks/use-cart.ts`
  (mounted in `_layout.tsx`, no `CartProvider` name remains), backed by `packages/types/src/cart.ts`'s
  `Cart`/`CartItem`/`CartItemOption`/`AppliedDiscount` (not `CartLine`). `cart-totals.ts` is
  deleted — totals (`subtotalCents`/`discountTotalCents`/`totalCents`) are now derived inside the
  hook itself. The order-placement backend wiring (API routes, `order_number`, `estimated_ready_at`,
  transaction independence, the `OrderStatus` rewrite described above) is **unchanged and still
  real** — only the cart's own type/state layer changed. A coupon-apply UI exists in the merged
  cart screen but is disabled/hidden (no backend coupon support yet, same `discount_total` stance
  as before). The merge is EVL-verified but was staged, not yet committed, as of this pass — check
  `git log`/`git status` before assuming it landed.
- **Menu/branch data layer superseded (13-07-26):** while this branch built its own plain
  `useEffect`/`useState` menu/branch hooks (`features/branches/hooks/use-branches.ts`,
  `features/menu/{hooks/use-branch-menu.ts,lib/api-client.ts,lib/api-client.contract.ts}`),
  `development` independently shipped a parallel menu/branch feature (its own SPEC/plan —
  `process/features/ordering-cart/completed/menu-product-browsing_10-07-26/`, now archived as
  superseded) built on **react-query** (`@tanstack/react-query`) and a **decimal-peso** backend
  API (`packages/api/src/routes/menu.ts`, discarded/never mounted). When the branches merged, the
  user chose: (1) keep this branch's cents backend + real order-placement as canonical, discard
  development's decimal-peso parallel API; (2) **adopt react-query**, retargeted onto this
  branch's real cents-native `/branches`/`/branches/:id/menu` endpoints; (3) adopt development's
  new menu UI components. See
  `process/general-plans/completed/merge-menu-api-reconciliation_13-07-26/` for the full
  merge-resolution plan (7 real conflicts + 4 silent-auto-merge fixes + 3 more found during
  EXECUTE) and closeout report.
  - **Current, real data layer:** `apps/mobile/src/lib/{api-client,query-client}.ts` (global
    react-query client + `getBranches()`/`getMenu()`, unwrapping this backend's 3 distinct response
    envelope shapes), `apps/mobile/src/features/branch/hooks/use-branch.ts` (`BranchProvider`/
    `useBranch()` — replaces the deleted `features/branches/` folder entirely),
    `apps/mobile/src/features/menu/hooks/{use-menu,use-product-details}.ts` (replaces the deleted
    `features/menu/lib/api-client.ts` + `use-branch-menu.ts`), plus new UI components
    `apps/mobile/src/features/menu/components/{add-to-cart-bar,branch-switcher,category-section,
    option-group-selector}.tsx` and `packages/ui`'s `AddOnSelector`.
  - **`packages/types/src/menu.ts` is no longer a placeholder** — it now carries real cents-native
    catalog types (`Product`, `ProductOption`, `Category`, `ProductDetail`, `MenuResponse`,
    `optionId`/`basePriceCents`/`priceDeltaCents` field names) promoted from this branch's own
    local types, superset-merged over development's auto-merged (and discarded) decimal versions.
    The pre-existing cart-internal `MenuItem`/`MenuCategory` types are unchanged.
  - **Money convention remains cents everywhere** — development's decimal-peso convention
    (`Product.basePrice` as whole PHP, `formatPricePHP`) was explicitly rejected during this
    reconciliation; `packages/utils/src/pricing.ts` (decimal-based) was deleted.
  - **New shared util:** `packages/utils/src/product-options.ts` (`getRequiredOptionTypes`,
    `isRequiredSelectionComplete`) adopted from development, unit-agnostic.
  - **`features/shared/{use-async-data.ts,lib/api-request.ts}` are explicitly carved out and kept**
    (not deleted) — the out-of-scope `features/orders/*` hooks still depend on them; only the
    menu/branch-specific old hooks were deleted.
  - The order-placement backend (`packages/api/src/routes/orders.ts`, 47 tests) is **unchanged**
    and remains canonical. The merge is EVL-verified but was staged, not yet committed, as of this
    pass — check `git log`/`git status` before assuming it landed.
- **Known tech debt:** un-gated "Dev: ..." nav links (added to manually exercise nested stacks
  before real UI existed) are resolved for `order/`, `branches/`, and
  `order/confirmation/[orderId].tsx` — the `pickup-order-flow` plan removed them once real
  navigation entry points superseded them. One instance remains: `rewards/index.tsx`'s
  `Dev: View Coupons` link, since the Rewards tab is still a placeholder — see
  `process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md` (narrowed scope).
- **Known gap:** no automated E2E/regression harness exists for any navigation flow (project-wide
  test-runner gap, see `tests/all-tests.md`) — see
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. The
  `pickup-order-flow` plan's happy-path coverage relied on an Agent-Probe manual QA script for this
  reason, not an automated E2E gate. The mobile staff shell and role-gate are Agent-Probe only for
  the same reason.
- **API testing:** `packages/api` has vitest + supertest. Run `pnpm --filter @jojopotato/api test`
  (requires `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` first). Suites
  cover auth, staff authz (`require-staff.integration.test.ts` — hermetic, self-seeding fixtures),
  branches, customer order placement, deals (`deals.test.ts`), and staff order status actions
  (`staff-order-status.integration.test.ts` — 17 tests, AC-1..AC-6: valid transitions + timestamps,
  illegal/terminal → 409, branch isolation → 403, ETA derivation, completed-list filtering). `app`
  is exported from `packages/api/src/index.ts` (port binding guarded so tests never bind a port).
- **Deals feature (backend wiring COMPLETE, 14-07-26):** the Deals feature
  (`(tabs)/deals/index.tsx` list + `deals/deal/[dealId].tsx` details, reachable from the Home tab —
  NOT a bottom-nav tab itself) is now fully backend-wired end-to-end, real data through real cart
  apply through real server-authoritative order placement. The `deals-api-integration` program
  (all 3 phases, `process/features/rewards-notifications/completed/
  deals-api-integration_13-07-26/` — archived) delivered:
  **Phase 1 (DEAL-001 / #22):** public `GET /deals?branchId=` route
  (`packages/api/src/routes/deals.ts`) + `serializeDeal`/`ApiDeal` boundary serializer
  (`routes/lib/serializers.ts` — cents at the boundary, EXCEPT `percentage_discount` values are NOT
  ×100, per `packages/types/src/deals.ts`'s VALUE-UNIT NOTE) + a react-query `useDeals()` hook
  (`apps/mobile/src/features/deals/hooks/use-deals.ts`, reading branch from `useCart()`); the deals
  list screen renders from the API, not `MOCK_DEALS`.
  **Phase 2 (DEAL-002 / #23):** public `GET /deals/:id` route (additive to `deals.ts`, reuses
  `serializeDeal` verbatim; no branch/window filter by design so the client eligibility engine can
  render `branch_ineligible`/`not_in_window` reasons) + a react-query `useDeal(dealId)` hook
  (`apps/mobile/src/features/deals/hooks/use-deal.ts`) + the Deal Details screen
  (`deal/[dealId].tsx`) feeding the existing 6-step `checkDealEligibility` engine with real data.
  **Phase 3 (DEAL-003 / #24 — the write surface):** migration `0006_legal_daredevil.sql` (renumbered
  twice during merges with `development`'s own `0004_add_branch_priority`/`0005_add_rejected_order_status`
  migrations — same content throughout, only the slot number changed) adds a
  nullable `orders.deal_id uuid` FK (additive, NO ACTION); `POST /orders` was rewritten so that,
  inside the existing placement transaction, it `SELECT ... FOR UPDATE`-locks the deal row, rejects
  the 4 complex deal types (`buy_one_take_one`/`free_item`/`free_upgrade`/`bundle`) with 400 before
  any write, re-runs the 6-step eligibility server-side (window/branch/product/minimum/per-user
  usage/total usage — usage derives from `orders.deal_id`, no separate `deal_usages` table), and
  computes a REAL discount for `percentage_discount`/`fixed_discount` ONLY from the raw
  `deals.discount_value` (never a client-sent amount, always dual-clamped
  `Math.max(0, Math.min(computed, subtotalCents))`), writing `total = subtotal − discount` and
  `deal_id` atomically. `apps/mobile`'s cart dead coupon-code-input UI (the `deals` table has no
  `code` column, so it could never resolve a real deal) was deleted; the real
  browse→Deal-Details→**Apply**→cart flow is wired (`applyDealById` now performs a real `getDeal()`
  fetch and client-side-rejects the 4 complex types before applying — `apply-deal.ts` +
  `deal/[dealId].tsx`); checkout's Total-display bug (was showing subtotal) is fixed
  (`checkout.tsx`, subtotal/discount/total breakdown). `cart.tsx`'s `useReorderConflicts()` import
  and render path (unrelated `ordering-cart` feature) were explicitly preserved untouched.
  **Test-tier split (standing, unchanged by this program):** `packages/api` vitest+supertest IS the
  automated hard gate for all placement/discount/eligibility/atomicity/complex-reject logic
  (`orders.test.ts` grew to 25 cases incl. 15 deal-apply; `deals.test.ts` covers the read routes).
  `apps/mobile` has NO RN test runner (project-wide gap, see `tests/all-tests.md`) — all client-side
  Deals UX (list render, details render, cart-apply-through-checkout flow) is Agent-Probe only,
  never claimed as automated coverage; 3 manual walkthroughs remain owed (non-blocking backlog).
  **Deferred/out of scope (by design, unchanged):** coupons entirely (no `/coupons`, no `code`
  column, no Coupon Wallet); real pricing for the 4 complex deal types (shown/evaluated, not
  cart-applicable); star/rewards accrual; live payment processing.
- **Staff order status actions (STAFF-003, 14-07-26):** a `PATCH` state-machine endpoint for staff
  to transition order status (valid transitions only, illegal/terminal → 409, branch-isolated → 403,
  atomic compare-and-swap to avoid a race on concurrent transitions) plus a Completed Orders screen
  and a new `rejected` order-status enum value (migration `0005_add_rejected_order_status.sql`).
  Delivered by `process/features/staff-dashboard/completed/staff-003-order-status-actions_14-07-26/`.
- **Push notifications, backend + real-delivery hardening (PUSH-004 #75 + real-push-delivery
  15-07-26, on branch `feat/push-notifications-api`, uncommitted as of this pass — check
  `git log`/`git status` before assuming landed):** PUSH-004 shipped the first real push send
  pipeline — `device_tokens` table (`packages/api/src/db/schema/device_tokens.ts`), a
  `marketing_opt_in` better-auth `additionalField` on `users` (`input:true`), an
  `expo-server-sdk`-based `push-provider.ts`, `notification-dispatch.ts` (order-status +
  marketing dispatch), and an in-process `scheduler.ts`. It has never run against real
  credentials — `sendPush()` only ever hits its log-fallback branch in CI/dev
  (`EXPO_ACCESS_TOKEN` unset). The `real-push-delivery_15-07-26` follow-up (same feature,
  `process/features/rewards-notifications/active/real-push-delivery_15-07-26/`) hardens the code
  *around* that seam so it is correct once real credentials exist, provable today with creds
  unset: (1) `notifications.ts`'s `deviceTokenSchema.platform` is now a Zod
  `z.enum(['ios','android'])` (API-boundary-only tightening, no DB/schema change — the column
  stays `varchar`); (2) `push-provider.ts`'s constructed `ExpoPushMessage` now includes
  `priority: 'high'` + `_contentAvailable: true` for background/killed-app wake delivery; (3)
  `sendPush()`'s return type widened `Promise<void>` → `Promise<PushSendResult[]>` (per-ticket
  `ok`/`error` classification, exports `PushSendResult`/`PERMANENT_PUSH_ERROR_CODES`/
  `isPermanentPushError`); (4) a new `sendAndPrune()` wrapper in **`notification-dispatch.ts`**
  (not `push-provider.ts`) calls `sendPush` then hard-deletes any `device_tokens` row whose
  ticket reports a permanent `DeviceNotRegistered` error — both `dispatchOrderNotification` and
  `dispatchMarketingNotification` now call it instead of `sendPush` directly. **Correlation
  gotcha (durable, non-obvious):** `sendPush` filters non-Expo tokens
  (`Expo.isExpoPushToken`) and re-chunks before sending, so tickets align with the
  filtered+chunked `validTokens`/`messages` list, NOT the raw input `tokens` array — the prune
  logic must correlate by that filtered/chunked order (preferring `details.expoPushToken` when
  the SDK populates it, else positional index within the chunk), never by zipping tickets
  against the original unfiltered array, or it can delete the wrong device's token row. (5)
  `apps/mobile/app.config.ts`'s `expo-notifications` plugin entry became a tuple
  (`['expo-notifications', { enableBackgroundRemoteNotifications: true }]`) to wire the
  `remote-notification` `UIBackgroundModes` entitlement — no secret file needed for
  typecheck/lint/build to pass. New reusable test pattern: `push-provider.test.ts` mixes
  pure-unit assertions (mocked `Expo` client, for message-shape) with a real-seeded-`device_tokens`-row
  fixture (mirroring `push-provider.integration.test.ts`'s hermetic self-seed/cleanup) for the
  prune assertions — not "no DB" despite living in `.test.ts` not `.integration.test.ts`. API
  suite: 167/167 with `EXPO_ACCESS_TOKEN` unset. **Known gaps (both accepted, documented, not
  defects):** receipt-stage `DeviceNotRegistered` detection (`getPushNotificationReceiptsAsync`,
  ~15min delayed poll) is deliberately deferred — only ticket-stage errors are pruned today, see
  `process/features/rewards-notifications/backlog/receipt-stage-token-prune_NOTE_15-07-26.md`;
  and real on-device delivery (AC-6) is a permanent, user-run Agent-Probe walkthrough (needs live
  Firebase/APNs/EAS credentials + physical hardware) documented in a standalone runbook
  (`real-push-delivery_REF-credential-runbook_15-07-26.md`) — no agent can complete it. As of this
  pass the plan is CODE DONE (all automated gates green) but not yet VERIFIED — the plan's own
  Phase Completion Rules require the user to review the credential runbook (AC-5) before
  archival; the plan stays in `active/` pending that review, not yet moved to `completed/`.
- Delivered by: `process/general-plans/completed/finalize-navigation-shell_09-07-26/` (navigation
  shell — archived plan, full route tree/decisions/validate-contract),
  `process/general-plans/completed/pickup-order-flow_10-07-26/` (customer ordering flow — archived
  plan, API design, validate journey incl. the CONDITIONAL→PASS PVL cycle and the EVL cross-phase
  bug catch-and-fix, closeout report), `process/general-plans/completed/merge-cart-reconciliation_13-07-26/`
  (cart architecture reconciliation),
  `process/general-plans/completed/merge-menu-api-reconciliation_13-07-26/` (menu/branch data-layer
  + react-query reconciliation),
  `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/` (staff authz
  layer + role-gated staff shell — STAFF-001),
  `process/features/rewards-notifications/completed/deals-api-integration_13-07-26/` (3-phase Deals
  backend wiring program — #22/#23/#24, archived plan + phase reports + high-risk evidence pack),
  `process/features/staff-dashboard/completed/staff-003-order-status-actions_14-07-26/` (order
  state-machine PATCH endpoint + Completed Orders screen + `rejected` enum — STAFF-003), and
  `process/features/ordering-cart/completed/order-history-reorder-api_13-07-26/` (real-API Order
  History display + Reorder — HIST-001/HIST-002).

## Quick Start

For most substantial tasks:

1. read this file first
2. choose the smallest relevant root file or context group from the tables below
3. only then load deeper files

---

## Current Root Entry Points

<!-- The two tables below (Root Entry Points + Context Groups) are GENERATED from each
     context doc's frontmatter by `discover-context.mjs --emit-routing`. Do NOT hand-edit
     between the GENERATED markers — your edits will be overwritten on the next rebuild.
     To change a row, edit the owning doc's frontmatter (description / keywords) and re-emit.
     `--check-routing` fails lint if this block drifts from the frontmatter on disk. -->

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/planning/all-planning.md` | SIMPLE vs COMPLEX plan calibration and example PRD references |
| `process/context/tests/all-tests.md` | Test runner selection, commands, and verification order — vitest in packages/api, apps/mobile, and apps/admin; jest-expo in packages/ui |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `planning/` | `process/context/planning/all-planning.md` | SIMPLE vs COMPLEX plan calibration and example PRD references |
| `tests/` | `process/context/tests/all-tests.md` | Test runner selection, commands, and verification order — vitest in packages/api, apps/mobile, and apps/admin; jest-expo in packages/ui |
<!-- /GENERATED:routing -->

No other context groups exist beyond the baseline `tests`/`planning` groups every repo gets
(independent of the project-signal detection table) — see §Context Group Detection Result below.

## Context Group Detection Result

Scanned against the canonical Context Group Detection Table
(`.claude/skills/vc-generate-context/references/generate-context.md`):

- Drizzle ORM + PostgreSQL present (`packages/api` — full schema ~15 tables, 2 migrations, `db:generate`/
  `db:migrate` scripts, seed, vitest integration tests). `database/` group threshold is likely met
  (full schema + seed + migration pattern established). Not yet created — run `vc-generate-context`
  (delta mode) to create it when ready.
- Auth dependency present — **better-auth** in `packages/api` + consumed by `apps/mobile`. The
  `auth/` group threshold now plausibly has THREE durable narratives: (1) auth provider setup
  (better-auth config, Expo bearer-token client, magic-link caveat), (2) staff authz pattern
  (`require-staff.ts`, role-gated routes, `StaffRole`/`StaffMe` types), and (3) admin browser-cookie
  authz (`require-admin.ts`, `requireAdmin`, the first browser-cookie session flow, super_admin-only
  role management, the resolved `TODO(STAFF-ADM)` bypass — Phase 1, delivered 14-07-26).
  **Recommendation:** this is a strong candidate to formally create the `auth/` context group now —
  three narratives across two apps (mobile + admin) and two session models (bearer-token vs
  browser-cookie) is exactly the "stable operational domain" signal in §Context Group Lifecycle.
  Not created in this pass (deferred per UPDATE PROCESS scope discipline — recommend only, don't
  create speculatively mid-phase); run `vc-generate-context` (delta mode) or raise it explicitly at
  the next UPDATE PROCESS pass to create it.
- `staff-dashboard` feature established (STAFF-001 delivered 13-07-26). `process/features/staff-dashboard/`
  exists with `active/`, `completed/`, `backlog/` subdirs. Future STAFF-002/003/004 work lives here.
- `admin-dashboard` feature established (Phase 0 — Scaffold delivered 14-07-26; Phase 1 — Auth/RBAC
  delivered 14-07-26, ✅ VERIFIED; Phase 2 — Branches CRUD delivered 14-07-26, ✅ VERIFIED;
  Sidebar Navigation cross-cutting task delivered 15-07-26, ✅ COMPLETE; Phase 3 — Products/
  Categories CRUD delivered 15-07-26, ✅ VERIFIED; Phase 4a — Deals-as-Products (ADM-004 RE-PLAN)
  delivered 15/16-07-26, EVL-green, on branch `feat/adm-004-deals`, PR pending review/merge).
  `process/features/admin-dashboard/` exists with `active/`, `completed/`, `backlog/` subdirs
  (`completed/admin-dashboard_14-07-26/` now holds the sidebar-nav plan + report; 3 Phase-2 backlog
  notes remain, plus 2 new Phase-4a backlog notes filed this pass — see Deferred Hardening bullet
  above). This is an 8-phase program (P0 scaffold through P7 analytics, ADM-001..007) — see the
  umbrella plan's `## Current Execution State` for the current phase (Phase 4a delivered; Phase 5 —
  Rewards CRUD, ADM-005, next, once Phase 4a merges).
- `docker-compose.yml` (root) provides local/CI Postgres, but no Dockerfile / app container image → `container/` group threshold not met
- CI/CD config now present (`.github/workflows/ci.yml` — format/lint/typecheck/test/build) → re-evaluate a `cicd/` group if CI docs grow
- No infra-as-code (terraform/pulumi/CDK/SST) → no `infra/` group
- Only 1 UI package (`packages/ui`) with 3 source files → below the 3+ dedicated dirs threshold for `uxui/`
- No workflow/queue system → no `workflows/` group

Re-run `vc-generate-context` (delta mode) once the `database/` or `auth/` thresholds are formally
crossed — it will create the matching group automatically.

## Task Routing Table

| Task type | Load first | Then load |
|---|---|---|
| general repo research | `all-context.md` | this file's Repository Structure / Technology Stack sections |
| implementation planning | `all-context.md`, `planning/all-planning.md` | the relevant feature's `_GUIDE.md` under `process/features/{feature}/` |
| test planning or verification | `all-context.md`, `tests/all-tests.md` | no runner configured yet — `all-tests.md` documents the current typecheck/lint-only verification path |
| new feature work | `all-context.md` | `process/features/{feature}/_GUIDE.md` for the matching product area (`ordering-cart`, `pickup-branches`, `auth-accounts`, `rewards-notifications`, `staff-dashboard`, `admin-dashboard`) if it exists, else `process/general-plans/active/` |
| staff dashboard work (STAFF-002/003/004) | `all-context.md` | `process/features/staff-dashboard/` — read completed STAFF-001 plan for requireStaff/assertBranchScope contract and (staff) shell structure |
| admin dashboard work (Phase 5-7, ADM-005..007) | `all-context.md` | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/` — read the umbrella plan's `## Current Execution State` for the current phase, then the named phase plan file, then the backlog notes under `backlog/` (3 Phase-2 notes: AC7 owed, is_accepting_pickup Known-Gap, shared-composite extraction — RESOLVED, extracted in Phase 3/4a; 2 new Phase-4a notes: `deal_components` CHECK constraints deferred, `products.is_deal` partial index deferred) |

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- a topic has 3+ durable docs
- a single doc exceeds roughly 800 lines with separable subtopics
- multiple agents repeatedly need only one slice of a large context file
- the topic maps to a stable operational domain (tests, infra, database, auth, UI, workflows, etc.)

Do not create a group when:

- the content is a temporary report
- the content is a plan or execution artifact
- the topic is feature-specific and belongs in `process/features/...`

Move or split one group at a time. Use `all-{group}.md` entrypoints. Run the `audit-context` skill after every context organization change.

## Naming Convention

There are no `README.md` files inside `process/context/`.

Canonical entrypoints use `all-*.md`:

- root: `process/context/all-context.md`
- group: `process/context/{group}/all-{group}.md`

Each `all-{group}.md` file should act as the attachable quick router for that domain:

- tell the agent what the group covers
- give quick procedures and decision rules
- route to smaller deeper files

## Context Update Protocol

When durable project knowledge changes:

1. update the smallest relevant context file
2. update this file if routing, ownership, naming, or groups changed
3. update the owning `all-{group}.md` entrypoint when a group exists
4. run `audit-context`

---

## Repository Structure

```
jojo-mobile/                           (package.json name: jojo-potato)
  apps/
    mobile/                            -- @jojopotato/mobile, Expo Router app (iOS/Android/web)
      src/
        app/                           -- Expo Router file-based routes
          _layout.tsx                  -- wraps tree in AuthProvider, RootNavigator gates (tabs) vs (auth) via Stack.Protected
          (auth)/                      -- public/onboarding stack: _layout.tsx, splash, onboarding, login, signup, phone-otp, terms
          (tabs)/                      -- authenticated 5-tab shell for customer role (Home/Order/Rewards/Branches/Account, PRD order)
            _layout.{ios,android,web}.tsx  -- per-platform Tabs.Screen wiring (base _layout.tsx is a dead-at-runtime re-export of _layout.web)
            index.tsx                  -- Home tab root -- real business UI, wired navigation to branches/products
            order/                      -- index, product/[productId], cart, tracking/[orderId], history (real, backend-wired); checkout.tsx (useCheckout() → real POST /orders), payment-method.tsx (payment-method picker), confirmation/[orderId].tsx (fetchOrder() → real GET /orders/:id) — see "Checkout-flow UI rework" bullet
            branches/                   -- real: index (list), [branchId] (detail + menu)
            rewards/, account/          -- still <ComingSoon> placeholders (not in scope for pickup-order-flow)
          (staff)/                     -- role-gated shell for staff/admin/super_admin; guarded by Stack.Protected in root _layout.tsx
            _layout.tsx                -- Stack navigator (headerShown:false for root; STAFF-002+ screens add their own headers)
            index.tsx                  -- staff dashboard shell: BrandWordmark+Staff badge, branch name from /api/staff/me, 4 inert nav cards, sign-out
            active-orders.tsx          -- MOCK PREVIEW ONLY (hardcoded sample data, inert buttons); replaced by STAFF-002
        features/
          auth/hooks/use-auth.ts       -- AuthProvider + useAuth(): real better-auth session seam; exposes isStaff boolean (role ∈ {staff,admin,super_admin})
          auth/lib/auth-client.ts      -- better-auth mobile client (expoClient + secure-store persistence, phone/magic-link plugins)
          cart/hooks/use-cart.ts       -- CartSessionProvider + useCart(): Cart/CartItem-shaped state (canonical model from development's PR #62, real backend wiring ported on -- superseded the original CartProvider/CartLine seam, see all-context.md "Cart architecture (superseded)")
          cart/mock-cart.ts            -- dev/demo-only seed data (component-showcase.tsx), not used as use-cart.ts's production default
          order/hooks/use-order.ts     -- OrderSessionProvider + useOrder(): payment-method selection state only (trimmed 14-07-26; placement logic + mock-order.ts deleted); consumed by order/payment-method.tsx
          branch/hooks/use-branch.ts   -- BranchProvider + useBranch(): react-query-backed branch list/selection (replaces deleted features/branches/, see all-context.md "Menu/branch data layer superseded")
          menu/hooks/{use-menu,use-product-details}.ts  -- react-query-backed branch menu + client-derived product detail
          menu/components/             -- add-to-cart-bar, branch-switcher, category-section, option-group-selector (adopted from development)
          orders/                      -- api-client + hooks, unchanged/out-of-scope for the react-query migration (order create/get/history)
          shared/                      -- api-request.ts fetch wrapper, use-async-data.ts, screen-message.tsx (extracted during pickup-order-flow EXECUTE; both api-request.ts/use-async-data.ts explicitly carved out of the menu/branch data-layer merge since orders/ still depends on them)
          staff/lib/staff-api.ts       -- fetchStaffMe(): authClient.$fetch wrapper for GET /api/staff/me → StaffMe | null
          staff/hooks/use-staff-me.ts  -- useStaffMe(): useState/useEffect hook returning { data, isLoading, error }
        lib/{api-client,query-client}.ts  -- global react-query client + getBranches()/getMenu() (menu/branch data layer, added by merge-menu-api-reconciliation)
        config/                        -- env.ts: typed access to EXPO_PUBLIC_* vars (incl. onlinePaymentEnabled, added by the checkout-flow rework)
        constants/                     -- app-level theme (re-exports brand tokens from @jojopotato/ui)
        hooks/                         -- use-color-scheme.ts (+.web.ts variant), use-theme.ts
        components/                    -- floating-tab-bar.tsx (ICONS map keyed by route name), coming-soon.tsx (isNestedScreen? prop)
      assets/                          -- icons, splash, favicon (placeholder branding)
      app.json                         -- Expo app config (bundle id, scheme, plugins)
      .env.example
    admin/                             -- @jojopotato/admin, TanStack Start web admin dashboard (Phase 1: browser-cookie auth + admin login + guarded (dashboard) shell; sidebar nav 15-07-26 -- see process/features/admin-dashboard/)
      src/
        routes/                       -- TanStack Start file-based routes: __root.tsx (shell + QueryClientProvider), (dashboard)/route.tsx (SidebarProvider + AppSidebar wrapper), (dashboard)/index.tsx (pure content view), login.tsx
        components/
          ui/                         -- shadcn/ui primitives (button.tsx, card.tsx, sidebar.tsx, sheet.tsx, tooltip.tsx, separator.tsx, skeleton.tsx) -- canonical registry source, NOT packages/ui (RN-only, not reused here)
          app-sidebar.tsx             -- config-driven brutalist sidebar; iterates navConfig; active-state via startsWith + exact-for-root
          nav-user.tsx                -- sidebar footer: user initial, email, role badge, sign-out; reads useAdminAuth()
          admin-home.tsx              -- placeholder proving boot + brand tokens + stock primitives render on-brand
        config/
          nav-config.ts               -- navConfig array (Main/Management/Dev groups); single source of truth for sidebar route metadata; disabled flag for unbuilt routes
        styles/globals.css            -- Tailwind v4 @theme brand-token port + two-block shadcn semantic mapping (light-mode only)
        lib/{query-client,utils}.ts   -- separate react-query client instance (own runtime, not shared with apps/mobile) + shadcn cn() helper
        router.tsx                    -- TanStack Start router-instance factory
      vite.config.ts                  -- tailwindcss() + tanstackStart() + viteReact() plugin chain
      vitest.config.ts                -- jsdom + @testing-library/react, separate from vite.config.ts
  packages/
    api/
      src/routes/                      -- branches.ts, orders.ts (session-gated), routes/lib/{order-number,serializers}.ts, __tests__/
      src/middleware/require-session.ts -- better-auth session-check Express middleware
      src/types/express.d.ts           -- Request augmentation (user/session)
    config/                            -- @jojopotato/config: shared ESLint (flat config), Prettier, TypeScript base configs
    types/                             -- @jojopotato/types: shared domain types (auth, cart, menu, notifications, order, pickup, rewards, product-option, staff) -- order/cart/pickup/menu now reconciled to the real ordering-flow API contract (menu.ts is cents-native, promoted 13-07-26 -- see "Menu/branch data layer superseded"); staff.ts (StaffMe, StaffRole, STAFF_ROLES, StaffBranch) is live; notifications/rewards still placeholders
    ui/                                -- @jojopotato/ui: shared UI incl. order-status-badge.tsx/order-status-timeline.tsx (real 7-value OrderStatus enum), addon-selector.tsx (adopted 13-07-26) -- brand tokens are placeholder
    utils/                             -- @jojopotato/utils: shared helpers (currency.ts, number.ts, async.ts, product-options.ts -- adopted 13-07-26, unit-agnostic option-selection helpers)
  docs/
    jojo-potato-mobile-prd.md         -- product PRD (navigation §7, auth §6.1) — source of truth for scope
  process/
    context/                          -- this context system
    general-plans/                    -- plans, reports, references (task-folder convention)
    features/                         -- feature-scoped storage (ordering-cart, pickup-branches, auth-accounts, rewards-notifications, staff-dashboard, admin-dashboard)
    development-protocols/            -- RIPER-5 methodology docs
  package.json                        -- root scripts (turbo pipelines)
  pnpm-workspace.yaml                 -- workspaces: apps/*, packages/*
  turbo.json
  .env.example                        -- repo-wide / CI values (EAS project id, etc.)
```

Packages are consumed as TypeScript source directly (no build step) via pnpm workspace links —
Metro/Expo resolves them like any other dependency.

## Technology Stack

- **Framework:** Expo ~57.0.4 (React Native 0.86.0) with Expo Router ~57.0.4 (file-based navigation, typed routes enabled)
- **Language:** TypeScript ~6.0.3 throughout
- **React:** 19.2.3 (react, react-dom, react-native-web ~0.21.0 for web target)
- **Runtime:** Node >=20 (`.nvmrc` pins the dev version)
- **Package manager:** pnpm 10.33.0 (`packageManager` field pinned in root `package.json`)
- **Monorepo:** Turborepo ~2.10.4 for task orchestration/caching (`turbo.json`)
- **Navigation/UI libs:** expo-router, react-native-screens, react-native-safe-area-context, react-native-gesture-handler, react-native-reanimated 4.5.0 + react-native-worklets, expo-image, expo-status-bar, expo-system-ui, expo-splash-screen, expo-linking, expo-constants
- **Data fetching:** `@tanstack/react-query` ^5.62.0 (`apps/mobile` only) — added 13-07-26 via `merge-menu-api-reconciliation`, scoped to menu/branch/product data (`lib/query-client.ts` + `features/{branch,menu}/hooks/`); NOT an app-wide data-fetching mandate — `features/orders/*` intentionally still uses the pre-existing `use-async-data.ts`/`api-request.ts` plumbing. `apps/admin` (added 14-07-26) also depends on react-query v5 but instantiates its OWN separate `QueryClient` — not shared with `apps/mobile`'s instance (different app/runtime).
- **Linting/formatting:** Flat-config ESLint 9.x (`eslint-config-expo` ~57.0.0, `typescript-eslint` 8.x) + Prettier 3.9.x, shared via `@jojopotato/config`
- **Admin web app (`apps/admin`, `@jojopotato/admin`, added 14-07-26):** TanStack Start (file-based routing, Vite 8-based build/dev) + Tailwind CSS v4 (`@theme` token block) + shadcn/ui primitives (installed as source, not a runtime dep) + `@tanstack/react-query` (own client instance). This is a NEW web app, distinct from the Expo/RN `apps/mobile` — `packages/ui` (React Native) is NOT reused here; brand tokens are ported from `packages/ui/src/theme.ts` into Tailwind's `@theme` CSS block instead. Currently Phase 0 scaffold only (no auth, no business screens) — see `process/features/admin-dashboard/`.
- **Testing:** `vitest` + `supertest` in `packages/api` (integration suites for auth, staff authz, branches, orders — run `pnpm --filter @jojopotato/api test` after `docker compose up -d` + `db:migrate`); `vitest` in `apps/mobile` (pure-TS logic only, node env — added by the checkout-flow rework, config extended by HIST-002); `vitest` + `@testing-library/react` (jsdom) in `apps/admin` (added 14-07-26 — the FIRST web-app component-test runner precedent in the repo, run `pnpm --filter @jojopotato/admin test`); `jest`/`jest-expo` in `packages/ui` (component tests). `packages/{types,utils}` and RN component/E2E coverage for `apps/mobile` still have no runner — see `process/context/tests/all-tests.md`. Propose a runner explicitly when a feature plan needs coverage on an untested surface.
- **Deploy/CI:** EAS Build/Submit (deploy) planned but not yet wired — no `eas.json`. GitHub Actions CI IS present (`.github/workflows/ci.yml`): format, lint, typecheck, test (Postgres service + `db:migrate`), build. Local Postgres for tests via root `docker-compose.yml` (`docker compose up -d`). `apps/admin`'s deploy pipeline is explicitly out of scope for the admin-dashboard program (builds the app, not its deploy story).

## Key Patterns and Conventions

**Monorepo package naming:** all workspace packages are scoped `@jojopotato/*` (`config`, `types`, `ui`, `utils`, `mobile`, `admin`). New packages should follow the same scope and the "Adding a new package" recipe in `README.md`.

**No build step for internal packages:** `packages/{types,ui,utils}` have `"main": "./src/index.ts"` — they are consumed as raw TypeScript source via pnpm workspace links, not compiled. Do not add a build step to these packages without a clear reason.

**Import aliases:** in `apps/mobile`, `@/*` maps to `./src/*` and `@/assets/*` maps to `./assets/*` (see `apps/mobile/tsconfig.json`). Workspace packages are imported by their npm scope, e.g. `@jojopotato/ui`, `@jojopotato/types`, `@jojopotato/utils`.

**TypeScript config layering:** each package's `tsconfig.json` extends a shared base from `@jojopotato/config` (`./typescript/tsconfig.base.json` or `./typescript/tsconfig.expo.json` for the Expo app), which itself sits on top of `expo/tsconfig.base` for the mobile app.

**ESLint layering:** each package's `eslint.config.js` re-exports either `@jojopotato/config/eslint-base` (plain TS packages) or `@jojopotato/config/eslint` (RN/JSX packages like `mobile` and `ui`) — flat config format (ESLint 9).

**Env var access pattern:** client-bundle config is read through a typed wrapper, not `process.env` directly inline — see `apps/mobile/src/config/env.ts` (`env.appEnv`, `env.apiUrl`), which falls back to sane defaults if the `EXPO_PUBLIC_*` var is unset.

**Types-first placeholders:** `packages/types/src/{auth,notifications,rewards}.ts` still stub out the shared domain types for their planned feature areas (see §Current Context Groups / feature folders) even though no implementation consumes them yet — check these files before defining new domain types for a feature. `cart`, `order`, `pickup`, and `menu` are no longer placeholders — all four are real, cents-native types reconciled to the actual ordering-flow API contract (`menu.ts` was promoted from placeholder to real content by `merge-menu-api-reconciliation`, 13-07-26).

**Platform-specific hooks:** `use-color-scheme.ts` has a `.web.ts` sibling variant (`apps/mobile/src/hooks/use-color-scheme.web.ts`) — this is the RN/Expo convention for platform-specific implementations picked up automatically by the bundler. Follow this `.web.ts` / default split for any new platform-diverging hook or util, per the "iOS-first, Android-ready" principle in `README.md`.

**Naming:** kebab-case files (`use-color-scheme.ts`, `brand-wordmark.tsx`), camelCase functions/variables, PascalCase React components/exports.

**Navigation shell pattern (Expo Router):** each tab under `(tabs)/` is a folder with its own
`_layout.tsx` (a `Stack`) plus explicit sibling route files (not a catch-all `[screen]`), so Expo
Router's typed-routes codegen (`experiments.typedRoutes: true` → `.expo/types/router.d.ts`) works
per file. Tab-root screens (`index.tsx` in each tab folder) keep `headerShown:false` (framed by the
tab bar); nested/pushed screens get `headerShown:true` with the default back button. After adding
new dynamic route files (`[id].tsx`), run `expo start` (then stop it) once before `tsc --noEmit`
resolves the new typed hrefs — the codegen doesn't run on typecheck alone. Auth gating between the
public `(auth)` stack and authenticated `(tabs)` shell is driven by `Stack.Protected` guards in the
root `_layout.tsx`, reading `useAuth()` (`user`/`isLoading`).

**Auth-state seam:** `useAuth()` (from `apps/mobile/src/features/auth/hooks/use-auth.ts`) is the
only way any screen should read/mutate auth state. It exposes `{ user, role, isLoading, isStaff,
signIn, signOut, hasOnboarded, completeOnboarding }`, derives the session from better-auth's
`authClient.useSession()`, and persists it via `expo-secure-store` (survives restarts). `isStaff`
is a derived boolean (`role ∈ {staff, admin, super_admin}`) — the root gate uses it to route to
`(staff)` vs `(tabs)`. `signIn` is a dispatcher over the supported methods (email/password +
signup, Google OAuth, magic link, and the two-step phone OTP flow). The better-auth client itself
lives in `apps/mobile/src/features/auth/lib/auth-client.ts` and talks to
`{EXPO_PUBLIC_API_URL}/api/auth/*`; consumers never import it directly.
`hasOnboarded`/`completeOnboarding` remain local, non-auth state, independent of the better-auth
session. **Magic link is not a plain `authClient.magicLink` round trip** — better-auth's default
flow doesn't log the user in on Expo (session lands in an external browser, not the app), so this
repo relays the token through a custom `/magic-link/native` redirect + an app-side
`(auth)/magic-link.tsx` verify step; see
`process/features/auth-accounts/backlog/wire-better-auth-magic-link-expo-caveat_NOTE_09-07-26.md`.

**Staff API authz pattern (first protected API surface, established STAFF-001):** all `/api/staff/*`
routes are guarded by `requireStaff(auth)` applied at the router level in
`packages/api/src/index.ts`. New staff routes only need to be added to `packages/api/src/routes/staff.ts`
— the guard is inherited automatically. The middleware chain is:
`requireStaff(auth)` → `resolveBranchScope(db, userId)` → `assertBranchScope(assignedBranchId, requestedBranchId)`.
`requireStaff` admits roles `staff | admin | super_admin`; it returns 403 for customer roles.
`assertBranchScope` is a pure function (testable without DB); `resolveBranchScope` is the DB read.
A `TODO(STAFF-ADM)` comment in `assertBranchScope` marks where admin bypass logic goes (not
implemented — post-STAFF-001). Always import `StaffRole` / `StaffMe` from `@jojopotato/types`,
not from `packages/api` server code.

**Always use the shared `@jojopotato/ui` component library — never one-off screen UI.** `packages/ui/src/components/` is the canonical, theme-token-driven component set (`Button`, `Card`, `Badge`, `Input`, `ProductCard`, `DealCard`, `BranchCard`, `RewardProgressCard`, `StarProgressBar`, `OrderStatusBadge`, `OrderStatusTimeline`, `CouponCard`, `CartItem`, `FlavorSelector`, `SizeSelector`, `PickupTimeBadge`, plus `BrandWordmark`). Before writing new inline markup in any `apps/mobile` screen, check `packages/ui/src/index.ts` for an existing export first. If a needed component doesn't exist yet, prefer adding it to `packages/ui` over a local one-off, unless it's truly screen-specific and not reusable elsewhere. Never hardcode colors/spacing that duplicate `theme.ts` tokens — components take a `mode: ThemeMode = 'light'` prop (see `BrandWordmark`/`Button`) rather than depending on an app-level theme hook, since the package has no such dependency. `Button` is the single canonical button — `JojoButton` (an earlier proof-of-concept primitive) was removed on 2026-07-09 in favor of it; do not reintroduce a parallel button primitive.

## Environment and Configuration

**Config files:** `turbo.json` (root), `pnpm-workspace.yaml`, `tsconfig.json` (per-package, layered from `@jojopotato/config`), `apps/mobile/app.json` (Expo config), `.env.example` (root, git-ignored `.env` for real values), `apps/mobile/.env.example`.

**Env var groups (names only, never values):**
- Client runtime (Expo, prefixed `EXPO_PUBLIC_*` so they are safe to inline into the bundle): `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`
- Repo-wide / CI (root `.env.example`, never inlined into the client bundle): `EAS_PROJECT_ID`

**Never put secrets in `EXPO_PUBLIC_*` variables** — they ship to every device. Non-public config
(future auth/DB/payments keys) will need a different mechanism once a backend is chosen — this is
an open question, see below.

## Open Questions

Tracked here so future planning knows these are unresolved, not accidentally decided.

- **Auth provider:** decided — **better-auth**, wired into `packages/api` (Express + Drizzle +
  Postgres) and consumed by `apps/mobile` via `useAuth()`. (Supabase/Firebase were earlier
  candidates; better-auth was chosen instead.) Remaining sub-decisions: a real SMS vendor for phone
  OTP (currently a server-side stub that logs the code) and provisioning live Google OAuth
  credentials + a Resend account are manual follow-ups, not code gaps.
- **Database:** not decided.
- **Payments processor:** not decided.
- **Notifications provider:** not decided.
- **CI/CD:** GitHub Actions CI exists (`.github/workflows/ci.yml`). EAS Build/Submit (deploy) is the intended path but not yet configured (no `eas.json`).

## Scan Metadata

- Generated: 2026-07-08 (full scan)
- Last delta: 2026-07-16 (admin-dashboard Phase 4a UPDATE PROCESS — Deals-as-Products ADM-004
  RE-PLAN, EVL-green: pivoted from a discarded discount-object deals model (commit `d5070d8`,
  superseded) to `products.is_deal` + a new self-referential `deal_components` junction, reusing the
  entire product→menu→cart→checkout pipeline with zero new pricing code; AC9 snapshot-integrity real
  passing regression test (Known-Gap never used); THREE filter sites actually modified, TWO
  explicitly verified as correctly unchanged; Enhancement E1 (transactional create-with-components +
  2-step wizard) + this session's deal-manage price-comparison panel + 3 PR-review fixes layered on
  top; branch `feat/adm-004-deals` NOT YET MERGED, PR pending review — do not treat Phase 4a as
  archived to `completed/` until the PR lands)
- Previous delta: 2026-07-15 (real-push-delivery UPDATE PROCESS — added the missing PUSH-004
  baseline bullet (never previously documented here) plus the `real-push-delivery_15-07-26`
  hardening follow-up: platform Zod-enum tightening, background/killed-app payload shaping,
  ticket-based `sendAndPrune` token pruning in `notification-dispatch.ts`, `app.config.ts`
  background-mode plugin. Plan archived to `completed/real-push-delivery_15-07-26/` after full
  manual credential setup + on-device Android verification.)
- Concurrent delta (development, merged in): 2026-07-15 (admin-dashboard Phase 3 UPDATE
  PROCESS — Products/Categories CRUD ✅ VERIFIED: full real vertical slice, third confirmed consumer
  of the append-only admin aggregator pattern, AC1 snapshot-integrity real passing regression test
  (Known-Gap never used), AC8 Agent-Probe walkthrough actually performed — found + fixed a real
  TanStack Start nested-detail-route `<Outlet/>` gotcha (durable, affects P4-P7), first 3 shared
  composites extracted (query-states/confirm-dialog/page-header), `data-table`/`form-dialog`
  extraction re-eval trigger now live for Phase 4)
- Earlier delta: 2026-07-15 (admin-dashboard Sidebar Nav UPDATE PROCESS — cross-cutting sidebar
  navigation ✅ COMPLETE: nav-config.ts + AppSidebar + NavUser + shadcn sidebar/sheet/tooltip/
  separator/skeleton primitives; (dashboard)/route.tsx wrapped with SidebarProvider; old shell
  stripped from index.tsx; plan+report archived to completed/admin-dashboard_14-07-26/)
- Earlier delta: 2026-07-14 (issue #72 plan-folder housekeeping — added the missing HIST-001/HIST-002
  "Order History + Reorder, real-API" bullet documenting `order-history-reorder-api_13-07-26`
  (merged PR #73), and archived 3 stale `active/` plan folders: `order-history-reorder_13-07-26`
  (SUPERSEDED, never executed), `order-history-reorder-api_13-07-26` (completed, formally archived),
  `deals-screens_13-07-26` (SUPERSEDED by `deals-api-integration_13-07-26`) — no source/narrative
  content changed, all three moved `active/` → `completed/`)
- Earlier delta: 2026-07-14 (admin-dashboard Phase 2 UPDATE PROCESS — Branches CRUD ✅ VERIFIED: full
  real vertical slice, second confirmed consumer of the append-only admin aggregator pattern,
  drizzle `err.cause.code` unique-violation gotcha, 3 backlog notes filed for
  AC7/is_accepting_pickup/shared-composite-deferral)
- Earlier delta: 2026-07-14 (admin-dashboard Phase 1 RE-CLOSE UPDATE PROCESS — post-AC8 CORS fix: shared `adminCors` mounted on both `/api/auth/*` and `/api/admin`, API suite 75→78, AC8 browser walkthrough re-verified PASS for all 3 roles)
- Previous delta: 2026-07-14 (admin-dashboard Phase 1 UPDATE PROCESS — requireAdmin + first browser-cookie session flow, packages/types/src/admin.ts, super_admin role-management route, TODO(STAFF-ADM) resolved, apps/admin login + (dashboard) shell, MFA/TOTP structural seam)
- Prior delta: 2026-07-14 (admin-dashboard Phase 0 UPDATE PROCESS — apps/admin scaffold, admin-dashboard feature, first web-app Vitest runner precedent)
- HEAD at last delta: merge of `feat/push-notifications-api` (real-push-delivery hardening, PUSH-004
  #75, plus this pass's dev/star rewards reconciliation + drizzle migration renumbering) with a newer
  `development` (admin-dashboard Phase 4a — deals-as-products ADM-004 RE-PLAN, branch
  `feat/adm-004-deals` still PR-pending, not yet merged into `development` itself at this point) —
  verify via `git log`/`git status` before assuming further changes since this merge
- Package manager: pnpm 10.33.0 (workspaces: `apps/*`, `packages/*`)
