---
name: plan:adm-009-staff-management
description: "Admin staff list + branch-assignment surface (issue #124) — packages/api + apps/admin"
date: 21-07-26
feature: admin-dashboard
---

# ADM-009 — Staff Management: Branch Assignment + Role Admin Surface (PLAN)

Date: 21-07-26
Status: VALIDATED — Gate: CONDITIONAL (see `## Validate Contract` below) — ready for EXECUTE
Complexity: mid-COMPLEX (single standalone plan, NOT a phase program)
SPEC: `adm-009-staff-management_SPEC_21-07-26.md` (same folder) — all decisions D1–D2 locked there; this plan adds D3 (role-change control IS shown, super_admin-gated, reusing the existing route unmodified).

## Overview

Issue #124. Feature: admin-dashboard. This plan builds a Staff screen in `apps/admin` backed by two
new `packages/api` routes, closing the operational gap where `users.assignedBranchId` has no
client-facing write path. Context: `process/context/all-context.md`, `process/context/tests/all-tests.md`.

## Summary

Builds the 12th consumer of the append-only `/api/admin` aggregator: a new `staff.ts` sub-router
(`GET /api/admin/staff`, `PATCH /api/admin/staff/:id/branch`) plus a dedicated `apps/admin` Staff
screen. Closes the only production gap in staff onboarding today — `users.assignedBranchId` has no
client-facing write path; the seed is the only writer. Role changes are NOT rebuilt: the existing
`POST /api/admin/users/:id/role` route is reused byte-for-byte, surfaced in the new screen only for
`super_admin` viewers (D3, locked with the user this session — supersedes the SPEC's "no role
control on this screen" line).

## Locked Decisions (do not re-open)

- **D1** (SPEC): demote staff→customer leaves `assignedBranchId` stale — no auto-clear. Known,
  accepted quirk (re-promotion silently restores the old branch).
- **D2** (SPEC): ONE dedicated `Staff` nav entry — repurpose the disabled `Users & Roles` entry
  (`nav-config.ts`) to `label: 'Staff'`, `to: '/staff'`, `disabled: false`. No shared Users screen.
- **D3** (this plan, user-confirmed): the Staff screen DOES show a role-change control, rendered
  ONLY for `super_admin` viewers (gated via `useAdminAuth().role === 'super_admin'`); plain `admin`
  viewers see role as a read-only badge. It calls the EXISTING `POST /api/admin/users/:id/role`
  UNMODIFIED — this screen becomes that route's first and only UI consumer (confirmed by grep: no
  prior call site exists in `apps/admin`). Client-side gate is cosmetic; the server's existing
  inline `role !== 'super_admin'` 403 check is the real boundary. Self-escalation stays
  server-blocked (unchanged).
