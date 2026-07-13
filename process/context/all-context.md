# Jojo Potato - All Context

Last updated: 2026-07-13

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

## Current Implementation State (as of 13-07-26)

- **Navigation shell:** complete. Full 5-tab bottom nav (Home, Order, Rewards, Branches, Account —
  PRD order), a public `(auth)` stack (Splash → Onboarding → Login/Signup → Terms), and per-tab
  nested `Stack` navigators so deep screens (Product Details, Cart, Checkout, Branch Details, etc.)
  have somewhere to live with correct back-navigation. Root gating is now **role-aware** via three
  `Stack.Protected` guards in `apps/mobile/src/app/_layout.tsx`: staff/admin/super_admin users
  route to `(staff)`, customer users route to `(tabs)`, unauthenticated users route to `(auth)`.
- **Auth:** real provider decided and wired — **better-auth**, hosted in `packages/api` (Express +
  Drizzle + Postgres). Server config lives in `packages/api/src/lib/auth.ts` (email/password, phone
  OTP, Google OAuth, magic link), mounted at `/api/auth/*` in `src/index.ts`; the existing `users`
  table IS better-auth's user model (plus new `session`/`account`/`verification` tables, migration
  `0001_daily_carnage.sql`). The mobile app consumes it through a real
  `AuthProvider`/`useAuth()` seam at `apps/mobile/src/features/auth/hooks/use-auth.ts` (backed by
  `authClient.useSession()` in `.../lib/auth-client.ts`). Sessions persist across restarts via
  `expo-secure-store` and slide (30-day expiry, 1-day refresh). `role` is server-owned (`input:
  false`), defaulting to `customer`. `useAuth()` now also exposes `isStaff: boolean` (role ∈
  {staff, admin, super_admin}). Phone-OTP SMS delivery is a server-side STUB; Google OAuth needs
  live credentials — both flagged as follow-ups.
- **API schema and seed (as of 13-07-26):** `packages/api/src/db/schema/` contains a full Drizzle
  schema: `branches`, `products`, `categories`, `orders`, `order_items`, `rewards`, `coupons`,
  `deals`, `notifications`, `star_transactions`, `user_stars`, `branch_product_availability`, plus
  the better-auth tables (`users`, `session`, `account`, `verification`). Two migrations applied:
  `0001_daily_carnage.sql` (auth tables) and `0002_elite_bishop.sql` (adds nullable
  `assigned_branch_id uuid references branches(id)` to `users` — STAFF-001). The seed
  (`packages/api/src/db/seed/seed.ts`) creates branch rows, a staff test user
  (`staff-branch1@jojopotato.local`, role=staff, assigned to branch 1), and any other fixture data.
  Run `pnpm --filter @jojopotato/api db:migrate` before running tests.
- **Staff authz layer (STAFF-001, delivered 13-07-26):** first protected app API surface.
  `packages/api/src/lib/require-staff.ts` exports `requireStaff(auth)` middleware (rejects
  non-staff roles with 403), `resolveBranchScope(db, userId)` helper (returns
  `assigned_branch_id`), and `assertBranchScope(assignedBranchId, requestedBranchId)` pure guard.
  Applied at router level: `app.use('/api/staff', requireStaff(auth), staffRouter)` — all future
  `/api/staff/*` routes automatically inherit the guard without re-applying it. `GET /api/staff/me`
  canary returns `{ role, assignedBranch: { id, name, slug } | null }`. `StaffMe` and `StaffRole`
  types live in `packages/types/src/staff.ts`. A `TODO(STAFF-ADM)` seam in `assertBranchScope`
  marks where admin bypass logic goes (currently not implemented — post-STAFF-001).
- **Staff dashboard shell (STAFF-001):** `apps/mobile/src/app/(staff)/` is a role-gated Expo
  Router group. `(staff)/index.tsx` shows: BrandWordmark + "Staff" Badge header; assigned-branch
  name fetched from `GET /api/staff/me` via `useStaffMe()` hook
  (`features/staff/hooks/use-staff-me.ts` → `features/staff/lib/staff-api.ts` using
  `authClient.$fetch`); four inert PRD §6.13 nav cards (Active Orders / Completed Orders /
  Product Availability / Branch Pickup Settings); sign-out Button. `(staff)/active-orders.tsx`
  is a **hardcoded mock preview scaffold** added at user request — NOT a real data screen; STAFF-002
  will replace it. Full plan: `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/`.
