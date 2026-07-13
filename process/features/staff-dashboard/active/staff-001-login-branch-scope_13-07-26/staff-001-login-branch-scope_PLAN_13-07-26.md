---
name: plan:staff-001-login-branch-scope
description: "Staff login and branch-scoped access — STAFF-001 foundation for staff dashboard"
date: 13-07-26
feature: staff-dashboard
phase: "STAFF-001"
---

# STAFF-001: Staff Login and Branch-Scoped Access

**Complexity**: COMPLEX
**Priority**: P0 — Milestone: Phase 3 Pickup Live Updates
**GitHub Issue**: #31
**Date**: 2026-07-13
**Status**: CODE DONE (all automated + hybrid gates green; mobile Agent-Probe pending operator manual confirmation)

---

## Overview

Add `assigned_branch_id` to `users`, create a reusable `requireStaff` Express middleware and branch-scope guard, mount a canary `GET /api/staff/me` route, add a `(staff)` Expo Router stack with a designed staff dashboard shell (branded header, assigned-branch display, inert nav cards, sign-out), and make the root gate role-aware. The shell displays the staff member's branch name by calling the canary `/api/staff/me` endpoint built in this same plan — proving AC1+AC3 end-to-end. STAFF-002/003/004 data screens are out of scope.

---

## Objective

Build the minimum server-side and mobile-side primitives so that:

1. A staff account can sign in and land in the staff shell (AC1).
2. Customer-role accounts are blocked from every staff API endpoint at the server (AC2).
3. Staff A can only receive Branch-1 data even if Branch-2 ids are passed directly (AC3).
4. Session lifecycle is identical to customer login — no forked auth logic (AC4).

This plan delivers reusable authz primitives (`requireStaff`, `resolveBranch`, `assertBranchScope`) and a canary staff route. It does NOT build the actual orders/products/availability staff UI screens — those are STAFF-002, STAFF-003, STAFF-004.

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC1 | A staff account logs in and is routed to the `(staff)` shell, NOT `(tabs)`. |
| AC2 | A customer-role account receives 403 from any `/api/staff/*` endpoint (server-side, not just hidden nav). |
| AC3 | Staff A (Branch 1) querying by Branch 2 id receives 403/empty — server-side branch enforcement, not client filter. |
| AC4 | Staff session persists across restarts via `expo-secure-store`; no duplicated auth logic from better-auth flow. |

---

## Scope

### In Scope

- Schema: add `assigned_branch_id uuid references branches(id)` nullable column to `users` table; drizzle-kit migration.
- API: `packages/api/src/lib/require-staff.ts` — `requireStaff` middleware + `resolveBranchScope` + `assertBranchScope` helper.
- API: Mount `GET /api/staff/me` canary route returning `{ role, assignedBranch }`.
- API: Seed at least one `staff` user assigned to a branch for testability.
- Mobile: `apps/mobile/src/app/(staff)/_layout.tsx` — Stack navigator for staff screens.
- Mobile: `apps/mobile/src/app/(staff)/index.tsx` — **designed staff dashboard shell** (branded header with `BrandWordmark` + "Staff" `Badge`; assigned-branch name fetched from `GET /api/staff/me` via a minimal `useStaffMe` hook; four inert PRD §6.13 nav `Card`s; sign-out `Button` wired to `useAuth().signOut`). Uses `@jojopotato/ui` components and theme tokens exclusively — no hardcoded colors.
- Mobile: `apps/mobile/src/features/staff/lib/staff-api.ts` — NEW minimal fetch helper that calls `GET /api/staff/me` using `authClient.$fetch` (session headers attached automatically). Returns `StaffMe | null`.
- Mobile: `apps/mobile/src/features/staff/hooks/use-staff-me.ts` — NEW `useStaffMe()` hook wrapping `staff-api.ts` with `useState`/`useEffect`. Returns `{ data: StaffMe | null, isLoading: boolean, error: string | null }`.
- Mobile: `apps/mobile/src/app/_layout.tsx` — make `RootNavigator` role-aware (add `isStaff` derivation, third `Stack.Protected` guard for `(staff)`).
- Mobile: `apps/mobile/src/features/auth/hooks/use-auth.ts` — derive and expose `isStaff` boolean (role ∈ {staff, admin, super_admin}).
- Types: `packages/types/src/staff.ts` — `StaffMe` response type + `StaffRole` type; `packages/types/src/index.ts` export.
- Integration test: `packages/api/src/lib/__tests__/require-staff.integration.test.ts` covering AC2 and AC3.

### Out of Scope (Explicitly Deferred)

- **STAFF-002** — Active orders dashboard (realtime order feed per branch).
- **STAFF-003** — Status-change actions + Completed Orders screen.
- **STAFF-004** — Product availability toggle + pickup pause.
- **Admin/super_admin branch-scope rules** — `requireStaff` admits admin/super_admin roles but does NOT apply branch restriction to them. Leave a clearly-marked `// TODO(STAFF-ADM): admin branch logic` seam in `assertBranchScope`.
- **Multi-branch staff** — MVP is exactly one branch per staff. `assigned_branch_id` is a single nullable FK.
- **Real staff data endpoints** — `/api/staff/orders`, `/api/staff/products`, etc. are STAFF-002+.
- **Staff management UI** — assigning branches to staff users is an admin concern outside this milestone.
- **Shell scope guards (hard limits for STAFF-001 shell):**
  - NO real order data (no `/api/staff/orders`), NO product availability reads/writes, NO order-status logic, NO pickup-pause toggle — the four nav cards are INERT placeholders only (STAFF-002/003/004).
  - NO data-fetching library (react-query/axios/swr/tanstack-query) — only a single minimal `authClient.$fetch` call for `/api/staff/me`.
  - NO admin/super_admin branch-logic in the shell — admin bypasses are a post-STAFF-001 concern.
  - The branch-name fetch is the ONLY network call the shell makes.

---

## Data Model Decision

**Recommendation: Single `assigned_branch_id` nullable FK on `users`.**

