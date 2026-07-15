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
**Umbrella plan:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/mobile-tabs-order-flow-completion-umbrella_PLAN_14-07-26.md
**Date**: 14-07-26
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX (phase of a COMPLEX phase program)
**Report destination:** process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_REPORT_14-07-26.md

## Overview / Context

TL;DR: Final friendliness pass across all 5 tabs and the pay-at-branch order flow. Standardize loading (skeletons), empty, and error-with-retry states; improve a11y (labels, touch targets, contrast against theme tokens); and unify data-fetching (Branches tab screen uses local `useEffect`/`useState` fetch state — inconsistent with the react-query used elsewhere). This is the overriding-principle phase: prioritize user friendliness. Presentation/consistency only — no new API, no behavior/pricing change. Read `process/context/all-context.md` first. Runs LAST; depends on Phases 1-5.

## Phase Completion Rules

This phase is VERIFIED only when: all checklist items checked; the phase validate-contract exists with green gates; regression checks against overlapping earlier phases pass; and the phase report is written. Code-only completion is CODE DONE, never VERIFIED. Mobile-screen behavior with no automated runner is proven by Agent-Probe and recorded as Known-Gap. Post-phase testing uses the Exit Gate test gates (see process/context/tests/all-tests.md).

## Acceptance Criteria

- AC1: consistent friendly loading/empty/error across all tabs (Agent-Probe).
- AC2: no dev nav links in production tabs (Fully-Automated grep).
- AC3: pay-at-branch behavior unchanged; typecheck+lint+format green.

## Entry Gate

- Phases 1-5 exit gates all passed (all tabs delivering real data).

## Blast Radius

- `apps/mobile/src/app/(tabs)/branches/index.tsx` + `apps/mobile/src/features/branches/api.ts` — migrate this screen's local `useEffect`/`useState` fetch (`apiFetch('/api/branches')` + `mapApiBranch`) to react-query for consistency (if low-risk; else document as follow-up). **VALIDATE correction (14-07-26):** the original Blast Radius line named `apps/mobile/src/features/branch/hooks/use-branch.ts` as the migration target — that hook is ALREADY react-query (`useQuery(['branches'], getBranches)`); it is NOT the local-fetch-state offender. The real offender is this screen's own separate fetch path via the legacy `@/features/branches/api` + `apiFetch('/api/branches')` (a still-live but duplicate legacy Express route defined inline in `packages/api/src/index.ts`, distinct from the canonical `/branches` route `useBranch()`/`getBranches()` consume — the two routes return overlapping but differently-shaped data). Backend route duplication cleanup is out of scope for this phase; flagged as an Open Gap in the validate-contract for a future backlog note. See E1 below for the required migration guardrail.
- `apps/mobile/src/app/(tabs)/**` — consistent loading/empty/error across Home, Order, Rewards, Branches, Account.
- `apps/mobile/src/app/(tabs)/order/**` — order-flow polish (checkout/confirmation/tracking friendliness), NO behavior change.
- `packages/ui/src/components/*` — additive shared skeleton/empty/error primitives if missing (e.g. `Skeleton`). **VALIDATE-confirmed:** no `Skeleton` primitive currently exists in `packages/ui/src/components/` or `packages/ui/src/index.ts` — A2 must add one.
- Resolve remaining tracked nav-link debt where in scope (`process/general-plans/backlog/mobile-dev-nav-links-gating_NOTE_09-07-26.md`). **VALIDATE-confirmed count (14-07-26):** 3 live `"Dev:"` occurrences exist today, not the 1 the backlog note's "Status" section currently tracks — see C1 scope correction below.

## Implementation Checklist

### Step A — Consistency audit

- [ ] A1. Inventory each tab/screen's current loading/empty/error handling; list inconsistencies. Note: existing screens already mix ad-hoc `ActivityIndicator` + text-link-retry (e.g. `order/index.tsx`), a shared `ScreenLoader`/`ScreenMessage` pair (`order/cart.tsx`), and `@jojopotato/ui`'s `EmptyState` (`order/cart.tsx`, `order/checkout.tsx`, `order/history.tsx`) — the audit should decide which of these becomes the one canonical pattern rather than inventing a fourth.
- [ ] A2. Decide a single shared pattern (skeleton component + `EmptyState` + error-with-retry). Add a `Skeleton` primitive to `@jojopotato/ui` if missing (confirmed missing — see Blast Radius).

