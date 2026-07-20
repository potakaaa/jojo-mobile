---
name: plan:brn-006-branch-status-badge
description: "BRN-006 — gate accepting-pickup badge on isOpen, fix top spacing, light/dark polish on Branch Details"
date: 17-07-26
feature: pickup-branches
phase: ""
---

# BRN-006 Branch Status Badge Fix

**Type:** SIMPLE  
Complexity: SIMPLE  
Status: PLAN  
**Branch:** development (target for PR)  
**GitHub:** issue #102  
Date: 17-07-26

## Overview

Presentation-only fix addressing three related issues on the Branches feature:

1. **Badge visibility bug** — Branch Details and the Branch List both render an accepting-pickup badge unconditionally. A branch that is CLOSED but has `is_accepting_pickup = true` currently shows "Closed" + "Accepting Pickup" simultaneously — contradictory UX. Fix: gate the pickup badge on `isOpen === true` in both locations.
2. **Top spacing bug** — Branch Details `scrollContent` uses `paddingVertical: Spacing.four`, stacked directly under the native header from `_layout.tsx`, producing a doubled top gap.
3. **Light/dark polish** — minor visual consistency pass on Branch Details, using `@jojopotato/ui` tokens and the `useColorScheme()`/`useTheme()` convention.

**Zero backend changes.** No API contract or data-layer change of any kind.

---

## Phase Completion Rules

This plan is COMPLETE (CODE DONE) when:
1. All 5 checklist steps are executed and confirmed.
2. `pnpm --filter @jojopotato/mobile typecheck` exits 0.
3. `pnpm --filter @jojopotato/ui typecheck` exits 0.
4. `pnpm --filter @jojopotato/ui test` passes (including new badge-gate render tests for `BranchListItem`).
5. `pnpm --filter @jojopotato/mobile test` passes (no regression).

This plan is VERIFIED when the Agent-Probe walkthroughs (AC1-AC4, AC6-AC8) are completed in the Expo app and all outcomes match the acceptance criteria.

---

## Deals Section — Descope Decision (IMPORTANT)

The BRN-006 issue originally listed deals-removal ACs. These are **intentionally DESCOPED** and must NOT be implemented.

**Why the Deals section is kept:**
- `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` fetches from `/api/branches/:id`.
- This request is served by an **inline handler at `packages/api/src/index.ts:137`**, NOT by `packages/api/src/routes/branches.ts` (which is mounted at `/branches` and never matches `/api/branches/:id`).
- That inline handler returns `{ branch, deals }` via a live UNION query over the `offers` table (branch-mapped + global, active + in-window). So `data.deals` is real, live, DB-backed data — the section is not dead.
- Removing it would silently discard working product functionality.

**Follow-up action (orchestrator, not EXECUTE):** Comment this descope rationale on PR and on issue #102 so reviewers understand why deals-removal ACs are not addressed.

---

## Touchpoints

| File | Package | Change |
|---|---|---|
| `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` | `apps/mobile` | Gate pickup badge on `isOpen` (lines 161-165); reduce top padding (line 223); light/dark polish |
| `packages/ui/src/components/branch-list-item.tsx` | `packages/ui` | Gate pickup badge on `isOpen` prop (lines 70-74) |

**Read-only (for context, unchanged):**
- `apps/mobile/src/app/(tabs)/branches/index.tsx` — `renderItem` at lines 130-145 passes `isOpen` and `isEnabled` to `BranchListItem`; no change needed here
- `apps/mobile/src/app/(tabs)/branches/_layout.tsx` — native `title: 'Branch Details'` header; confirms the doubled-top-gap source
- `packages/ui/src/components/badge.tsx` — variants: `default` / `success` / `warning` / `danger`; used for badge rendering

---

## Public Contracts

No public API, schema, or cross-package type changes. `BranchListItem`'s props interface is unchanged — the `isOpen` prop already exists and is already passed by the caller at `index.tsx:134`. This is a pure render-logic change.

---

## Blast Radius

- **2 files** modified across 2 packages (`apps/mobile`, `packages/ui`)
- **Risk class:** LOW — presentation-only, no logic or data changes
- `canOrder = isOpen && branch?.isAcceptingPickup` at `[branchId].tsx:90` is byte-identical (untouched)
- `isEnabled = isOpen && item.isAcceptingPickup` at `index.tsx:132` is byte-identical (untouched)
- No DB, API, state, or navigation code touched

---

## Implementation Checklist

### Step 1 — Gate pickup badge on `isOpen` in Branch Details (`[branchId].tsx`)

File: `apps/mobile/src/app/(tabs)/branches/[branchId].tsx`