Rationale:
- MVP constraint: one staff member → one branch. No evidence of multi-branch requirement in PRD §6.13.
- Simpler JOIN: every staff query can add a WHERE clause without an extra join table lookup.
- Avoids a join table, its migration, and the need for a second FK resolution per request.
- `favoriteBranchId` is for customers only — do NOT overload it. A separate column keeps semantics clean.
- Multi-branch (join table) is out of scope; when needed, migrate this FK to a join table — a nullable column → join table migration is straightforward.

Migration adds:

```sql
ALTER TABLE users ADD COLUMN assigned_branch_id uuid REFERENCES branches(id);
```

---

## Architecture: Server Authz Primitives

All staff routes will be protected by a two-layer guard chain mounted in `packages/api/src/index.ts`:

```
Request → requireStaff(auth) → resolveBranchScope(db, req) → route handler → assertBranchScope(resolved, requested)
```

### `requireStaff` middleware

File: `packages/api/src/lib/require-staff.ts`

Logic:
1. Convert Express `req.headers` to a `Headers` object.
2. Call `auth.api.getSession({ headers })` — reuses existing better-auth instance.
3. If no session or `role` not in `['staff', 'admin', 'super_admin']` → `res.status(403).json({ error: 'Forbidden' })` and return.
4. Attach `req.staffSession = { userId, role, assignedBranchId }` (augment `Request` type via declaration merging in the same file).

### `resolveBranchScope` helper

```typescript
async function resolveBranchScope(db, userId: string): Promise<string | null>
```

Queries `db.select({ assignedBranchId: users.assignedBranchId }).from(users).where(eq(users.id, userId))` and returns `assignedBranchId ?? null`.

### `assertBranchScope` guard

```typescript
function assertBranchScope(assignedBranchId: string | null, requestedBranchId: string | null): boolean
```

- If `assignedBranchId === null` → false (unassigned staff cannot access anything).
- If `requestedBranchId === null` → true (no branch filter requested, return own branch data).
- Returns `assignedBranchId === requestedBranchId`.
- Admin/super_admin bypass: callers check `role` before calling this. Leave `// TODO(STAFF-ADM): admin branch logic` comment in `requireStaff` to signal where admin bypass should go.

### Canary route: `GET /api/staff/me`

Returns `{ role: string, assignedBranch: { id, name, slug } | null }`.

Proves:
- AC2: customer → 403 (requireStaff rejects).
- AC3: no cross-branch data possible on this endpoint (returns own branch only).
- AC4: session is the same better-auth session — no separate auth.

---

## Touchpoints

| File | Change type |
|---|---|
| `packages/api/src/db/schema/users.ts` | Add `assignedBranchId` column |
| `packages/api/drizzle/` | New migration SQL (drizzle-kit generate) |
| `packages/api/src/lib/require-staff.ts` | NEW — middleware + helpers |
| `packages/api/src/lib/__tests__/require-staff.integration.test.ts` | NEW — integration tests |
| `packages/api/src/routes/staff.ts` | NEW — canary `GET /api/staff/me` router (create `src/routes/` dir first) |
| `packages/api/src/index.ts` | Export `app`; mount `/api/staff/*` after `express.json()` |
| `packages/api/src/db/seed/seed.ts` | Add staff user via `auth.api.signUpEmail` + `db.update` |
| `packages/types/src/staff.ts` | NEW — `StaffMe` type + `StaffRole` type |
| `packages/types/src/index.ts` | Export `staff.ts` |
| `apps/mobile/src/app/_layout.tsx` | Add `isStaff` derivation + third `Stack.Protected` for `(staff)` |
| `apps/mobile/src/app/(staff)/_layout.tsx` | NEW — Stack navigator |
| `apps/mobile/src/app/(staff)/index.tsx` | NEW — designed staff dashboard shell (header + branch name + inert nav cards + sign-out) |
| `apps/mobile/src/features/auth/hooks/use-auth.ts` | Expose `isStaff` in context + `AuthContextValue` |
| `apps/mobile/src/features/staff/lib/staff-api.ts` | NEW — minimal `authClient.$fetch` wrapper for `GET /api/staff/me` |
| `apps/mobile/src/features/staff/hooks/use-staff-me.ts` | NEW — `useStaffMe()` hook with loading/error states |

---

## Public Contracts

| Contract | Consumer | Change |
|---|---|---|
| `GET /api/staff/me` → `StaffMe` | STAFF-002/003/004, future staff routes; shell `useStaffMe` hook | New — stable response shape |
| `requireStaff` middleware | All `/api/staff/*` routes | New — reusable Express middleware, signature: `(req, res, next) => void` |
| `assertBranchScope(assignedBranchId, requestedBranchId)` | All staff data routes | New — pure function, stable signature |
| `useAuth().isStaff` | `(staff)/_layout.tsx`, `RootNavigator` | New — derived boolean, no hook signature change |
| `AuthContextValue.isStaff` | Any consumer of `useAuth()` | New field on existing interface |
| `packages/types/src/staff.ts` `StaffMe` + `StaffRole` | `packages/api` (route response), `apps/mobile` (isStaff derivation, shell fetch helper) | New types |
| `useStaffMe()` hook | `(staff)/index.tsx` shell | New — returns `{ data: StaffMe | null, isLoading: boolean, error: string | null }` |

---

## Blast Radius

**Packages touched:** `packages/api`, `packages/types`, `apps/mobile`
**Files changed:** ~17 files (11 new, 4 modified, 2 new feature-layer files added by shell scope)
**Risk class:** HIGH — auth/identity + new API trust boundary + schema migration + UI fetching the auth-gated canary endpoint
**Migration risk:** Additive only (`ALTER TABLE ADD COLUMN` nullable) — no data loss, rollback = drop column. Safe.
**Route surface risk:** First protected app API route in the project. `requireStaff` design sets the pattern for all future staff endpoints.
**Shell fetch risk:** LOW — a single authenticated read-only call to `GET /api/staff/me` (already tested by E7). `authClient.$fetch` reuses the existing better-auth session cookie path; no new auth surface.

---

## Prerequisites / Unknowns