### Step B — Apply

- [ ] B1. Apply the shared loading/empty/error pattern to Home, Rewards, Coupon wallet, Account, Branches, Order screens.
- [ ] B2. Migrate the Branches tab screen's (`branches/index.tsx`) local `useEffect`/`useState` fetch (legacy `@/features/branches/api` + `apiFetch('/api/branches')`) to react-query (matching menu/deals/`getBranches()`), IF low-risk; otherwise write a follow-up backlog note and skip. **Guardrail (E1):** do NOT reuse `useBranch()`'s exposed `branches` array directly — it is pre-filtered to `openOnly` (excludes currently-closed branches), and this screen intentionally displays closed branches with a closed badge (`getIsOpenNow`-derived). Add a new unfiltered query local to this screen (e.g. `useQuery(['branches','all'], getBranches)`, or a new export from `use-branch.ts` that returns the raw unfiltered list) so closed branches keep rendering. Regression-check: after migration, any currently-closed branch in seed data still appears in the list/map with its closed indicator, exactly as before.
- [ ] B3. a11y pass across Home, Rewards, Coupon wallet, Account, Branches, Order/Cart/Checkout/Confirmation/Tracking/History screens: accessible `accessibilityRole`/`accessibilityLabel` on interactive elements (icon-only buttons especially — e.g. Branches tab's locate-me FAB already has this pattern, use as reference), minimum ~44x44 touch targets (`hitSlop` where the visual size is smaller), text contrast against `theme.ts` tokens (never hardcode duplicating tokens). No automated a11y linter exists in this RN project — verification is Agent-Probe (see Verification Evidence); the named screen list above is the definition-of-done boundary so this does not expand into an open-ended audit.
- [ ] B4. Order-flow friendliness: clearer pay-at-branch messaging on checkout/confirmation (payment behavior UNCHANGED — `payment_status` stays `unpaid`). **VALIDATE-confirmed:** neither `checkout.tsx` nor `confirmation/[orderId].tsx` currently contains any "pay-at-branch" copy — this is a real, un-started gap, not already partially done.

### Step C — Verify + cleanup

- [ ] C1. Remove any remaining dev/mock nav links in production render paths (grep). **Scope correction (E2, VALIDATE 14-07-26):** there are 3 live `"Dev:"` occurrences today, not 1: `rewards/index.tsx`'s un-gated `"Dev: View Coupons"` (should already be superseded/removed once Phase 4 ships the real Rewards/coupon-wallet UI, since this phase runs after Phase 4) AND `order/index.tsx`'s two `__DEV__`-gated `"Dev: View Cart"` / `"Dev: Order History"` links (compiled out of production JS via `__DEV__ ? ... : null`, but still present in source text, so the Exit Gate grep below still matches them). Cart and Order History are now real, fully-wired screens (the code comment calling them "still placeholders" is stale) — replace those two debug-labeled links with a proper navigation affordance (e.g. a cart icon + a history icon in the Order tab header) rather than leaving them as unstyled debug buttons. This both satisfies the Exit Gate grep cleanly and is itself a friendliness improvement in scope for this phase.
- [ ] C2. Extract any pure viewmodel/formatting helpers touched here to vitest-coverable modules where practical.

## Exit Gate

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check
# Expected: exit 0

grep -rn "Dev:" apps/mobile/src/app/\(tabs\) || echo "no dev nav links in production tabs"
# Expected: no dev nav links remain in production tab render paths
```

Note (VALIDATE 14-07-26): before C1 runs, this grep currently matches 3 lines (`order/index.tsx` ×2 `__DEV__`-gated, `rewards/index.tsx` ×1 un-gated). The gate is satisfied only once all 3 are resolved (Phase 4 removes the `rewards/` one as a side effect of shipping real UI; C1 removes the two `order/index.tsx` ones per its scope correction above).

- All checklist items checked.
- Agent-Probe: every tab has consistent, friendly loading/empty/error; order flow reads clearly as pay-at-branch.
- Phase report written to report destination above.

## Blockers That Would Justify BLOCKED Status

- react-query migration of the Branches tab screen (B2) reveals deep coupling that risks regressing Branches (defer via backlog note; do not force it).
- A required shared primitive expands into a design-system task beyond a presentation polish (route to follow-up).

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: prior phase reports read; test context loaded; per-tab loading/empty/error inventory gathered; plan drift checked
- [ ] 2. INNOVATE — innovate-agent: shared UX pattern decided; Decision Summary written
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: phase plan updated (or "n/a — research clean")
- [x] 4. PVL — vc-validate-agent: full V1-V7; validate-contract written per example-validate-output.md
- [ ] 5. EXECUTE — all checklist items done; per-section test gates green
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, commit done

**Validate-contract required before execute.**

## Touchpoints

- `apps/mobile/src/app/(tabs)/**`, `apps/mobile/src/app/(tabs)/branches/index.tsx`, `apps/mobile/src/features/branches/api.ts`, `apps/mobile/src/features/branch/hooks/use-branch.ts` (read-only reference for the react-query pattern, not itself the migration target)
- `packages/ui/src/components/*` (additive skeleton/empty/error primitives)

## Public Contracts

- No API changes; no behavior/pricing change. Presentation and consistency only.
- Pay-at-branch order behavior explicitly unchanged; `payment_status` stays `unpaid`.
- Branches tab must continue to show closed branches (with closed indicator) after any B2 migration — see E1 guardrail; silently dropping them would be an undocumented behavior change.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| typecheck + lint + format:check green | Fully-Automated | AC-7 |
| No dev nav links remain in production tabs (grep, all 3 occurrences resolved) | Fully-Automated | AC-7 |
| Every tab has consistent friendly loading/empty/error; order flow clearly pay-at-branch (walkthrough) | Agent-Probe (Known-Gap for automation) | AC-7, AC-8 |
| Branches tab still shows closed branches with closed indicator after B2 (if B2 executes) | Agent-Probe | AC-7 (regression) |
| Any extracted formatting/viewmodel helper (unit test) | Fully-Automated (conditional on C2 producing an extraction) | AC-7 |

```bash
pnpm --filter @jojopotato/mobile typecheck && pnpm lint
# Expected: exit 0
```

## Test Infra Improvement Notes

- Screen-level UX consistency is Agent-Probe only (no RN runner — project-wide gap). This phase is the natural place to record whether an RN component-test runner should be adopted as a dedicated follow-up (recommend a backlog note if the gap keeps blocking automated UX coverage).
- VALIDATE finding (14-07-26): `packages/api/src/index.ts` defines an inline legacy `GET /api/branches` + `GET /api/branches/:id` pair alongside the canonical mounted `branchesRouter` at `/branches`. Both are live and return overlapping-but-differently-shaped branch data. This phase's B2 item migrates the ONE mobile consumer of the legacy route; the backend duplication itself is out of scope here — recommend a backlog note after this phase to evaluate retiring the inline `/api/branches` route once nothing consumes it.

## Resume and Execution Handoff

- Selected plan file path: `process/general-plans/active/mobile-tabs-order-flow-completion_14-07-26/phase-06-ux-polish_PLAN_14-07-26.md`
- Last completed step: PVL (V1-V7) — validate-contract written, gate CONDITIONAL
- Validate-contract status: CONDITIONAL (written 14-07-26)
- Supporting context: Phase 3/4/5 reports (delivered screens), `packages/ui/src/index.ts`, `theme.ts` tokens.
- Next step: Spawn vc-research-agent for RESEARCH (Step 1) — inventory per-tab loading/empty/error handling. Do not spawn EXECUTE until Phases 1-5 exit gates have passed (Entry Gate) — Phase 6 PVL was run out of dependency order as part of outer-PVL fan-out across all 6 phase plans; this only validates the PLAN's feasibility, not readiness to EXECUTE yet.

## Validate Contract

Status: CONDITIONAL
Date: 14-07-26
date: 2026-07-14
generated-by: outer-pvl

Parallel strategy: sequential (this VALIDATE pass) / parallel-subagents (recommended for EXECUTE)
Rationale: Score 2/7 (S4 phase-program membership, S7 5+ blast-radius files). No multi-package, schema/API/auth, or high-risk surface. MEDIUM band → parallel subagents fit for EXECUTE Step B (Home/Rewards/Coupon-wallet/Account/Branches/Order screen edits are disjoint files, decided once Step A/A2's shared pattern is locked); Steps A and C stay sequential (A must land before B starts; C is a small cleanup pass after B).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC3/AC7-typecheck | typecheck + lint + format:check all exit 0 after polish changes | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check` | A |
| AC2/AC7-devlinks | zero `"Dev:"` nav-link occurrences remain in `apps/mobile/src/app/(tabs)` source (all 3 current occurrences resolved: rewards/, order/index.tsx ×2) | Fully-Automated | `grep -rn "Dev:" apps/mobile/src/app/\(tabs\) \|\| echo "no dev nav links in production tabs"` | B |
| AC7-c2-helpers | any pure viewmodel/formatting helper extracted by C2 has a passing unit test | Fully-Automated (conditional — only if C2 extracts something) | `pnpm --filter @jojopotato/mobile test` | B |
| AC7/AC8-walkthrough | every tab (Home, Order, Rewards, Coupon wallet, Account, Branches) shows a consistent friendly loading/empty/error pattern; order flow reads clearly as pay-at-branch on checkout/confirmation | Agent-Probe | Manual walkthrough script: for each of the 6 screens, force (a) loading (throttle/slow network or a temporary artificial delay), (b) empty (no data condition where applicable), (c) error (kill network mid-request) — confirm skeleton/EmptyState/error-with-retry render per the Step A2 decided pattern; on checkout/confirmation confirm pay-at-branch copy is present and payment_status-related UI shows no online-payment path | D |
| AC7-b2-regression | Branches tab still lists/maps closed branches (with closed indicator) after any B2 react-query migration | Agent-Probe | Manual walkthrough: with at least one branch in seed data toggled/observed as currently-closed (outside opening hours or `is_accepting_pickup=false`), confirm it still renders in the Branches tab list and map with its closed badge, both before and after B2's migration | D |
| B3-a11y | interactive elements across the named B3 screen list have `accessibilityRole`/`accessibilityLabel`, ~44x44 touch targets, and text meets `theme.ts` token contrast | Agent-Probe | Manual walkthrough against the B3 named screen list; no automated a11y linter exists in this RN project | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — the Agent-Probe rows above are judgment-based proving strategies, not Known-Gap; the RN-runner absence is the *reason* Agent-Probe is the ceiling, not a claim of zero coverage.

Legacy line form (retained so existing validate-contract consumers still parse):
- typecheck/lint/format: `pnpm --filter @jojopotato/mobile typecheck && pnpm lint && pnpm format:check` (Fully-Automated)
- dev-link cleanup: `grep -rn "Dev:" apps/mobile/src/app/\(tabs\)` exits with no matches (Fully-Automated)
- cross-tab UX consistency + pay-at-branch messaging: manual walkthrough script above (Agent-Probe — Known-Gap for automation, no RN runner exists)
- Branches closed-branch regression after B2: manual walkthrough (Agent-Probe)
- a11y pass: manual walkthrough against named screen list (Agent-Probe — Known-Gap for automation)

Failing stub (AC3/AC7-typecheck):
```
test("should exit 0 for typecheck, lint, and format:check after polish changes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: typecheck + lint + format:check all exit 0")
})
```

Failing stub (AC2/AC7-devlinks):
```
test("should have zero Dev: nav-link occurrences in apps/mobile/src/app/(tabs)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: no dev nav links remain in production tabs")
})
```

Failing stub (AC7-c2-helpers):
```
test("should pass unit tests for any pure helper extracted by C2", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: extracted formatting/viewmodel helper has unit coverage")
})
```

Dimension findings:
- Infra fit: PASS — pure `apps/mobile` + `packages/ui` presentation-layer change; no container/infra/runtime surface touched.
- Test coverage: PASS — tier assignments match project reality (no RN component/E2E runner exists; Fully-Automated correctly used for typecheck/lint/format/grep/unit-extractable logic; Agent-Probe honestly used, never overclaimed as automated, for screen-level judgment). No high-risk class (auth/billing/schema/API/deploy/secrets) is touched, so no hybrid-minimum requirement applies.
- Breaking changes: CONCERN — B2's react-query migration target was mislabeled in the original plan (`use-branch.ts`, already react-query) instead of the actual local-fetch-state offender (`branches/index.tsx` + `features/branches/api.ts`, hitting a separate legacy `/api/branches` route); naively reusing `useBranch()`'s pre-filtered `branches` array would silently drop closed branches from the Branches tab, contradicting the plan's own "no behavior change" Public Contract. Fixed in plan (corrected Blast Radius + B2 text + E1 guardrail + new regression test-gate row) — see Plan Updates Applied below.
- Security surface: PASS — no auth, billing, secrets, schema, or public API contract touched.
- Section A (Consistency audit): PASS — mechanical, no edit-target collisions, no conflicts with current file state.
- Section B (Apply): CONCERN — same B2 mislabeling as above, plus B3 (a11y) originally had no named screen boundary or done-criteria, risking open-ended scope. Fixed in plan (B3 now carries the same named screen list as B1, plus an explicit stop-boundary statement).
- Section C (Verify + cleanup): CONCERN — the Exit Gate's `grep -rn "Dev:"` check is broader than the plan's original 1-occurrence assumption (backlog note said only `rewards/index.tsx` remained); `order/index.tsx` also has 2 more (`__DEV__`-gated, so not a production leak, but still grep-matched in source). As written, the gate would not cleanly pass even after C1's original narrow scope was done. Fixed in plan (C1 text now names all 3 occurrences and directs execute-agent to replace `order/index.tsx`'s debug links with real header nav icons).

Open gaps:
- Backend route duplication (`/api/branches` inline legacy route vs. mounted `/branches` router) is out of scope for this phase; recommend a backlog note after Phase 6 closes to evaluate retiring the legacy route once B2 migrates its one remaining mobile consumer.
- Screen-level UX consistency, the closed-branch regression check, and the a11y pass all cap out at Agent-Probe — no RN component/E2E runner exists in this repo (project-wide, pre-existing gap, already tracked at `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`). Not a new gap introduced by this phase.

What this coverage does NOT prove:
- typecheck/lint/format green does NOT prove the UI actually looks or reads as "friendly" — that is the Agent-Probe walkthrough's job, and it is judgment-based, not machine-verifiable.
- The `Dev:` grep does NOT prove the replacement nav affordances (cart/history header icons) are usable or discoverable — only that the debug-labeled text is gone.
- The Agent-Probe walkthrough for AC7/AC8 does NOT prove behavior under real network flakiness in production (it is a manual, single-run judgment call, not a fuzzed or repeated automated test).
- The closed-branch regression check does NOT prove correctness across all possible open/closed branch combinations — it is a spot-check against whatever branches exist in seed/test data at the time of the walkthrough.
- The a11y walkthrough does NOT prove WCAG-level conformance or screen-reader correctness end-to-end — no screen reader automation exists in this repo; it is a manual visual/structural check against the named screen list only.

Gate: CONDITIONAL (concerns found and fixed in plan text; residual Agent-Probe ceiling on screen-level UX/a11y/regression checks is a pre-existing, honestly-declared project-wide gap, not a new unresolved risk)
Accepted by: session (autonomous — outer-PVL subagent run, no interactive user in this validate turn). Accepted concerns: (1) B2 blast-radius/target mislabeling — resolved via plan-text correction + E1 guardrail + new regression test-gate row; (2) B3 a11y scope vagueness — resolved via named screen list + done-boundary; (3) C1 exit-gate grep breadth mismatch — resolved via corrected occurrence count + E2 instruction to replace `order/index.tsx` debug links with real nav icons. No FAILs found. Residual known-gap: Agent-Probe ceiling on screen-level UX/regression/a11y proof (pre-existing project-wide RN-runner gap, not introduced by this phase).