- **API testing:** `packages/api` now has vitest + supertest. Run `pnpm --filter @jojopotato/api
  test` (requires `docker compose up -d` + `pnpm --filter @jojopotato/api db:migrate` first).
  34 tests covering auth and staff authz. `app` is exported from `packages/api/src/index.ts` (port
  binding guarded behind `NODE_ENV !== 'test'`).
- **Screens:** Home tab (`(tabs)/index.tsx`) is the only customer tab with real business UI. Every
  other tab-root screen and nested/pushed screen is still a `<ComingSoon>` placeholder. The
  `(staff)` shell exists but its data screens (STAFF-002/003/004) are not yet built.
- **Known tech debt:** placeholder tab-root screens carry "Dev: ..." nav links not gated behind
  `__DEV__` — see `process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`.
- **Known gap:** no automated E2E/regression harness for navigation flows (project-wide
  test-runner gap, see `tests/all-tests.md`) — see
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. Mobile staff
  shell and role-gate are Agent-Probe only for the same reason.
- **OrderStatus type gap:** `packages/types/src/order.ts` `OrderStatus` enum is out of sync with
  the DB `orders` enum. The shared `OrderStatusBadge` component is unusable for real staff order
  data until reconciled — see
  `process/features/staff-dashboard/backlog/staff-002-order-status-type-reconciliation_NOTE_13-07-26.md`.
- Delivered by: `process/general-plans/completed/finalize-navigation-shell_09-07-26/` (nav shell);
  `process/features/staff-dashboard/completed/staff-001-login-branch-scope_13-07-26/` (staff authz + shell).

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
| `process/context/tests/all-tests.md` | Test runner selection, commands, and verification order — vitest now live in packages/api |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `planning/` | `process/context/planning/all-planning.md` | SIMPLE vs COMPLEX plan calibration and example PRD references |
| `tests/` | `process/context/tests/all-tests.md` | Test runner selection, commands, and verification order — vitest now live in packages/api |
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
- No Dockerfile/docker-compose → no `container/` group
- No CI/CD config (`.github/workflows`, `.circleci`, `.gitlab-ci`) → no `cicd/` group
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
| new feature work | `all-context.md` | `process/features/{feature}/_GUIDE.md` for the matching product area (`ordering-cart`, `pickup-branches`, `auth-accounts`, `rewards-notifications`, `staff-dashboard`) if it exists, else `process/general-plans/active/` |
| staff dashboard work (STAFF-002/003/004) | `all-context.md` | `process/features/staff-dashboard/` — read completed STAFF-001 plan for requireStaff/assertBranchScope contract and (staff) shell structure |

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
            index.tsx                  -- Home tab root (only tab with real business UI)
            order/, rewards/, branches/, account/  -- per-tab folders, each with its own _layout.tsx (Stack) + nested screens; tab-root index.tsx is <ComingSoon> placeholder
          (staff)/                     -- role-gated shell for staff/admin/super_admin; guarded by Stack.Protected in root _layout.tsx
            _layout.tsx                -- Stack navigator (headerShown:false for root; STAFF-002+ screens add their own headers)
            index.tsx                  -- staff dashboard shell: BrandWordmark+Staff badge, branch name from /api/staff/me, 4 inert nav cards, sign-out
            active-orders.tsx          -- MOCK PREVIEW ONLY (hardcoded sample data, inert buttons); replaced by STAFF-002
        features/
          auth/hooks/use-auth.ts       -- AuthProvider + useAuth(): real better-auth session seam; exposes isStaff boolean (role ∈ {staff,admin,super_admin})
          auth/lib/auth-client.ts      -- better-auth mobile client (expoClient + secure-store persistence, phone/magic-link plugins)
          staff/lib/staff-api.ts       -- fetchStaffMe(): authClient.$fetch wrapper for GET /api/staff/me → StaffMe | null
          staff/hooks/use-staff-me.ts  -- useStaffMe(): useState/useEffect hook returning { data, isLoading, error }
        config/                        -- env.ts: typed access to EXPO_PUBLIC_* vars
        constants/                     -- app-level theme (re-exports brand tokens from @jojopotato/ui)
        hooks/                         -- use-color-scheme.ts (+.web.ts variant), use-theme.ts
        components/                    -- floating-tab-bar.tsx (ICONS map keyed by route name), coming-soon.tsx (isNestedScreen? prop)
      assets/                          -- icons, splash, favicon (placeholder branding)
      app.json                         -- Expo app config (bundle id, scheme, plugins)
      .env.example
  packages/
    config/                            -- @jojopotato/config: shared ESLint (flat config), Prettier, TypeScript base configs
    types/                             -- @jojopotato/types: shared domain types (auth, cart, menu, notifications, order, pickup, rewards, staff) -- most are placeholders; staff.ts (StaffMe, StaffRole, StaffBranch) is live
    ui/                                -- @jojopotato/ui: shared UI (brand-wordmark.tsx, theme.ts) -- brand tokens are placeholder
    utils/                             -- @jojopotato/utils: shared helpers (currency.ts, number.ts, async.ts)
  docs/
    jojo-potato-mobile-prd.md         -- product PRD (navigation §7, auth §6.1) — source of truth for scope
  process/
    context/                          -- this context system
    general-plans/                    -- plans, reports, references (task-folder convention)
    features/                         -- feature-scoped storage (ordering-cart, pickup-branches, auth-accounts, rewards-notifications, staff-dashboard)
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
- **Linting/formatting:** Flat-config ESLint 9.x (`eslint-config-expo` ~57.0.0, `typescript-eslint` 8.x) + Prettier 3.9.x, shared via `@jojopotato/config`
- **Testing:** `packages/api` uses **vitest** + **supertest** (added STAFF-001). Run `pnpm --filter @jojopotato/api test` (requires `docker compose up -d` + `db:migrate` first). 34 tests covering auth and staff authz. No test runner exists for `apps/mobile` (no Jest/Vitest/Detox) — mobile verification is typecheck + lint + Agent-Probe only. See `process/context/tests/all-tests.md`.
- **Deploy:** EAS Build/Submit planned (per user, 2026-07-08) but not yet wired — no `eas.json`, no `.github/workflows/` in the repo.