At lines 161-165, the second `<Badge>` (accepting-pickup) renders unconditionally:

```
<Badge
  label={branch.isAcceptingPickup ? 'Accepting Pickup' : 'Not Accepting Pickup'}
  variant={branch.isAcceptingPickup ? 'success' : 'danger'}
  mode={mode}
/>
```

Replace with a conditional render — only show when `isOpen === true`:

```
{isOpen ? (
  <Badge
    label={branch.isAcceptingPickup ? 'Accepting Pickup' : 'Not Accepting Pickup'}
    variant={branch.isAcceptingPickup ? 'success' : 'danger'}
    mode={mode}
  />
) : null}
```

`isOpen` is already computed at line 84 — no new variable needed.

### Step 2 — Reduce top padding in Branch Details (`[branchId].tsx`)

File: `apps/mobile/src/app/(tabs)/branches/[branchId].tsx`, StyleSheet at line 221-224.

Current:
```
scrollContent: {
  gap: Spacing.two,
  paddingVertical: Spacing.four,
},
```

Replace `paddingVertical` with separate `paddingTop`/`paddingBottom`. Keep `paddingBottom` equivalent to the original (`Spacing.four`) so bottom clearance is unaffected. Reduce `paddingTop` (e.g. `Spacing.two`) so content sits flush under the native header without doubling. Do NOT touch `paddingBottom: getFloatingTabBarClearance(insets.bottom)` at line 134 — that is the nav clearance, out of scope.

```
scrollContent: {
  gap: Spacing.two,
  paddingTop: Spacing.two,
  paddingBottom: Spacing.four,
},
```

Exact value for `paddingTop` is a judgment call during EXECUTE — `Spacing.two` is the suggested starting point; agent should verify visually.

### Step 3 — Light/dark polish on Branch Details (`[branchId].tsx`)

Scope: light pass only — no restructure. Using `theme.*` tokens from `useTheme()` and `mode` from `useColorScheme()`.

Check and correct any hardcoded colors or style values that don't respond to the current `mode`. Examples:
- Verify `styles.name`, `styles.body`, `styles.sectionTitle` use `theme.text` or `theme.textSecondary` (not hardcoded palette values)
- Verify `<Card mode={mode}>` components pass `mode` consistently — text sitting on a fixed-mode Card surface should use that mode's tokens, not the device-scheme `theme`
- If any color or typography values are hardcoded (e.g. `color: Palette.ink` on a text element inside a theme-variable surface), switch them to the appropriate `theme.*` token

Keep it a light pass. If a restructure is needed to fix a theming issue, prefer the minimal targeted fix. Note any deferred items in the EXECUTE report.

### Step 4 — Gate pickup badge on `isOpen` in BranchListItem (`branch-list-item.tsx`)

File: `packages/ui/src/components/branch-list-item.tsx`

At lines 70-74 in the `metaRow`, the pickup badge renders unconditionally:

```
<Badge
  label={branch.isAcceptingPickup ? 'Pickup available' : 'Pickup unavailable'}
  variant={branch.isAcceptingPickup ? 'success' : 'danger'}
  mode={mode}
/>
```

Replace with a conditional render gated on the existing `isOpen` prop:

```
{isOpen ? (
  <Badge
    label={branch.isAcceptingPickup ? 'Pickup available' : 'Pickup unavailable'}
    variant={branch.isAcceptingPickup ? 'success' : 'danger'}
    mode={mode}
  />
) : null}
```

`isOpen` is already a prop on `BranchListItemProps` (line 11) and is already passed by every caller. No prop interface change needed.

### Step 5 — Run typecheck and tests

```bash
# Typecheck both touched packages
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/ui typecheck

# Run packages/ui component tests (jest-expo)
pnpm --filter @jojopotato/ui test

# Run apps/mobile tests (vitest + jest)
pnpm --filter @jojopotato/mobile test
```

All must pass before EXECUTE is considered done. Fix any failures inline.

---

## Acceptance Criteria

