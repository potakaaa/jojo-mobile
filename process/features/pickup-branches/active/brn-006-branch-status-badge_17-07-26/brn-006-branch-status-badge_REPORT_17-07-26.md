---
phase: UPDATE-PROCESS
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: pickup-branches
plan: process/features/pickup-branches/active/brn-006-branch-status-badge_17-07-26/brn-006-branch-status-badge_PLAN_17-07-26.md
---

# BRN-006 Branch Status Badge Fix — Phase Report

**PR:** #111 (open, base: `development`)
**Commit:** `9910872`
**Branch:** `fix/brn-006-branch-status-badge`
**Issue:** #102

---

## What Was Done

- **Badge gate (`isOpen`) in Branch Details** (`apps/mobile/src/app/(tabs)/branches/[branchId].tsx`): the accepting-pickup `<Badge>` is now conditionally rendered — only when `isOpen === true`. A closed branch with `is_accepting_pickup = true` no longer shows "Closed" + "Accepting Pickup" simultaneously.
- **Badge gate in BranchListItem** (`packages/ui/src/components/branch-list-item.tsx`): same conditional applied in the shared list component — pickup badge hidden when `isOpen` is false.
- **Top spacing fix** in Branch Details `scrollContent` StyleSheet: `paddingVertical: Spacing.four` replaced with `paddingTop: Spacing.two + paddingBottom: Spacing.four`, eliminating doubled spacing stacked under the native header from `_layout.tsx`.
- **3 new jest render tests** added to `packages/ui/src/components/__tests__/branch-list-item.test.tsx`:
  1. `isOpen={false}` — no pickup badge rendered (AC2 automated half)
  2. `isOpen={true}, isAcceptingPickup={false}` — "Pickup unavailable" badge shown (AC3 automated half)
  3. `isOpen={true}, isAcceptingPickup={true}` — "Pickup available" badge shown (AC4 automated half)
- **Ordering gate preserved byte-identical**: `canOrder = isOpen && branch?.isAcceptingPickup` at `[branchId].tsx:90` and `isEnabled = isOpen && item.isAcceptingPickup` at `index.tsx:132` are completely untouched (AC5).

**Zero backend changes.** No API contract, schema, or data-layer change of any kind.

---

## What Was Skipped / Deferred

**Deals section removal — intentionally DESCOPED (durable, non-obvious):**

The BRN-006 issue originally listed deals-removal ACs. These were NOT implemented.

**Why:** `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` fetches `/api/branches/:id`. This path is served by an **inline handler at `packages/api/src/index.ts` line ~137**, NOT by `packages/api/src/routes/branches.ts` (which is mounted at `/branches` — the wrong prefix for `/api/branches/:id`). That inline handler returns `{ branch, deals }` via a live UNION query over the `offers` table (branch-mapped + global, active + in-window). The deals data is real, DB-backed, and functional — removing the section would silently delete working product functionality.

This is a **durable API precedence fact**: two handlers exist for branch data. The inline `index.ts` handler serves `/api/branches/:id` (mobile branch detail + deals). The `routes/branches.ts` router serves `/branches` (never hits `/api/branches/:id`). Any future agent researching the branch detail endpoint must check `index.ts` first, not only `routes/branches.ts`.

**Follow-up action:** Comment this rationale on PR #111 and on issue #102.

**Light/dark polish (Step 3):** The plan included a light theming pass. The execute agent confirmed that the existing screen already uses `theme.*` tokens correctly — no changes were needed. Deferred items: none.

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Mobile typecheck | `pnpm --filter @jojopotato/mobile typecheck` | GREEN |
| UI typecheck | `pnpm --filter @jojopotato/ui typecheck` | GREEN |
| UI tests (jest-expo) | `pnpm --filter @jojopotato/ui test` | GREEN — 65/65 (incl. +3 new) |
| Mobile tests (vitest) | `pnpm --filter @jojopotato/mobile test` | GREEN — 27/27 |
| Prettier | `pnpm format:check` | GREEN — clean |
| Agent-Probe: in-app badge states + light/dark | manual walkthrough | PENDING |

---

## Plan Deviations