| Item | Status | Needed by |
|---|---|---|
| Local Postgres running with migrations applied | Required for integration tests | Step 12 |
| `DATABASE_URL` env var set | Already used by existing vitest tests | Step 12 |
| Seed data: at least one branch row in `branches` | Required for staff seed | Step 11 |
| Admin/super_admin branch-scope rules decision | Explicitly OUT OF SCOPE — seam only | Post-STAFF-001 |
| Mobile fetch client (react-query/axios) | NOT NEEDED — shell uses a single minimal `authClient.$fetch` call for `/api/staff/me`; no fetch library introduced. This is a deliberate, narrow revision of the prior "no mobile fetch" decision: the shell must show the staff member's assigned branch name, and the only correct source is the canary endpoint this plan builds. Consuming it proves AC1+AC3 end-to-end. `authClient.$fetch` forwards the existing session automatically — no new auth surface. | Phase F shell (F3a–F3e) |

**Decision: mobile canary fetch scoped to shell only.** `authClient.$fetch('/api/staff/me')` is called once when the shell mounts to display the branch name. No react-query/axios/swr is introduced. The `useStaffMe` hook is the only consumer. This is the ceiling for mobile network calls in STAFF-001.

---

## Implementation Checklist

### Phase A — Schema + Migration

- [x] **A1.** In `packages/api/src/db/schema/users.ts`: add `assignedBranchId: uuid('assigned_branch_id').references(() => branches.id)` (nullable, no `.notNull()`, no default). Import `branches` from `'./branches'` (already imported — confirmed present on line 2).
- [x] **A2.** Run `pnpm --filter @jojopotato/api db:generate` to produce the next numbered migration SQL in `packages/api/drizzle/` (will be `0002_*.sql` or next sequential). Commit the generated files.
- [x] **A3.** Run `pnpm --filter @jojopotato/api db:migrate` against local Postgres to apply. Verify the column appears: `psql $DATABASE_URL -c "\d users"` should show `assigned_branch_id`.

### Phase B — Server Authz Primitives

- [x] **B1.** Create `packages/api/src/lib/require-staff.ts`:
  - Import `StaffRole` from `@jojopotato/types` (do NOT redefine locally — types package is the canonical source per validate-contract P5).
  - Export `STAFF_ROLES = ['staff', 'admin', 'super_admin'] as const satisfies readonly StaffRole[]`.
  - Add Express `Request` augmentation: `declare global { namespace Express { interface Request { staffSession?: { userId: string; role: StaffRole; assignedBranchId: string | null }; } } }`.
  - Export async `requireStaff(auth: Auth): RequestHandler` factory — converts `req.headers` to `new Headers(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? '']))`, calls `auth.api.getSession({ headers })`, checks role membership against `STAFF_ROLES`, attaches `req.staffSession`, calls `next()` on success or sends `403 { error: 'Forbidden' }` on failure.
  - Export async `resolveBranchScope(db: Db, userId: string): Promise<string | null>` — queries `users.assignedBranchId` by `userId`.
  - Export pure `assertBranchScope(assignedBranchId: string | null, requestedBranchId: string | null): boolean` — see architecture section; include `// TODO(STAFF-ADM): admin/super_admin bypass goes here` comment.
- [x] **B2.** Create `packages/api/src/routes/` directory (it does not exist) and `packages/api/src/routes/staff.ts`:
  - Express `Router` with `GET /me` handler.
  - Handler calls `resolveBranchScope(db, req.staffSession!.userId)`, then if `assignedBranchId` queries branch row (`db.select({ id, name, slug }).from(branches).where(eq(branches.id, assignedBranchId))`), returns `{ role: req.staffSession!.role, assignedBranch: branchRow ?? null }` as `StaffMe`.
- [x] **B3.** In `packages/api/src/index.ts`:
  - Change `const app = express()` to `export const app = express()` (needed for supertest in E6/E7).
  - After `app.use(express.json())` and before `app.listen(...)`, add:
    ```ts
    import staffRouter from './routes/staff';
    import { requireStaff } from './lib/require-staff';
    app.use('/api/staff', requireStaff(auth), staffRouter);
    ```
  - Note: `auth` is already imported on line 9. `requireStaff(auth)` applied at router level — STAFF-002/003/004 only add routes, not re-apply the guard.

### Phase C — Types Package

- [x] **C1.** Create `packages/types/src/staff.ts` with:
  ```ts
  export type StaffRole = 'staff' | 'admin' | 'super_admin';
  export interface StaffBranch { id: string; name: string; slug: string; }
  export interface StaffMe { role: StaffRole; assignedBranch: StaffBranch | null; }
  ```
  Note: `StaffRole` is exported here so both `packages/api` (server authz) and `apps/mobile` (isStaff derivation, shell fetch helper) can import it without mobile importing server-side code.
- [x] **C2.** In `packages/types/src/index.ts`: add `export * from './staff';`.

### Phase D — Seed

- [x] **D1.** In `packages/api/src/db/seed/seed.ts` (add to the existing `runSeed()` function after `seedBranchesTable()`): create a staff user via `auth.api.signUpEmail({ body: { email: 'staff-branch1@jojopotato.local', password: 'staff-dev-password', name: 'Branch 1 Staff' } })` — this creates the `users` row AND the `account` entry (better-auth handles both). Then `db.update(users).set({ role: 'staff', assignedBranchId: <firstBranchId> }).where(eq(users.email, 'staff-branch1@jojopotato.local'))`. Wrap in try/catch to skip if user already exists (email unique constraint). Do NOT use a bare `db.insert(users)` — it creates an orphaned user row with no account entry and the user cannot authenticate.

### Phase E — Integration Tests