## Key Patterns and Conventions

**Monorepo package naming:** all workspace packages are scoped `@jojopotato/*` (`config`, `types`, `ui`, `utils`, `mobile`). New packages should follow the same scope and the "Adding a new package" recipe in `README.md`.

**No build step for internal packages:** `packages/{types,ui,utils}` have `"main": "./src/index.ts"` — they are consumed as raw TypeScript source via pnpm workspace links, not compiled. Do not add a build step to these packages without a clear reason.

**Import aliases:** in `apps/mobile`, `@/*` maps to `./src/*` and `@/assets/*` maps to `./assets/*` (see `apps/mobile/tsconfig.json`). Workspace packages are imported by their npm scope, e.g. `@jojopotato/ui`, `@jojopotato/types`, `@jojopotato/utils`.

**TypeScript config layering:** each package's `tsconfig.json` extends a shared base from `@jojopotato/config` (`./typescript/tsconfig.base.json` or `./typescript/tsconfig.expo.json` for the Expo app), which itself sits on top of `expo/tsconfig.base` for the mobile app.

**ESLint layering:** each package's `eslint.config.js` re-exports either `@jojopotato/config/eslint-base` (plain TS packages) or `@jojopotato/config/eslint` (RN/JSX packages like `mobile` and `ui`) — flat config format (ESLint 9).

**Env var access pattern:** client-bundle config is read through a typed wrapper, not `process.env` directly inline — see `apps/mobile/src/config/env.ts` (`env.appEnv`, `env.apiUrl`), which falls back to sane defaults if the `EXPO_PUBLIC_*` var is unset.

**Types-first placeholders:** `packages/types/src/{auth,cart,menu,notifications,order,pickup,rewards}.ts` already stub out the shared domain types for the four planned feature areas (see §Current Context Groups / feature folders) even though no implementation consumes them yet. Check these files before defining new domain types for a feature.

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
- **CI/CD:** EAS Build/Submit is the intended path but not yet configured (no `eas.json`, no GitHub Actions workflow yet).

## Scan Metadata

- Generated: 2026-07-08 (full scan)
- Last delta: 2026-07-13 (STAFF-001 UPDATE PROCESS — staff authz layer, staff-dashboard feature, API schema, vitest, seed)
- HEAD at last delta: `a153ec5` (process artifacts, branch `feat/staff-001-login-branch-scope`)
- Package manager: pnpm 10.33.0 (workspaces: `apps/*`, `packages/*`)