- **D4** (VALIDATE-confirmed, promoted from an implementation note — see Execute-Agent Instruction
  E2): the role `<select>` in `staff-list.tsx` intentionally offers only `staff`/`admin`/
  `super_admin` — NOT `customer` — even though the underlying `POST /api/admin/users/:id/role`
  route technically accepts a `customer` target. This is a deliberate UX-scope narrowing, not a
  defect: demoting a staff member out of the staff-level roles entirely (i.e. "remove them from
  being staff") is a distinct workflow this dedicated Staff screen does not own — once demoted, the
  user disappears from `GET /api/admin/staff`'s own result set anyway (it filters `role IN
  STAFF_ROLES`), so exposing a "demote to customer" control on a screen that would then immediately
  make that row vanish is a confusing UX shape. That action remains reachable only via direct API
  call today; a general Users screen (ADM-010, already out-of-scope per the SPEC) is the natural
  future home for it. Sign-off given at VALIDATE — see Layer 2 findings.
- **Branch picker**: native `<select>`, mirroring `order-filter-bar.tsx`. Options come from the
  existing `useAdminBranches()` hook, filtered client-side to `isActive` branches before rendering.
  No new combobox/dialog/shared `Select` primitive.
- **No pagination/search** on `GET /api/admin/staff` — flat list (staff rosters are small; YAGNI,
  matches the `GET /api/admin/rewards` precedent, not the cursor-paginated Orders precedent).
- **Branch data source**: reuse `apps/admin/src/features/branches/hooks/use-admin-branches.ts` — no
  new fetch wrapper for branches.
- **Non-`customer` targets allowed on the branch-assignment route**: `admin`/`super_admin` targets
  are accepted too (harmless — they're not branch-scoped, `assertBranchScope` bypasses them
  regardless), matching that `GET /api/admin/staff` already lists all three roles. Only
  `role === 'customer'` is rejected. Documented explicitly so EXECUTE doesn't narrow this
  unilaterally.

## Touchpoints

| File | Change |
|---|---|
| `packages/api/src/routes/admin/staff.ts` | NEW — `GET /` (list) + `PATCH /:id/branch` (assign/clear) |
| `packages/api/src/routes/admin/index.ts` | append `adminRouter.use('/staff', staffRouter)` |
| `packages/api/src/routes/lib/serializers.ts` | append local `AdminStaffSummary` interface + `serializeAdminStaffSummary` |
| `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts` | NEW — full AC1–AC7 coverage |
| `apps/admin/src/features/staff/lib/admin-staff-api.ts` | NEW — fetch wrapper: `getStaff()`, `patchStaffBranch()`, `postStaffRole()` |
| `apps/admin/src/features/staff/hooks/use-admin-staff.ts` | NEW — react-query list query + 2 mutations |
| `apps/admin/src/features/staff/components/staff-list.tsx` (+ `.test.tsx`) | NEW — table: email/role/branch, role `<select>` (super_admin only) or badge, branch `<select>` |
| `apps/admin/src/routes/(dashboard)/staff.tsx` | NEW — thin `<Outlet/>` layout (TanStack nested-route gotcha) |
| `apps/admin/src/routes/(dashboard)/staff.index.tsx` | NEW — renders `StaffList`, owns query/mutation wiring |
| `apps/admin/src/config/nav-config.ts` | edit — repurpose `users` entry → `label: 'Staff'`, `to: '/staff'`, `disabled: false` |

No schema/migration changes. No changes to `users.ts` (role route untouched, per Constraint).

## Public Contracts

**`GET /api/admin/staff`** → `200 { staff: AdminStaffSummary[] }`
```ts
interface AdminStaffSummary {
  id: string;
  email: string;
  role: 'staff' | 'admin' | 'super_admin';
  assignedBranchId: string | null;
  branchName: string | null; // null when assignedBranchId is null OR branch lookup fails
}
```
- 401 unauthenticated, 403 non-admin (inherited from `requireAdmin` mount guard — no new logic).

**`PATCH /api/admin/staff/:id/branch`** → body `{ branchId: string | null }` (uuid or null)
→ `200 { staff: AdminStaffSummary }` (the updated row, re-serialized with fresh branch join)
- `400` invalid body shape (Zod)
- `404` target user not found
- `400` target role === `'customer'` — message: `"Target user is not staff-level"`
- `400` `branchId` non-null but branch missing or `isActive === false` — message:
  `"Unknown or inactive branch"` (verbatim reuse of `deals.ts:209`'s phrasing convention)
- `401`/`403` — inherited guard, same as GET.

**Reused, unmodified:** `POST /api/admin/users/:id/role` (`users.ts`) — zero code changes. This
plan's UI is its first consumer.

## Blast Radius

- **Packages touched:** `packages/api` (1 new route file, 1 aggregator line, 1 serializer block),
  `apps/admin` (1 new feature folder — 3 files + 1 test — plus 2 new route files, 1 nav-config edit).
- **Risk class:** none of auth/billing/schema/migration/public-customer-API/deploy — this is an
  ADMIN-only CRUD-shaped surface reusing an already-locked auth guard and an already-locked
  role-change route verbatim. Lowest risk tier seen across the admin-dashboard program.
- **File count:** 10 touched/new files total (7 new, 3 edited) — mid-COMPLEX, below the
  high-risk-evidence-pack threshold (no auth/billing/schema/migration/public-API/deploy/secrets
  surface is touched).
- **No new dependency, no new runtime surface, no new auth mechanism.**

## Backend Implementation

### 1. `packages/api/src/routes/admin/staff.ts` (new)

```ts
import { STAFF_ROLES } from '@jojopotato/types';
import { eq, inArray } from 'drizzle-orm';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { db } from '../../db/client';
import { branches, users } from '../../db/schema/index';
import { serializeAdminStaffSummary } from '../lib/serializers';
import { AdminApiError, handleAdminError } from './lib/errors';

const staffRouter: ExpressRouter = Router();

const branchAssignSchema = z.object({
  branchId: z.uuid().nullable(),
});

/**
 * GET /api/admin/staff — every user with role ∈ STAFF_ROLES (staff, admin,
 * super_admin), left-joined to `branches` for the assigned branch name.
 * Customers are never included (WHERE role IN (...), not a client-side filter).
 * No pagination — staff rosters are small (locked decision, YAGNI).
 */
staffRouter.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(inArray(users.role, [...STAFF_ROLES]));

    res.status(200).json({ staff: rows.map(serializeAdminStaffSummary) });
  } catch (err) {
    handleAdminError(err, res, 'listing staff');
  }
});

/**
 * PATCH /api/admin/staff/:id/branch — set or clear a staff-level user's branch.
 * Guard order (LOCKED, mirrors users.ts's role-route guard-order discipline):
 *   1. Zod body validation           → 400 on invalid shape
 *   2. target user lookup            → 404 if not found
 *   3. target role check             → 400 if role === 'customer'
 *   4. branchId === null             → short-circuit straight to the DB write (clear)
 *   5. branch lookup + isActive check→ 400 "Unknown or inactive branch"
 *   6. DB write + re-join + serialize
 * Branch existence/active status is ALWAYS read fresh from the DB — never
 * trusted from client input (mirrors resolveBranchScope's convention).
 */
staffRouter.patch('/:id/branch', async (req, res) => {
  try {
    const parsed = branchAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AdminApiError(400, 'Invalid request body');
    }

    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, req.params.id));
    if (!target) {
      throw new AdminApiError(404, 'User not found');
    }
    if (target.role === 'customer') {
      throw new AdminApiError(400, 'Target user is not staff-level');
    }

    if (parsed.data.branchId !== null) {
      const [branch] = await db
        .select({ id: branches.id, isActive: branches.is_active })
        .from(branches)
        .where(eq(branches.id, parsed.data.branchId));
      if (!branch || !branch.isActive) {
        throw new AdminApiError(400, 'Unknown or inactive branch');
      }
    }

    await db
      .update(users)
      .set({ assignedBranchId: parsed.data.branchId })
      .where(eq(users.id, req.params.id));

    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        assignedBranchId: users.assignedBranchId,
        branchName: branches.name,
      })
      .from(users)
      .leftJoin(branches, eq(users.assignedBranchId, branches.id))
      .where(eq(users.id, req.params.id));

    res.status(200).json({ staff: serializeAdminStaffSummary(updated!) });
  } catch (err) {
    handleAdminError(err, res, 'assigning staff branch');
  }
});

