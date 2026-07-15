---
name: plan:mobile-tabs-order-flow-completion-phase-06-ux-polish
description: "Mobile Tabs + Order-Flow Completion — Phase 06: cross-tab UX-friendliness polish (loading/empty/error states, skeletons, a11y, react-query consistency)"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
  feature: mobile-tabs-order-flow-completion
  phase: phase-06
---

# Phase 06 — Cross-Tab UX Polish

**Program:** mobile-tabs-order-flow-completion
**Umbrella plan:** process/general-plans/completed/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26 (supplemented 15-07-26; VALIDATE gap-fix 15-07-26)
**Status**: ✅ VERIFIED — EXECUTE + EVL complete, all gates green (see Phase Loop Progress)
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/completed/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_REPORT_14-07-26.md

## Overview / Context

TL;DR: This is the FINAL phase and its scope is now TIGHTLY BOUNDED to 4 concrete gaps found by
RESEARCH: (1) migrate `branches/index.tsx`'s local-fetch to react-query while preserving its
already-correct closed-branch display, (2) replace the last 2 `__DEV__`-gated dev links in
`order/index.tsx` with real nav icons, (3) add pay-at-branch copy to checkout/confirmation
(real unstarted gap), (4) a11y pass on exactly 3 lowest-density screens (cart, checkout, coupons).
Everything else that the original plan worried about (Home/Rewards/Account loading-empty-error,
a Skeleton primitive, a broad a11y sweep, a broad react-query migration) was ALREADY DELIVERED by
Phases 3-5 or is confirmed unnecessary — see Inner Loop Refresh Note. No API/behavior/pricing
change. Read `process/context/all-context.md` first. Runs LAST; depends on Phases 1-5.

**VALIDATE-found addendum (15-07-26):** inner PVL discovered a real, silent regression risk in
B1's react-query migration — see the `priority` sort-order gap called out in Blast Radius and
Checklist B1a below. Everything else in this plan verified clean against actual code.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: Branches tab uses react-query (unfiltered — closed branches still shown with badge), matching the rest of the app's data layer.
- AC2: zero `"Dev:"` nav-link occurrences remain in `apps/mobile/src/app/(tabs)` (down from 2; the `rewards/` one was already removed in Phase 4).
- AC3: pay-at-branch messaging present on checkout + confirmation; `payment_status` stays `unpaid`; no other order-flow behavior changes.
- AC4: cart.tsx, checkout.tsx, coupons.tsx have `accessibilityRole`/`accessibilityLabel` on bare `Pressable`/`TouchableOpacity` elements not already covered by `Button`/`Card` primitives.
- AC5: typecheck + lint + format:check green; mobile test suite (vitest+jest) green; `packages/api` orders.test.ts (41 cases) stays green as an order-flow regression guard.
- AC6 (added 15-07-26 — VALIDATE gap-fix): Branches tab's no-location sort order (by `priority`) is preserved after the B1 migration — not silently degraded to arbitrary DB-return order.

## Entry Gate

- Phases 1-5 exit gates all passed (all tabs delivering real data). Confirmed against the umbrella's `## Program Status Table` and `## Current Execution State` (15-07-26): Phases 0-5 all ✅ VERIFIED/COMPLETE.

## Blast Radius (bounded — supplemented 15-07-26; gap-fixed 15-07-26)