- [x] **E0.** Add `supertest` and `@types/supertest` as devDependencies in `packages/api/package.json`: `pnpm --filter @jojopotato/api add -D supertest @types/supertest`.
- [x] **E1.** Create `packages/api/src/lib/__tests__/require-staff.integration.test.ts` following the exact pattern of `auth.integration.test.ts` (dynamic import in `beforeAll`, `process.env` defaults, log spy, cleanup). Import `app` from `../../index` for supertest tests.
- [x] **E2.** Test: `requireStaff — customer → 403 (AC2)`: sign up a customer user via `auth.api.signUpEmail`; build mock Express req with session headers; call `requireStaff` handler; assert `403` response (use a lightweight `mockRes` helper with `status().json()` spy).
- [x] **E3.** Test: `requireStaff — staff → passes (AC1 server side)`: sign up a test user, directly update role to `staff` via `db.update(users).set({ role: 'staff' })`, call `requireStaff`, assert `next()` was called and `req.staffSession` is populated.
- [x] **E4.** Test: `assertBranchScope — same branch → true (AC3 positive)`: call `assertBranchScope('branch-uuid-A', 'branch-uuid-A')` → assert `true`.
- [x] **E5.** Test: `assertBranchScope — different branch → false (AC3 negative)`: call `assertBranchScope('branch-uuid-A', 'branch-uuid-B')` → assert `false`.
- [x] **E6.** Test: `GET /api/staff/me — customer → 403 (AC2 route-level)`: use `supertest(app)` to POST sign-in as customer; GET `/api/staff/me` with session cookie → expect `403`.
- [x] **E7.** Test: `GET /api/staff/me — staff → 200 with own branch (AC3 positive, AC4)`: set test user role to `staff` and `assignedBranchId` to a valid branch uuid (insert one via `db.insert(branches)` in the test, or use the first seeded branch); GET `/api/staff/me` → expect `{ role: 'staff', assignedBranch: { id, name, slug } }`.
- [x] **E8.** Run `pnpm --filter @jojopotato/api test` — all tests green including the new suite and the existing `auth.integration.test.ts` (regression check).

### Phase F — Mobile Shell

- [x] **F1.** In `apps/mobile/src/features/auth/hooks/use-auth.ts`: import `StaffRole` from `@jojopotato/types`; add `isStaff: boolean` to `AuthContextValue` interface; derive `const isStaff = role !== null && (['staff', 'admin', 'super_admin'] as readonly StaffRole[]).includes(role as StaffRole);` in the `useMemo` block; include `isStaff` in the returned value object. (Using imported `StaffRole` type avoids TypeScript narrowing issues with `includes` on a `const` array.)
- [x] **F2.** Create `apps/mobile/src/app/(staff)/_layout.tsx`:
  - `Stack` navigator with `screenOptions={{ headerShown: false }}` as the tab-root pattern; nested screens within staff can override per STAFF-002+.
  - No auth check here — the root `_layout.tsx` `Stack.Protected` gate is the single source of truth.
- [x] **F3a.** Create `apps/mobile/src/features/staff/lib/staff-api.ts`:
  - Import `authClient` from `@/features/auth/lib/auth-client` and `StaffMe` from `@jojopotato/types`.
  - Export `async function fetchStaffMe(): Promise<StaffMe | null>` — calls `authClient.$fetch('/api/staff/me')` (session cookie/headers attached automatically by the expo better-auth client). Returns the parsed `StaffMe` on success; returns `null` on any error (catch all errors, do not throw — the shell shows a graceful fallback).
  - No retry logic, no timeout tuning, no library — plain `authClient.$fetch` is the ceiling.
- [x] **F3b.** Create `apps/mobile/src/features/staff/hooks/use-staff-me.ts`:
  - Import `fetchStaffMe` from `../lib/staff-api` and `StaffMe` from `@jojopotato/types`.
  - Export `function useStaffMe(): { data: StaffMe | null; isLoading: boolean; error: string | null }`.
  - Implementation: `useState` for `data`, `isLoading`, `error`; `useEffect` with empty dep array to call `fetchStaffMe()` once on mount; set loading false after resolve. On null return show `error: 'Could not load branch info'`; on success set `data` and clear error.
  - No cleanup needed for a single one-shot fetch on mount.
- [x] **F3c.** Create `apps/mobile/src/app/(staff)/index.tsx` (the designed shell):
  - Imports: `BrandWordmark`, `Badge`, `Card`, `Button` from `@jojopotato/ui`; `useTheme` from `@/hooks/use-theme`; `SafeAreaView`, `useSafeAreaInsets` from `react-native-safe-area-context`; `ScrollView`, `View`, `Text`, `ActivityIndicator`, `StyleSheet` from `react-native`; `useAuth` from `@/features/auth/hooks/use-auth`; `useStaffMe` from `@/features/staff/hooks/use-staff-me`; `Spacing`, `TypeScale`, `FontFamily` from `@/constants/theme` (re-exports from `@jojopotato/ui` theme tokens — do NOT import directly from `packages/ui`).
  - Structure:
    1. **Header row**: `BrandWordmark` (mode from theme) beside a `Badge` with label `"Staff"`. Use theme tokens for spacing/color — no hardcoded hexes.
    2. **Branch name block**: If `isLoading` → `ActivityIndicator`; if `error` → graceful fallback text ("Branch unavailable"); if `data.assignedBranch` → `Text` with `data.assignedBranch.name` styled with theme tokens; if `data.assignedBranch === null` → "No branch assigned".
    3. **Nav cards** (4 × `Card` from `@jojopotato/ui`, inert, non-navigating or navigating to a `<ComingSoon>` route): "Active Orders", "Completed Orders", "Product Availability", "Branch Pickup Settings". Each card body: title text + "Coming soon" subtitle text. Do NOT wire any tap action that fetches data. Do NOT navigate to a non-existent route — either leave `onPress` as `undefined` or navigate to a `(staff)/coming-soon` route if one is created; keep it honest (no false navigation).
    4. **Sign-out**: `Button` from `@jojopotato/ui` labeled `"Sign out"` with `onPress={() => void signOut()}` where `signOut` comes from `useAuth()`. This returns the user to `(auth)` stack via the root gate.
  - Follow `SafeAreaView`/insets pattern from `coming-soon.tsx` (edges `['top', 'bottom']`; no floating-tab-bar clearance needed since `(staff)` has no tab bar).
  - No inline hex colors, no one-off `StyleSheet` values that duplicate theme tokens.
