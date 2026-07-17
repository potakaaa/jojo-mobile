---
name: plan:admin-dashboard-umbrella
description: "Jojo Potato Admin Dashboard — umbrella/orchestration plan for the 8-phase program (P0 scaffold + ADM-001..007)"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: umbrella
---

# Jojo Potato Admin Dashboard — Umbrella Plan

**Date:** 14-07-26
**Complexity:** COMPLEX
**Status:** ✅ COMPLETE (8/8 phases VERIFIED, 17-07-26)

Date: 14-07-26
Status: ✅ COMPLETE — all 8 phases VERIFIED (Phased Delivery Plan — 8 phases, see Phase Map below).
Program's scoped Definition of Done (Program Goal Charter, above) is met. The inserted ADM-008
Coupons + Fix 6 sub-program remains CODE-COMPLETE, held OPEN in `active/` per standing user
decision (not part of the 8-phase numbering — see Current Execution State for the archival
decision flagged for the user).

- Program type: PHASE PROGRAM (8 phases, sequential with gated joins; HYBRID build strategy)
- Date: 14-07-26
- Feature folder: `process/features/admin-dashboard/`
- This is the UMBRELLA plan only. Per-phase plan files (`phase-00-scaffold_PLAN_14-07-26.md` through
  `phase-07-analytics_PLAN_14-07-26.md`) are created in a SEPARATE pass, flat in this same task
  folder (`process/features/admin-dashboard/active/admin-dashboard_14-07-26/`).

---

## Overview

Jojo Potato currently has zero back-office tooling — branches, products, deals, and rewards are all
hand-seeded via SQL/scripts. This program builds **`apps/admin`**, a new web app (TanStack Start +
Tailwind + shadcn/ui, React Query for data) that lets staff-with-elevated-privilege (`admin` /
`super_admin` roles) manage the catalog and see orders/analytics. It is **distinct from the existing
mobile `(staff)` shell** (STAFF-001, `apps/mobile/src/app/(staff)/`), which is a branch-scoped,
read-mostly view for on-the-ground `staff` role users. The admin dashboard is a full CRUD backoffice
for `admin`/`super_admin` roles, reachable only from a browser.

The backend is the EXISTING Express API (`packages/api` — Express 5 + Drizzle + Postgres +
better-auth). No second DB layer, no second auth provider, no second backend. The admin app is a new
HTTP client of the same API, following the exact `requireStaff` guard pattern already established at
`packages/api/src/lib/require-staff.ts:55-80` and mounted the same way orders/staff routers are
mounted at `packages/api/src/index.ts:51`.

---

## Program Goal Charter