- `apps/mobile/src/app/(tabs)/branches/index.tsx` — migrate its local `useEffect`/`useState` fetch
  (`apiFetch('/api/branches')` via `features/branches/api.ts`'s `mapApiBranch`) to
  `useQuery(['branches','all'], getBranches)` (`lib/api-client.ts`'s canonical, UNFILTERED
  `/branches` endpoint). **Do NOT reuse `useBranch()`'s exposed `branches` list** — it is
  pre-filtered `openOnly` (on `isAcceptingPickup`) and would silently drop branches not accepting
  pickup. Preserve the screen's EXISTING loading (`ActivityIndicator`)/error(+retry)/empty JSX and
  its existing per-item `isOpen` computation (`getIsOpenNow(item.openingHours)`, independent of any
  `isOpen` field on the fetched object) + closed badge — only the data-fetch mechanism changes.
  **Type note (confirmed via source read, not a real reconciliation task):** both the old
  `mapApiBranch()` and the new `getBranches()` already return `PickupBranch` (`@jojopotato/types`)
  — there is no separate "Branch" type and no field-name reconciliation needed; this is a
  low-friction swap of the fetch mechanism only.
- **B1a — `priority` field regression (VALIDATE-found, 15-07-26 — see Checklist B1a):** the
  canonical `/branches` route's `serializeBranch()` (`packages/api/src/routes/lib/serializers.ts`)
  and its mobile-side `BranchResponse` interface (`apps/mobile/src/lib/api-client.ts`) do **NOT**
  include the `priority` field, while the legacy `/api/branches` route (currently used) does — and
  `branchesRouter`'s `GET /` has no `ORDER BY` at all in the no-lat/lng case. Since
  `branches/index.tsx`'s no-location sort (`list.sort((a,b) => (a.priority ?? 0) - (b.priority ?? 0))`)
  depends on `priority`, migrating to `getBranches()` as-is will make every branch's `priority`
  silently `undefined` — sort degrades from priority-ordered to arbitrary DB-return order. This is
  presentation-only (branch list order; does not affect AC1's closed-branch badge, order placement,
  pricing, or payment) but is a real, silent regression with no typecheck/lint catch (the field is
  `priority?: number` — optional — on `PickupBranch`). See Checklist B1a for the fix.
- `apps/mobile/src/app/(tabs)/order/index.tsx` — replace the 2 `__DEV__`-gated `"Dev: View Cart"` /
  `"Dev: Order History"` links (lines ~84, ~89) with real header nav icons (Cart + History; both
  are real, fully-wired screens). Confirmed via source read: exactly these 2 occurrences exist,
  both in this file.
- `apps/mobile/src/app/(tabs)/order/checkout.tsx`, `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` — add pay-at-branch copy only (no behavior change; `payment_status` stays `unpaid`). Confirmed insertion point: checkout.tsx's existing "Payment" `Card` block (around the `PAYMENT_METHOD_LABELS[paymentMethod]` row) is the natural spot; no logic touched.
- `apps/mobile/src/app/(tabs)/order/cart.tsx`, `apps/mobile/src/app/(tabs)/order/checkout.tsx`, `apps/mobile/src/app/(tabs)/rewards/coupons.tsx` — a11y pass (accessibilityRole/Label on bare Pressable/TouchableOpacity not already covered by shared primitives). These are the lowest-a11y-density screens found by RESEARCH (0/3, 0/6, 0/0 respectively). Confirmed via source read: `Button` already sets `accessibilityRole="button"` (do not double-add on Button-composed elements); `Card` is a non-interactive plain `View` (no role needed, never a bare-pressable target itself); checkout.tsx's confirm-drawer backdrop `Pressable` (`style={StyleSheet.absoluteFill} onPress={dismissConfirm}`) is a confirmed real bare-Pressable target; coupons.tsx confirmed to have zero bare Pressable/TouchableOpacity (0/0 — this item is a no-op there, consistent with RESEARCH's density claim).
- NEW test file: `apps/mobile/src/app/(tabs)/branches/index.test.tsx` (jest component test).

**Explicitly OUT of this phase's blast radius (scope guards — see Inner Loop Refresh Note):**
- `packages/api/**` — no backend/deal-logic changes; `useReorderConflicts()` render path in `cart.tsx` stays untouched (confirmed present/untouched via source read).
- **Bounded exception (B1a only, added 15-07-26):** a 2-line additive-only passthrough of the
  already-existing `branches.priority` DB column through `serializeBranch()`
  (`packages/api/src/routes/lib/serializers.ts`) and the mobile `BranchResponse` interface
  (`apps/mobile/src/lib/api-client.ts`) is IN scope — see Checklist B1a. This is not
  backend/deal-logic; it is a response-shape passthrough of a field the DB already has, required to
  avoid a regression this phase's own migration would otherwise introduce. No other `packages/api`
  change is licensed by this exception.