- [x] **F3d.** Run `expo start` in `apps/mobile` and Ctrl-C to trigger Expo Router typed-routes codegen for the new `(staff)/index.tsx` file. Required before typecheck resolves the typed hrefs.
- [ ] **F3e.** Verify shell renders correctly in dev: sign in as seeded staff user (`staff-branch1@jojopotato.local`) and confirm: header shows `BrandWordmark` + "Staff" badge; branch name from API is displayed; all four nav cards visible and labeled correctly; sign-out button visible and functional (returns to login screen).
- [x] **F4.** In `apps/mobile/src/app/_layout.tsx` — update `RootNavigator`:
  - Destructure `isStaff` alongside `user, isLoading` from `useAuth()`.
  - Rewrite the guard logic:
    ```tsx
    const isAuthenticated = !isLoading && user !== null;
    const isStaffUser = isAuthenticated && isStaff;
    const isCustomer = isAuthenticated && !isStaff;
    ```
  - Replace the two existing `Stack.Protected` blocks with three:
    ```tsx
    <Stack.Protected guard={isStaffUser}>
      <Stack.Screen name="(staff)" />
    </Stack.Protected>
    <Stack.Protected guard={isCustomer}>
      <Stack.Screen name="(tabs)" />
    </Stack.Protected>
    <Stack.Protected guard={!isAuthenticated}>
      <Stack.Screen name="(auth)" />
    </Stack.Protected>
    ```
  - Customer-with-staff-role now routes to `(staff)`, not `(tabs)`. Auth public stack still covers unauthenticated users. isLoading still blocks (user === null while loading).

### Phase G — Typecheck + Codegen

- [x] **G1.** Run `expo start` in `apps/mobile` and then Ctrl-C to trigger Expo Router typed-routes codegen (picks up new `(staff)/index.tsx` and `(staff)/_layout.tsx` hrefs in `.expo/types/router.d.ts`). Required before `tsc --noEmit` can resolve typed hrefs. (Note: F3d may have already done this — skip if already run.)
- [x] **G2.** Run `pnpm --filter @jojopotato/mobile typecheck` — must pass with zero errors.
- [x] **G3.** Run `pnpm --filter @jojopotato/types typecheck` — must pass.
- [x] **G4.** Run `pnpm --filter @jojopotato/api typecheck` — must pass.
- [x] **G5.** Run `pnpm lint` — all packages clean.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api test` — all 5 existing auth tests still pass | Hybrid (needs local Postgres) | AC4 (session/auth reuse — regression check) |
| New test: customer → `GET /api/staff/me` → 403 | Hybrid (needs local Postgres) | AC2 proven by: `require-staff.integration.test.ts` test E6 |
| New test: staff with own branch → `GET /api/staff/me` → 200 + `assignedBranch` | Hybrid (needs local Postgres) | AC3 proven by: test E7; AC1 server-side proven by: test E3 |
| New test: `assertBranchScope` returns false for cross-branch request | Fully-Automated (pure function) | AC3 proven by: test E5 |
| `pnpm --filter @jojopotato/mobile typecheck` — zero errors after codegen | Fully-Automated | AC1 (typed routes compile) |
| `pnpm lint` across all packages | Fully-Automated | Code health |
| Manual: sign in as staff account on Expo app → lands in `(staff)` stack, NOT home tab | Agent-Probe | AC1 |
| Manual: sign in as customer → cannot see `(staff)` stack, any nav to staff routes shows `(tabs)` | Agent-Probe | AC2 (mobile routing) |
| Manual: sign in as staff, observe `assignedBranch` in `/api/staff/me` response matches seeded branch | Agent-Probe | AC3 (end-to-end branch scope) |
| Manual: restart app while signed in as staff → still in `(staff)` shell (session persisted) | Agent-Probe | AC4 |
| Manual: staff shell displays correct branch name from `/api/staff/me`; four nav cards visible and inert; sign-out returns to `(auth)` stack | Agent-Probe | AC1 + AC3 (shell end-to-end) |
| Mobile RN unit test for `useStaffMe` loading/error states | Known-Gap (no RN test runner) | — (backlog: `mobile-e2e-navigation-harness_NOTE_09-07-26.md`) |

### High-Risk Surface Evidence Table

| Area | High-risk class | Minimum tier | Gap rationale if known-gap |
|---|---|---|---|
| `requireStaff` middleware | auth/identity | Hybrid | — |
| `GET /api/staff/me` endpoint | auth/identity + new API trust boundary | Hybrid | — |
| `assertBranchScope` | auth/identity | Fully-Automated (pure function) | — |
| Mobile role-aware gate | auth/identity | Agent-Probe (no RN test runner) | No RN test runner exists; backlog: `mobile-e2e-navigation-harness_NOTE_09-07-26.md` |
| `useStaffMe` fetch hook | auth/identity (uses session) | Agent-Probe (no RN test runner) | Low risk — read-only call on existing auth session; test runner absence documented as known-gap |

---

## Risk Assessment and Failure Modes

| Risk | Mitigation |
|---|---|
| `auth.api.getSession` headers conversion incorrect (Express `IncomingHttpHeaders` → `Headers`) | Include an explicit conversion helper in `require-staff.ts`; test with real session in integration test |
| `Stack.Protected` guards evaluate simultaneously — loading race gives staff a flash of auth stack | `isStaffUser` and `isCustomer` both require `!isLoading && user !== null` — loading state routes to neither protected stack; `(auth)` stack `guard={!isAuthenticated}` catches unauthenticated state during load |
| Expo typed-routes codegen not run before typecheck → `href: '/(staff)'` is unknown | Document in checklist G1 (run `expo start` + stop); known repo convention per `all-context.md` |
| Migration applied with active connections — `ALTER TABLE ADD COLUMN` is safe on Postgres but confirm no LOCK contention on dev | Nullable column add is instant on Postgres 12+ with `DEFAULT NULL`; no risk on dev/staging |
| Seed user's `assignedBranchId` references a branch that doesn't exist in DB | Seed runs branch first; seed upserts branch row if not already present |
| Admin/super_admin bypass accidentally implemented | Explicit `// TODO(STAFF-ADM)` comment + zero admin logic in this ticket; AC2/AC3 tests use only `customer` and `staff` roles |
| Shell fetch fails silently and shows wrong branch name | `useStaffMe` returns `error` string on any failure; shell shows "Branch unavailable" fallback — no silent null display |
| Nav cards accidentally wired to real data endpoints | Cards are inert (no `onPress` data fetches); shell scope guard: only `/api/staff/me` is called in STAFF-001 |
| `authClient.$fetch` not available on expo better-auth client | `authClient` from `@better-auth/expo/client` exposes `$fetch` — the `@better-fetch/fetch` layer makes it available on all better-auth v1.x clients. If unavailable at runtime: use `authClient.getSession()` (non-reactive, promise-based) to retrieve the session token, then call `fetch(env.apiUrl + '/api/staff/me', { headers: { Authorization: 'Bearer ' + token } })`. Do NOT use `authClient.useSession()` as a fallback — it is a React hook and cannot be called inside a plain async function. |

