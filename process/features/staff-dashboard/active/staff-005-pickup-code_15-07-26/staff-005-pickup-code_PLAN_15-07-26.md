---
name: plan:staff-005-pickup-code
description: "SIMPLE plan — STAFF-005/PUP-002 staff pickup-code lookup route + mobile lookup screen"
date: 15-07-26
feature: staff-dashboard
phase: "STAFF-005"
---

# STAFF-005 (PUP-002): Pickup Code Lookup — Implementation Plan

Date: 15-07-26
Status: PLAN (pre-validate)
Complexity: SIMPLE (single direction, one package-pair: `packages/api` + `apps/mobile`)

**GitHub Issue:** #35 (PUP-002), P1
**SPEC:** `staff-005-pickup-code_SPEC_15-07-26.md` (locked, same folder)
**INNOVATE:** locked in handoff — one new branch-scoped `GET /api/staff/orders/lookup?code=` route + mobile "Enter Pickup Code" screen; no migration, no state-machine change.
Context loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md` (routing chain followed).

## TL;DR

Add one new read-only Express route `GET /api/staff/orders/lookup?code=` (branch-scoped, reuses `resolveBranchScope` + `serializeStaffOrderDetail`) that finds an order by its existing `order_number`, returning a **byte-identical 404** for both wrong-branch and nonexistent codes. Add a 5th staff nav card + a new mobile lookup screen that routes a found actionable order to the existing `order-detail/[orderId]` screen and shows inline messages for not-found / already-terminal. New Fully-Automated integration test file covers all backend behavior; mobile UI is Agent-Probe (no RN runner exists). No DB migration, no state-machine change.

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | staff-dashboard |
| 2 | phase | PLAN |
| 3 | session-goal | STAFF-005 pickup-code lookup route + staff mobile lookup screen |
| 4 | branch | development |
| 5 | worktree | main |
| 6 | context-group | tests |
| 7 | blast-radius-packages | packages/api, apps/mobile |
| 8 | active-plan | process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/staff-005-pickup-code_PLAN_15-07-26.md |
| 9 | test-runner | vitest (packages/api) |
| 10 | validate-contract | pending |

## Overview / Goals / Scope

**Goal:** Give staff a fast, branch-scoped way to find an order by typing the pickup code a customer speaks aloud, reusing the existing `order_number` as the code.

**In scope:**
- New `GET /api/staff/orders/lookup?code=` route in `packages/api/src/routes/staff.ts`.
- New "Enter Pickup Code" nav card + lookup screen in `apps/mobile/src/app/(staff)/`.
- New `fetchStaffOrderByCode` client function in `staff-api.ts`.
- New Fully-Automated integration test file.

**Out of scope (from SPEC):** camera/barcode scanning, code-format changes, any order-state-machine or `PATCH /orders/:orderId` change, real star accrual, push notifications, admin/customer lookup, any DB migration. Completion ("Mark Picked Up") continues through the existing, untouched detail screen.

## Touchpoints

Files to ADD:
- `packages/api/src/routes/__tests__/staff-order-lookup.integration.test.ts` — new Fully-Automated integration suite (mirror the hermetic self-seeding pattern of `staff-order-status.integration.test.ts`: `signUpAndGetCookie` + branch seeding + `insertOrder`).
- `apps/mobile/src/app/(staff)/pickup-lookup.tsx` — new staff lookup screen (text input + submit + inline result states).

Files to MODIFY:
- `packages/api/src/routes/staff.ts` — add `GET /orders/lookup` handler, registered BEFORE `GET /orders/:orderId` (immediately after the existing `/orders/completed` static route). Add a small normalization guard for the `code` query param.
- `apps/mobile/src/features/staff/lib/staff-api.ts` — add `fetchStaffOrderByCode(code: string): Promise<StaffOrderDetail | null>` (returns `null` on 404, throws on other non-OK — same convention as `fetchStaffOrderDetail`).
- `apps/mobile/src/app/(staff)/index.tsx` — add a 5th entry to `NAV_CARDS` (`title: 'Enter Pickup Code'`, `navigateTo: '/(staff)/pickup-lookup'`).
- `apps/mobile/src/app/(staff)/_layout.tsx` — register `<Stack.Screen name="pickup-lookup" />`.

Files to READ for context (not modified):
- `packages/api/src/routes/lib/serializers.ts` (`serializeStaffOrderDetail`) — reuse verbatim.
- `packages/api/src/lib/require-staff.ts` (`resolveBranchScope`) — reuse verbatim.
- `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` — navigation target for a found actionable order (no change).

## Public Contracts

**New endpoint:** `GET /api/staff/orders/lookup?code=<pickup-code>`
- Auth: inherited `requireStaff` guard (mounted at `app.use('/api/staff', ...)`), session-gated. No branch id accepted from client.
- Query param `code` (required). Server normalizes: `String(code ?? '').trim().toUpperCase()`.
- Response shapes / status codes:
  - `200` — flat `StaffOrderDetail` (same shape and serializer as `GET /orders/:orderId`), INCLUDING the order's real `status` (terminal or not). No special-cased error for already-completed.
  - `400` — missing/empty `code` after normalization: `{ error: 'Missing code' }`.
  - `403` — unassigned/no-branch staff: `{ error: 'No branch assigned' }` (matches every other `/api/staff/*` route).
  - `404` — no order matches this code AT THE CALLER'S BRANCH. **Body MUST be byte-identical** for both wrong-branch and nonexistent codes: `{ error: 'No matching order found for your branch' }`. This is a locked security requirement (SPEC US-3/AC4/AC5) and a required test assertion.
- Security-by-construction: the DB query filters `and(eq(orders.branch_id, resolvedBranchId), eq(orders.order_number, normalizedCode))`. A wrong-branch code simply does not match the branch filter → same not-found path as a nonexistent code. Staff can never infer a code belongs to another branch.

**New client fn:** `fetchStaffOrderByCode(code)` → `StaffOrderDetail | null` (null on 404).

No type changes to `packages/types` — reuses existing `StaffOrderDetail`.

## Blast Radius

- **Packages:** 2 (`packages/api`, `apps/mobile`).
- **Files:** 2 added + 4 modified = 6.
- **Risk class:** trust-boundary (branch isolation on a read path). Mitigated by reusing the established STAFF-001 `resolveBranchScope` pattern verbatim and by a Fully-Automated cross-branch + nonexistent byte-identical-404 assertion. No schema, no migration, no write path, no state-machine touch — the highest-risk surfaces are explicitly untouched.
- **Regression surface:** the existing `/orders/:orderId` and `/orders/completed` routes (route-ordering — the new static `/orders/lookup` must precede `:orderId`, same as `completed`). Regression check: re-run the full `packages/api` suite; the existing `staff-order-status` / `staff-orders` tests exercise `:orderId` and `completed` and must stay green.

## Implementation Checklist

1. In `packages/api/src/routes/staff.ts`, add a `GET /orders/lookup` handler immediately AFTER the existing `staffRouter.get('/orders/completed', ...)` block and BEFORE `staffRouter.get('/orders/:orderId', ...)`. Steps inside the handler, in order:
   1a. `const branchId = await resolveBranchScope(db, req.staffSession!.userId);` → if falsy, `res.status(403).json({ error: 'No branch assigned' })` and return.
   1b. Normalize: `const code = String(req.query.code ?? '').trim().toUpperCase();` → if empty, `res.status(400).json({ error: 'Missing code' })` and return.
   1c. Query: `const [order] = await db.select().from(orders).where(and(eq(orders.branch_id, branchId), eq(orders.order_number, code)));`
   1d. If `!order`, `res.status(404).json({ error: 'No matching order found for your branch' })` and return. (Same literal for wrong-branch — the branch filter guarantees it.)
   1e. Load items: `const items = await db.select().from(orderItems).where(eq(orderItems.order_id, order.id));`
   1f. `res.json(serializeStaffOrderDetail(order, items));`
2. Create `packages/api/src/routes/__tests__/staff-order-lookup.integration.test.ts` mirroring `staff-order-status.integration.test.ts`'s hermetic setup (seed branch1 + branch2, a customer, staff1 assigned to branch1; extend/reuse an `insertOrder` helper that RETURNS the seeded `order_number` so tests can look it up). Cases (a)–(f) — see Verification Evidence.
3. In `apps/mobile/src/features/staff/lib/staff-api.ts`, add `fetchStaffOrderByCode(code: string): Promise<StaffOrderDetail | null>` — `staffFetch('/api/staff/orders/lookup?code=' + encodeURIComponent(code))`; `if (res.status === 404) return null;` `if (!res.ok) throw new Error(...)`; return parsed `StaffOrderDetail`.
4. Create `apps/mobile/src/app/(staff)/pickup-lookup.tsx`: shared `@jojopotato/ui` `Input` + `Button` (SafeAreaView + brand header matching sibling screens). Local component state (`code`, `isLoading`, `errorMessage`). On submit:
   - call `fetchStaffOrderByCode(code)`;
   - `null` → set inline error "No matching order found for your branch.";
   - order with terminal status (`completed`/`cancelled`/`rejected`) → set inline message ("This order was already picked up." for `completed`; generic terminal message otherwise) and do NOT navigate;
   - otherwise → `router.push('/(staff)/order-detail/' + order.id)`.
   Use existing shared UI components only (no one-off inputs/buttons).
5. In `apps/mobile/src/app/(staff)/index.tsx`, append a 5th `NAV_CARDS` entry: `{ title: 'Enter Pickup Code', subtitle: 'Look up an order by code', navigateTo: '/(staff)/pickup-lookup' as const }`.
6. In `apps/mobile/src/app/(staff)/_layout.tsx`, add `<Stack.Screen name="pickup-lookup" options={{ headerShown: false }} />`.
7. Run verification gates (see Verification Evidence): API integration test, both typechecks, lint.
8. Pre-EXECUTE recheck (from INNOVATE cross-check): confirm `order/confirmation/[orderId].tsx` and `order/tracking/[orderId].tsx` still render `order.orderNumber` prominently (AC1/AC2 satisfied with no rework) — if PR #87 merged and changed them, flag before touching.

## Acceptance Criteria

Carried verbatim in intent from the SPEC (see `staff-005-pickup-code_SPEC_15-07-26.md` §Acceptance Criteria); each is mapped to its proving gate in Verification Evidence / REQ-TEST-LINK below.

1. AC1 — every order has a visible, non-empty, unique pickup code (`order_number`) on the Confirmation screen right after checkout.
2. AC2 — the same pickup code is visible on the Order Tracking screen.
3. AC3 — staff can enter a pickup code and, when it belongs to an order at their own branch, are taken to that order's details.
4. AC4 — a pickup code from another branch returns the not-found outcome; the other branch's order is never exposed.
5. AC5 — a nonexistent pickup code returns the SAME not-found outcome and byte-identical message as a wrong-branch code.
6. AC6 — an already-completed order is clearly flagged as already picked up, not silently re-actionable.
7. AC7 — attempting to complete an already-completed order via this lookup path never yields a second star/reward credit.

Done = every AC row in Verification Evidence has a green Fully-Automated gate (AC3–AC7 backend) or a completed Agent-Probe walkthrough (AC1/AC2 + AC3–AC6 UI layer), both typechecks show no new errors, and lint is clean.

## Phase Completion Rules

- **CODE DONE:** all 6 touchpoint files created/modified; new integration test written.
- **VERIFIED:** `pnpm --filter @jojopotato/api test` green (all lookup cases + full-suite regression), both typechecks clean (mobile: no NEW errors beyond the 3 pre-existing BRN baseline), lint clean, AND the Agent-Probe staff walkthrough + customer confirmation/tracking visibility check completed. Do NOT mark `✅ VERIFIED` until the user confirms the Agent-Probe walkthrough passed — the mobile UI layer has no automated coverage.
- Backend behavior (AC3–AC7) reaches VERIFIED on automated gates alone; mobile UI (AC1/AC2 + UI layer of AC3–AC6) requires the manual walkthrough because no RN runner exists.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `staff-order-lookup` (a): valid code + own branch → 200 with matching order | Fully-Automated | AC3 |
| `staff-order-lookup` (b): valid code + DIFFERENT branch → 404 | Fully-Automated | AC4 |
| `staff-order-lookup` (c): nonexistent code → 404, response body **byte-identical** to (b)'s body (`expect(cResBody).toEqual(bResBody)`) | Fully-Automated | AC4, AC5 |
| `staff-order-lookup` (d): unassigned/no-branch staff → 403 | Fully-Automated | Constraint (branch-scoped authz) |
| `staff-order-lookup` (e): code for an already-`completed` order → 200 with `status='completed'` (not an error) | Fully-Automated | AC6 |
| `staff-order-lookup` (f): lowercase/whitespace input still matches (normalization) | Fully-Automated | AC3 |
| Re-completion of a completed order still rejected by existing state-machine 409 (re-asserted in lookup context) | Fully-Automated | AC6, AC7 |
| Full `packages/api` suite stays green (regression: `/orders/:orderId`, `/orders/completed` route ordering intact) | Fully-Automated | Regression guard |
| `pnpm --filter @jojopotato/api typecheck` clean | Fully-Automated | Build integrity |
| `pnpm --filter @jojopotato/mobile typecheck` — no NEW errors vs the 3 pre-existing BRN-001/002/003 baseline errors | Fully-Automated | Build integrity |
| Staff walkthrough: dashboard → Enter Pickup Code → type code → found actionable navigates to detail; wrong/nonexistent shows inline not-found; completed shows "already picked up" no-nav | Agent-Probe | AC3, AC4, AC5, AC6 (UI layer) |
| Customer confirmation + tracking screens show the pickup code | Agent-Probe | AC1, AC2 |

**REQ-TEST-LINK (per-criterion proving map):**
- AC1 — proven by: Fully-Automated backend "every order has non-empty unique `order_number`" (existing `orders.test.ts` covers uniqueness) + confirmation-screen Agent-Probe. strategy: Hybrid.
- AC2 — proven by: tracking-screen Agent-Probe walkthrough. strategy: Agent-Probe.
- AC3 — proven by: lookup test (a) + (f) + staff-screen Agent-Probe. strategy: Hybrid.
- AC4 — proven by: lookup test (b) + (c) byte-identical assertion. strategy: Fully-Automated.
- AC5 — proven by: lookup test (c). strategy: Fully-Automated.
- AC6 — proven by: lookup test (e) + re-completion 409 re-assert. strategy: Fully-Automated.
- AC7 — proven by: state-machine terminal-guard re-assert (structurally safe; test locks against regression). strategy: Fully-Automated.

No developed backend behavior is assigned Known-Gap. The only Agent-Probe/Known-Gap surface is mobile RN UI (AC1/AC2 confirmation/tracking visibility and the AC3–AC6 UI layer), which is a pre-existing project-wide runner gap (already backlog-tracked), not newly introduced by this plan.

## Test Infra Improvement Notes

(none newly identified) — the mobile RN component/E2E test-runner gap is the standing project-wide gap already tracked at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`; this plan does not widen it and adds no new untested backend surface.

## Dependencies / Risks / Integration Notes

- **No migration collision (non-issue):** this plan needs NO migration, so PR #83's claim on slot `0007` (`device_tokens`) is moot. Note only.
- **PR #84 (staff branch pickup-toggle, admin-only):** different surface (branch settings, not order lookup). No conflict. Note only.
- **PR #87 (broad mobile tabs PR):** research found `order/confirmation/[orderId].tsx` and `order/tracking/[orderId].tsx` already satisfy AC1/AC2 and need no changes. RISK: if #87 merges before EXECUTE, re-confirm those two screens still render `order.orderNumber` prominently and unchanged (checklist step 8) before declaring AC1/AC2 met — do not modify them unless a genuine prominence gap is found.
- **Route ordering (hard requirement):** `/orders/lookup` is a static segment and MUST be registered before `/orders/:orderId`, exactly like `/orders/completed`. Placing it after `:orderId` would make Express treat `lookup` as an `:orderId` value → wrong 404 path.
- **Pre-existing mobile typecheck baseline:** `apps/mobile` has 3 pre-existing unrelated typecheck errors (BRN-001/002/003 missing type stubs). These are NOT this plan's regressions — the gate is "no NEW errors," not "zero errors."
- **Star idempotency (AC7):** structurally safe today — `creditStarsForOrder` is a no-op stub and completion is compare-and-swap 409-gated. This plan's lookup path never calls the completion transition; the test locks the guarantee against regression.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/staff-005-pickup-code_PLAN_15-07-26.md`
2. **Last completed step:** VALIDATE written (Gate: PASS). No code changed.
3. **Validate-contract status:** written 15-07-26 (Gate: PASS) — see `## Validate Contract` below.
4. **Supporting context loaded:** `process/context/all-context.md`; `process/context/tests/all-tests.md`; SPEC (same folder); `packages/api/src/routes/staff.ts`; `staff-api.ts`; `(staff)/index.tsx` + `_layout.tsx`; `staff-order-status.integration.test.ts` (fixture pattern).
5. **Next step for a fresh agent:** ENTER EXECUTE MODE. Prerequisites for the API test gate: `docker compose up -d` (or the native Postgres on this box — see all-tests.md dev-machine gotcha) + `pnpm --filter @jojopotato/api db:migrate` before `pnpm --filter @jojopotato/api test`. Then EXECUTE the checklist in order (backend route + test first, then mobile). Follow execute-agent instructions E1–E5 in the contract.

## Validate Contract

Status: PASS
Date: 15-07-26
date: 2026-07-15
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 new API contract, S6 trust-boundary high-risk class, S7 6 files); dominant signal S6. Blast radius is 6 files across one interlocked backend surface + a boilerplate mobile surface — a single sequential executor (backend route + test first, then mobile) is the correct fit. Parallel/team overkill; no cross-agent coordination needed.

### Test gates (C3 5-column table — ADDITIVE; legacy line form retained below)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3 | Valid code at own branch → 200 with the matching order | Fully-Automated | lookup test (a): `pnpm --filter @jojopotato/api test` — case "valid code + own branch → 200" | A |
| AC4 | Cross-branch code → not-found; other branch's order never exposed | Fully-Automated | lookup test (b): cross-branch code → 404 | A |
| AC4/AC5 | Nonexistent code → SAME not-found + byte-identical body as cross-branch | Fully-Automated | lookup test (c): `expect(cResBody).toEqual(bResBody)` | A |
| (authz) | Unassigned/no-branch staff → 403 | Fully-Automated | lookup test (d): unassigned staff → 403 | A |
| AC6 | Already-completed order returns 200 with `status='completed'` (not an error) | Fully-Automated | lookup test (e): completed order's code → 200, status=completed | A |
| AC3 | Lowercase/whitespace input still matches (normalization) | Fully-Automated | lookup test (f): normalized input matches | A |
| AC6/AC7 | Re-completing a completed order still rejected by state-machine 409 (no 2nd star) | Fully-Automated | re-assert `canTransition` terminal-guard 409 in lookup context | A |
| (regression) | Route ordering intact; `/orders/:orderId` + `/orders/completed` unbroken | Fully-Automated | full `pnpm --filter @jojopotato/api test` suite green | A |
| (build) | API typecheck clean | Fully-Automated | `pnpm --filter @jojopotato/api typecheck` exits 0 | A |
| (build) | Mobile typecheck — no NEW errors vs 3 pre-existing BRN baseline | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` | A |
| AC3/AC4/AC5/AC6 (UI) | Staff walkthrough: dashboard → Enter Pickup Code → found actionable navigates; wrong/nonexistent inline not-found; completed shows "already picked up" no-nav | Agent-Probe | manual walkthrough on device/simulator | D |
| AC1/AC2 | Customer confirmation + tracking screens show the pickup code | Agent-Probe | manual walkthrough (confirm existing screens, no rework) | D |

gap-resolution legend: A — proven now · B — gate added by this plan's checklist · C — deferred to named later phase · D — backlog test-building stub (named residual: project-wide RN-runner gap).

C-4 reconciliation: the strategy column carries only Fully-Automated / Agent-Probe (the proving strategies used here). Known-Gap is never a strategy value — the mobile RN-runner absence is a named residual (gap-resolution D), not a proving strategy.

**Legacy line form (retained for existing consumers):**

**packages/api — new lookup route**
- Fully-automated: `pnpm --filter @jojopotato/api test` exits 0 — precondition: local Postgres up + migrated (`docker compose up -d` OR the box's native `postgresql.service` per all-tests.md dev-machine gotcha) + `pnpm --filter @jojopotato/api db:migrate`. CI provides the Postgres service. Covers lookup cases (a)-(f) + regression + terminal-guard re-assert.
- Fully-automated: `pnpm --filter @jojopotato/api typecheck` exits 0.

**apps/mobile — lookup screen + client fn + nav wiring**
- Fully-automated: `pnpm --filter @jojopotato/mobile typecheck` — gate is "no NEW errors" beyond the 3 pre-existing BRN-001/002/003 baseline errors (NOT zero errors).
- Fully-automated: `pnpm --filter @jojopotato/mobile lint` clean.
- Agent-probe: staff pickup-lookup walkthrough (found-actionable-nav / wrong / nonexistent / completed) + customer confirmation/tracking pickup-code visibility. — known-gap: no RN component/E2E runner exists project-wide (backlog: `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`); NOT newly introduced by this plan.

**Regression suite (after all sections)**
- `pnpm --filter @jojopotato/api test` exits 0 (full suite, route-ordering intact)
- `pnpm typecheck` (mobile: no new errors vs BRN baseline)
- `pnpm lint`

### Failing stubs (Fully-Automated rows — red-first starting points for execute-agent)

```
test("should return 200 with the matching order for a valid code at own branch", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (a) valid code + own branch → 200") })
test("should return 404 for a code belonging to a different branch", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (b) cross-branch → 404") })
test("should return a byte-identical 404 body for a nonexistent code and a cross-branch code", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (c) expect(cResBody).toEqual(bResBody)") })
test("should return 403 for unassigned/no-branch staff", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (d) unassigned → 403") })
test("should return 200 with status=completed for an already-completed order's code", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (e) completed → 200 status=completed") })
test("should match on lowercase/whitespace input via normalization", () => { throw new Error("NOT IMPLEMENTED — TDD stub: lookup (f) normalization") })
test("should still reject re-completing a completed order with a 409", () => { throw new Error("NOT IMPLEMENTED — TDD stub: state-machine terminal-guard 409 re-assert") })
```

### Execute-agent instructions

- **E1 (Section A — the security crux, MANDATORY):** the lookup handler MUST use the single combined WHERE filter `and(eq(orders.branch_id, branchId), eq(orders.order_number, code))` and a single `!order → 404` branch (plan checklist 1c/1d). Do NOT copy the pattern of the adjacent `GET /orders/:orderId` handler (staff.ts:178-186), which loads by id then returns **403** on cross-branch mismatch — that pattern LEAKS order existence and would violate the byte-identical-404 requirement (SPEC US-3/AC4/AC5). The wrong pattern is literally adjacent in the same file; do not mirror it.
- **E2 (Section A — route ordering):** register `GET /orders/lookup` AFTER `staffRouter.get('/orders/completed', ...)` and BEFORE `staffRouter.get('/orders/:orderId', ...)`. Placing it after `:orderId` makes Express treat `lookup` as an `:orderId` value → wrong 404 path. Add the byte-identical test (c) `expect(cResBody).toEqual(bResBody)` assertion — this is a required, not optional, assertion.
- **E3 (Section A — test fixture):** the new `staff-order-lookup.integration.test.ts` is hermetic/self-seeding like its siblings — copy the `signUpAndGetCookie` + branch/customer/staff seeding + `insertOrder` helpers into the new file. Extend the copied `insertOrder` to RETURN the seeded `order_number` (today it returns only `orderId`) so cases can look up by code. Each staff integration file is self-contained by convention; do not extract a shared module.
- **E4 (Section B — pre-EXECUTE recheck, checklist step 8):** before declaring AC1/AC2 met, confirm `order/confirmation/[orderId].tsx` and `order/tracking/[orderId].tsx` still render `order.orderNumber` prominently. If PR #87 merged and changed them, flag before touching — do NOT modify them unless a genuine prominence gap is found.
- **E5 (Section B — shared UI):** use `@jojopotato/ui` `Input` + `Button` for the lookup screen; no one-off inputs/buttons (global convention).

### High-risk pack

Required: **no** (advisory light-note only). This is a trust-boundary class (branch isolation) but a READ-only path with byte-identical-404 security-by-construction, Fully-Automated cross-branch + byte-identical coverage, and verbatim reuse of the STAFF-001 `resolveBranchScope` pattern — materially lower stakes than STAFF-003's write state-machine (which carried `mustStopBeforeFinalize: true`). Recommended (not gate-blocking): before marking `✅ VERIFIED`, execute-agent records a one-paragraph adversarial note confirming lookup tests (b)+(c) prove wrong-branch and nonexistent are indistinguishable. No 5-artifact `harness/` pack mandated.

### Dimension findings
- Infra fit: PASS — append-only route slot (staff.ts:133→165) free; vitest+Postgres runner real; mobile edits mirror existing NAV_CARDS + Stack.Screen.
- Test coverage: PASS — backend Fully-Automated (hermetic pattern), trust-boundary covered by Fully-Automated cross-branch + byte-identical (exceeds hybrid minimum); mobile Agent-Probe (pre-existing RN-runner gap, not widened).
- Breaking changes: PASS — purely additive; no existing-export signature change; serializer/resolveBranchScope reused verbatim; no packages/types change; only regression vector is route ordering (mitigated).
- Security surface: PASS — byte-identical 404 by construction verified against live code (combined WHERE filter); one mandatory execute instruction (E1) to not mirror the adjacent 403-leaking `:orderId` pattern.
- Section A (backend route + integration test) feasibility: PASS — insertion point + reuse targets confirmed; only anticipated gap (insertOrder returns order_number) already flagged by plan; highest-risk edit is the E1 security query.
- Section B (mobile screen + client fn + nav) feasibility: PASS — staffFetch signature + fetchStaffOrderByCode mirror + NAV_CARDS/Stack.Screen shapes all confirmed; highest-risk edit is the low PR #87 recheck.

### Open gaps
- Mobile RN UI behavior (AC1/AC2 + UI layer of AC3-AC6): known-gap — documented, Agent-Probe only; project-wide RN component/E2E runner absence, already backlog-tracked at `process/features/staff-dashboard/backlog/staff-mobile-rn-test-runner-gap_NOTE_13-07-26.md`. NOT newly introduced by this plan; not this plan's to resolve.

### What This Coverage Does NOT Prove
- The Fully-Automated backend gates prove branch-scoped lookup, byte-identical 404, normalization, and terminal-guard 409 at the API layer — they do NOT prove the mobile screen renders correctly, that the "Enter Pickup Code" nav card navigates, that a found actionable order routes to `order-detail/[orderId]`, that inline not-found/already-picked-up messages display, or that the customer confirmation/tracking screens visually show the code. All mobile-render behavior is Agent-Probe only (no RN runner).
- The typecheck gates prove no type breakage — they do NOT validate runtime `fetch` response shape against `StaffOrderDetail` (a bare `as T` cast is not runtime-checked; this class of bug bit `pickup-order-flow` EVL). The Agent-Probe walkthrough is the compensating check.
- The regression gate proves existing API routes stay green — it does NOT prove behavior under real concurrent lookups (out of scope; no oracle beyond existing compare-and-swap).

Gate: PASS (no FAILs, no unresolved CONCERNs; plan correct as written, execute-agent instructions E1-E5 recorded)
Accepted by: session (autonomous VALIDATE subagent) — no CONCERNs required acceptance; the mobile Agent-Probe residual is the pre-existing, SPEC-locked, backlog-tracked project-wide RN-runner gap, on record as a known-gap (not a newly accepted concern).

## Autonomous Goal Block

```
SESSION GOAL: STAFF-005 (PUP-002) — staff pickup-code lookup route + mobile "Enter Pickup Code" screen
Charter + umbrella plan: N/A — single standalone plan (staff-dashboard feature, no umbrella program)
Autonomy: reversible decisions auto-proceed; hard-stop only on irreversible/outward-facing actions not in this contract. Per feedback_autonomous_phase_execution — BLOCKED → backlog + continue.
Hard stop conditions / safety constraints:
- Do NOT mirror the adjacent GET /orders/:orderId handler's load-then-403 pattern — it leaks order existence and breaks the byte-identical-404 requirement (use the single combined WHERE filter; see contract E1).
- No DB migration, no order-state-machine change, no PATCH /orders/:orderId change (SPEC out-of-scope).
- Do NOT modify order/confirmation or order/tracking screens unless a genuine prominence gap is found (contract E4).
- Do NOT mark VERIFIED until the user confirms the Agent-Probe staff walkthrough passed (mobile UI has no automated coverage).
Next phase: EXECUTE — process/features/staff-dashboard/active/staff-005-pickup-code_15-07-26/staff-005-pickup-code_PLAN_15-07-26.md
Validate contract: inline in plan (## Validate Contract, Gate: PASS)
Execute start: backend route + new staff-order-lookup.integration.test.ts first, then mobile (staff-api.ts -> pickup-lookup.tsx -> index.tsx NAV_CARDS -> _layout.tsx). Gates: pnpm --filter @jojopotato/api test | pnpm --filter @jojopotato/api typecheck | pnpm --filter @jojopotato/mobile typecheck (no new errors) | pnpm --filter @jojopotato/mobile lint | Agent-Probe staff+customer walkthrough. High-risk pack: no.
```

## Next Step

Plan validated — **Gate: PASS**. Say **ENTER EXECUTE MODE** to implement the checklist (backend route + integration test first, then mobile), following execute-agent instructions E1–E5 in the Validate Contract. Do not mark `✅ VERIFIED` until the Agent-Probe walkthrough is confirmed.