- No new `Skeleton` primitive — reuse existing `ActivityIndicator`/`EmptyState` (already consistent per Phases 3-5).
- No async-state additions to `edit-profile.tsx`/`help.tsx`/`payment-method.tsx` (local-state screens, not data-fetching — not a real gap).
- No broad react-query migration beyond Branches (no other local-fetch offenders found).
- No a11y sweep beyond the 3 named screens.
- Legacy `packages/api/src/index.ts` inline `/api/branches` route duplication: unchanged, tracked as an existing Open Gap for a future backlog note (not this phase's job to retire).

## Implementation Checklist

### Step A — Consistency audit (SUPERSEDED — mostly already done)

- [x] A1. Inventory complete via RESEARCH: Home/Rewards/Account/order screens already use a consistent pattern (`ActivityIndicator` + `@jojopotato/ui` `EmptyState` + error+retry, delivered by Phases 3-5). Only `branches/index.tsx`'s DATA SOURCE (not its UI pattern, which is already fine) is the outlier.
- [x] A2. No new `Skeleton` primitive needed — existing `ActivityIndicator`/`EmptyState` pattern is sufficient and already consistent. (Reverses the original plan's A2 assumption that a Skeleton primitive was missing-and-needed; it is missing but NOT needed.)

### Step B — Apply (bounded)

- [x] B1. Migrate `branches/index.tsx` to `useQuery(['branches','all'], getBranches)` per the Blast Radius guardrail above. Keep existing loading/error/empty JSX and closed-branch badge logic unchanged — only swap the fetch mechanism. (No `Branch`/`ApiBranch`/`PickupBranch` field-name reconciliation needed — confirmed both already resolve to `PickupBranch`.) DONE — useState/useEffect/reloadToken removed; `onRetry` now calls `refetch()`; `isPending`/`isError` replace the manual flags.
- [x] B1a. **(execute-agent instruction — VALIDATE gap-fix, 15-07-26).** APPLIED (not deferred). Added `priority: number` to `ApiBranch` (serializers.ts) + `priority: branch.priority` in `serializeBranch()`; added `priority: number` to mobile `BranchResponse` (api-client.ts). `getBranches()` spreads it through automatically. Before or alongside B1: add
  `priority: branch.priority` to `serializeBranch()`'s return object
  (`packages/api/src/routes/lib/serializers.ts`) and add `priority: number` to the `BranchResponse`
  interface in `apps/mobile/src/lib/api-client.ts` (`getBranches()` already spreads `...branch`, so
  no other change is needed there — the field will flow through automatically once both shapes
  declare it). This is a 2-line additive-only fix, zero risk to deal/order logic. **If for any
  reason this fix cannot be applied within the bounded exception above** (e.g. an unexpected
  conflict is discovered), do NOT force it — instead keep the existing client-side sort as-is,
  write a backlog note documenting the accepted no-location sort-order degradation, and record it
  as a Known-Gap in the phase report. Prefer the fix; only defer if genuinely blocked.
- [x] B2. `order/index.tsx`: replace the 2 `__DEV__`-gated dev links with real Cart + History header nav icons. DONE — in-screen header row (Menu heading + `cart-outline`/`receipt-outline` Ionicons Pressables, both a11y-labelled); `DevLink` component + `devLinks` style removed; 0 `"Dev:"` remain.
- [x] B3. Add pay-at-branch copy to `checkout.tsx` and `confirmation/[orderId].tsx` (copy-only, no behavior change). DONE — "Pay when you pick up — settle your order in cash or card at the branch counter." added to checkout's Payment card and the confirmation screen. No `payment_status`/`useCheckout` logic touched.
- [x] B4. a11y pass on exactly `cart.tsx`, `checkout.tsx`, `coupons.tsx`: add `accessibilityRole`/`accessibilityLabel` to bare `Pressable`/`TouchableOpacity` elements. DONE — checkout.tsx's confirm-drawer backdrop `Pressable` got `accessibilityRole="button"`/`accessibilityLabel="Dismiss order confirmation"`. cart.tsx & coupons.tsx confirmed ZERO bare `Pressable`/`TouchableOpacity` (all interaction via `Button`/`Card`/`CartItem`/`CouponCard`/`BranchCard` primitives) → correctly-scoped no-op, matching the plan's density claim.

### Step C — Verify + cleanup

- [x] C1. Confirm zero `"Dev:"` occurrences remain (grep). DONE — `grep -rn "Dev:" apps/mobile/src/app/(tabs)` → 0 occurrences.
- [x] C2. Write `apps/mobile/src/app/(tabs)/branches/index.test.tsx` (jest, using existing `test-utils/render.tsx` + `jest-setup.ts`): renders BOTH open and closed branches with correct badges (the E1 closed-branch regression guard, now a real automated assertion instead of Agent-Probe), plus loading and error+retry states, **plus (added 15-07-26, proves AC6/B1a) a no-location-granted-fixture assertion that branches render in ascending-`priority` order** — this is the regression guard for the B1a gap; if B1a's backend fix was deferred to a backlog note instead of applied, this assertion is expected to (and should) fail against arbitrary order, and the test should instead assert the documented degraded behavior explicitly (do not silently skip the assertion either way — one of the two must be written and pass).
- [~] C3. SKIPPED (honest report, non-blocking per plan). The checkout screen crashes at render under the shared jest reanimated mock: it uses `FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`/`Easing`/`cancelAnimation` (e.g. `entering={FadeIn.duration(200)}`), none of which are in `test-utils/jest-setup.ts`'s reanimated stub. Extending that shared mock is a test-infra change touching ALL mobile jest tests — out of this bounded phase's scope. `orders.test.ts` (C4) remains the hard regression gate.
- [x] C4. Re-run `packages/api` `orders.test.ts` (41 cases) as the order-flow regression guard — must stay green, unmodified. DONE — orders.test.ts 41/41 green; full API suite 189/189 green (branches.test.ts 7/7 green — B1a additive `priority` didn't break it).

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check
# Expected: exit 0

pnpm --filter @jojopotato/mobile test
# Expected: exit 0 — vitest + jest suites green (no regressions vs Phase 4/5 baseline: vitest 44 + jest 19)

pnpm --filter @jojopotato/api test
# Expected: exit 0 — orders.test.ts (41 cases, confirmed via source read 15-07-26) + full API suite stay green (order-flow regression guard; Phase 6 must not touch packages/api beyond the bounded B1a exception)

grep -rn "Dev:" apps/mobile/src/app/\(tabs\) || echo "no dev nav links in production tabs"
# Expected: no dev nav links remain (0 occurrences; corrected from stale "3" — rewards/ was already fixed in Phase 4, only order/index.tsx's 2 remain pre-fix)
```

- All checklist items checked.
- Agent-Probe: pay-at-branch copy reads clearly on checkout/confirmation; a11y improvements verified on the 3 named screens.
- Fully-Automated: Branches tab react-query migration + closed-branch display + no-location sort-order preservation (or documented degradation) proven by `branches/index.test.tsx` (upgraded from Agent-Probe).
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- B1's react-query migration reveals deep coupling that risks regressing Branches beyond the B1a priority-field issue already found and fixed by this plan (defer any NEW such issue via backlog note; do not force it).
- `packages/api` `orders.test.ts` regresses for any reason traceable to this phase's changes (should be near-impossible given the bounded B1a-only touchpoint — treat as a hard stop if it happens).
- B1a's additive `priority` passthrough somehow cannot be applied without touching deal/order logic (defer via backlog note per B1a's own fallback instruction; do not force it).

## Phase Loop Progress

- [x] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; per-tab loading/empty/error inventory gathered; plan drift checked (findings folded in this supplement)
- [x] 2. INNOVATE — innovate-agent: bounded scope locked (4 must-dos + 3-screen a11y); Decision Summary produced
- [x] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (this pass, 15-07-26)
- [x] 4. PVL — vc-validate-agent: full V1-V7 re-run from V1 against the bounded scope (this pass, 15-07-26) — CONDITIONAL gate; one real gap found (B1a priority-field regression) and fixed directly into this plan; validate-contract below.
- [x] 5. EXECUTE — all code checklist items done (B1/B1a/B2/B3/B4/C1/C2/C4); C3 skipped (honest, non-blocking); full Exit Gate green (mobile typecheck/lint/format 0; vitest 44 + jest 23; api 189 incl. orders 41; 0 "Dev:")
- [x] 6. EVL — confirmed independently: mobile vitest 44 + jest 23 green, api 189/189 (orders 41/41, branches 7/7), typecheck/lint/format green, 0 "Dev:" links, order flow un-regressed. No new gaps beyond C3 (already recorded, non-blocking). Follow-up stub: extend shared jest reanimated mock (Test Infra Gaps Found) — captured in backlog, not blocking.
- [x] 7. UPDATE PROCESS — phase report written (already present), umbrella state updated, program archived, commit deferred to orchestrator

**Validate-contract below. Gate: CONDITIONAL — proceed to EXECUTE with the B1a instruction on record (execute-agent must apply it or explicitly defer per its documented fallback).**

## Inner Loop Refresh Note

**Date:** 15-07-26
**Trigger:** Inner-loop R+I ran (RESEARCH found the plan predates Phase 4/5 delivery and the jest
runner; INNOVATE locked a bounded final-polish scope).

**What changed since the 14-07-26 outer-PVL contract:**
1. Scope narrowed from a broad cross-tab audit to 4 concrete gaps: Branches react-query migration,
   2 dev-link removals (not 3 — `rewards/`'s was already fixed in Phase 4), pay-at-branch copy,
   and a11y on exactly 3 screens (cart, checkout, coupons) instead of all 10 screens.
2. Step A (Consistency audit) is now marked SUPERSEDED/done — Home/Rewards/Account
   loading/empty/error was already delivered by Phases 3-5; no new `Skeleton` primitive is needed.
3. Explicit scope guards added: no `packages/api` touch (see B1a bounded exception, added
   15-07-26), no async-state additions to local-state screens (edit-profile/help/payment-method),
   no broad react-query migration, no broad a11y sweep.
4. Test tier upgrade: the jest runner (added by Phase 4/5) lets the Branches migration's closed-
   branch regression guard move from Agent-Probe to Fully-Automated via a new component test
   (`branches/index.test.tsx`). A best-effort checkout jest test is attempted as additional
   insurance but is not required to pass the exit gate.
5. Dev-link count corrected: 3 → 2 (both in `order/index.tsx`, `__DEV__`-gated).
6. Regression hard gate added: `packages/api` `orders.test.ts` (41 cases) must stay green — proves
   the order-placement flow is unregressed by this presentation-only phase.

**PVL re-run result (this pass, 15-07-26):** V1-V7 re-ran against the bounded scope. All 4
Blast-Radius items verified mechanically feasible against actual current source (branches/index.tsx,
order/index.tsx, checkout.tsx, confirmation/[orderId].tsx, cart.tsx, coupons.tsx, use-branch.ts,
api-client.ts, packages/ui's Button/Card, packages/api's branches routes + serializers,
orders.test.ts). The prior CONDITIONAL contract's concerns (B2 mislabeling, B3 scope vagueness, C1
grep-count mismatch) are all confirmed resolved by the 15-07-26 supplement. One NEW real gap was
found during this PVL pass and fixed directly into this plan text: **B1a — the canonical `/branches`
route's `serializeBranch()` drops the `priority` field that the branch list's no-location sort
depends on, silently degrading sort order after B1's migration.** Fixed via a bounded, additive-only
2-line passthrough exception to the `packages/api/**` scope guard (see Blast Radius/Checklist B1a).

## Touchpoints

- `apps/mobile/src/app/(tabs)/branches/index.tsx`, `apps/mobile/src/features/branches/api.ts` (or its replacement/removal once migrated), `apps/mobile/src/lib/api-client.ts` (`getBranches()`, `BranchResponse` — read-write for B1a's `priority` field addition)
- `packages/api/src/routes/lib/serializers.ts` (`serializeBranch()` — write, B1a bounded exception only)
- `apps/mobile/src/app/(tabs)/order/index.tsx`
- `apps/mobile/src/app/(tabs)/order/checkout.tsx`
- `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx`
- `apps/mobile/src/app/(tabs)/order/cart.tsx`
- `apps/mobile/src/app/(tabs)/rewards/coupons.tsx`
- NEW: `apps/mobile/src/app/(tabs)/branches/index.test.tsx`
- NOT `packages/api/**` beyond the named B1a exception (explicitly out of scope this phase)

## Public Contracts

- No API changes; no behavior/pricing change. Presentation and consistency only. **Exception:** B1a
  adds one additive field (`priority`) to the `/branches` response shape — backward-compatible,
  no existing consumer breaks (an added optional-safe field).
- Pay-at-branch order behavior explicitly unchanged; `payment_status` stays `unpaid`.
- Branches tab must continue to show closed branches (with closed indicator) after B1's migration — now proven by an automated test (`branches/index.test.tsx`), not just Agent-Probe.
- Branches tab's no-location sort order (by `priority`) must not silently degrade — proven by `branches/index.test.tsx`'s new sort-order assertion (AC6, added 15-07-26).
- `useReorderConflicts()` render path in `cart.tsx` (unrelated `ordering-cart` feature) is explicitly preserved untouched.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| typecheck + lint + format:check green | Fully-Automated | AC5 |
| `pnpm --filter @jojopotato/mobile test` green (vitest+jest, no regression vs Phase 4/5 baseline) | Fully-Automated | AC5 |
| `pnpm --filter @jojopotato/api test` green — `orders.test.ts` (41 cases, confirmed) unmodified and passing | Fully-Automated | AC5 (order-flow regression guard) |
| `branches/index.test.tsx` — renders open AND closed branches with correct badges + loading/error states | Fully-Automated (upgraded from Agent-Probe via jest runner) | AC1 |
| `branches/index.test.tsx` — no-location fixture renders branches in ascending-`priority` order (or documented degraded-order assertion if B1a deferred) | Fully-Automated (new, 15-07-26 gap-fix) | AC6 |
| Zero `"Dev:"` grep matches in `apps/mobile/src/app/(tabs)` | Fully-Automated | AC2 |
| Pay-at-branch copy present and reads clearly on checkout/confirmation | Agent-Probe | AC3 |
| a11y roles/labels present on cart.tsx/checkout.tsx/coupons.tsx bare Pressable/TouchableOpacity | Agent-Probe | AC4 |
| Optional checkout-screen jest regression test (best-effort) | Fully-Automated if feasible, else Known-Gap (non-blocking) | AC3 (insurance only) |

## Test Infra Improvement Notes

- Screen-level UX judgment (pay-at-branch copy quality, a11y visual/structural correctness) remains
  Agent-Probe — no RN a11y linter or screen-reader automation exists in this repo (project-wide,
  pre-existing gap). The jest runner (Phase 4/5) DOES let the Branches closed-branch regression
  move to Fully-Automated this phase, which is a real improvement over the prior CONDITIONAL
  contract's all-Agent-Probe assumption.
- VALIDATE finding (carried over, unchanged): `packages/api/src/index.ts` defines an inline legacy
  `GET /api/branches` route alongside the canonical `/branches` router. Out of scope for this phase;
  recommend a backlog note after Phase 6 closes to evaluate retiring the legacy route.
- VALIDATE finding (new, 15-07-26): the legacy `/api/branches` route independently also lacks a
  `priority`-based `ORDER BY` fallback issue — no, it DOES order by priority (`asc(branches.priority)`)
  and DOES select all columns including `priority`; only the CANONICAL `/branches` route (via
  `serializeBranch()`) omits `priority` from its response shape and has no `ORDER BY` in the
  no-lat/lng case. B1a fixes the response-shape omission; consider (non-blocking, future backlog)
  also adding an explicit `.orderBy(asc(branches.priority))` to `branchesRouter`'s `GET /` for
  server-side defense in depth, matching the legacy route's behavior — not required this phase
  since the client already re-sorts by `priority` once the field is present.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/completed/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_PLAN_14-07-26.md`
- Last completed step: UPDATE PROCESS (Step 7) — all 7 inner-loop steps complete; EXECUTE + EVL green, program archived (see Phase Loop Progress).
- Validate-contract status: historical record below was CONDITIONAL at PVL time (1 concern, B1a); B1a was applied during EXECUTE and independently confirmed green at EVL — no open gaps remain.
- Supporting context: Phase 3/4/5 reports (delivered screens + jest runner), `packages/ui/src/index.ts`, `theme.ts` tokens, `apps/mobile/src/test-utils/render.tsx` + `jest-setup.ts`
- Next step: none — phase VERIFIED and archived. This handoff block is retained as historical record.

## Validate Contract

Status: CONDITIONAL
Date: 15-07-26
date: 2026-07-15
generated-by: inner-pvl: phase-6
supersedes: 14-07-26 (outer-pvl) — inner PVL has current evidence (scope materially changed per Inner Loop Refresh Note; prior contract's concerns are superseded/resolved by the 15-07-26 supplement, and this pass found one new gap, B1a, fixed directly into this plan)

Parallel strategy: sequential
Rationale: single bounded phase, 4 small independent-but-related edits in one small app, no
schema/container/multi-package surface; signal score 1/7 (only S7-adjacent "5+ files" edges close
but blast radius is 6 mobile files + 2 tiny backend passthrough lines, still small and low-risk) —
sequential vc-execute-agent is the right fit, no fan-out needed for EXECUTE.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | typecheck/lint/format clean | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check` | A |
| AC5 | mobile test suite green, no regression vs Phase 4/5 baseline (vitest 44 + jest 19) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` | A |
| AC5 | order-flow regression guard unbroken | Fully-Automated | `pnpm --filter @jojopotato/api test` (orders.test.ts, 41 cases confirmed) | A |
| AC1 | Branches tab shows open+closed branches with correct badges after react-query migration | Fully-Automated | `apps/mobile/src/app/(tabs)/branches/index.test.tsx` (new, C2) | B |
| AC6 | Branches tab no-location sort order preserved (or documented degradation) after migration | Fully-Automated | `apps/mobile/src/app/(tabs)/branches/index.test.tsx` sort-order assertion (new, C2, added by this PVL pass) | B |
| AC2 | zero stale "Dev:" nav links in production tabs | Fully-Automated | `grep -rn "Dev:" apps/mobile/src/app/(tabs)` (Exit Gate) | A |
| AC3 | pay-at-branch copy reads clearly on checkout/confirmation | Agent-Probe | Manual walkthrough: open checkout with `pay_at_branch` selected, confirm copy is present and clear; repeat on confirmation screen | A |
| AC4 | a11y roles/labels present on bare Pressable/TouchableOpacity in cart.tsx/checkout.tsx/coupons.tsx | Agent-Probe | Manual code + screen-reader-adjacent review of the 3 named screens post-edit | A |
| AC3 (insurance) | optional checkout jest regression test | Fully-Automated if feasible, else Known-Gap | Attempted jest test per C3; if infeasible, report honestly — non-blocking | D (if deferred) |

gap-resolution legend: A = proven now, B = fixed in this plan (gate added by this plan's checklist), C = deferred to a named later phase/plan, D = backlog test-building stub.

Failing stub (AC1, `branches/index.test.tsx`):
```
test("should render both open and closed branches with correct badges", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: renders open and closed branches with per-item isOpen badge")
})
```

Failing stub (AC6, `branches/index.test.tsx`):
```
test("should preserve ascending-priority sort order with no location granted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: no-location fixture renders branches sorted by ascending priority after B1 migration")
})
```

Failing stub (AC2, grep-based — no code stub applicable; Exit Gate command is the gate itself):
N/A — Exit Gate grep command IS the fully-automated proving test; no separate test file needed.

Dimension findings:
- Infra fit: PASS — no container/port/infra surface touched; single small mobile app + 2-line backend passthrough.
- Test coverage: CONCERN → resolved — B1a's regression would have shipped with zero test coverage (no typecheck/lint catch, `priority?: number` is optional); this PVL pass added an explicit C2 sort-order assertion (AC6) closing the gap. Everything else (dev-link grep, orders.test.ts count, closed-branch badge) has real, verified-accurate Fully-Automated coverage.
- Breaking changes: CONCERN → resolved — B1a is the one real breaking-adjacent finding (silent behavioral regression, not a type/compile break); fixed via a bounded additive-only backend exception with an execute-agent fallback instruction if the fix proves infeasible. No other breaking changes found; `payment_status`/order-flow/deal logic confirmed untouched.
- Security surface: PASS — no auth/billing/schema/secret-boundary surface touched.
- Section B1 (Branches react-query migration): CONCERN → resolved via B1a fix — mechanically feasible (PickupBranch-to-PickupBranch swap confirmed, useBranch() correctly avoided, closed-branch badge logic confirmed preserved); gap found: priority field regression (now fixed in plan).
- Section B2 (dev-link replacement): PASS — mechanical feasibility confirmed via source read (exactly 2 occurrences, both in order/index.tsx, matches plan claim exactly).
- Section B3 (pay-at-branch copy): PASS — mechanically feasible; confirmed insertion point in checkout.tsx's existing Payment Card block; confirmation screen has an equivalent natural insertion point; no logic/payment_status touch needed.
- Section B4 (a11y pass): PASS — confirmed Button already sets accessibilityRole="button" (avoids double-add); confirmed Card is non-interactive (no role needed); confirmed checkout.tsx's backdrop Pressable is a real bare target; confirmed coupons.tsx's 0/0 density claim (no bare Pressable/TouchableOpacity present — this item is a correctly-scoped no-op there).
- Section C (verify/cleanup): PASS — orders.test.ts count (41) verified exact via full source read; C2 test target well-specified against the established Phase 4/5 test-utils pattern; C1 grep expectation (0 after fix) confirmed correct.

Open gaps: none unresolved. B1a (priority-field regression) is resolved via a direct plan fix (bounded scope exception + execute-agent instruction + new C2 test assertion) — not deferred.

What this coverage does NOT prove:
- typecheck/lint/format gate: does not prove runtime correctness of pay-at-branch copy wording or a11y label quality (Agent-Probe covers that).
- mobile test suite gate: does not prove on-device gesture/screen-reader behavior — no RN E2E/a11y-linter runner exists in this repo (project-wide, pre-existing gap).
- orders.test.ts gate: proves the backend order-placement/pricing/discount logic is unregressed; does not directly exercise the mobile checkout screen's rendering of the new pay-at-branch copy (that's Agent-Probe's job).
- branches/index.test.tsx (AC1+AC6): proves render + badge + sort-order correctness under jest's DOM-less RN test environment; does not prove real-device map/bottom-sheet interaction (native-only code path, `Platform.OS === 'web'` branch is what jest exercises) — this is an accepted, pre-existing project-wide gap (no RN native-runner), not new to this phase.
- Exit Gate grep for "Dev:": proves no literal string match remains; does not prove the new Cart/History header nav icons are correctly wired (that's Agent-Probe's job, folded into AC2's broader "replace with real nav" intent).
- Agent-Probe rows (AC3, AC4): manual judgment only, no automated regression protection going forward — if a future phase's edit accidentally removes the pay-at-branch copy or a11y labels, no test will catch it. Recorded as a standing, accepted limitation (matches the umbrella's project-wide "no RN runner" stance), not specific to this phase's gaps.

Gate: CONDITIONAL (1 concern found — B1a priority-field regression — resolved via direct plan fix + new C2 test assertion + execute-agent fallback instruction; no unresolved FAILs)
Accepted by: session (autonomous inner-PVL pass, 15-07-26) — B1a concern accepted-and-fixed-in-plan per the "Fix small forward-text gaps directly" validate mandate; execute-agent instructed to apply the B1a backend passthrough fix or, if genuinely blocked, defer via backlog note and document the degradation (both paths keep AC6 honestly proven, never silently skipped)