---

## Dependencies

- **Upstream (must exist):** `packages/api` schema migration 0001 applied; `branches` table populated (at least one row) before seed runs.
- **Downstream (will depend on STAFF-001):** STAFF-002 `GET /api/staff/orders?status=...` — uses `requireStaff` + `assertBranchScope`. STAFF-003 PATCH `/api/staff/orders/:id/status` — same middleware. STAFF-004 PATCH `/api/staff/branches/:id/availability` — same middleware.
- **Parallel-safe:** `packages/types` change is additive; no existing consumer breaks.
- **Shell dependency on canary:** `useStaffMe` hook (Phase F3a/F3b) depends on Phase B (canary endpoint) and Phase C (StaffMe type) being done first. Execute Phase F only after B, C, and D complete.

---

## Test Infra Improvement Notes

- `apps/mobile` still has no RN test runner (existing gap, see `all-tests.md`). The mobile role-gate logic (`isStaff` derivation, `Stack.Protected` guard), the `useStaffMe` hook, and the shell render logic cannot be automatically tested without one. This plan's mobile verification remains Agent-Probe tier. A future plan should introduce `jest-expo` or Maestro for mobile coverage — the `mobile-e2e-navigation-harness_NOTE_09-07-26.md` backlog note covers this.
- Integration test pattern established in `auth.integration.test.ts` is reused verbatim. `supertest` is added as a devDependency in Phase E (E0) to enable route-level HTTP tests E6/E7.
- `packages/api/src/index.ts` exports `app` (added in B3) so supertest can attach to the running Express instance without binding a port.

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/staff-dashboard/active/staff-001-login-branch-scope_13-07-26/staff-001-login-branch-scope_PLAN_13-07-26.md`
2. **Last completed phase or step:** None — not started.
3. **Validate-contract status:** Written — see `## Validate Contract` below.
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - `apps/mobile/src/app/_layout.tsx`
   - `apps/mobile/src/features/auth/hooks/use-auth.ts`
   - `apps/mobile/src/features/auth/lib/auth-client.ts`
   - `apps/mobile/src/components/coming-soon.tsx`
   - `packages/ui/src/index.ts`
   - `packages/ui/src/theme.ts`
   - `packages/api/src/db/schema/users.ts`
   - `packages/api/src/db/schema/branches.ts`
   - `packages/api/src/index.ts`
   - `packages/api/src/lib/auth.ts`
   - `packages/api/src/lib/__tests__/auth.integration.test.ts`
   - `packages/api/src/db/schema/index.ts`
5. **Next step for a fresh agent:** Start at Phase A (schema). Run `pnpm --filter @jojopotato/api db:generate` after editing `users.ts`. Follow checklist phases A → B → C → D → E → F → G in order. Do not start F (mobile) before E (tests pass) and before C (StaffMe type exists). Add supertest in E0 before writing E6/E7. Export `app` from index.ts in B3. For the shell: F3a (staff-api.ts) → F3b (use-staff-me.ts) → F3c (index.tsx shell) → F3d (codegen) → F3e (manual verify) → F4 (root gate).

**Execution order dependency graph:**

```
A (schema + migrate) → B (server primitives) → C (types) → D (seed)
                     → E (tests — needs A, B, D done; E0 adds supertest first)
                     → F (mobile — needs C done; F3a/F3b/F3c also need B done for endpoint to exist)
                     → G (typecheck — needs E + F done)
```

---

## Phase Completion Rules

A phase is NOT complete until all of the following hold:

