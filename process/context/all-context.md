# Jojo Potato - All Context

Last updated: 2026-07-14

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

## Current Implementation State (as of 14-07-26, incl. admin-dashboard Phase 0 + STAFF-001 + merge-menu-api-reconciliation + checkout-flow UI)

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
  (STAFF-001, see below); its real data screens (STAFF-002/003/004) are not yet built.
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
  Availability / Branch Pickup Settings); sign-out Button. `(staff)/active-orders.tsx` is a
  **hardcoded mock preview scaffold** — NOT a real data screen; STAFF-002 will replace it. Full
  plan: `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/`.
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
  branches, and customer order placement. `app` is exported from `packages/api/src/index.ts` (port
  binding guarded so tests never bind a port).
- Delivered by: `process/general-plans/completed/finalize-navigation-shell_09-07-26/` (navigation
  shell — archived plan, full route tree/decisions/validate-contract),
  `process/general-plans/completed/pickup-order-flow_10-07-26/` (customer ordering flow — archived
  plan, API design, validate journey incl. the CONDITIONAL→PASS PVL cycle and the EVL cross-phase
  bug catch-and-fix, closeout report), `process/general-plans/completed/merge-cart-reconciliation_13-07-26/`
  (cart architecture reconciliation),
  `process/general-plans/completed/merge-menu-api-reconciliation_13-07-26/` (menu/branch data-layer
  + react-query reconciliation), and
  `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/` (staff authz
  layer + role-gated staff shell — STAFF-001).

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
- Auth dependency present — **better-auth** in `packages/api` + consumed by `apps/mobile`. Also
  the new staff authz layer (`require-staff.ts`, role-gated routes, `StaffRole`/`StaffMe` types)
  adds a second durable narrative. `auth/` group threshold is now plausibly met — two narratives
  (auth provider setup + staff authz pattern). Not yet created; re-evaluate at next
  UPDATE PROCESS pass or when a role/permissions design doc is written.
- `staff-dashboard` feature established (STAFF-001 delivered 13-07-26). `process/features/staff-dashboard/`
  exists with `active/`, `completed/`, `backlog/` subdirs. Future STAFF-002/003/004 work lives here.
- `admin-dashboard` feature established (Phase 0 — Scaffold delivered 14-07-26). `process/features/admin-dashboard/`
  exists with `active/`, `completed/`, `backlog/` subdirs. This is an 8-phase program (P0 scaffold
  through P7 analytics, ADM-001..007) — see the umbrella plan for the current phase. A new web app
  (`apps/admin`) established a SECOND durable narrative for the plausible `auth/` context group
  (browser-cookie admin session, Phase 1) — re-evaluate the `auth/` group threshold once Phase 1 lands.
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
| admin dashboard work (Phase 1-7, ADM-001..007) | `all-context.md` | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/` — read the umbrella plan's `## Current Execution State` for the current phase, then the named phase plan file |

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
    admin/                             -- @jojopotato/admin, TanStack Start web admin dashboard (Phase 0 scaffold only, no auth/screens yet -- see process/features/admin-dashboard/)
      src/
        routes/                       -- TanStack Start file-based routes: __root.tsx (shell + QueryClientProvider), index.tsx (placeholder)
        components/
          ui/                         -- shadcn/ui primitives (button.tsx, card.tsx) -- canonical registry source, NOT packages/ui (RN-only, not reused here)
          admin-home.tsx              -- placeholder proving boot + brand tokens + stock primitives render on-brand
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
- Last delta: 2026-07-14 (admin-dashboard Phase 0 UPDATE PROCESS — apps/admin scaffold, admin-dashboard feature, first web-app Vitest runner precedent)
- Previous delta: 2026-07-13 (STAFF-001 UPDATE PROCESS — staff authz layer, staff-dashboard feature, API schema, vitest, seed)
- HEAD at last delta: branch `dev/admin` (admin-dashboard Phase 0 scaffold, uncommitted at time of this UPDATE PROCESS pass — verify via `git log`/`git status` before assuming committed)
- Package manager: pnpm 10.33.0 (workspaces: `apps/*`, `packages/*`)
