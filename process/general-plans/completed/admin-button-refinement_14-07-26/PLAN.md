---
name: plan:admin-button-refinement
description: "Refining the Button component with smart submit/async loading states and dedicated wrapper components."
date: 14-07-26
metadata:
  node_type: memory
  type: plan
---

# Admin Button Refinement Plan

## Touchpoints
- `apps/admin/src/components/ui/button.tsx`

## Public Contracts
- Exported components: `Button`, `PrimaryButton`, `SecondaryButton`, `DestructiveButton`, `OutlineButton`, `GhostButton`, `SubmitButton`.
- `SubmitButton` will use `useFormStatus` internally.
- `Button` components will support an `async` `onClick` handler and automatically manage loading state.

## Blast Radius
- Scope: 1 file (`apps/admin/src/components/ui/button.tsx`)
- Risk Class: Low. Updates the button component to add wrappers and smart loading states.

## Verification Evidence
| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| SubmitButton loading state | Agent-Probe | `SubmitButton` disables and shows a spinner when `useFormStatus` is pending. |
| Async onClick loading state | Agent-Probe | Smart `type="button"` tracks `async` `onClick` promises, showing loading state and preventing spam. |
| DestructiveButton styling & behavior | Agent-Probe | `DestructiveButton` automatically includes a warning icon, uses distinct destructive colors without pulse/stripes, and correctly implements the two-step `requiresConfirm` flow. |
| Loading state visual polish | Agent-Probe | Spinner replaces icon or sits beside text without layout shift. |

## Test Infra Improvement Notes
(none identified yet)

## Resume and Execution Handoff
1. Selected plan file path: `process/general-plans/active/admin-button-refinement_14-07-26/PLAN.md`
2. Last completed phase or step: PLAN
3. Validate-contract status: pending
4. Supporting context files loaded: `process/context/all-context.md`
5. Next step for a fresh agent picking up mid-execution: Run VALIDATE mode to convert this plan into an executable validate contract before moving to EXECUTE.

## Validate Contract

Status: CONDITIONAL
Date: 2026-07-14
date: 2026-07-14
generated-by: outer-pvl
Test gates:
- Agent-Probe: Verify SubmitButton with useFormStatus pending state
- Agent-Probe: Verify Button async onClick loading state tracking
- Agent-Probe: Verify DestructiveButton confirm flow and UI
- Agent-Probe: Verify Loading state visual polish without layout shift
Dimension findings:
- infra/setup-fit: PASS
- test-coverage: CONCERN (Lacks fully-automated E2E/integration scenarios)
- breaking-changes: PASS
- security-surface: PASS
Open gaps:
- CONCERN: No fully-automated E2E/integration test scenarios are planned for the new button behaviors.
What This Coverage Does NOT Prove:
- Does not prove that the new button behaviors will remain working under future refactors, as there are no automated regression tests catching potential breakages in useFormStatus or async promise tracking.
Accepted by: session (autonomous, /goal execution)

## Autonomous Goal Block

SESSION GOAL: Refining the Button component with smart submit/async loading states and dedicated wrapper components
Charter + umbrella plan: N/A — single plan
Autonomy: phases execute autonomously; pause only on hard stops — see feedback_autonomous_phase_execution.md
Hard stop conditions / safety constraints:
- None identified
Next phase: EXECUTE: process/general-plans/active/admin-button-refinement_14-07-26/PLAN.md
Validate contract: process/general-plans/active/admin-button-refinement_14-07-26/PLAN.md (inline)
Execute start: high-risk pack: no

## Implementation Details
1. **Smart `type="submit"` (`SubmitButton`)**:
   - Create a `SubmitButton` wrapper component.
   - Use `useFormStatus()` from `react-dom` to get `pending` state.
   - When `pending` is true, set `disabled={true}` and render a loading spinner.

2. **Smart `type="button"` (`onClick` Promise Tracking)**:
   - In the base `Button` component, if `onClick` is provided, wrap it to detect if it returns a Promise.
   - Track resolution using local state (`isLoading`).
   - While `isLoading` is true, disable the button and show the spinner to prevent spam clicks.

3. **Dedicated Wrapper Components**:
   - `PrimaryButton`: Uses `variant="default"`
   - `SecondaryButton`: Uses `variant="secondary"`
   - `DestructiveButton`: Uses `variant="destructive"`.
     - Automatically include a warning SVG icon.
     - Ensure its color is distinctly destructive within the Jojo Potato theme. Do NOT use pulsating effects or striped backgrounds.
     - Support a conditional `requiresConfirm?: boolean` prop. If true, the button requires a two-step confirmation (first click changes the button state/text to confirm, second click fires the action).
   - `OutlineButton`: Uses `variant="outline"`
   - `GhostButton`: Uses `variant="ghost"`
   - Export all wrappers from `button.tsx`.

4. **Visual Polish**:
   - Integrate a loading spinner component (e.g., Lucide React's `Loader2` with `animate-spin` class).
   - Position the spinner seamlessly without layout shift.
   - Maintain strict adherence to the Jojo Potato system theme and `apps/admin` module's aesthetics.