1. **Integration test** - vitest suite for packages/api is green (all new gates plus existing auth tests passing).
2. **Manual test** - staff login routes to (staff) stack; customer blocked at API (403 confirmed via curl or Expo network inspector); staff shell shows correct branch name from /api/staff/me.
3. **DB check** - assigned_branch_id column present in users table; seeded staff row has non-null value.
4. **Error handling** - unauthenticated and customer requests to /api/staff/* return 403, not 500 or empty; shell shows "Branch unavailable" gracefully when /api/staff/me fails.
5. **User confirmation** - operator confirms staff shell visible on device with branch name; customer is blocked.

Status markers: PLANNED (not started) | CODE DONE (written, not e2e tested) | TESTING | VERIFIED (all 5 criteria met, user confirmed) | BLOCKED

---

## Validate Contract

Status: PASS
Date: 13-07-26
date: 2026-07-13
generated-by: outer-pvl
supersedes: 2026-07-13 (outer-pvl) — PVL cycle 1 after SUPPLEMENT_APPLIED; CONCERN resolved (E3 fallback corrected)

Parallel strategy: sequential
Rationale: score 2/7 (S2: auth surface, S6: high-risk class); single plan, inline session validation; no fan-out parallelism needed at this scale.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3-pure | assertBranchScope same branch → true | Fully-Automated | `pnpm --filter @jojopotato/api test` — test E4 | A |
| AC3-neg | assertBranchScope different branch → false | Fully-Automated | `pnpm --filter @jojopotato/api test` — test E5 | A |
| AC1-type | Mobile typed routes compile with (staff) stack + new shell files | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` exits 0 | A |
| types-compile | StaffMe + StaffRole types export correctly | Fully-Automated | `pnpm --filter @jojopotato/types typecheck` exits 0 | A |
| lint | All packages lint clean | Fully-Automated | `pnpm lint` exits 0 | A |
| AC2-middleware | requireStaff rejects customer → 403 | Hybrid | `pnpm --filter @jojopotato/api test` — precondition: `docker compose up -d` + `db:migrate`; test E2 | A |
| AC1-server | requireStaff passes staff → req.staffSession populated | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition; test E3 | A |
| AC2-route | GET /api/staff/me customer → 403 | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition; test E6 via supertest | A |
| AC3-route | GET /api/staff/me staff → 200 + assignedBranch | Hybrid | `pnpm --filter @jojopotato/api test` — same precondition; test E7 | A |
| AC4-regression | Existing auth tests still pass (no forked auth) | Hybrid | `pnpm --filter @jojopotato/api test` — test E8 runs full suite | A |
| AC1-mobile | Staff login → (staff) shell on device | Agent-Probe | 1. Start API. 2. Boot Expo (pnpm ios). 3. Sign in with staff credentials. 4. Verify (staff) stack shown, not (tabs). | A |
| AC2-mobile | Customer login → (tabs) shell; no (staff) route visible | Agent-Probe | Same session, sign in as customer. Verify (tabs) shown; attempting to navigate to staff routes stays in (tabs). | A |
| AC4-mobile | Restart app while signed in as staff → still in (staff) shell | Agent-Probe | Sign in as staff; kill and reopen app; verify (staff) shell resumes without re-auth. | A |
| AC1-shell | Staff shell shows branch name from /api/staff/me; nav cards visible and inert; sign-out returns to (auth) | Agent-Probe | 1. Sign in as staff. 2. Verify header: BrandWordmark + "Staff" badge. 3. Verify branch name matches seeded branch. 4. Verify 4 nav cards visible with "Coming soon" text; no data fetch on tap. 5. Tap sign-out → returns to login screen. | A |
| mobile-hook-unit | useAuth() isStaff unit test | Known-Gap | — | D |
| use-staff-me-unit | useStaffMe() loading/error state unit test | Known-Gap | — | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: Known-Gap rows (mobile-hook-unit, use-staff-me-unit) are named residuals, not strategies. Their gap-resolution is D (backlog stubs). They do not appear in the strategy column.

Legacy line form:
- assertBranchScope (pure function): Fully-automated: `pnpm --filter @jojopotato/api test`
- requireStaff + GET /api/staff/me: hybrid: `pnpm --filter @jojopotato/api test` + precondition: local Postgres via `docker compose up -d` + `db:migrate`
- mobile role gate: agent-probe: manual Expo device/simulator test
- staff shell (branch name + nav cards + sign-out): agent-probe: manual Expo device/simulator test
- mobile hook unit tests: known-gap: documented — backlog `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`

Failing stubs (Fully-Automated rows only):

```
test("should assertBranchScope return true for same branch uuid (AC3 positive)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: assertBranchScope same branch → true")
})

test("should assertBranchScope return false for different branch uuid (AC3 negative)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: assertBranchScope different branch → false")
})

test("should mobile typecheck pass with isStaff, third Stack.Protected guard, and new shell files", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: pnpm --filter @jojopotato/mobile typecheck exits 0")
})

test("should packages/types typecheck pass with StaffMe and StaffRole exports", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: pnpm --filter @jojopotato/types typecheck exits 0")
})

test("should pnpm lint exit 0 across all packages", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: pnpm lint exits 0")
})
```

Dimension findings:
- Infra fit: PASS — E3 fallback corrected to use `authClient.getSession()` (non-reactive) instead of `authClient.useSession()` (React hook); primary `authClient.$fetch` path confirmed sound via @better-fetch/fetch layer; no new infra dependencies; Stack.Protected three-guard logic verified.
- Test coverage: PASS — delta coverage correct; AC1-shell Agent-Probe gate confirmed present; known-gaps (mobile-hook-unit + use-staff-me-unit) honestly documented; server-side canary endpoint (E7) proves the fetch target works.
- Breaking changes: PASS — all delta (staff-api.ts, use-staff-me.ts, (staff)/index.tsx) is additive; no existing consumer breaks; customer (tabs) routing unaffected.
- Security surface: PASS — shell fetch is read-only, auth-gated (requireStaff middleware), single endpoint; no new trust boundary; nav cards inert; risk evidence pack required before DONE (E1 instruction retained).
- Phase F — Mobile Shell feasibility: PASS — all import targets confirmed (BrandWordmark/Badge/Card/Button in @jojopotato/ui index.ts; authClient in auth-client.ts; StaffMe from @jojopotato/types); scope clean (1 network call only; no library); features/staff/lib and features/staff/hooks dirs are new — execute-agent must mkdir.
- Scope Boundary Audit (PVL cycle 1 — delta items): PASS — staff-api.ts IN-SCOPE (single read-only call to plan-built canary); use-staff-me.ts IN-SCOPE (thin wrapper, no library); (staff)/index.tsx IN-SCOPE (AC1 landing screen, proves AC1+AC3 end-to-end); NO banned fetch libraries; nav cards INERT; NO real data endpoints.

Scope Boundary Audit Table:

| Item | Classification | Justification |
|---|---|---|
| users.ts — assignedBranchId column | FOUNDATION (justified) | Required for AC3 server-side branch scope; reused by STAFF-002/003/004 |
| Migration 0002_*.sql | FOUNDATION (justified) | Consequence of schema change |
| require-staff.ts — middleware + helpers | FOUNDATION (justified) | Core authz primitive for AC2+AC3; all future staff routes reuse |
| GET /api/staff/me canary route | IN-SCOPE | Proves AC2/AC3/AC4 at route level; read-only |
| index.ts — mount /api/staff/* | IN-SCOPE | Required for route to be reachable |
| Seed — staff user | FOUNDATION (justified) | Testability; rewritten to use auth.api approach |
| packages/types/src/staff.ts — StaffMe + StaffRole | FOUNDATION (justified) | Stable contract; cross-package type sharing |
| packages/types/src/index.ts — export | IN-SCOPE | Mechanical consequence |
| (staff)/_layout.tsx — Stack navigator | FOUNDATION (justified) | AC1 requires staff shell; future screens mount here |
| (staff)/index.tsx — designed shell | IN-SCOPE | AC1 requires landing screen with branch name (proves AC1+AC3 end-to-end); SHELL only — no order/product data |
| staff-api.ts — fetch helper | IN-SCOPE | Single read-only call for branch name display; authClient.$fetch reuses existing session |
| use-staff-me.ts — hook | IN-SCOPE | Thin useState/useEffect wrapper; no library |
| _layout.tsx — role-aware root gate | IN-SCOPE | AC1 directly requires staff to route to (staff) not (tabs) |
| use-auth.ts — isStaff | IN-SCOPE | AC1 mobile role derivation |
| Integration tests E1-E8 | IN-SCOPE | Direct AC1-AC4 coverage |

Execute-agent instructions:

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Before marking DONE: produce risk evidence pack in `process/features/staff-dashboard/active/staff-001-login-branch-scope_13-07-26/harness/` — files: `risk-gate.json` (riskClass: "auth or identity", mustStopBeforeFinalize: true), `context-snippets.json`, `verification.json`, `review-decision.json`, `adversarial-validation.json`. Run `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs` on the harness directory to confirm all 5 artifacts are present and valid. | Before final DONE report |
| E2 | If TypeScript reports a narrowing error on `STAFF_ROLES.includes(role)` in mobile code: import `StaffRole` from `@jojopotato/types`; use `(STAFF_ROLES as readonly StaffRole[]).includes(role as StaffRole)`. Do NOT import from `packages/api` or `packages/api/src/lib/require-staff`. | Phase F1 implementation |
| E3 | If `authClient.$fetch` is not available on the expo better-auth client: use `authClient.getSession()` (non-reactive, promise-based — NOT `authClient.useSession()` which is a React hook and cannot be called in a plain async function) to retrieve the session; then call `fetch(env.apiUrl + '/api/staff/me', { headers: { Authorization: 'Bearer ' + session?.token } })`. Do not import server-side code. | Phase F3a implementation |

Open gaps:
- mobile-hook-unit: known-gap: documented as NEW PLAN REQUIRED — existing backlog note `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` covers mobile auth hook test coverage.
- use-staff-me-unit: known-gap: same backlog note covers hook test coverage; useStaffMe is a simple useState/useEffect hook with no edge-case complexity that can cause silent failures — graceful null return handles all error paths.

What this coverage does NOT prove:
- Fully-Automated (assertBranchScope E4/E5): does not prove the DB query in resolveBranchScope returns the correct value; does not prove runtime middleware chain wiring; does not prove concurrent request behavior.
- Fully-Automated (typecheck gates): does not prove runtime behavior, React render correctness, or Expo Router navigation mount behavior.
- Fully-Automated (lint): does not prove correctness, only style/type surface issues.
- Hybrid (requireStaff E2/E3 middleware tests): does not prove HTTP-level route behavior (covered by E6); does not prove session expiry behavior; does not prove concurrent session handling.
- Hybrid (GET /api/staff/me E6/E7 route tests): does not prove mobile-side rendering; does not prove session persistence across server restarts; does not prove load behavior under concurrent staff sessions.
- Agent-Probe (mobile gate): does not provide automated regression; cannot catch regressions introduced by future Expo Router upgrades without re-running manually.
- Agent-Probe (shell gate AC1-shell): does not prove behavior under network failure mid-mount; does not prove branch name updates if session changes; requires manual re-run after any shell change.
- Known-Gap (mobile-hook-unit, use-staff-me-unit): useAuth() isStaff derivation logic, useStaffMe loading/error transitions, and hook behavior under edge cases (role changes mid-session, network failures) are NOT proven.

Gate: PASS (0 FAILs; 1 CONCERN resolved via E3 fix in PVL cycle 1 after SUPPLEMENT_APPLIED; scope boundary audit clean; shell delta IN-SCOPE)
Accepted by: session (autonomous, /goal execution) — PVL cycle 1 concern: authClient-useSession-hook-in-async-context (resolved by correcting E3 to use authClient.getSession())

## Autonomous Goal Block

SESSION GOAL: STAFF-001 — Staff login and branch-scoped access foundation with staff dashboard shell (GitHub #31)
Charter + umbrella plan: N/A — single plan
Autonomy: PASS — no open concerns; all prior concerns resolved. Hard stop on irreversible/outward-facing actions not in this contract.
Hard stop conditions / safety constraints:
- Do NOT implement /api/staff/orders, /api/staff/products, or any real data endpoint (STAFF-002+ scope)
- Do NOT implement admin/super_admin branch bypass logic (only the TODO seam comment)
- Do NOT modify (tabs) screens or customer auth flow beyond the root _layout.tsx gate
- Do NOT introduce react-query, axios, swr, or any data-fetching library for mobile — only authClient.$fetch for /api/staff/me
- Do NOT fetch any endpoint other than GET /api/staff/me from the mobile shell
- Do NOT wire nav cards to real data — cards are inert placeholders only (onPress={undefined} is correct)
- Do NOT hardcode hex colors in shell components — use theme tokens exclusively (Spacing, TypeScale, FontFamily, useTheme())
- Do NOT use authClient.useSession() inside a plain async function — it is a React hook; use authClient.getSession() instead if $fetch fallback is needed
- Risk evidence pack MUST be produced before reporting DONE (vc-risk-evidence-pack, auth/identity class)
- Do NOT skip the Expo Router codegen step (expo start + Ctrl-C) before typecheck
- mkdir features/staff/lib and features/staff/hooks before creating staff-api.ts and use-staff-me.ts
Next phase: EXECUTE: process/features/staff-dashboard/active/staff-001-login-branch-scope_13-07-26/staff-001-login-branch-scope_PLAN_13-07-26.md
Validate contract: inline in plan (## Validate Contract section above)
Execute start: Hybrid: `pnpm --filter @jojopotato/api test` (after docker compose up -d + db:migrate) | Fully-Automated: `pnpm --filter @jojopotato/mobile typecheck` + `pnpm lint` | Agent-Probe: manual Expo device test (shell branch name + nav cards + sign-out) | high-risk pack: yes (auth/identity class)