| # | Criterion | Tier |
|---|---|---|
| AC1 | A closed branch with `is_accepting_pickup = true` shows exactly ONE status badge ("Closed"), never "Closed" + "Accepting Pickup" simultaneously — on Branch Details | Agent-Probe |
| AC2 | Same as AC1 for the Branches list (`BranchListItem`) | Fully-Automated (jest) + Agent-Probe |
| AC3 | An open branch with `is_accepting_pickup = false` shows "Open" + a "Not Accepting Pickup" badge in both list and details | Agent-Probe |
| AC4 | An open + accepting branch shows "Open" + "Accepting Pickup" badge in both locations; order CTA enabled | Agent-Probe |
| AC5 | `canOrder` at `[branchId].tsx:90` and `isEnabled` at `index.tsx:132` are byte-identical post-change (regression guard) | Fully-Automated (typecheck) |
| AC6 | No doubled spacing under the Branch Details header | Agent-Probe |
| AC7 | Branch Details renders correctly in both light and dark mode | Agent-Probe |
| AC8 | Toggling `is_accepting_pickup` from staff/admin reflects on next fetch in list and details (fetch path unchanged — no code change, verify via manual) | Agent-Probe |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` exits 0 | Fully-Automated | AC5 — `canOrder`/`isEnabled` unchanged; no TS regressions from badge gate |
| `pnpm --filter @jojopotato/ui typecheck` exits 0 | Fully-Automated | AC5 — `BranchListItem` props unchanged, no TS regressions |
| `pnpm --filter @jojopotato/ui test` — new render test: `BranchListItem` with `isOpen={false}` renders no pickup badge | Fully-Automated | AC2 (shared component half) |
| `pnpm --filter @jojopotato/ui test` — `BranchListItem` with `isOpen={true}, isAcceptingPickup=false` renders "Pickup unavailable" badge | Fully-Automated | AC3 (shared component half) |
| `pnpm --filter @jojopotato/ui test` — `BranchListItem` with `isOpen={true}, isAcceptingPickup=true` renders "Pickup available" badge | Fully-Automated | AC4 (shared component half) |
| `pnpm --filter @jojopotato/mobile test` exits 0 (no regression) | Fully-Automated | regression guard for apps/mobile logic |
| Agent-Probe: open a closed+accepting branch in the Expo app — verify only "Closed" badge appears, no pickup badge | Agent-Probe | AC1, AC2 |
| Agent-Probe: open an open+not-accepting branch — verify "Open" + "Not Accepting Pickup" | Agent-Probe | AC3 |
| Agent-Probe: open an open+accepting branch — verify "Open" + "Accepting Pickup" + Order CTA enabled | Agent-Probe | AC4 |
| Agent-Probe: scroll Branch Details in light and dark mode — verify no doubled top gap, correct colors | Agent-Probe | AC6, AC7 |

---

## Test Infra Improvement Notes

`packages/ui` already has `jest`/`jest-expo` and component tests for `OrderStatusBadge`/`OrderStatusTimeline`. Adding render tests for `BranchListItem`'s badge-gate behavior (Step 5, AC2) follows the same pattern — no new infra needed, just new test cases in an existing file or a new `branch-list-item.test.tsx`.

`apps/mobile` has both vitest (pure-TS) and jest/jest-expo (component) runners as of 15-07-26. The badge gate on `[branchId].tsx` is screen-level — the `jest-setup.ts` reanimated mock gap means screens with entering/exiting animations can crash; verify `[branchId].tsx` doesn't use layout animations before writing a screen-level jest test. If it does, mark the screen-level AC as Agent-Probe only (already the plan's assignment).

Known test gap: no E2E/navigation runner for full toggle→fetch→badge-update flow (AC8). Agent-Probe manual check remains the verification path.

---

## Descope Guard

The following are explicitly NOT in scope and must NOT be implemented during EXECUTE:

- Removing the Deals section from Branch Details (see "Deals Section — Descope Decision" above)
- Any backend/API change (`packages/api`)
- Changing `canOrder` computation logic at `[branchId].tsx:90`
- Changing `isEnabled` computation logic at `index.tsx:132`
- Changing `paddingBottom` / `getFloatingTabBarClearance` at `[branchId].tsx:134`

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/pickup-branches/active/brn-006-branch-status-badge_17-07-26/brn-006-branch-status-badge_PLAN_17-07-26.md`
2. **Last completed phase/step:** PLAN (this document)
3. **Validate-contract status:** pending — vc-validate-agent writes this before EXECUTE
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` (full read, confirmed line anchors)
   - `packages/ui/src/components/branch-list-item.tsx` (full read, confirmed line anchors)
   - `apps/mobile/src/app/(tabs)/branches/index.tsx` (lines 1-145, confirmed isEnabled/isOpen compute)
5. **Next step for a fresh agent:** Read this plan. The 5-step checklist is complete and ordered. Start at Step 1 (`[branchId].tsx` badge gate). After all steps, run the verification commands in Step 5. Do NOT touch any descoped files. Check "Deals Section — Descope Decision" before making any other change. After EXECUTE, the orchestrator should post the descope rationale as a comment on issue #102 and the PR.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
