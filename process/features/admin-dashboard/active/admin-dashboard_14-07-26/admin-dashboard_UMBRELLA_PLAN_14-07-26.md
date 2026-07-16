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
**Status:** ⏳ PLANNED

Date: 14-07-26
Status: PLANNED (Phased Delivery Plan — 8 phases, see Phase Map below)

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
| P6 — Orders view (ADM-006, #44) | #44 | P1 | Read-only order list per branch; filter by branch/status/date; NO status mutation in this program | `packages/api/src/routes/admin/orders.ts` (new, read-only), `apps/admin/src/features/orders/**` (new) | P2 (branch filter needs branch list) | Customer-PII exposure boundary — orders carry customer name/contact; needs an explicit design note contrasting this against the existing §19 staff-role restriction pattern, not an ad-hoc call during EXECUTE |
| P7 — Analytics (ADM-007, #45) | #45 | P2 | Basic analytics: orders/branch, AOV, deals-vs-no-deals lift, repeat-purchase rate, stars issued, rewards redeemed — time-range filterable | `packages/api/src/routes/admin/analytics.ts` (new, aggregation queries), `apps/admin/src/features/analytics/**` (new) | P3, P4, P5, P6 (aggregates across products/deals/rewards/orders) | Least-precedented phase — `packages/api` has NO existing aggregation-query pattern to mirror; query correctness (esp. AOV and repeat-purchase definitions) needs explicit acceptance-criteria sign-off before EXECUTE, not just "looks right" |

---

## Phase Ordering

| Order | Phase | Depends on | Status |
|---|---|---|---|
| 0 | P0 — Scaffold | — | ✅ VERIFIED |
| 1 | P1 — Auth/RBAC (ADM-001) | P0 | ✅ VERIFIED |
| 2 | P2 — Branches CRUD (ADM-002) | P1 | ✅ VERIFIED |
| 3 | P3 — Products/Categories CRUD (ADM-003) | P2 | ✅ VERIFIED |
| 4 | P4 — Deals CRUD (ADM-004) | P2, P3 | ⏳ PLANNED |
| 5 | P5 — Rewards CRUD (ADM-005) | P0, P1 | ⏳ PLANNED |
| 6 | P6 — Orders view (ADM-006) | P2 | ⏳ PLANNED |
| 7 | P7 — Analytics (ADM-007) | P3, P4, P5, P6 | ⏳ PLANNED |

No phase depends on a later phase's output — ordering verified by inspection (P4/P7 have the widest
fan-in but still only depend on strictly earlier phases).

---

## Program Status Table

| Phase | Status |
|---|---|
| P0 — Scaffold | ✅ VERIFIED |
| P1 — Auth/RBAC (ADM-001) | ✅ VERIFIED |
| P2 — Branches CRUD (ADM-002) | ✅ VERIFIED |
| P3 — Products/Categories CRUD (ADM-003) | ✅ VERIFIED |
| P4 — Deals CRUD (ADM-004) | ⏳ PLANNED |
| P5 — Rewards CRUD (ADM-005) | ⏳ PLANNED |
| P6 — Orders view (ADM-006) | ⏳ PLANNED |
| P7 — Analytics (ADM-007) | ⏳ PLANNED |

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

Last updated: 16-07-26 (Phase 4a — Deals-as-Products, EVL-green; UPDATE PROCESS doc reconciliation
  pass; branch `feat/adm-004-deals` NOT YET MERGED, PR pending review)
Completed phases: Phase 0 — Scaffold (✅ VERIFIED, 14-07-26); Phase 1 — Auth/RBAC (✅ VERIFIED,
  14-07-26); Phase 2 — Branches CRUD (✅ VERIFIED, 14-07-26); Phase 3 — Products/Categories CRUD
  (✅ VERIFIED, 15-07-26); Phase 4a — Deals-as-Products, ADM-004 RE-PLAN (EVL-green, 16-07-26 —
  see status note below on why this is not yet stamped ✅ VERIFIED at the umbrella level)
Completed cross-cutting tasks: Sidebar Navigation (✅ COMPLETE, 15-07-26)
Current phase N of total: 4 of 8 (Phase 4a — Deals-as-Products, ADM-004 RE-PLAN) — delivered;
  Phase 5 (Rewards CRUD, ADM-005) is next once Phase 4a's PR merges
Phase N name: Phase 4a — Deals-as-Products (ADM-004 RE-PLAN; supersedes and discards the
  discount-shaped "Phase 4 — Deals CRUD" model built on commit `d5070d8`)
Phase N status: EVL-green, code-complete, NOT YET MERGED (branch `feat/adm-004-deals`, PR pending
  review — held at "Keep in active/testing" rather than stamped ✅ VERIFIED until the PR lands).
  Phase 4 PIVOTED mid-program: the original discount-object deals model (a standalone `deals` table
  + `deal_products`/`deal_branches` junctions + a coupon-cascade deactivate flow) was fully EXECUTEd
  on commit `d5070d8` (31/31 new tests, 214/214 full API suite, Gate: PASS) and is now SUPERSEDED —
  its code was discarded (content replaced at the same file paths, not `git revert`; not deleted from
  git history; the `deals`/`deal_products`/`deal_branches`/`coupons` schema stays dormant, preserved
  for a future ADM-008). The new model: a "Deal" is a `products` row with `is_deal = true`, described
  by a new self-referential `deal_components` junction (member products + quantity), priced at its
  own `base_price` — reusing the entire existing product → menu → cart → checkout → order_items
  pipeline with zero new pricing/cart/order code. `phase-04-deals_PLAN_14-07-26.md` was rewritten in
  full for this new model and carried a fresh Step 4 PVL pass (Gate: CONDITIONAL, 1 accepted
  non-blocking concern) before EXECUTE. Delivered on top of the base 4a scope: **Enhancement E1**
  (2-step create wizard, transactional `db.transaction()` create-with-components, commit `680427f`,
  Gate: PASS) and, this session (16-07-26, uncommitted at session start — see below), a live
  deal-manage "Price comparison" panel (commit `1ca08f7`) plus 3 PR-review fixes (staged, uncommitted
  as of this pass): (1) wizard `step1Valid` now also requires a non-empty slug; (2) `PATCH
  /api/admin/deals/:id` now serializes existing components instead of `[]`; (3) deal-detail price
  formatting routed through the shared `formatPeso` helper. EVL evidence this session: admin
  typecheck ✅, api typecheck ✅, API suite 222/222 ✅, admin 8/8 ✅, Prettier clean.
Phase N EVL: green for the full delivered scope (4a base + E1 + this session's price-comparison
  panel + PR-review fixes) — see `phase-04a-deals-as-products_REPORT_15-07-26.md` `## Test Gate
  Outcomes` for the 4a-base evidence table; this session's 3-file diff was independently re-verified
  (typecheck + full API/admin suites + format) as summarized above. AC12/AC-E6 (Agent-Probe UI
  walkthroughs) were user-verified.
Phase N report: `phase-04a-deals-as-products_REPORT_15-07-26.md` is the CURRENT, AUTHORITATIVE
  EXECUTE report for Phase 4a. `phase-04-deals_REPORT_15-07-26.md` (the original file, dated the same
  day) documents the now-discarded discount-model EXECUTE pass on commit `d5070d8` and is marked
  SUPERSEDED at its own header — do not read it as current truth.
Companion (non-executed) artifact: `deals-mobile-repoint_HANDOFF_15-07-26.md` — a standalone,
  plain-language handoff spec for a different (non-RIPER-aware) teammate to repoint the mobile Deals
  tab onto the new `?isDeal=true` menu-read contract once Phase 4a ships (and, separately, once a
  customer-facing deal-detail-with-components read route exists — the handoff doc's read-contract
  section was corrected this pass to stop implying `deal_components` are exposed via the menu-list
  response; they are not — see the phase plan's `## Public Contracts` note). This is NOT part of this
  program's own EXECUTE scope and is never routed through this program's phase loop.
Next phase: (a) merge the `feat/adm-004-deals` PR — no further RIPER work is pending on Phase 4a
  itself; (b) once merged, move `phase-04-deals_PLAN_14-07-26.md` +
  `phase-04a-deals-as-products_REPORT_15-07-26.md` (+ the now-superseded
  `phase-04-deals_REPORT_15-07-26.md`, kept for history) into `completed/admin-dashboard_14-07-26/`
  and stamp Phase 4a ✅ VERIFIED in the Phase Map/Ordering/Program Status tables below; (c) start
  Phase 5 — Rewards CRUD (ADM-005), Step 1 RESEARCH.

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

Program Net Gate: 4/8 phases VERIFIED — PENDING overall
Latest validator run: 15-07-26 — this UPDATE PROCESS pass (see phase report + this session's
closeout packet for results)

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

Orchestrator rule: read "Phase N status" and the named phase plan's `## Phase Loop Progress`
before spawning any subagent. Never spawn execute-agent when loop step is RESEARCH, INNOVATE,
PLAN-SUPPLEMENT, or PVL. Phase 4's plan file already exists (FLEXIBLE depth) but has NOT started
its inner loop — spawn vc-research-agent next, not vc-execute-agent.

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

START (updated 16-07-26): Phases 0-3 ✅ VERIFIED; Phase 4a (Deals-as-Products, ADM-004 RE-PLAN)
EVL-green and delivered incl. Enhancement E1 + this session's price-comparison panel/PR-review
fixes, but NOT YET MERGED -- branch `feat/adm-004-deals`, PR pending review. Do not archive Phase 4a
to completed/ or stamp it VERIFIED in the Phase Map until the PR lands. Once merged: Phase 5
(Rewards CRUD, ADM-005), loop step 1-RESEARCH.
```

---

## Phase Plan Index

All 8 per-phase plan files are written (flat in this task folder). Each carries its own
`## Cross-Cutting Compliance` subsection (per the 5 hard gates), Touchpoints, Public Contracts,
Blast Radius, Acceptance Criteria, Verification Evidence, Test Infra Improvement Notes, 7-step
`## Phase Loop Progress`, Resume and Execution Handoff, and a placeholder `## Validate Contract`.
Depth: P0–P2 are FULL (executable-ready); P3–P7 are FULL-PICTURE-BUT-FLEXIBLE (scope, contracts
sketch, acceptance criteria, risks locked; line-level EXECUTE checklist finalized at each phase's
inner-loop PLAN-SUPPLEMENT after RESEARCH).

| Phase | Plan file | Depth | Carried open items |
|---|---|---|---|
| P0 — Scaffold | [phase-00-scaffold_PLAN_14-07-26.md](./phase-00-scaffold_PLAN_14-07-26.md) | FULL | ESLint config shape, turbo build-output dir, TanStack scaffold filenames → this phase's RESEARCH/INNOVATE |
| P1 — Auth/RBAC (ADM-001) | [phase-01-auth-rbac_PLAN_14-07-26.md](./phase-01-auth-rbac_PLAN_14-07-26.md) | FULL | Browser-cookie-session feasibility probe gates the auth design (first RESEARCH step) |
| P2 — Branches CRUD (ADM-002) | [phase-02-branches_PLAN_14-07-26.md](./phase-02-branches_PLAN_14-07-26.md) | FULL | `is_accepting_pickup` shared-state coordination with STAFF-004 (Known-Gap) |
| P3 — Products/Categories CRUD (ADM-003) ✅ VERIFIED | [phase-03-products_PLAN_14-07-26.md](./phase-03-products_PLAN_14-07-26.md) | FLEXIBLE | RESOLVED — snapshot-integrity regression test (AC1) real and passing, Known-Gap never used; `centsToNumeric` exported. Only residual: `data-table`/`form-dialog` extraction deferred to P4 re-eval. |
| P4 — Deals CRUD (ADM-004) | [phase-04-deals_PLAN_14-07-26.md](./phase-04-deals_PLAN_14-07-26.md) | FLEXIBLE | **Coupon-cascade on deal deactivation — 3 options, needs sign-off at P4 INNOVATE** |
| P5 — Rewards CRUD (ADM-005) | [phase-05-rewards_PLAN_14-07-26.md](./phase-05-rewards_PLAN_14-07-26.md) | FLEXIBLE | Reward-retroactivity regression test (HARD, Known-Gap banned) |
| P6 — Orders view (ADM-006) | [phase-06-orders_PLAN_14-07-26.md](./phase-06-orders_PLAN_14-07-26.md) | FLEXIBLE | Customer-PII exposure boundary design note (name+phone in, email out) |
| P7 — Analytics (ADM-007) | [phase-07-analytics_PLAN_14-07-26.md](./phase-07-analytics_PLAN_14-07-26.md) | FLEXIBLE | **6 metric definitions need sign-off; aggregation-query approach open (no precedent)** |

---

## Test Infra Improvement Notes

(none identified yet)

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE. For a phase program, per-phase
validate-contracts live inside each phase plan file; this umbrella-level placeholder is retained only
to satisfy the direct-plan artifact contract and is not expected to be filled independently of the
per-phase contracts.)
