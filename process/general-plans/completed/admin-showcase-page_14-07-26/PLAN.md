---
name: plan:admin-showcase-page
description: "Implement Component Showcase page in apps/admin for Buttons, Cards, and Inputs"
date: 14-07-26
metadata:
  node_type: memory
  type: plan
---

# Admin Dashboard Component Showcase - Plan

**Date:** 14-07-26
**Complexity:** Simple
**Status:** ⏳ PLANNED

## Overview

Implement a TanStack Router route in `apps/admin` to showcase the UI components (Buttons, Cards, Inputs) with the Jojo Potato design language. This acts as an internal reference for developers building the admin dashboard.

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
- Create a new route `apps/admin/src/routes/(dashboard)/components.tsx`.
- Display a comprehensive grid layout showcasing Button, Card, and Input variants.
- Validate that components render correctly within the existing admin app's layout and styling (shadcn + tailwind v4).

**Success Metrics:**
- All 7 Button variants, 7 Card sub-components, and Input states (default, disabled, error) are visible on the new page.
- Page is reachable at `/components` in the admin dev environment.

## Execution Brief

**IMPORTANT:** This is a SIMPLE (one-session) plan - implement continuously without approval gates.

Before EXECUTE begins, vc-validate-agent must write the Validate Contract section. Do not start EXECUTE with an empty placeholder.

### Phase 1: Route Setup
**What happens:** Create the route file `components.tsx` within the `apps/admin/src/routes/(dashboard)/` directory.

### Phase 2: Page Layout & Sections
**What happens:** Implement a clean semantic layout with a page title ("Component Showcase") and distinct grid sections for Buttons, Cards, and Inputs.

### Phase 3: Component Integration
**What happens:** Import and mount the components. Handle any mock context required for specific components (like `SubmitButton`).

### Test Gates

1. **Route Test:** Visit `/components` to verify it loads within the dashboard layout. `[hybrid]`
2. **Visual Test:** Check that the Jojo Potato design language (cream bg/ink text/jyellow primary/brand radius/4px hard shadow) is applied correctly to all showcased components. `[hybrid]`
3. **Console Test:** Ensure no React warnings or errors in the browser console. `[hybrid]`

### Expected Outcome
- A functional and visually accurate reference page for the admin dashboard's UI components.

## Scope

**In-Scope:**
- `apps/admin/src/routes/(dashboard)/components.tsx` route file.
- Layout and rendering of requested Button, Card, and Input components.

**Out-of-Scope:**
- Creating new components.
- Modifying existing components.
- Modifying `apps/mobile` or `packages/api`.

## Assumptions and Constraints

**Assumptions:**
- Admin app is using TanStack Router for file-based routing.
- The `(dashboard)` route group exists and provides the surrounding layout.
- The Jojo Potato design tokens are already available and applied via Tailwind/shadcn.
- All target components exist in the repo.

**Constraints:**
- Must maintain the Jojo Potato design language.
- Single-session implementation.

## Functional Requirements

1. **Page Structure:**
   - Title: "Component Showcase".
   - Subtitle/Description: "Reference for Jojo Potato admin UI components."
2. **Buttons Section:**
   - Grid layout showing all specified button variants side-by-side.
   - Example labels indicating the variant name.
3. **Cards Section:**
   - A realistic card composition showing all sub-components.
4. **Inputs Section:**
   - Stacked layout showing standard input, disabled input, and error state input.

## Non-Functional Requirements

- **Design:** Semantic HTML, responsive grid layouts.
- **Code Quality:** Clean, maintainable component structure.

## Acceptance Criteria

1. ✅ `components.tsx` exists and is a valid TanStack Router file.
2. ✅ Page renders at `/components`.
3. ✅ Buttons section displays 7 variants.
4. ✅ Cards section displays composed card.
5. ✅ Inputs section displays 3 states.
6. ✅ Design is visually consistent with the Jojo Potato brand.

## Implementation Checklist

1. **Route Creation**
   - Create `apps/admin/src/routes/(dashboard)/components.tsx`.
   - Add `createFileRoute` boilerplate for TanStack Router.
2. **Imports**
   - Import `Button` variants, `Card` sub-components, and `Input` from the UI library path.
3. **Layout Implementation**
   - Create standard page container (e.g., `flex flex-col gap-8 p-8`).
   - Add "Component Showcase" heading.
4. **Buttons Section**
   - Create section heading.
   - Render `Button` (default).
   - Render `PrimaryButton`.
   - Render `SecondaryButton`.
   - Render `OutlineButton`.
   - Render `GhostButton`.
   - Render `DestructiveButton` (demonstrating `requiresConfirm`).
   - Render `SubmitButton` (mock form context if needed).
5. **Cards Section**
   - Create section heading.
   - Render full `Card` composition (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`).
6. **Inputs Section**
   - Create section heading.
   - Render standard `Input`.
   - Render `disabled` `Input`.
   - Render error `Input` (`aria-invalid="true"`).

## Risks and Mitigations

**Risk:** `SubmitButton` requires a form context (`useFormStatus`) to render correctly.
**Mitigation:** If it throws an error outside a form, wrap it in a mock `<form action={...}>` or a simple Form context provider for the showcase.

## Integration Notes

- Ensure component imports resolve to the correct path based on `apps/admin` aliases.

## Blast Radius

- `apps/admin/src/routes/(dashboard)/components.tsx`

## Phase Loop Progress

- [ ] 1a. Research updated — context and codebase scan complete
- [ ] 1b. Plan supplemented — checklist reflects research findings
- [ ] 2. Validate contract written — vc-validate-agent gate verdict is green
- [ ] 3. Execute complete — all checklist items done, tests pass
- [ ] 4. Update process — plan archived, context docs updated, memory notes written
- [ ] 5. Report written — execute report filed to reports/

> **IMPORTANT:** Step 2 is never skippable. A placeholder Validate Contract is a blocker — do not proceed to step 3 until a vc-validate-agent gate verdict is present.

## Validate Contract

**V7 Gate: EXECUTE Readiness**
- **Plan Type**: SIMPLE
- **Strategy Recommendation**: Sequential execution by `vc-execute-agent` in a single run.

### Target Files
- `apps/admin/src/routes/(dashboard)/components.tsx`

### Hard Stop Conditions
- Existing components are modified (explicitly out-of-scope).
- The `(dashboard)` layout wrapper is broken or altered.
- React throws unhandled errors when mounting the showcase page.

### Test Gates
1. `components.tsx` compiles without type or lint errors.
2. The page renders at `/components` in the dev environment without console warnings.
3. All required components (Buttons, Cards, Inputs) are visually present and styled using Jojo Potato design language.

## Autonomous Goal Block

```text
SESSION GOAL: Implement Component Showcase page in apps/admin for Buttons, Cards, and Inputs
Charter + umbrella plan: N/A — single plan
Autonomy: Auto-proceed on all reversible decisions; surface only hard stops.
Hard stop conditions / safety constraints:
- Existing components are modified (explicitly out-of-scope).
- The `(dashboard)` layout wrapper is broken or altered.
- React throws unhandled errors when mounting the showcase page.
Next phase: EXECUTE: process/general-plans/active/admin-showcase-page_14-07-26/PLAN.md
Validate contract: inline in plan
Execute start: spawn vc-execute-agent | high-risk pack: no
```
