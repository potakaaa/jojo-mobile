# Admin App: Universal Button Outlines

**Date:** 14-07-26
**Complexity:** Simple
**Status:** ⏳ PLANNED

## Overview

Add universal button outlines and remove the explicit outline variant in the admin app to unify the neobrutalist aesthetic across all buttons.

## Quick Links

- [Goals and Success Metrics](#goals-and-success-metrics)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Assumptions and Constraints](#assumptions-and-constraints)
- [Functional Requirements](#functional-requirements)
- [Non-Functional Requirements](#non-functional-requirements)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Risks and Mitigations](#risks-and-mitigations)
- [Integration Notes](#integration-notes)
- [Blast Radius](#blast-radius)
- [Phase Loop Progress](#phase-loop-progress)
- [Validate Contract](#validate-contract)

## Goals and Success Metrics

**Goals:**
- Apply a universal 2px border to all buttons.
- Remove redundant outline button variants.
- Update hover states for SubmitButtons to simulate thickening outline.

**Success Metrics:**
- All buttons render with the standard `border-2 border-border` styling.
- `OutlineButton` and `outline` variant are completely removed from the codebase.
- App builds and renders successfully without missing component errors.

---

## Execution Brief

**IMPORTANT:** This is a SIMPLE (one-session) plan - implement continuously without approval gates. The phases below are logical groupings for understanding flow, NOT stop points.

Before EXECUTE begins, vc-validate-agent must write the Validate Contract section. Do not start EXECUTE with an empty placeholder.

### Phase 1: Base Component Updates
**What happens:** Update the core button UI component (`button.tsx`) to include universal borders and remove the outline variant.

### Phase 2: Refactoring Consumers
**What happens:** Update all usages of `OutlineButton` or `variant="outline"` to use `SecondaryButton` or `variant="secondary"`.

### Test Gates

After completing all implementation steps, verify the following:

1. **Build Test:** Run admin app build to ensure no TypeScript or resolving errors `[automated]`
2. **Visual Test:** Check button visuals in dashboard components and branch list `[hybrid]`

### Expected Outcome
- Consistent neobrutalist button borders across the admin app.
- Cleaner UI component library.

---

## Scope

**In-Scope:**
- Modifying `apps/admin/src/components/ui/button.tsx`
- Refactoring `apps/admin/src/routes/(dashboard)/components.tsx`
- Refactoring `apps/admin/src/features/branches/components/branch-list.tsx`

**Out-of-Scope:**
- Other app workspaces (like client apps).
- Non-button component styling.

## Assumptions and Constraints

**Assumptions:**
- `SecondaryButton` and `variant="secondary"` exist and are appropriate substitutes for `OutlineButton`.

**Constraints:**
- Maintain current UI library patterns (cva).

## Functional Requirements

- Base buttons must have `border-2 border-border`.
- `SubmitButton` must have `hover:ring-2 hover:ring-border hover:ring-offset-0`.
- Consumers previously using `outline` variant must use `secondary` variant.

## Non-Functional Requirements

- **Design:** Keep neobrutalist aesthetic consistent.
- **Code Quality:** Ensure unused components (`OutlineButton`) are deleted.

## Acceptance Criteria

1. ✅ `apps/admin/src/components/ui/button.tsx` base styling includes `border-2 border-border`.
2. ✅ `outline` variant and `OutlineButton` are removed from `button.tsx`.
3. ✅ `SubmitButton` has hover state `hover:ring-2 hover:ring-border hover:ring-offset-0`.
4. ✅ `apps/admin/src/routes/(dashboard)/components.tsx` uses `<SecondaryButton>` instead of `<OutlineButton>`.
5. ✅ `apps/admin/src/features/branches/components/branch-list.tsx` uses `variant="secondary"` instead of `variant="outline"`.

## Implementation Checklist

1. **Update Button Component (`apps/admin/src/components/ui/button.tsx`)**
   - In `cva` base styles, add `border-2 border-border`.
   - In `buttonVariants`, delete the `outline` variant from `variants.variant`.
   - Delete the `OutlineButton` exported component.
   - In `SubmitButton` component, merge the hover classes: `hover:ring-2 hover:ring-border hover:ring-offset-0`.

2. **Refactor Dashboard Components (`apps/admin/src/routes/(dashboard)/components.tsx`)**
   - Replace `<OutlineButton>` elements with `<SecondaryButton>`.
   - Update imports to remove `OutlineButton` and ensure `SecondaryButton` is imported.

3. **Refactor Branch List (`apps/admin/src/features/branches/components/branch-list.tsx`)**
   - Replace any button using `variant="outline"` to use `variant="secondary"`.

## Risks and Mitigations

**Risk 1:** Missing usages of `OutlineButton` in other files.
- **Mitigation:** Rely on TypeScript to catch build errors if `OutlineButton` is used elsewhere, or use a workspace-wide search before finalizing.

## Integration Notes

- Ensure Tailwind CSS classes added do not conflict with existing padding or sizing utilities.

## Blast Radius

- `apps/admin/src/components/ui/button.tsx`
- `apps/admin/src/routes/(dashboard)/components.tsx`
- `apps/admin/src/features/branches/components/branch-list.tsx`

## Phase Loop Progress

- [ ] 1a. Research updated — context and codebase scan complete
- [ ] 1b. Plan supplemented — checklist reflects research findings
- [ ] 2. Validate contract written — vc-validate-agent gate verdict is green
- [ ] 3. Execute complete — all checklist items done, tests pass
- [ ] 4. Update process — plan archived, context docs updated, memory notes written
- [ ] 5. Report written — execute report filed to reports/

> **IMPORTANT:** Step 2 is never skippable. A placeholder Validate Contract is a blocker — do not proceed to step 3 until a vc-validate-agent gate verdict is present.

## Validate Contract

**Gate Status:** ✅ PASS (Ready for EXECUTE)

**Pre-flight / Verification Steps:**
1. [ ] `grep -r "OutlineButton" apps/admin/src/` returns no results after refactor.
2. [ ] `grep -r "variant=\"outline\"" apps/admin/src/` returns no results after refactor.
3. [ ] Running the typechecker (e.g. `npm run typecheck` or `npm run build` inside `apps/admin`) passes with no errors.

**Hard Stop Conditions / Safety Constraints:**
- `apps/admin/src/components/ui/button.tsx` is shared outside the `admin` app (if it's not strictly local, we must evaluate impact).
- Unresolvable build errors appear when swapping `<OutlineButton>` to `<SecondaryButton>`.

## Autonomous Goal Block

```text
SESSION GOAL: Admin App Universal Button Outlines
Charter + umbrella plan: N/A — single plan
Autonomy: Auto-proceed on all reversible decisions; surface only hard stops.
Hard stop conditions / safety constraints:
- If apps/admin/src/components/ui/button.tsx is shared outside the admin app.
- If replacing OutlineButton with SecondaryButton causes unresolvable build errors.
Next phase: EXECUTE: process/general-plans/active/admin-button-outlines_14-07-26/PLAN.md
Validate contract: inline in plan
Execute start: fully-auto commands | high-risk pack: no
```