```
Jojo Potato Admin Dashboard — Program Goal Charter

North star:
- Give admin/super_admin users a working web back-office (apps/admin) to manage branches,
  products/categories/options, deals, and rewards, and to view orders and basic analytics — backed
  entirely by the existing packages/api Express service, with zero duplicate data/auth layers and
  zero risk to the historical-integrity invariants (order line-item price snapshots, star ledger
  retroactivity) that the mobile ordering flow already depends on.

Definition of done (an unattended agent must be able to do all of these):
1. Log in to apps/admin as an admin or super_admin user via a real browser cookie session against
   the existing better-auth instance (not the Expo bearer-token flow) and reach a role-gated
   dashboard shell; a customer or plain-staff user is rejected server-side.
2. As super_admin, promote/demote another user's role via a dedicated route + UI; as admin, the same
   role-management route/UI is not exposed and role-escalation attempts (including self-escalation)
   are rejected server-side regardless of client trust.
3. Fully create/read/update/(soft-)delete branches, products, categories, product options,
   branch-product-availability rows, deals (incl. deal_products/deal_branches), and rewards through
   real `/api/admin/*` routes and real apps/admin screens — no mocked data survives to program end.
4. View orders filtered by branch/status/date (read-only, no status mutation) and see basic
   analytics (orders/branch, AOV, deals-vs-no-deals, repeat-purchase rate, stars issued, rewards
   redeemed) over a selectable time range.
5. Prove, via automated regression tests, that editing a product's base_price never changes
   historical order_items.unit_price, and that editing a reward's required_stars never rewrites
   historical star_transactions.

What "verified" means (program level):
- Each phase's own validate-contract gates (fully-automated + hybrid tiers green, agent-probe
  judgments recorded) PLUS a regression check against every earlier phase's blast radius that this
  phase's blast radius overlaps. A phase without a validate-contract (or a documented, accepted skip
  reason) cannot be marked ✅ VERIFIED. The two named hard invariants (snapshot integrity,
  reward-retroactivity) each require a real regression test, not a manual judgment call — Known-Gap
  is never acceptable for these two.

Scope tiers → phase mapping:
- Tier 0 Foundation (scaffold + auth) → Phases 0, 1
- Tier 1 Core catalog CRUD → Phases 2, 3, 4, 5
- Tier 2 Operational visibility → Phases 6, 7
- This program retires Tiers 0-2.

Explicitly out of scope (deferred tier):
- Tier 3 (deferred): Customers module (PRD §6.14/§19 — view/search customer accounts, manual
  star/reward adjustments). No GitHub issue assigned yet. Candidate ADM-008 — decide near program
  end whether it belongs to this program or a follow-on one.
- Also deferred: coupon-cascade behavior when a deal with outstanding coupons is deactivated (flagged
  inside the Phase 4/ADM-004 plan, not resolved at umbrella level); a live SMS/OAuth production
  credential story (pre-existing repo-wide open question, unrelated to this program); EAS/deploy
  wiring for apps/admin (out of scope — this program builds the app, not its deploy pipeline).

Hard safety constraints (non-negotiable, per phase):
- NEVER let admin CRUD write to `order_items` (unit_price/total_price are point-in-time snapshots at
  order placement) or rewrite/backfill historical `star_transactions` rows. Editing a product's price
  or a reward's required_stars must only affect FUTURE reads/writes.
- `role` stays server-owned (`input: false` in better-auth config) for both the existing customer/staff
  fields and any new admin role-management route — never trust a client-supplied role value.
- An admin/super_admin actor must never be able to grant itself a higher role (self-escalation guard,
  server-side, unconditional) — see Phase 1 (ADM-001) hard gate.
- Every `/api/admin/*` route requires server-side `requireAdmin` (or stricter) authorization; there is
  no client-only gate anywhere in this program.
- Prefer soft-delete (`is_active` toggle) over hard-delete for any table that already has an
  `is_active` column, to avoid orphaning historical order/deal references.
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context
  commits separate from execution commits.
```

---

## Cross-Cutting Principles (per-phase hard gates)

Every phase plan (P0-P7) MUST include an explicit subsection — e.g. `## Cross-Cutting Compliance` —
showing how that phase satisfies all five of these. A phase plan without this subsection is
incomplete and must be sent back to PLAN.

1. **Modularity** — one independent module per admin domain.
   - API side: one route file per domain under `packages/api/src/routes/admin/` (e.g.
     `admin/branches.ts`, `admin/products.ts`, `admin/deals.ts`, `admin/rewards.ts`,
     `admin/orders.ts`, `admin/analytics.ts`, `admin/users.ts`), mirroring the existing
     `staffRouter` convention (`packages/api/src/index.ts:51` mounts `staffRouter` once behind
     `requireStaff`; the admin mount point mounts one `adminRouter` behind `requireAdmin`, with each
     domain as its own sub-router or route group inside it).
   - App side: one feature folder per domain under `apps/admin/src/features/{domain}/` (branches,
     products, deals, rewards, orders, analytics, users/roles).
   - A shared admin core prevents copy-paste duplication across domains: the `requireAdmin` guard
     itself, a common error envelope (mirroring `OrderError` at `packages/api/src/routes/orders.ts:39`),
     shared Zod validation helpers, and the shared serializer money-conversion helpers
     (`numericToCents`/`centsToNumeric`, `packages/api/src/routes/lib/serializers.ts:105-107`) are
     written ONCE and imported by every domain route, not re-implemented per domain.

2. **Clarity** — new code matches existing house conventions, not a new style.
   - Zod `safeParse` request validation (existing pattern in `routes/orders.ts`, `routes/branches.ts`).
   - Response envelopes: `{ resource: ... }` for singular reads/writes, `{ resources: [...] }` for
     list reads — same shape family already used by `branches.ts`/`orders.ts`/`staff.ts` routes.
   - Typed errors mirroring `OrderError` (`orders.ts:39-47`) — one error class per domain or one
     shared `AdminApiError`, never bare `throw new Error(...)`.
   - Serializer pattern: DB row → API shape conversion lives in `routes/lib/serializers.ts`-style
     helper files, not inlined in route handlers.
   - Naming: kebab-case files, camelCase functions/vars, PascalCase components (repo-wide convention,
     `process/context/all-context.md` §Key Patterns).
   - A reviewer who knows `packages/api`/`apps/mobile` today should be able to read `apps/admin` /
     `packages/api/src/routes/admin/*` without learning a new house style.

3. **Safety** — every destructive/irreversible admin action gets an explicit guardrail.
   - Deletes: prefer the existing `is_active` boolean toggle (soft-delete) over `DELETE` SQL wherever
     the table already has that column (branches, products, deals, rewards all plausibly do — confirm
     per-phase during RESEARCH). Hard-delete is reserved for rows with zero historical references and
     must be called out explicitly in that phase's plan if used.
   - Price edits, availability toggles, and deal activation/deactivation are logically destructive to
     *future* behavior even when the row isn't deleted — each such mutation route needs a
     confirmation step in the UI and must be traceable (the response envelope should let the UI show
     "what changed" without needing a separate audit log table, unless a phase's RESEARCH finds this
     insufficient — flag as an open question if so).
   - The two named HARD invariants are non-negotiable and testable, not just "best effort":
     `order_items.unit_price`/`total_price` snapshot integrity (product price changes never mutate
     historical orders) and `star_transactions` retroactivity (reward `required_stars` changes never
     rewrite historical star ledger rows). Each gets a dedicated regression test in its owning phase
     (P3 for snapshot integrity, P5 for retroactivity) — Known-Gap is banned for these two.

4. **Security** — server-side authorization on every admin route, always.
   - Every `/api/admin/*` route is behind `requireAdmin(auth)` at the router-mount level (same pattern
     as `app.use('/api/staff', requireStaff(auth), staffRouter)` at `index.ts:51`) — new admin routes
     inherit the guard automatically by being added to the admin router, never by re-checking role
     inline per-handler.
   - `role` remains server-owned (`input: false`) — this applies to both existing better-auth fields
     and any NEW admin-role-management route in Phase 1; the route itself is the only sanctioned
     write path for `role`, and it enforces the self-escalation guard (an actor cannot elevate its
     own role) and the admin-vs-super_admin distinction (admin cannot promote/demote; only
     super_admin can).
   - All admin route inputs are validated server-side with Zod — a rejected client-side validation
     must never be trusted as the only gate.
   - CORS/`trustedOrigins` in better-auth must be extended deliberately for the new admin web origin
     (Phase 1) — never wildcarded.

5. **UI component modularity & reusability** — admin screens are composed from a shared component
   kit, never one-off per-screen markup.
   - `packages/ui` is React Native (mobile) only and is NOT reused here (locked decision) — the admin
     UI kit is **shadcn/ui primitives** (Button, Input, Dialog, Table, Select, etc.) generated into
     `apps/admin/src/components/ui/` in Phase 0, plus a thin set of admin-specific composites built on
     top of them. Do not hand-roll a Button/Input/Dialog when shadcn already provides it.
   - Every admin domain (branches, products, deals, rewards, orders, analytics, users) reuses the SAME
     cross-domain composites instead of re-implementing them per feature. The recurring CRUD shapes —
     a resource list/table, a create/edit form dialog, a delete/deactivate confirmation, empty/loading/
     error states, a page header with primary action — are written ONCE as shared composites (e.g.
     `components/data-table.tsx`, `components/form-dialog.tsx`, `components/confirm-dialog.tsx`,
     `components/page-header.tsx`, `components/query-states.tsx`) and consumed by every
     `features/{domain}/` screen. Phase 2 (branches, the full vertical slice) is the phase that FIRST
     extracts these composites; P3-P7 reuse them and only add genuinely domain-specific pieces.
   - Reuse test (the "second consumer" rule): a component earns a place in the shared kit when a second
     domain needs it. Phase 2 builds branches concretely; when Phase 3 (products) would copy-paste a
     branches component, that component is promoted to `components/` instead of duplicated. A phase
     plan that re-implements an existing shared composite instead of importing it is incomplete and
     goes back to PLAN.
   - Design tokens (colors/spacing/radii ported from `theme.ts` into Tailwind `@theme` in Phase 0) are
     the single source of styling truth — components consume tokens, never hardcode hex/px that
     duplicates a token (mirrors the mobile-side "never hardcode colors/spacing that duplicate
     theme.ts" rule in `process/context/all-context.md`).
   - **Brand/visual-identity fidelity (integrate, don't reinvent):** the admin dashboard must look like
     it belongs to Jojo Potato, not like a stock shadcn/zinc template. The existing mobile app's visual
     identity — the brand palette (`theme.ts` `Palette`: cream/ink/jyellow/jred/jorange/jgold/jbrown),
     the brand radii, the comic hard-shadow look, and the Fredoka/Jakarta type family — is the source
     of truth. Concretely: Phase 0 maps the ported brand tokens onto shadcn/ui's SEMANTIC token slots
     (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`,
     `--radius`, etc.) so every shadcn primitive renders on-brand by default, rather than each screen
     re-skinning components ad hoc. A screen that overrides a primitive's color inline to "fix" its look
     is a signal the semantic mapping is wrong — fix the mapping in P0's token layer, not per-screen.
     Where the admin's information density genuinely differs from the mobile app (dense data tables vs.
     touch-first cards), adapt spacing/scale for web — but stay within the same palette and token
     vocabulary; do not introduce a parallel color set.
   - `ponytail:` discipline still applies — don't build a composite before its second consumer exists.
     The kit grows by extraction when duplication actually appears, not speculatively up front. P0 only
     scaffolds the shadcn primitives; the cross-domain composites are extracted starting in P2.

---

## Locked Architecture Decisions

- **New app:** `apps/admin/` (package `@jojopotato/admin`), currently empty — created fresh in Phase 0.
- **Stack:** TanStack Start + Tailwind CSS + shadcn/ui for the UI; `@tanstack/react-query` for all
  server-state data fetching (same library `apps/mobile` already adopted for menu/branch data — see
  `process/context/all-context.md` "Menu/branch data layer superseded" — but a SEPARATE query client
  instance, since `apps/admin` is a different app/runtime).
- **Backend:** the EXISTING `packages/api` Express 5 + Drizzle + Postgres + better-auth service.
  `apps/admin` is an HTTP client of it, same as `apps/mobile`. No new database, no new auth provider,
  no new backend service. New surface = `requireAdmin` middleware + `/api/admin/*` routes added
  inside `packages/api`.
- **Package reuse:** `packages/types` and `packages/utils` are reused directly (money-cents
  conventions, shared domain types — extend with `packages/types/src/admin.ts` mirroring the existing
  `packages/types/src/staff.ts` shape). `packages/api` is reused as the one backend.
  `packages/ui` (React Native components) is **NOT** reused — it is RN-only and cannot render in a
  web/TanStack Start app. Design tokens are ported from `packages/ui/src/theme.ts` into Tailwind
  config/CSS variables (brand colors, the comic hard-shadow `box-shadow: 4px 4px 0 #1C1714`, and the
  two brand fonts — Fredoka for display, Plus Jakarta Sans for body).
- **Build strategy:** HYBRID. Phase 1 (auth) is built for real end-to-end. Phase 2 (branches) is
  built as a FULL real vertical slice (real API + real screen + real DB) to prove the whole stack
  works end-to-end once. Phases 3-7 (products, deals, rewards, orders, analytics) are then reassessed
  per-domain during their own RESEARCH step — each may still turn out to need its own nuance (e.g.
  deals' date-range validation, orders' PII boundary) rather than being a mechanical copy of Phase 2's
  shape.
- **Existing code this program builds on (cited `file:line`):**
  - `packages/api/src/lib/require-staff.ts:55-80` — `requireStaff(auth)` middleware pattern to mirror
    for `requireAdmin(auth)`.
  - `packages/api/src/index.ts:51` — `app.use('/api/staff', requireStaff(auth), staffRouter)` mount
    pattern to mirror for `/api/admin`.
  - `packages/api/src/routes/lib/serializers.ts:105-107` — `numericToCents`/decimal-to-cents money
    conversion helpers to reuse, not reimplement.
  - `packages/api/src/routes/orders.ts:39-47` — `OrderError` typed-error pattern to mirror for admin
    routes.
  - `packages/api/src/db/schema/users.ts:4,34` — `userRoleEnum` (`customer | staff | admin |
    super_admin`) already includes `admin`/`super_admin`; no schema migration needed to add the
    roles themselves, only to add role-management route/UI and (from STAFF-001) the
    `TODO(STAFF-ADM)` bypass seam at `require-staff.ts:65-67,103` that Phase 1 should resolve.

---

## Phase Map

| Phase | Issue | Priority | Scope one-liner | Blast radius (packages/files) | Depends on | Biggest risk |
|---|---|---|---|---|---|---|
| P0 — Scaffold ✅ VERIFIED | — (infra) | P0 | Create `apps/admin` (TanStack Start + Tailwind + shadcn), port theme tokens, wire tsconfig/eslint extends from `@jojopotato/config`, confirm turborepo build pipeline output dir, choose test runner (default: Vitest + `@testing-library/react`) | `apps/admin/**` (new), `turbo.json` (unchanged — dist/ matched existing glob), `pnpm-workspace.yaml` (already covers `apps/*`) | — | Build tooling drift vs. Expo app's tooling; turbo pipeline miscabling could silently exclude admin from `pnpm build`/CI — RESOLVED, no drift found |
| P1 — Auth/RBAC (ADM-001, #39) | #39 | P0 | `requireAdmin` middleware (sibling to `require-staff.ts:55-80`), mount `/api/admin`, extend better-auth `trustedOrigins` for admin web origin, add a **browser cookie session** flow (new to this repo — Expo only has bearer-token flow today), admin login + dashboard-landing screens, `packages/types/src/admin.ts`, resolve `TODO(STAFF-ADM)` seam, role-management route+UI (super_admin only; self-escalation guard) | `packages/api/src/lib/require-admin.ts` (new), `packages/api/src/lib/auth.ts` (trustedOrigins), `packages/api/src/index.ts` (mount), `packages/api/src/routes/admin/**` (new: users/roles), `packages/types/src/admin.ts` (new), `apps/admin/src/features/auth/**` (new) | P0 | Cookie-session-for-web is UNPROVEN in this repo — **Phase 1's first step is a feasibility probe** of better-auth cookie sessions against a browser client before committing to the design; getting this wrong reshapes every later phase's auth plumbing |
| P2 — Branches CRUD (ADM-002, #40) ✅ VERIFIED | #40 | P0 | Full vertical slice: branch list/detail/create/edit/(soft-)delete via real `/api/admin/branches` + real `apps/admin` screens + real Postgres rows; slug uniqueness enforced | `packages/api/src/routes/admin/branches.ts` (new), `apps/admin/src/features/branches/**` (new) | P1 | `is_accepting_pickup` is shared mutable state with the mobile staff shell (STAFF-004, not yet built) — must establish single-source-of-truth semantics now, or admin and staff writes could race/conflict later. RESOLVED-as-Known-Gap: no optimistic-concurrency guard exists; last-write-wins accepted, blocked on STAFF-004 (backlog note filed). |
| P3 — Products/Categories CRUD (ADM-003, #41) ✅ VERIFIED | #41 | P0 | CRUD for products, categories, product_options, branch_product_availability; money boundary conversion (decimal PHP in DB ↔ cents in API/UI) | `packages/api/src/routes/admin/products.ts`, `admin/categories.ts` (new), `apps/admin/src/features/products/**`, `features/categories/**` (new) | P2 (reuses branch-scoping patterns) | Snapshot-integrity regression is a HARD invariant — editing `base_price` must be proven NOT to mutate historical `order_items.unit_price`; this is the highest-stakes correctness bar in the whole program. RESOLVED: real passing automated regression test (AC1), Known-Gap never used. |
| P4 — Deals CRUD (ADM-004, #42) | #42 | P0 | CRUD for deals + deal_products/deal_branches join tables; 6 deal types (enum); `end_at > start_at` app-level validation | `packages/api/src/routes/admin/deals.ts` (new), `apps/admin/src/features/deals/**` (new) | P2, P3 (deals reference branches + products) | Coupon-cascade behavior when a deal with outstanding coupons is deactivated is an OPEN QUESTION — must be explicitly flagged (not silently decided) in the P4 phase plan |
| P5 — Rewards CRUD (ADM-005, #43) | #43 | P1 | CRUD for rewards; `reward_type` is free-text varchar (no enum) — validate allowed values app-side | `packages/api/src/routes/admin/rewards.ts` (new), `apps/admin/src/features/rewards/**` (new) | P0, P1 (no direct dependency on P2-P4 catalog data) | Retroactivity regression is a HARD invariant — editing `required_stars` must be proven NOT to rewrite historical `star_transactions`; second of the two program-level non-negotiable invariants |
| P6 — Orders view (ADM-006, #44) ✅ VERIFIED | #44 | P1 | Read-only order list per branch; filter by branch/status/date; NO status mutation in this program | `packages/api/src/routes/admin/orders.ts` (new, read-only), `apps/admin/src/features/orders/**` (new) | P2 (branch filter needs branch list) | Customer-PII exposure boundary — orders carry customer name/contact; needs an explicit design note contrasting this against the existing §19 staff-role restriction pattern, not an ad-hoc call during EXECUTE. RESOLVED: D2 locked (name+phone only), proven by an automated field-shape test (AC6), no ad-hoc EXECUTE decision. |
| P7 — Analytics (ADM-007, #45) ✅ VERIFIED | #45 | P2 | Basic analytics: 8 KPIs — orders/branch, AOV, deals-vs-no-deals split, repeat-purchase rate, stars earned, rewards unlocked/redeemed, top-selling products, new-vs-returning — time-range filterable | `packages/api/src/routes/admin/analytics.ts` (new, aggregation queries), `apps/admin/src/features/analytics/**` (new) | P3, P4, P5, P6 (aggregates across products/deals/rewards/orders) | Least-precedented phase — RESOLVED: real passing Fully-Automated exact-value fixtures for all money-adjacent ACs (AC2/AC3/AC6/AC11), Known-Gap never used; 2 correctness ambiguities (newVsReturning status-filter consistency, D1 double-signal dedup) found at PVL and fixed via Execute-Agent Instructions E1/E2 before EXECUTE completed |

---

## Phase Ordering

| Order | Phase | Depends on | Status |
|---|---|---|---|
| 0 | P0 — Scaffold | — | ✅ VERIFIED |
| 1 | P1 — Auth/RBAC (ADM-001) | P0 | ✅ VERIFIED |
| 2 | P2 — Branches CRUD (ADM-002) | P1 | ✅ VERIFIED |
| 3 | P3 — Products/Categories CRUD (ADM-003) | P2 | ✅ VERIFIED |
| 4 | P4a — Deals-as-Products (ADM-004 RE-PLAN) | P2, P3 | ✅ VERIFIED (merged PR #92, `fedcfcb`) |
| — | ADM-008 Coupons + Fix 6 (sub-program, inserted between P4 and P5, not phase-numbered) | P4a | CODE-COMPLETE, EVL-green, USER-REVIEWED — held OPEN in `active/` |
| 5 | P5 — Rewards CRUD (ADM-005) | P0, P1 | ✅ VERIFIED (merged via PR #112, commit `772e2fd`) |
| 6 | P6 — Orders view (ADM-006) | P2 | ✅ VERIFIED (commit `7bb0918`, `feat/adm-006-branchview`, user-run UI walkthrough passed) |
| 7 | P7 — Analytics (ADM-007) | P3, P4, P5, P6 | ✅ VERIFIED (commit `ba88318`, `feat/adm-007-analytics`, 493/493 api + 72/72 admin, EVL-confirmed) |

No phase depends on a later phase's output — ordering verified by inspection (P4/P7 have the widest
fan-in but still only depend on strictly earlier phases).

**PROGRAM COMPLETE — 8/8 phases ✅ VERIFIED as of 17-07-26.**

---

## Program Status Table

| Phase | Status |
|---|---|
| P0 — Scaffold | ✅ VERIFIED |
| P1 — Auth/RBAC (ADM-001) | ✅ VERIFIED |
| P2 — Branches CRUD (ADM-002) | ✅ VERIFIED |
| P3 — Products/Categories CRUD (ADM-003) | ✅ VERIFIED |
| P4a — Deals-as-Products (ADM-004 RE-PLAN) | ✅ VERIFIED |
| ADM-008 Coupons + Fix 6 (sub-program) | CODE-COMPLETE (held OPEN) |
| P5 — Rewards CRUD (ADM-005) | ✅ VERIFIED |
| P6 — Orders view (ADM-006) | ✅ VERIFIED |
| P7 — Analytics (ADM-007) | ✅ VERIFIED |
| **PROGRAM (all 8 phases)** | **✅ COMPLETE** |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Global Constraints

- Never let admin CRUD write directly to `order_items` or rewrite historical `star_transactions` rows.
- Never widen `trustedOrigins`/CORS beyond the explicit admin web origin without user approval.
- `role` stays server-owned (`input: false`) everywhere — no phase may introduce a client-trusted role write.
- After every phase that touches harness/agent files, run the parity validator and confirm exit 0 before declaring the phase DONE.
- Commit each phase's execution changes before starting the next phase. Keep process/plan/context commits separate from execution commits.

---

## Durable Report Destinations

| Phase | Report path (inside task folder) |
|---|---|
| P0 — Scaffold | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-00-scaffold_REPORT_14-07-26.md` |
| P1 — Auth/RBAC | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_REPORT_14-07-26.md` |
| P2 — Branches CRUD | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_REPORT_14-07-26.md` |
| P3 — Products/Categories CRUD | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_REPORT_14-07-26.md` |
| P4 — Deals CRUD | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-04-deals_REPORT_14-07-26.md` |
| P5 — Rewards CRUD | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-05-rewards_REPORT_14-07-26.md` |
| P6 — Orders view | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-06-orders_REPORT_14-07-26.md` |
| P7 — Analytics | `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-07-analytics_REPORT_14-07-26.md` |

---

## Explicitly Deferred / Locked Scope Decisions

- **Customers module** (PRD §6.14/§19, no GitHub issue assigned): placed in the charter's
  OUT-OF-SCOPE tier as "decide near program end (candidate ADM-008)". Do not build it inside P0-P7.
- **Coupon-cascade on deal deactivation**: explicitly NOT resolved at the umbrella level — the P4
  (ADM-004) phase plan must carry this as a flagged open question with resolution options, not a
  silent default.
- **Snapshot integrity (P3) and reward retroactivity (P5)**: research already indicates both are
  structurally safe today (admin writes will target `products.base_price`/`rewards.required_stars`,
  never `order_items`/`star_transactions` directly) — but each phase's acceptance criteria REQUIRES a
  passing regression test proving it, not a code-review assertion. This is listed as a HARD SAFETY
  CONSTRAINT above, not merely an acceptance criterion, because it protects existing customer-facing
  order history.

---

## Current Execution State

Last updated: 17-07-26 (Phase 7 — Basic Analytics Dashboard, ADM-007; UPDATE PROCESS doc
  reconciliation pass; branch `feat/adm-007-analytics`, commit `ba88318`, source committed —
  process-only reconciliation this pass. **THIS PASS CLOSES THE ENTIRE 8-PHASE PROGRAM.**)
Completed phases (ALL 8 — PROGRAM COMPLETE): Phase 0 — Scaffold (✅ VERIFIED, 14-07-26); Phase 1
  — Auth/RBAC (✅ VERIFIED, 14-07-26); Phase 2 — Branches CRUD (✅ VERIFIED, 14-07-26); Phase 3 —
  Products/Categories CRUD (✅ VERIFIED, 15-07-26); Phase 4a — Deals-as-Products, ADM-004 RE-PLAN
  (✅ VERIFIED — MERGED via PR #92, commit `fedcfcb`); Phase 5 — Rewards Configuration CRUD,
  ADM-005 (✅ VERIFIED — MERGED via PR #112, commit `772e2fd`); Phase 6 — Orders View by Branch,
  ADM-006 (✅ VERIFIED, commit `7bb0918`); Phase 7 — Basic Analytics Dashboard, ADM-007
  (✅ VERIFIED, this pass — see below).
Completed cross-cutting tasks: Sidebar Navigation (✅ COMPLETE, 15-07-26)
Completed sub-program (inserted between P4 and P5, NOT part of the 8-phase numbering): ADM-008
  Coupons (Promotion→Offer→Coupon, 5 phases, CODE-COMPLETE + EVL-green, 16-07-26) plus its 6-item
  post-merge fix batch (6/6 COMPLETE, 17-07-26 — Fix 6 = `adm-008-free-mechanics_16-07-26`, the
  free_item/free_upgrade offer-coupon redemption-math program, USER-REVIEWED 17-07-26 via a
  5-artifact risk evidence pack). Shipped on `feat/deals_unification`, merged into `development`
  via PR #109 (merge commit `95e7aeb`). Held OPEN in `active/` (not archived) per standing
  decision — user has further follow-up exploration planned on the coupons domain. Full account:
  `process/context/all-context.md` (ADM-008 + Fix 6 bullets) — not duplicated here.
Current phase N of total: **8 of 8 — PROGRAM COMPLETE.** There is no next phase.
Phase N name: Phase 7 — Basic Analytics Dashboard (ADM-007, #45) — final phase.
Phase N status: ✅ VERIFIED (branch `feat/adm-007-analytics`, rooted at merged `development`
  which already includes Phase 6's merge; execution commit `ba88318`). D1-D9 decisions (locked
  17-07-26) were honored, with 5 PVL-found CONCERNs resolved via Execute-Agent Instructions
  E1-E5 during EXECUTE (2 substantive correctness fixes — newVsReturning status-filter
  consistency (E1), D1 double-signal dedup (E2) — plus 3 minor implementation-guidance/docs
  items). Delivered: `GET /api/admin/analytics?from=&to=[&branchId=]` — one combined read-only
  aggregation route returning all **8 KPIs** (ordersPerBranch, averageOrderValueCents,
  dealsSplit, repeatPurchaseRate, starsEarned, rewardsUnlocked, rewardsRedeemed,
  topSellingProducts, newVsReturning) — the **11th confirmed append-only `/api/admin` aggregator
  consumer**. Money computed in integer cents throughout (`numericToCents`, reused not
  reimplemented); Asia/Manila day-boundary date-range semantics (D3), documented as an
  intentional divergence from Phase 6's UTC-day convention (E5). Zero schema change, zero
  migration (latest remains `0016`). `apps/admin` gained `features/analytics/**` (fetch wrapper +
  hook + metric-card/time-range-picker/branch-orders-table/top-products-table components) + a
  single-screen `(dashboard)/analytics.tsx` route (no `<Outlet/>` split needed) + a new Analytics
  nav entry (no prior disabled placeholder existed).
Phase N EVL: independently confirmed green — API 493/493 (468 baseline + 25 new: 18
  `admin-analytics.integration.test.ts` + 7 `analytics-range` unit tests, 0 regressions), admin
  72/72 (58 baseline + 14 new component tests), both typechecks/build clean (analytics chunk
  emitted), `pnpm format:check` clean — matches execute-agent's own report exactly. Regression
  checkpoint against P1 (`requireAdmin` role matrix), P2 (branches — the branch-scoping source),
  P5 (rewards/stars source columns), and P6 (orders source columns/status enum) all re-run as
  part of the full 493/493 suite pass — no regression against any earlier phase surface. Money-
  adjacent gates (AC2 AOV, AC3 deals-split, AC6 stars/rewards, AC11 top-selling-products) are ALL
  real passing Fully-Automated fixtures — Known-Gap banned per the program charter and unused.
  AC9 (visual half) and AC10 (PII code-review scan) remain owed as Agent-Probe, user-run,
  non-blocking — the same standing project-wide `apps/admin` E2E-runner gap carried by every
  prior phase (P2 AC7, P3 AC8 partial, Phase 5 G10) — not new debt.
Phase N report: `phase-07-analytics_REPORT_17-07-26.md` (this pass).
Next phase: **NONE — the 8-phase program is complete.** The Program Goal Charter's Definition of
  Done (5 items, see above) is met: admin/super_admin login works end-to-end; role management is
  gated and self-escalation-proof; full CRUD exists for branches/products/categories/options/
  availability/deals/rewards with zero mocked data; orders are viewable filtered by
  branch/status/date; basic analytics (now 8 KPIs, exceeding the charter's original 6) are
  viewable over a selectable range; both HARD invariants (order_items snapshot integrity — P3
  AC1; star_transactions retroactivity — P5) have real passing regression tests, Known-Gap never
  used for either. Any further admin-dashboard work (the deferred Tier 3 Customers module, ADM-008
  coupons follow-up exploration, backlog items like offer-usage-limits/coupons-mutual-exclusivity
  follow-through) is a NEW scope, not a continuation of this program — scope it as a follow-up
  plan or feature-folder task, per the standing rule that a program reaching its scoped goal
  should not be stretched to cover open-ended future work.

**Archival decision flagged for the user (not auto-decided this pass):** all 8 phases are
✅ VERIFIED, so the core `admin-dashboard_14-07-26/` task folder is eligible to move from
`active/` to `completed/`. However, this task folder is ALSO the home of two sub-program task
folders held OPEN in `active/` per standing user decision — `adm-008-coupons_16-07-26/` (its own
task folder, not nested inside `admin-dashboard_14-07-26/`) and `adm-008-free-mechanics_16-07-26/`
(likewise its own folder) — both are SIBLING task folders under `process/features/admin-dashboard/
active/`, not literally inside `admin-dashboard_14-07-26/`, so moving the `admin-dashboard_14-07-26/`
folder to `completed/` does NOT physically disturb them. Recommendation: the
`admin-dashboard_14-07-26/` folder (umbrella + 8 phase plans/reports) is safe to archive to
`completed/` on its own; the ADM-008 folders should stay in `active/` until the user's follow-up
coupons exploration concludes. This UPDATE PROCESS pass does NOT perform the move — it is
recommend-only, per the standing rule that UPDATE PROCESS does not auto-archive without a
user-visible action.

**Phase 4a merge + ADM-008 + Fix 6 (free-mechanics) closeout summary (16→17-07-26, reconciled
this pass):** `feat/adm-004-deals` merged via PR #92 (commit `fedcfcb`) — Phase 4a now stands
✅ VERIFIED at the umbrella level (a prior Current Execution State snapshot incorrectly showed
"NOT YET MERGED"; corrected this pass). ADM-008 Coupons (Promotion→Offer→Coupon, 5-phase
sub-program) shipped CODE-COMPLETE + EVL-green via `feat/deals_unification` (superseding the
closed `feat/adm-008-coupons` PR); its 6-item post-merge fix batch reached 6/6 COMPLETE
17-07-26, closing with Fix 6 — a standalone COMPLEX plan (`adm-008-free-mechanics_16-07-26`)
that fixed a live money leak where `free_item`/`free_upgrade`/`buy_one_take_one`/`bundle` offer
mechanics all routed through the cheapest-eligible-line discount branch instead of real
redemption math (or, for the first two, no redemption math at all). Delivered a new
`offers.benefit_product_id` FK, real `free_item`/`free_upgrade` money-path math, and a resolver
allowlist restructure that independently closed a second, separately-found zero/negative-
discount money leak. USER-REVIEWED 17-07-26 via a 5-artifact risk evidence pack.
`feat/deals_unification` then merged into `development` via PR #109 (merge commit `95e7aeb`)
after one further user-approved fix (coupon reward/offer mutual-exclusivity DB CHECK, commit
`31a574f`). See `process/context/all-context.md` for the full account (ADM-008 + Fix 6 bullets)
— not duplicated in full here to avoid drift between two sources of truth.

**Phase 3 closeout summary (15-07-26):** Full real vertical slice for the product catalog surface —
`packages/api/src/routes/admin/{products,categories}.ts` (new), mounted on the existing append-only
`/api/admin` aggregator (third confirmed consumer, after P1's `users.ts` and P2's `branches.ts`).
`handleAdminError`/`isUniqueViolation` relocated from `branches.ts` into `routes/admin/lib/
errors.ts` and exported (Decision 2) — now shared by all three admin route files. `centsToNumeric`
exported from `routes/lib/serializers.ts` (was module-private in `orders.ts`); `orders.ts`'s 3 real
call sites (not the plan's stale estimate of 2) updated to import it, with `orders.test.ts` re-run
as a regression guard (31/31 green). Availability writes use Drizzle `.onConflictDoUpdate()` on
`bpa_branch_product_idx` (Decision 3) — no manual select-then-insert-or-update; realtime UI sync
explicitly deferred (refetch-on-focus only, consistent with the app's existing staleness model, not
new debt). `apps/admin` gained its first 3 shared composites (`query-states`, `confirm-dialog`,
`page-header`, Decision 1) — Categories consumes all 3 (hard constraint, verified no local
duplicates); Products consumes them where they fit and stays feature-local for the option/
availability sub-editors. `data-table`/`form-dialog` deliberately NOT extracted — re-eval trigger is
now Phase 4's `deal_products`/`deal_branches` junction UI. 31 new supertest cases (19
`admin-products.integration.test.ts` + 12 `admin-categories.integration.test.ts`), reusing the
`makeUser(role)` self-seeding fixture a third time — full API suite 183/183, 0 regressions,
independently EVL-confirmed. **AC1 (snapshot-integrity, HARD, Known-Gap banned) is proven by a real
passing automated regression test** — places a product, places a real order snapshotting its price,
edits `base_price` via the new admin route, asserts historical `order_items.unit_price`/
`total_price` are unchanged; this is the single highest-stakes correctness bar in the whole program
and it is now closed for good, not deferred. **AC8 (Agent-Probe manual walkthrough) was actually
performed by the user this session — not left owed like P2's AC7.** The walkthrough found a real bug:
the "Manage" button changed the URL to `/products/:id` but the detail screen never painted, because
TanStack Start auto-nests `products.$productId.tsx` under `products.tsx` (shared filename prefix)
and the parent rendered no `<Outlet/>`. Fixed same session (commit `79df222`) by splitting
`products.tsx` into a thin `<Outlet/>` layout plus a new `products.index.tsx` holding the list UI —
re-walked and passed after the fix. This nested-route Outlet gotcha is now the reference pattern for
any future admin list→detail screen (P4-P7). Report:
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-03-products_REPORT_14-07-26.md`.

**Phase 4 pivot note (15-07-26):** the discount-shaped "Deals CRUD" delivered on commit `d5070d8`
(coupon-cascade deactivation, `deals`/`deal_products`/`deal_branches` junctions) is SUPERSEDED by a
deals-as-products model — see the `Current Execution State` block above for the full rationale.
The legacy `deals`/`deal_products`/`deal_branches`/`coupons.deal_id`/`orders.deal_id` schema and the
public `GET /deals`/`GET /deals/:id` read routes are left dormant and untouched, preserved for
ADM-008 (the coupon domain — Promotion→Offer→Coupon) to potentially resume in a modified form; the
legacy deals-table rename/split question is explicitly deferred to ADM-008, not resolved here. The
mobile Deals tab keeps reading the OLD `GET /deals` route in the interim (no regression — that route
is untouched) until the standalone `deals-mobile-repoint_HANDOFF_15-07-26.md` handoff is picked up
by a separate mobile workstream.

Program Net Gate: 6/8 phases VERIFIED — PENDING overall (Phase 7 — Analytics — is the sole
remaining phase; unparked and ready for its inner-loop RESEARCH pass)
Latest validator run: 17-07-26 — this UPDATE PROCESS pass (Phase 6 closeout; see phase report +
this session's closeout packet for results)

**Sidebar Navigation closeout summary (15-07-26, cross-cutting):** Config-driven brutalist sidebar
navigation delivered across the admin dashboard shell. `apps/admin/src/config/nav-config.ts` exports
a `navConfig` array (Main/Management/Dev groups) as the single source of truth for all sidebar
routes — adding a route = one object addition. `apps/admin/src/components/app-sidebar.tsx`
(`AppSidebar`) iterates `navConfig`, applies exact active-state matching, and renders with Tactile
Comic Brutalism styling (2px ink borders, jyellow + 3px offset shadow on active items, Fredoka
labels, disabled/greyed unbuilt routes). `apps/admin/src/components/nav-user.tsx` (`NavUser`)
displays user initial avatar, email, role badge, and sign-out via `useAdminAuth()` — no auth guard
bypassed. New shadcn primitives: `sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`,
`skeleton.tsx`. `(dashboard)/route.tsx` now wraps `<Outlet />` with `<SidebarProvider>` +
`<AppSidebar />`; old centered-card shell stripped from `(dashboard)/index.tsx`. Build verified
(`pnpm --filter @jojopotato/admin build` ✅); no TS errors. Plan and report archived to
`process/features/admin-dashboard/completed/admin-dashboard_14-07-26/`.

**Phase 2 closeout summary (14-07-26):** Full real vertical slice delivered — `packages/api/src/
routes/admin/branches.ts` (list incl. inactive / get / create / update / soft-deactivate), appended
to the existing `/api/admin` aggregator (`routes/admin/index.ts`), inheriting `requireAdmin` +
`adminCors` with zero inline role checks (second confirmed consumer of the Phase 1 append-only
aggregator pattern). `serializers.ts` gained an additive `AdminBranch`/`serializeAdminBranch`
(local-declaration convention, `packages/types` untouched). Slug-uniqueness enforced via a Postgres
`23505` catch — durable gotcha: drizzle-orm wraps the driver error in `DrizzleQueryError`, so the
code lives on `err.cause.code`, not the top-level `err.code` (AC3's Fully-Automated test caught the
top-level-only check as a real defect, not a hypothetical). `apps/admin` gained its first fetch
wrapper (`features/branches/lib/admin-branches-api.ts`, `credentials:'include'`), its first real
consumer of the dedicated `queryClient`, and a full list/create/edit/deactivate screen wired to a
new `(dashboard)/branches` route (radix-Dialog confirm gate on deactivate — Safety requirement).
12 new supertest cases (`admin-branches.integration.test.ts`, reusing the `makeUser(role)`
self-seeding fixture from Phase 1); full API suite 134/134, 0 regressions. Independently
EVL-confirmed (6/6 gates green, 0 fix cycles). Known gaps carried forward (documented, not silently
dropped, all with backlog notes): AC7 Agent-Probe manual walkthrough owed (no browser/E2E runner
exists yet); `is_accepting_pickup` shared-state race with the not-yet-built STAFF-004 mobile write
path (no optimistic-concurrency guard anywhere on `branches`, last-write-wins accepted); the §5
shared UI composite extraction was deliberately deferred (feature-folder components built instead;
revisit at Phase 3 RESEARCH once a real second CRUD consumer exists, per the "second consumer" rule
already in this umbrella's §5). Report:
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-02-branches_REPORT_14-07-26.md`.

Phase 1 closeout summary (RE-CLOSED 14-07-26, post-AC8 CORS fix): First `/api/admin/*` protected
surface shipped — `requireAdmin(auth)` middleware (mirrors `requireStaff`, admits `admin`/`super_admin`
only), mounted at `/api/admin` with credentialed CORS scoped to the `:3100` admin web origin
(`trustedOrigins` extended, never wildcarded). First browser-cookie session flow in the repo:
`apps/admin`'s `auth-client.ts` is a plain `createAuthClient` from `better-auth/react` — the Step 0
feasibility probe proved the default cookie session works with ZERO plugins (contrast with Expo's
bearer-token `@better-auth/expo` flow). `packages/types/src/admin.ts` (new) carries `ADMIN_ROLES`,
`AdminRole`, `AdminMe` (incl. an additive `mfaPending?: boolean` MFA/TOTP structural seam — no
plugin/migration, deferred to a future unassigned ADM-0xx), `AdminUserSummary`.
`POST /api/admin/users/:id/role` (super_admin-only role-management route) enforces the LOCKED guard
order (super_admin check → self-escalation guard → Zod validation → DB write) inline in the handler
— both hard umbrella safety constraints (no self-escalation, super_admin-only) are automated-tested
(AC2/AC3). The `TODO(STAFF-ADM)` seam in `require-staff.ts`'s `assertBranchScope` is resolved: an
additive optional `role?` trailing param bypasses branch-scope checks for admin/super_admin,
backward-compatible with all existing 2-arg call sites. `apps/admin` gained its login screen
(`routes/login.tsx`, unguarded) and a `(dashboard)` pathless route-group shell with a
server-verified `beforeLoad` guard (calls `GET /api/admin/me` — never trusts a client-cached role
flag); P2-P7 add sibling child routes to this same group, never restructure it. New integration
suite `require-admin.integration.test.ts` mirrors `require-staff.integration.test.ts`'s hermetic
self-seeding pattern.

**Post-close CORS defect found + fixed + re-verified:** the first real-browser AC8 walkthrough
(Firefox, `http://localhost:3100`) FAILED — admin login hung because credentialed CORS was mounted
only on `/api/admin`, never on `/api/auth/*`, so the browser blocked the better-auth `get-session`/
`sign-in`/`sign-out` calls (`trustedOrigins` is a CSRF allowlist only, NOT an HTTP CORS header
source — these are two separate layers). Fix: a single shared `adminCors` middleware is now mounted
on BOTH `/api/auth/*` (before the better-auth handler) and `/api/admin`, in
`packages/api/src/index.ts`. 3 new regression tests added to `require-admin.integration.test.ts`
(preflight OPTIONS + real sign-in + no-Origin mobile-path guard) — full API suite is now **78/78**
(was 75/75 before the fix). EVL independently re-confirmed 78/78 + typecheck green, no regression.
AC8 was then RE-WALKED in a real browser and PASSES for all 3 roles (super_admin reaches the
dashboard shell; customer and staff are rejected, stay on `/login`) — server enforcement additionally
curl-confirmed (403 for customer/staff, 200 for super_admin). **AC8 known-gap is now CLOSED** — it
is no longer "Agent-Probe-recorded manual-pending"; the walkthrough has actually run and passed.
Full detail + screenshot path: `## AC8 Verification (browser, post-fix)` in the phase report.

One non-exploitable documented side effect carried forward: a malformed `:id` in the role-management
route surfaces as a 500 rather than 404 (guard-order artifact, super_admin-only reachable) — tracked
as a known gap, not fixed this phase (out of blast radius; unrelated to the CORS fix).

**Bootstrap fact learned:** no admin/super_admin user is seeded by `packages/api/src/db/seed/seed.ts`
(seed only makes staff + 2 customers) — the AC8 super_admin test account was bootstrapped manually
(signup + a direct `UPDATE users SET role='super_admin'` DB write). A dev-only seeded admin account
is recommended as a backlog candidate for future phases' QA convenience (not implemented this pass —
touches the seed/auth surface, left as a user decision).

Report: `process/features/admin-dashboard/active/admin-dashboard_14-07-26/phase-01-auth-rbac_REPORT_14-07-26.md`.

Orchestrator rule: **PROGRAM COMPLETE — no further subagent spawns for this program.** All 8
phase plans have all 7 `## Phase Loop Progress` steps ticked ✅ VERIFIED, including Phase 7 (this
pass). Do not resume this umbrella plan for new work — any further admin-dashboard scope is a new
plan/feature-folder task, per the umbrella plan's own §Explicitly Deferred / Locked Scope
Decisions and the program's Definition of Done being fully met.

Note: this section is the only part of the umbrella plan expected to change over the program's
life — update-process-agent rewrites it after every phase closeout (overwrite, not append — git
history is the audit log).

---

## Pre-PVL Conflict Resolution

(placeholder — orchestrator fills this in before outer PVL begins, once per-phase plans exist.
Must classify each shared package/file group touched by 2+ phases as `parallel-safe` or `reassign`
(naming the winning phase). Known shared surfaces to pre-check once phase plans exist:
`packages/api/src/index.ts` mount ordering (P1 adds `/api/admin` mount — later phases add routers
under it, not new mounts), `packages/types/src/admin.ts` (P1 creates; P2-P7 extend), and
`apps/admin/src/lib/` shared API client / query client (P1 or P0 creates; all later phases consume).)

---

## Stable Program Goal (copy-paste this to start autonomous execution)

```
SESSION GOAL: admin-dashboard — Jojo Potato Admin Dashboard (8-phase program)
Ref: process/features/admin-dashboard/active/admin-dashboard_14-07-26/admin-dashboard_UMBRELLA_PLAN_14-07-26.md

TARGET: Complete ALL 8 phases (P0 scaffold, P1 auth/RBAC, P2 branches, P3 products/categories,
P4 deals, P5 rewards, P6 orders-view, P7 analytics) until:
- Every phase's validate-contract gates are green (no placeholder contracts remain)
- The two hard invariants have passing regression tests: order_items snapshot integrity (P3) and
  star_transactions retroactivity (P5) — Known-Gap is banned for these two specifically
- Test tiers: automated (iterate-until-green) / hybrid (fix-if-in-blast-radius) / agent-probe
  (record-judgment)

AUTONOMY: Before ANY subagent spawn, read:
1. Umbrella ## Current Execution State -> loop step + validate-contract status
2. Phase plan ## Phase Loop Progress -> first unchecked box = next subagent to spawn

PER-PHASE LOOP (7-step inner loop R -> I -> P -> PVL -> E -> EVL -> UP, never skip, never reorder;
SKIPS SPEC -- SPEC runs once in the outer program loop):
  1. RESEARCH -> 2. INNOVATE -> 3. PLAN-SUPPLEMENT -> 4. PVL -> 5. EXECUTE -> 6. EVL -> 7. UPDATE-PROCESS
- PLAN-SUPPLEMENT: plan-agent writes research/innovate gaps into phase plan (or marks "n/a -- clean")
- PVL NEVER skipped; contract must follow example-validate-output.md full format; a placeholder or
  partial contract (missing Plan updates applied / Execute-agent instructions / Test gates) = blocked
- Every subagent FIRST ACTION: run vc-context-discovery (load context group files +
  process/context/tests/all-tests.md routing chain) AND vc-plan-discovery (same-feature full depth
  active/backlog/completed/reports/refs + other features active-only + general-plans active)
- Every phase-END: invoke vc-agent-strategy-compare for the next step's strategy recommendation
- Phase 1's RESEARCH step must run a feasibility probe on better-auth browser cookie sessions
  BEFORE innovate/plan locks the auth design (VC-FEASIBILITY-PROBE-NEEDED routing applies).

Report via phase reports. No approval between phases unless a hard stop is hit.

HARD STOPS (pause, wait for user):
- Any admin CRUD path would write to order_items or rewrite historical star_transactions
- Any design would let an admin/super_admin self-escalate its own role, or let plain admin
  promote/demote roles (super_admin-only)
- Cascade BLOCKED: two consecutive phases BLOCKED with no intervening PASS
- Irreversible/outward-facing action without explicit validate-contract instruction (e.g. deploying
  apps/admin, migrating production schema)
- Validate-contract is placeholder and vc-validate-agent cannot run

SAFETY (never override):
- Never let admin CRUD mutate order_items or star_transactions historical rows
- role stays server-owned (input:false); no client-trusted role writes anywhere
- Prefer is_active soft-delete over hard-delete wherever the column exists
- Every /api/admin/* route behind requireAdmin at router-mount level, no per-handler-only checks
- Commit each phase before advancing; process and execution commits kept separate

TEST GATES (every phase exit; run all applicable):
  node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
  node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs
  node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs
  node .claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs
  node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs
  pnpm --filter @jojopotato/api test   (requires docker compose up -d + db:migrate)
  pnpm --filter @jojopotato/admin test  (once P0 scaffolds the runner)

VALIDATE CONTRACT: Per-phase contracts written by vc-validate-agent into each phase plan before
EXECUTE. None exist yet -- per-phase plan files are created in the next pass after this umbrella.

START (updated 17-07-26): **PROGRAM COMPLETE.** Phases 0-7 ✅ VERIFIED (P4a merged PR #92; P5
merged PR #112; P6 committed `7bb0918`; P7 committed `ba88318` on `feat/adm-007-analytics`, 8 KPIs,
EVL-confirmed 493/493 api + 72/72 admin). ADM-008 Coupons + Fix 6 sub-program CODE-COMPLETE, held
OPEN in active/ per standing user decision. No next phase -- any further admin-dashboard work is a
new plan, not a continuation of this program.
```

---

## Phase Plan Index

All 8 per-phase plan files are written (flat in this task folder). Each carries its own
`## Cross-Cutting Compliance` subsection (per the 5 hard gates), Touchpoints, Public Contracts,
Blast Radius, Acceptance Criteria, Verification Evidence, Test Infra Improvement Notes, 7-step
`## Phase Loop Progress`, Resume and Execution Handoff, and a placeholder `## Validate Contract`.
Depth: P0–P2, P6, and P7 are FULL (executable-ready — P6/P7 reached FULL post-EXECUTE, their
line-level checklists finalized at their inner-loop PLAN-SUPPLEMENT); P3–P5 are
FULL-PICTURE-BUT-FLEXIBLE (scope, contracts sketch, acceptance criteria, risks locked; line-level
EXECUTE checklist finalized at each phase's inner-loop PLAN-SUPPLEMENT after RESEARCH). See the
Depth column below for the authoritative per-phase classification.

| Phase | Plan file | Depth | Carried open items |
|---|---|---|---|
| P0 — Scaffold | [phase-00-scaffold_PLAN_14-07-26.md](./phase-00-scaffold_PLAN_14-07-26.md) | FULL | ESLint config shape, turbo build-output dir, TanStack scaffold filenames → this phase's RESEARCH/INNOVATE |
| P1 — Auth/RBAC (ADM-001) | [phase-01-auth-rbac_PLAN_14-07-26.md](./phase-01-auth-rbac_PLAN_14-07-26.md) | FULL | Browser-cookie-session feasibility probe gates the auth design (first RESEARCH step) |
| P2 — Branches CRUD (ADM-002) | [phase-02-branches_PLAN_14-07-26.md](./phase-02-branches_PLAN_14-07-26.md) | FULL | `is_accepting_pickup` shared-state coordination with STAFF-004 (Known-Gap) |
| P3 — Products/Categories CRUD (ADM-003) ✅ VERIFIED | [phase-03-products_PLAN_14-07-26.md](./phase-03-products_PLAN_14-07-26.md) | FLEXIBLE | RESOLVED — snapshot-integrity regression test (AC1) real and passing, Known-Gap never used; `centsToNumeric` exported. Only residual: `data-table`/`form-dialog` extraction deferred to P4 re-eval. |
| P4 — Deals CRUD (ADM-004) | [phase-04-deals_PLAN_14-07-26.md](./phase-04-deals_PLAN_14-07-26.md) | FLEXIBLE | **Coupon-cascade on deal deactivation — 3 options, needs sign-off at P4 INNOVATE** |
| P5 — Rewards CRUD (ADM-005) | [phase-05-rewards_PLAN_14-07-26.md](./phase-05-rewards_PLAN_14-07-26.md) | FLEXIBLE | Reward-retroactivity regression test (HARD, Known-Gap banned) |
| P6 — Orders view (ADM-006) ✅ VERIFIED | [phase-06-orders_PLAN_14-07-26.md](./phase-06-orders_PLAN_14-07-26.md) | FULL | RESOLVED — D2 PII boundary (name+phone in, email out) proven by automated field-shape test; no open items. |
| P7 — Analytics (ADM-007) ✅ VERIFIED | [phase-07-analytics_PLAN_14-07-26.md](./phase-07-analytics_PLAN_14-07-26.md) | FULL (post-EXECUTE) | RESOLVED — all money-adjacent ACs (AC2/AC3/AC6/AC11) real and passing, Known-Gap never used; AC9 visual + AC10 owed as standing Agent-Probe residual (non-blocking, matches program convention). |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE. For a phase program, per-phase
validate-contracts live inside each phase plan file; this umbrella-level placeholder is retained only
to satisfy the direct-plan artifact contract and is not expected to be filled independently of the
per-phase contracts.)