export default staffRouter;
```

Notes for EXECUTE:
- `STAFF_ROLES` (from `@jojopotato/types`) is `['staff', 'admin', 'super_admin']` — reuse the
  existing constant, do not hand-roll a new role list.
- `branches.is_active` is the raw DB column name (snake_case) — the select alias above
  (`isActive: branches.is_active`) matches `AdminBranch`'s existing camelCase convention.
- Malformed `:id` (non-uuid) falls through the `eq()` lookup and naturally 404s (same precedent as
  `branches.ts`) — no separate uuid-format guard needed on the param itself.

### 2. `packages/api/src/routes/admin/index.ts`

Add one import + one mount line, appended after the existing 11 mounts (never restructure):
```ts
import staffRouter from './staff';
// ...
// Staff management (ADM-009 — branch assignment for staff/admin/super_admin
// accounts). Same inherited guard; append-only, never restructure. 12th
// consumer of the append-only aggregator pattern.
adminRouter.use('/staff', staffRouter);
```

### 3. `packages/api/src/routes/lib/serializers.ts`

Append (near `AdminBranch`, matching its "declared LOCALLY, no `packages/types` promotion"
convention — no second consumer needs this shape today):
```ts
/**
 * Admin-only staff-roster shape (ADM-009, #124) — every user with a staff-level
 * role, plus their currently assigned branch (name resolved via a LEFT JOIN so an
 * unassigned staff member still serializes cleanly with both fields null).
 * Declared LOCALLY here matching the `AdminBranch`/`AdminReward` convention.
 */
export interface AdminStaffSummary {
  id: string;
  email: string;
  role: 'staff' | 'admin' | 'super_admin';
  assignedBranchId: string | null;
  branchName: string | null;
}

export function serializeAdminStaffSummary(row: {
  id: string;
  email: string;
  role: string;
  assignedBranchId: string | null;
  branchName: string | null;
}): AdminStaffSummary {
  return {
    id: row.id,
    email: row.email,
    role: row.role as AdminStaffSummary['role'],
    assignedBranchId: row.assignedBranchId,
    branchName: row.branchName,
  };
}
```

## Frontend Implementation (`apps/admin`)

### 4. `features/staff/lib/admin-staff-api.ts` (new)

Mirrors `admin-rewards-api.ts`'s `request<T>()` wrapper + `AdminApiError` class exactly
(`credentials: 'include'`, JSON content-type, status-carrying error). Exports:
```ts
export interface AdminStaffMember {
  id: string;
  email: string;
  role: 'staff' | 'admin' | 'super_admin';
  assignedBranchId: string | null;
  branchName: string | null;
}

export function listStaff(): Promise<AdminStaffMember[]>;                       // GET /staff
export function patchStaffBranch(id: string, branchId: string | null): Promise<AdminStaffMember>; // PATCH /staff/:id/branch
export function postStaffRole(id: string, role: 'customer' | 'staff' | 'admin' | 'super_admin'): Promise<{ id: string; email: string; role: string }>; // POST /users/:id/role (reused route, base path `${API}` not `${API}/staff`)
```
`postStaffRole` hits `${env.apiUrl}/api/admin/users/${id}/role` — NOT under `/staff` — since it's
the existing `users.ts` route, unmodified. Keep the two base paths visually distinct in the file
(a `USERS_API` vs `STAFF_API` const, or inline paths) so EXECUTE doesn't accidentally nest it under
`/staff/users/...`.

### 5. `features/staff/hooks/use-admin-staff.ts` (new)

Mirrors `use-admin-rewards.ts` exactly:
```ts
export const STAFF_KEY = ['admin', 'staff'] as const;

export function useAdminStaff() {
  return useQuery({ queryKey: STAFF_KEY, queryFn: listStaff });
}

export function useAssignStaffBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, branchId }: { id: string; branchId: string | null }) =>
      patchStaffBranch(id, branchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}

export function useChangeStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminStaffMember['role'] | 'customer' }) =>
      postStaffRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: STAFF_KEY }),
  });
}
```

### 6. `features/staff/components/staff-list.tsx` (+ `.test.tsx`)

Presentational, mirrors `reward-list.tsx`'s shape (parent owns query/mutation state, this component
takes data + callbacks). Uses the shared `DataTable` composite. Columns:
- **Email** — `r.email`
- **Role** — if `isSuperAdmin` prop is true: a native `<select>` (options: staff/admin/super_admin —
  NOT customer, this screen never demotes to customer per D3's UI framing, though the underlying
  route technically allows it; keep the dropdown scoped to the 3 staff-level roles to avoid an
  accidental self-demotion-off-this-screen UX trap) calling `onRoleChange(r, newRole)`. Else: a
  `StatusBadge` showing the role label, read-only.
- **Branch** — native `<select>` (mirrors `order-filter-bar.tsx`'s `selectClass`/`labelClass`
  pattern), value = `r.assignedBranchId ?? ''`, options = `<option value="">No branch
  assigned</option>` + one `<option>` per ACTIVE branch (branches prop pre-filtered by the parent
  route to `isActive`). `onChange` calls `onBranchChange(r, e.target.value || null)`.

```tsx
interface StaffListProps {
  staff: AdminStaffMember[] | undefined;
  branches: AdminBranch[] | undefined; // pre-filtered to isActive by the parent
  isLoading: boolean;
  error: unknown;
  isSuperAdmin: boolean;
  onBranchChange: (member: AdminStaffMember, branchId: string | null) => void;
  onRoleChange: (member: AdminStaffMember, role: AdminStaffMember['role']) => void;
}
```

**Execute-Agent Instruction E1 (see Validate Contract):** add an email-adjacent `Name` display
(`r.name`, from `users.name` — already selected fresh in the same query, notNull column) to this
component's first column, per the SPEC flow diagram's "name/email" column framing. This requires
adding `name` to the `GET`/`PATCH` selects, `AdminStaffSummary`/`AdminStaffMember` interfaces, and
`serializeAdminStaffSummary` in Section 3 above — a same-shaped, zero-risk additive field next to
`email` everywhere it already appears. Do not skip; do not treat `email` alone as satisfying AC8's
"name/email" display expectation.

### 7. `routes/(dashboard)/staff.tsx` (new — thin layout)

Byte-for-byte mirror of `rewards.tsx` (`Outlet` layout, docblock citing the same TanStack
nested-route gotcha).

### 8. `routes/(dashboard)/staff.index.tsx` (new)

Mirrors `rewards.index.tsx`'s shape (parent owns query wiring, `PageHeader` + list). Key wiring:
```tsx
const staffQuery = useAdminStaff();
const branchesQuery = useAdminBranches();
const assignMutation = useAssignStaffBranch();
const roleMutation = useChangeStaffRole();
const { role } = useAdminAuth(); // from features/auth/hooks/use-admin-auth
const isSuperAdmin = role === 'super_admin';