- **Step 3 (light/dark polish):** no code changes were required — the screen already used correct tokens. The step was evaluated and confirmed clean rather than skipped; this is a minor positive deviation (less work than planned).
- **Validate-contract:** the plan's `## Validate Contract` section remained a placeholder (vc-validate-agent was not invoked for this SIMPLE plan). Skip reason: presentation-only change, no schema/API/auth/billing surface, under 15 lines per file changed.

---

## Test Infra Gaps Found

- No RN screen runner exists for `apps/mobile` (project-wide gap). AC1/AC3/AC4/AC6/AC7/AC8 are Agent-Probe only — no automation path for in-app badge state verification in the current infra.
- See `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md` for the standing project-wide backlog note on this gap.

---

## SPEC Achievement

No separate `*_SPEC_*.md` file for this plan (SIMPLE plan — acceptance criteria are inline).

| AC | Description | Strategy | Result |
|---|---|---|---|
| AC1 | Closed+accepting branch: only "Closed" badge, no pickup badge (Branch Details) | Agent-Probe | PENDING |
| AC2 | Same as AC1 for BranchListItem | Fully-Automated (jest) + Agent-Probe | MET (automated half green; in-app half pending) |
| AC3 | Open+not-accepting: "Open" + "Not Accepting Pickup" in both locations | Agent-Probe | PENDING |
| AC4 | Open+accepting: "Open" + "Accepting Pickup" + Order CTA enabled | Agent-Probe | PENDING |
| AC5 | `canOrder`/`isEnabled` byte-identical post-change | Fully-Automated (typecheck) | MET |
| AC6 | No doubled spacing under Branch Details header | Agent-Probe | PENDING |
| AC7 | Branch Details renders correctly in light and dark mode | Agent-Probe | PENDING |
| AC8 | `is_accepting_pickup` toggle reflects on next fetch | Agent-Probe | PENDING |

---

## Closeout Packet

1. **Selected plan path:** `process/features/pickup-branches/active/brn-006-branch-status-badge_17-07-26/brn-006-branch-status-badge_PLAN_17-07-26.md`
2. **Closeout classification:** Keep in active/testing — code-complete + automated-verified; Agent-Probe QA (AC1/AC3/AC4/AC6/AC7/AC8) and PR #111 merge pending.
3. **What was finished:** Badge gate on `isOpen` in both locations; top spacing fix; 3 new jest render tests; deals descope researched and documented.
4. **Verified:** typecheck (mobile+ui) clean; UI 65/65; mobile 27/27; Prettier clean. **Unverified:** AC1/AC3/AC4/AC6/AC7/AC8 (Agent-Probe).
4b. **Validate-contract:** placeholder — SIMPLE plan, presentation-only change, VALIDATE explicitly skipped (no schema/API/auth/billing surface, under 15 lines per touched file).
5. **Cleanup done:** this REPORT written; `all-context.md` delta written; memory file written. **Still needed:** Agent-Probe walkthrough; PR #111 merge; final archival after merge.
6. **Next valid state:** Keep plan in `active/` pending Agent-Probe QA and PR merge. After merge: `ENTER UPDATE PROCESS MODE` to archive.
7. **Commit checkpoint:** Execution commit at `9910872` (already landed). Process commit (this REPORT + `all-context.md` + memory file) is next.
8. **Regression status:** N/A — first and only phase, no prior verified surfaces.
9. **SPEC achievement:** AC2 + AC5 met (automated). AC1/AC3/AC4/AC6/AC7/AC8 unmet (Agent-Probe pending).

Drift score: MEDIUM (2 signals: files touched across 2 packages, 1 memory-worthy non-obvious API fact). **Recommend UPDATE PROCESS -- significant changes detected.**

---

## Forward Preview

### Test Infra Found

- `packages/ui` jest-expo runner already existed and accepted the 3 new `branch-list-item.test.tsx` tests with no infra change.
- No new test runner or config needed for this fix.

### Blast Radius Changes

Matches plan exactly:
- `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` — modified (badge gate + spacing)
- `packages/ui/src/components/branch-list-item.tsx` — modified (badge gate)
- `packages/ui/src/components/__tests__/branch-list-item.test.tsx` — new file (3 render tests)

No files outside the declared blast radius were touched.

### Commands to Stay Green

```bash
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/ui typecheck
pnpm --filter @jojopotato/ui test
pnpm --filter @jojopotato/mobile test
pnpm format:check
```

### Dependency Changes

None. No new packages added or removed.