const activeBranches = branchesQuery.data?.filter((b) => b.isActive);

<StaffList
  staff={staffQuery.data}
  branches={activeBranches}
  isLoading={staffQuery.isLoading}
  error={staffQuery.error}
  isSuperAdmin={isSuperAdmin}
  onBranchChange={(member, branchId) => assignMutation.mutate({ id: member.id, branchId })}
  onRoleChange={(member, role) => roleMutation.mutate({ id: member.id, role })}
/>
```
No confirm dialog needed for branch changes (reversible, low-stakes — matches the branch-assignment
route's own non-destructive framing); role changes ALSO skip a confirm dialog here since the
underlying route already has its own hard guard (self-escalation 400, super_admin-only 403) — this
matches D3's framing that the client gate is cosmetic and the server is authoritative.

### 9. `config/nav-config.ts`

Change the existing `users` entry in the Management group:
```diff
       {
         id: 'users',
-        label: 'Users & Roles',
+        label: 'Staff',
         icon: Users,
-        to: '/users',
-        disabled: true,
+        to: '/staff',
       },
```
(Drop `disabled: true` entirely rather than setting `disabled: false` — matches every other enabled
entry's shape, no entry in the file currently has an explicit `disabled: false`.)

## Backend Tests — `admin-staff.integration.test.ts` (new)

Mirror `admin-rewards.integration.test.ts`'s structure exactly: same env-var bootstrap block, same
hermetic `makeUser(role)`-style self-seeding (grep `require-admin.integration.test.ts` for the
canonical fixture — reuse it, do not reinvent), same `beforeAll`/`afterAll` cleanup discipline.

| Test | ACs covered |
|---|---|
| `GET /staff` returns exactly the seeded staff/admin/super_admin users, correct branch name joined for an assigned user, null-safe for unassigned | AC1 |
| `GET /staff` never includes a seeded customer-role user | AC1 |
| `PATCH /staff/:id/branch` with a valid active branch sets `assignedBranchId` and the response reflects it | AC2 |
| `PATCH /staff/:id/branch` with `branchId: null` clears a previously-assigned user | AC3 |
| `PATCH /staff/:id/branch` with a deactivated branch id → 4xx, row unchanged | AC4 |
| `PATCH /staff/:id/branch` with a random/non-existent branch uuid → 4xx, row unchanged | AC4 |
| `PATCH /staff/:id/branch` targeting a customer-role user → 4xx, no row mutation | AC5 |
| `GET /staff` and `PATCH /staff/:id/branch` both 401 unauthenticated | AC6 |
| `GET /staff` and `PATCH /staff/:id/branch` both 403 for an authenticated non-admin (customer AND staff role) | AC6 |
| Re-run existing `require-admin.integration.test.ts` role-management suite green, zero diff | AC7 (regression assertion, no new logic) |

## Acceptance Criteria

Mirrors SPEC ACs 1–8 verbatim (see SPEC for full `proven by:`/`strategy:` text):

1. `GET /api/admin/staff` returns every user with role ∈ {staff, admin, super_admin}, branch name joined, customers excluded. Fully-Automated.
2. `PATCH /api/admin/staff/:id/branch` sets a valid active branch. Fully-Automated.
3. `PATCH /api/admin/staff/:id/branch` clears with `branchId: null`. Fully-Automated.
4. Route rejects inactive/nonexistent branch id, no partial write. Fully-Automated.
5. Route rejects a customer-role target, no row mutation. Fully-Automated.
6. Staff surface is admin-role-gated (401/403 matrix) identically to every other `/api/admin/*` route. Fully-Automated.
7. `POST /api/admin/users/:id/role` continues working unmodified (regression). Fully-Automated.
8. Admin dashboard Staff screen: list renders, nav entry reachable, branch assign/reassign/clear works, role control gated to super_admin. Agent-Probe.

## Implementation Checklist

1. `packages/api/src/routes/lib/serializers.ts` — add `AdminStaffSummary` interface + `serializeAdminStaffSummary` (per Execute-Agent Instruction E1, include `name: string` alongside `email`).
2. `packages/api/src/routes/admin/staff.ts` — new file: `GET /` list + `PATCH /:id/branch` (guard order per Backend Implementation §1; include `name` in both selects per E1).
3. `packages/api/src/routes/admin/index.ts` — append `adminRouter.use('/staff', staffRouter)`.
4. `packages/api/src/routes/admin/__tests__/admin-staff.integration.test.ts` — new file, full AC1–AC7 coverage (table in Backend Tests section).
5. Run `pnpm --filter @jojopotato/api test` + `pnpm --filter @jojopotato/api typecheck` — confirm green before touching `apps/admin`.
6. `apps/admin/src/features/staff/lib/admin-staff-api.ts` — new fetch wrapper (`listStaff`, `patchStaffBranch`, `postStaffRole`; `AdminStaffMember` includes `name` per E1).
7. `apps/admin/src/features/staff/hooks/use-admin-staff.ts` — new react-query hooks (`useAdminStaff`, `useAssignStaffBranch`, `useChangeStaffRole`).
8. `apps/admin/src/features/staff/components/staff-list.tsx` + `.test.tsx` — new presentational table component (name/email column per E1).
9. `apps/admin/src/routes/(dashboard)/staff.tsx` — new thin `<Outlet/>` layout.
10. `apps/admin/src/routes/(dashboard)/staff.index.tsx` — new list screen, wires hooks + `useAdminAuth` role gate.
11. `apps/admin/src/config/nav-config.ts` — repurpose `users` entry to `Staff` / `/staff` / enabled.
12. Run `pnpm --filter @jojopotato/admin test` + `typecheck` + `build` + `pnpm format:check` — confirm all green.
13. Manual admin-dashboard walkthrough (AC8, Agent-Probe) — owed by the user, standing residual. Include a check that the role `<select>` never offers `customer` (D4) and that this doesn't block the walkthrough (record this explicitly as expected behavior in the EXECUTE/report notes, per Execute-Agent Instruction E2).

## Phase Completion Rules

- CODE DONE once all 13 backend/frontend checklist items land and both automated gate commands
  (API + admin: test/typecheck/build/format) are green.
- VERIFIED only after the AC8 manual walkthrough is performed and passed — until then this plan
  stays in `active/`, matching every prior admin-dashboard phase's convention (e.g. Phase 5/6).
- No schema/migration/auth changes in this plan — no additional sign-off gate beyond the standard
  VALIDATE contract is required (VALIDATE explicitly reasoned through and WAIVED the high-risk
  5-artifact evidence pack — see `## Validate Contract` → Dimension findings → Security surface).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `admin-staff.integration.test.ts` — list shape + branch join + customer exclusion | Fully-Automated | AC1 |
| `admin-staff.integration.test.ts` — PATCH sets branch | Fully-Automated | AC2 |
| `admin-staff.integration.test.ts` — PATCH null clears branch | Fully-Automated | AC3 |
| `admin-staff.integration.test.ts` — PATCH rejects inactive/nonexistent branch | Fully-Automated | AC4 |
| `admin-staff.integration.test.ts` — PATCH rejects customer target | Fully-Automated | AC5 |
| `admin-staff.integration.test.ts` — 401/403 role matrix on both routes | Fully-Automated | AC6 |
| `require-admin.integration.test.ts` re-run, 0 diff to role-route behavior | Fully-Automated (regression) | AC7 |
| Manual admin-dashboard walkthrough: Staff nav entry reachable, list renders role+branch, branch assign/reassign/clear works from UI, super_admin sees role control / plain admin sees read-only badge | Agent-Probe | AC8 |

Standing residual: AC8 is the same class of no-E2E-runner gap carried by every prior admin-dashboard
phase (e.g. Phase 5/6's Agent-Probe UI gate) — not new debt.

## Test Gate Commands

```
pnpm --filter @jojopotato/api test
pnpm --filter @jojopotato/admin test
pnpm --filter @jojopotato/admin typecheck
pnpm --filter @jojopotato/admin build
pnpm --filter @jojopotato/api typecheck
pnpm format:check
```

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score = 1/7 (only S7 present: 10-file blast radius; S1 multi-package scope
absent — only 2 packages, not 3+; S2 schema/auth surface absent — additive admin-only API, no
schema/migration/breaking-contract change; S3/S4/S5/S6 all absent). Below the MEDIUM (2-3)
parallel-subagent threshold. A single `vc-execute-agent` working sequentially through the
Touchpoints table (backend route → serializer → aggregator mount → backend tests → frontend lib →
hook → component → routes → nav-config, running the relevant test gate after each section) is the
correct fit — matches every other single-plan admin-dashboard CRUD phase in this program (Branches,
Rewards, Orders) and matches the plan's own Resume/Execution Handoff guidance.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | `GET /api/admin/staff` lists staff/admin/super_admin with branch name joined, excludes customers | Fully-Automated | `admin-staff.integration.test.ts` — list shape + branch join + customer exclusion | B |
| AC2 | `PATCH /api/admin/staff/:id/branch` sets a valid active branch, response reflects new value | Fully-Automated | `admin-staff.integration.test.ts` — PATCH sets branch | B |
| AC3 | `PATCH /api/admin/staff/:id/branch` with `branchId: null` clears a previously-assigned user | Fully-Automated | `admin-staff.integration.test.ts` — PATCH null clears branch | B |
| AC4 | Route rejects an inactive OR non-existent branch id, no partial/silent write | Fully-Automated | `admin-staff.integration.test.ts` — PATCH rejects inactive/nonexistent branch (2 cases) | B |
| AC5 | Route rejects a customer-role target, no row mutation | Fully-Automated | `admin-staff.integration.test.ts` — PATCH rejects customer target | B |
| AC6 | Both routes are admin-role-gated: 401 unauthenticated, 403 non-admin (customer AND staff) | Fully-Automated | `admin-staff.integration.test.ts` — 401/403 role matrix | B |
| AC7 | `POST /api/admin/users/:id/role` continues working unmodified (byte-for-byte reuse) | Fully-Automated | `require-admin.integration.test.ts` re-run, 0 diff | B |
| AC8 | Admin Staff screen: list renders, nav reachable, branch assign/reassign/clear works from UI, role control gated to super_admin | Agent-Probe | Manual admin-dashboard walkthrough (standing no-E2E-runner residual) | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained for existing contract consumers):
- `packages/api` admin staff routes: Fully-automated: `pnpm --filter @jojopotato/api test` (new `admin-staff.integration.test.ts`, AC1–AC6) + regression re-run of `require-admin.integration.test.ts` (AC7)
- `apps/admin` Staff screen: Agent-probe: manual walkthrough of list/branch-assign/role-gate (AC8) | Fully-automated (build/typecheck/format only, no behavioral assertion): `pnpm --filter @jojopotato/admin test && pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin build`

C-4 reconciliation: the `strategy` column above carries only the 3 proving strategies
(Fully-Automated / Agent-Probe used here; Hybrid not needed — no container/live-DB precondition
beyond the standard `packages/api` vitest Postgres requirement already covered by Fully-Automated).
Known-Gap is not used as a strategy anywhere in this plan.

### Failing stubs (Fully-Automated rows)

```
test("should return every user with role ∈ {staff, admin, super_admin}, branch name joined, customers excluded", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC1 list shape + branch join + customer exclusion")
})
test("should set assignedBranchId to a valid active branch id and reflect it in the response", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC2 PATCH sets branch")
})
test("should clear assignedBranchId to null when branchId: null is sent", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC3 PATCH null clears branch")
})
test("should reject an inactive or non-existent branch id with no partial write", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC4 PATCH rejects inactive/nonexistent branch")
})
test("should reject a customer-role target with no row mutation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC5 PATCH rejects customer target")
})
test("should return 401 unauthenticated and 403 for non-admin (customer and staff) on both routes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC6 401/403 role matrix")
})
test("should leave POST /api/admin/users/:id/role behavior byte-for-byte unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC7 role-route regression re-run")
})
```

### Dimension findings

- Infra fit: PASS — `staff.ts` mounted via the append-only `routes/admin/index.ts` aggregator
  (confirmed 11 existing consumers, this becomes the 12th; the plan's own append-after-existing-11
  instruction matches the file's real current content exactly). All imports
  (`db`, `branches`/`users` from `db/schema/index`, `AdminApiError`/`handleAdminError` from
  `admin/lib/errors.ts`, `STAFF_ROLES` from `@jojopotato/types`) verified to exist with the exact
  names and shapes the plan's code block uses. `env.apiUrl` base-URL convention on the frontend
  side confirmed against `admin-rewards-api.ts`'s real fetch-wrapper pattern.
- Test coverage: PASS — all 7 API-level ACs (AC1–AC7) map 1:1 to a named test case in the
  `admin-staff.integration.test.ts` table, using the confirmed-real hermetic `require-admin.
  integration.test.ts` self-seeding fixture (no shared DB-state dependency). AC8 is correctly
  Agent-Probe — `apps/admin` has no E2E/browser runner (confirmed in `all-tests.md`), and this is
  the same standing residual class as every prior admin-dashboard phase (Phase 5/6), not new debt.
  No developed behavior in this plan rests on Known-Gap — every AC1–AC7 criterion has a real
  Fully-Automated proving test; net-gate vacuous-green rule is satisfied (see 08-validate §Net
  Gate Rule) since gap-resolution D is used only for the inherently-manual UI walkthrough AC, not
  as a substitute for an achievable automated gate.
- Breaking changes: PASS — zero modification to `packages/api/src/routes/admin/users.ts` (the
  role-change route), zero schema/migration change (`users.assignedBranchId` already exists,
  added by STAFF-001's migration 0003), zero change to any existing public or admin API contract.
  `Public Contracts` section is purely additive (2 brand-new endpoints). No downstream consumer of
  any touched shared file (`routes/admin/index.ts`, `routes/lib/serializers.ts`) is broken — both
  are append-only edits, confirmed against their real current content.
- Security surface: PASS, with one explicit reasoned finding on the high-risk-evidence-pack
  question (raised in the validation request) —
  1. **Guard order/status codes**: confirmed internally consistent with `AdminApiError`/
     `handleAdminError` conventions used by every other admin route (`branches.ts`, `rewards.ts`,
     `offers.ts`, `promotions.ts`). 404-for-missing-target-by-path-param then 400-for-business-rule
     violations is the same ordering used elsewhere in this codebase.
     "Malformed `:id` (non-uuid) naturally 404s" is not just asserted — it is **empirically
     confirmed** against 3 live precedents: `admin-offers.integration.test.ts:505-508`,
     `admin-promotions.integration.test.ts:182-184`, and `admin-rewards.integration.test.ts:671-676`
     all pass a non-uuid string to an `eq()`-by-id lookup and assert a clean 404, not a 500. The
     plan's claim is verified true, not a guess.
  2. **Role-change client gate is cosmetic, server is authoritative**: confirmed — `users.ts` is
     listed as untouched in Touchpoints, is NOT in the Backend Implementation section, and the
     frontend's `postStaffRole` hits `/api/admin/users/:id/role` (the existing route's real path)
     unmodified. `useAdminAuth().role === 'super_admin'` gates only which UI control renders; the
     server's existing `req.adminSession!.role !== 'super_admin'` 403 check
     (`users.ts:57-59`) and self-escalation guard (`users.ts:62-64`) are the real boundary and are
     byte-unchanged. No new server-side role check is introduced anywhere in this plan.
  3. **Non-staff (customer) target rejection**: confirmed — guard step 3
     (`target.role === 'customer'` → 400) runs before any branch lookup or write; the
     integration-test table explicitly covers this (AC5) with a "no row mutation" assertion.
  4. **Self-escalation on the role route stays server-blocked**: confirmed unchanged (route
     untouched). The NEW branch-assignment route has no analogous self-escalation risk to guard —
     `assignedBranchId` is inert metadata for `admin`/`super_admin` targets (bypassed by
     `assertBranchScope` regardless of value) and only meaningfully affects `staff`-role accounts,
     none of whom can ever be the calling admin (the `requireAdmin` guard only admits
     `admin`/`super_admin` callers, never `staff`) — so a caller can never affect their OWN staff
     branch scope through this route. No guard is missing here; none is needed.
  5. **High-risk 5-artifact evidence pack — WAIVED, with reasoning**: `users.assignedBranchId` does
     feed `assertBranchScope`'s authorization decision in the `(staff)` mobile app, which makes this
     adjacent to (but not squarely inside) the "auth or identity" high-risk class defined in
     `vc-risk-evidence-pack`. Judged WAIVED for three independent reasons: (a) the write path is
     gated by the SAME, already-hardened `requireAdmin` guard used by 11 prior admin-CRUD
     consumers — no new authorization mechanism, no new session/token/identity-resolution logic is
     introduced; (b) `assertBranchScope`/`resolveBranchScope` themselves (the actual
     authorization-decision code) are completely untouched by this plan — this plan only writes a
     value that feed those pre-existing, already-reviewed functions, it does not change how they
     decide; (c) matches this program's own established precedent — Branches CRUD (Phase 2, toggles
     `is_accepting_pickup`, also authorization-adjacent), Rewards CRUD (Phase 5, money-adjacent),
     and Orders View (Phase 6, PII-adjacent) none required the evidence pack, and each was judged on
     the same "reuses an existing guard, doesn't introduce a new mechanism" basis. The pack is
     reserved for genuinely NEW auth/identity/billing/migration/deploy mechanisms — this plan
     introduces none. Documented explicitly here so this reasoning is auditable, not implicit.
- Section — Backend routes (`staff.ts` + `index.ts` + `serializers.ts`): PASS. Mechanical
  feasibility: all referenced imports, schema field names, and existing-file append points verified
  against real source (see Infra fit above). Gaps found: none beyond the `name` field noted below
  (captured as Execute-Agent Instruction E1, not a blocking gap). Conflicts found: none — the new
  route file, aggregator line, and serializer block are all pure additions with no edit to existing
  logic. Highest-risk edit + mitigation: the `PATCH .../branch` write itself (the only mutation in
  this plan) — mitigated by the locked 6-step guard order (Zod → target lookup → role check →
  null-shortcut → branch-active check → write), matching this codebase's established
  validate-before-write discipline, and by AC2–AC5's explicit "no row mutation on rejection"
  test assertions.
- Section — Backend tests (`admin-staff.integration.test.ts`): PASS. Confirmed the cited hermetic
  self-seeding fixture (`require-admin.integration.test.ts`'s `signUpAndGetCookie` +
  inline-env-bootstrap pattern) exists and is reusable without a shared-DB-state dependency,
  matching the plan's own "reuse, don't reinvent" instruction. All 7 API ACs have a named,
  mapped test case.
- Section — Frontend (api/hooks/components/routes/nav-config): CONCERN — **finding not raised by
  the validation request, found independently**: the SPEC's own Flow diagram ("Table: name/email |
  role | assigned branch") and User Story 1 ("see... name/email") both frame the list column as
  name-and-email, but the plan's `AdminStaffSummary`/`AdminStaffMember` shapes and `staff-list.tsx`
  column spec only carry/render `email` — `users.name` (a real, `NOT NULL` column, already selected
  in `staff.ts`'s existing `GET /me` precedent style) is never read. Low severity — does not block
  AC1–AC7 (none require `name`) and does not block AC8's core walkthrough (the screen still shows
  who's who via email), but it is a real, cheap-to-close gap against the SPEC's own stated framing.
  **Resolution: Execute-Agent Instruction E1** (added inline above, in Section 6 and the
  Implementation Checklist) — add `name` alongside `email` in the two DB selects, both TS
  interfaces, and the serializer, and render it in the first table column. Same-shaped,
  zero-risk addition; does not change any Public Contract's error/status behavior. Everything
  else in this section (TanStack `<Outlet/>` layout/index split, `env.apiUrl` base-URL fetch
  convention, `AdminBranch.isActive` field reference, `order-filter-bar.tsx` `<select>` styling
  reuse, `useAdminAuth().role` gate) is mechanically confirmed correct against real source.
- Section — UX narrowing sign-off (role `<select>` omits `customer`): CONCERN, sign-off given.
  This was flagged for explicit review in the validation request. Verdict: the narrowing is a
  REASONABLE, deliberate product decision, not a defect — see the new Locked Decision **D4** added
  above (promoted from an implementation-note aside to a first-class locked decision, per
  **Execute-Agent Instruction E2**: EXECUTE must carry D4's rationale into the phase report
  verbatim, and the AC8 manual-walkthrough checklist item (Implementation Checklist §13) must
  explicitly confirm the absence of a `customer` option is expected, not a bug found during QA).
  No plan-text edits were needed to resolve the substance here (D4 already added) — only the
  Execute-Agent Instruction to make sure it survives into EXECUTE's own documentation.

**Totals: 0 FAILs / 2 CONCERNs (both resolved via Execute-Agent Instructions E1/E2, no unresolved
severity) / 6 PASSes (4 Layer 1 dimensions + 2 fully-clean Layer 2 sections)**

→ **Net Gate: CONDITIONAL** — 0 FAILs, 2 CONCERNs, both closed by Execute-Agent Instructions
(E1: add `name` field; E2: document D4's UX-narrowing rationale in the phase report). Proceed to
EXECUTE with both instructions carried forward; no return to PLAN needed, no plan re-scoping
required.

### Execute-Agent Instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Add a `name: string` field (from `users.name`, `NOT NULL`) alongside `email` in: the two DB selects in `staff.ts` (`GET /` and the post-write reselect in `PATCH /:id/branch`), `AdminStaffSummary` (`serializers.ts`), `AdminStaffMember` (`admin-staff-api.ts`), and `serializeAdminStaffSummary`'s input/output. Render it in `staff-list.tsx`'s first column (e.g. `"{r.name} <{r.email}>"` or a two-line cell) so the screen matches the SPEC's own "name/email" column framing. | Section 3 (serializers), Section 1 (`staff.ts`), Section 4 (`admin-staff-api.ts`), Section 6 (`staff-list.tsx`) entries |
| E2 | Carry Locked Decision D4's rationale (role `<select>` intentionally excludes `customer`) verbatim into the EXECUTE phase report, and when performing the AC8 manual walkthrough (Implementation Checklist §13), explicitly confirm the absent `customer` option is expected behavior, not a defect to report. | Section 6 (`staff-list.tsx` role-select entry), Implementation Checklist §13 (AC8 walkthrough) |

### Backlog artifacts

None — no gap in this plan needs deferral to a separate backlog note; both findings are resolved
inline via Execute-Agent Instructions above.

### Open gaps

None unresolved. (AC8's Agent-Probe walkthrough is a standing, already-tracked residual — not a
new gap introduced by this plan.)

### What this coverage does NOT prove

- `admin-staff.integration.test.ts` (AC1–AC6): proves the API contract's shape, status codes, and
  DB-mutation/non-mutation behavior under a hermetic test-seeded dataset. Does NOT prove: real
  browser-rendered list/table behavior, react-query cache invalidation timing as observed on
  screen, or the role `<select>`'s actual rendered option list in a live browser (that is AC8's
  job).
- `require-admin.integration.test.ts` re-run (AC7): proves the existing role-route's server-side
  behavior is byte-unchanged. Does NOT prove the NEW Staff screen's role-control UI correctly wires
  into that route end-to-end in a browser (that is also AC8's job — this plan's first-ever UI
  consumer of that route is Agent-Probe-verified only, not automated).
- `pnpm --filter @jojopotato/admin test`/`typecheck`/`build` (frontend gates): prove the new
  components compile, type-check, and render without throwing in the `apps/admin` vitest/jsdom
  environment. Do NOT prove real click-through behavior, real network round-trips against a live
  API, or visual/layout correctness — `apps/admin`'s jsdom-based vitest cannot substitute for a
  real browser (documented standing fact in `all-tests.md`).
- Manual admin-dashboard walkthrough (AC8): proves the screen works as observed by a human in one
  session, once. Does NOT provide regression protection against a future change silently breaking
  this flow — no E2E/browser-automation runner exists for `apps/admin` (standing project-wide gap,
  not new to this plan).

Gate: CONDITIONAL (0 FAILs, 2 CONCERNs — both resolved via Execute-Agent Instructions E1/E2 above,
no plan re-scoping required, no return to PLAN)
Accepted by: session — both CONCERNs are low-severity, additive/documentation-only findings with a
concrete, bounded Execute-Agent Instruction each; neither contradicts a Locked Decision, neither
touches the money/security/schema surface, and neither blocks any of AC1–AC7's Fully-Automated
proof. EXECUTE may proceed directly; a supplement/re-validate cycle is not required for concerns of
this class and severity.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/admin-dashboard/active/adm-009-staff-management_21-07-26/adm-009-staff-management_PLAN_21-07-26.md`
2. **Last completed phase or step:** VALIDATE complete (Gate: CONDITIONAL, see `## Validate Contract` above). SPEC already locked (same folder).
3. **Validate-contract status:** CONDITIONAL, written 21-07-26 — 2 concerns resolved via Execute-Agent Instructions E1/E2 (no plan re-scoping). Ready for EXECUTE.
4. **Supporting context files loaded:** `process/context/all-context.md`; `packages/api/src/routes/admin/{users,rewards,branches,offers,promotions,index}.ts`; `packages/api/src/routes/admin/lib/errors.ts`; `packages/api/src/routes/lib/serializers.ts`; `packages/api/src/lib/require-staff.ts`; `packages/api/src/routes/staff.ts` (GET /me join precedent); `packages/api/src/db/schema/{users,branches}.ts`; `packages/api/src/db/schema/index.ts`; `packages/types/src/staff.ts` / `src/index.ts`; `packages/api/src/lib/__tests__/require-admin.integration.test.ts`; `packages/api/src/routes/admin/__tests__/{admin-offers,admin-promotions,admin-rewards,admin-orders}.integration.test.ts` (malformed-uuid-404 precedent); `apps/admin/src/features/rewards/**`; `apps/admin/src/features/auth/hooks/use-admin-auth.ts`; `apps/admin/src/features/branches/hooks/use-admin-branches.ts`; `apps/admin/src/features/orders/components/order-filter-bar.tsx`; `apps/admin/src/config/nav-config.ts`; `apps/admin/src/config/env.ts`; `apps/admin/src/routes/(dashboard)/{rewards,orders}{.tsx,.index.tsx}`; `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent:** ENTER EXECUTE MODE against this plan. Implement section-by-section per the Touchpoints table (backend routes → serializer → aggregator mount → backend tests → frontend lib/hook → frontend components → routes → nav-config), applying Execute-Agent Instructions E1 (name field) and E2 (D4 documentation) inline as each relevant section is built, running the relevant test gate after each section. After EXECUTE, run the EVL confirmation pass (independent vc-tester re-run of the Test Gate Commands), then route to UPDATE PROCESS. AC8's manual walkthrough remains owed by the user before this plan can move from `active/` to `completed/` (VERIFIED).

## Autonomous Goal Block

```
SESSION GOAL: ADM-009 — Staff Management: Branch Assignment + Role Admin Surface (issue #124)
Charter + umbrella plan: N/A — single standalone plan (not a phase program; explicitly does not
  resume the completed 8-phase admin-dashboard_14-07-26 umbrella)
Autonomy: standard /goal autonomous execution rules — CONDITIONAL gates auto-accepted when concerns
  are low-severity and resolved via Execute-Agent Instructions (this plan's case); BLOCKED items go
  to backlog + continue; irreversible/outward-facing actions without explicit contract instruction
  are a hard stop.
Hard stop conditions / safety constraints:
- Never modify `packages/api/src/routes/admin/users.ts` (the role-change route) — it is reused
  byte-for-byte per Locked Decision D3 and the SPEC's own Constraints section.
- Never widen `PATCH /api/admin/staff/:id/branch` to skip the "target must be staff-level" (non-
  customer) rejection, or the "branch must exist AND be active" check — both are explicit,
  test-covered AC4/AC5 requirements.
- Never add a `customer` option to the role `<select>` in `staff-list.tsx` without re-opening
  Locked Decision D4 with the user first.
- Never introduce a new authorization/session mechanism — this plan reuses the existing
  `requireAdmin` guard only (12th consumer of the append-only aggregator).
Next phase: EXECUTE: process/features/admin-dashboard/active/adm-009-staff-management_21-07-26/adm-009-staff-management_PLAN_21-07-26.md
Validate contract: inline in plan (see `## Validate Contract` section, this file)
Execute start: fully-auto commands: `pnpm --filter @jojopotato/api test`, `pnpm --filter @jojopotato/api typecheck`, `pnpm --filter @jojopotato/admin test`, `pnpm --filter @jojopotato/admin typecheck`, `pnpm --filter @jojopotato/admin build`, `pnpm format:check` | e2e spec: none (no `apps/admin` E2E runner) | probe scenario: AC8 manual admin-dashboard walkthrough (Staff nav entry, list render, branch assign/reassign/clear, super_admin-only role control, confirm D4's customer-omission is expected not a bug) | high-risk pack: no (WAIVED — see Validate Contract → Security surface reasoning)
```
