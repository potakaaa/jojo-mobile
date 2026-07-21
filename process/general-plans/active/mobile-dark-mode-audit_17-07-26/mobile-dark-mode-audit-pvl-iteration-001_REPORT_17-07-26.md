---
name: mobile-dark-mode-audit-pvl-iteration-001
description: PVL cycle 1 — 3 test-coverage gaps confirmed resolved; StatusBar feasibility probe locked in
date: 2026-07-17
metadata:
  type: pvl-iteration-report
  plan: process/general-plans/active/mobile-dark-mode-audit_17-07-26/mobile-dark-mode-audit_PLAN_17-07-26.md
  cycle: 1
  gate: CONDITIONAL
---

# PVL Iteration Report — Cycle 1

## Summary

Baseline V1–V7 validate run returned `Gate: CONDITIONAL` — 0 FAILs, 3 CONCERNs, all located in
Section E (tests) / the test-coverage dimension. Sections A, B, C, D, F and Layer 1 infra /
breaking-changes / security all PASSed.

Two blockers halted the first validate attempt at V2 and were both resolved before this cycle:

1. **`VC-FEASIBILITY-PROBE-NEEDED` on `expo-status-bar` style semantics** — resolved VIABLE by a
   `cheap-local` `vc-debugger` probe. See `mobile-dark-mode-audit_FEASIBILITY_17-07-26.md`.
2. **`validate-plan-artifact.mjs` never ran (sandbox `ENOSPC`)** — root-caused to the host boot disk
   sitting at 100% capacity (~133 MB free), not a harness or plan defect. Validator subsequently
   re-run clean: 0 failures, 0 warnings.

## Gaps Found (3, all CONCERN, 0 FAIL)

| # | Section | Gap | Resolution |
|---|---|---|---|
| 1 | Section E — guard script | Spread-prop blind spot: a future `{...props}` spread on a tracked component bypasses the `mode`-presence check exactly as it bypasses TypeScript's required-prop check when the spread source widens to `any`. Today's enumeration IS confirmed exhaustive (zero spread occurrences across the 26 tracked components in `apps/mobile/src`; both packages `strict: true`) — but nothing kept it safe going forward. | Guard script must hard-fail on ANY spread attribute on a tracked component's JSX call, requiring a manual allow-list entry. Never a silent pass. Applied at plan `:225-231`. |
| 2 | Section E — tests | AC8 (`Appearance`-change resume) was documented in SPEC as Fully-Automated-testable but carried in the plan only as a soft "IF an existing test covers this" conditional — and zero tests in the repo mock `Appearance`. A test the SPEC claimed feasible would have silently never been built. | Now a REQUIRED Section E step: mock `Appearance.addChangeListener`/`getColorScheme`, assert `useColorScheme()` flips. Explicit downgrade-with-stated-reason is the only alternative. Applied at plan `:279-280`, `:484`. |
| 3 | Section E / F — hex guard | `packages/ui/scripts/check-raw-tokens.mjs` (`pnpm --filter @jojopotato/ui check-tokens`) already hard-fails on raw hex in `packages/ui` components — an existing free win the plan never referenced. It has zero reach into `apps/mobile`, exactly where Section C's hand-threaded fixes could introduce a stray hex. SPEC AC9's "no hardcoded colours" clause was only half-covered. | Script now referenced in the Verification Evidence Fully-Automated row and Section F's `all-tests.md` Commands table; EXECUTE must either extend coverage to `apps/mobile` or record a rationale-backed Known-Gap. Applied at plan `:241`, `:411`, `:430`. |

## Feasibility Lock-In (carried from the probe)

`resolveStatusBarStyle(scheme) = scheme === 'dark' ? 'light' : 'dark'` is locked at plan `:188`, with
an explicit anti-inversion instruction at `:193-199` naming the identity mapping as forbidden.

Key refinement from the probe evidence: today's `<StatusBar style="auto" />` was never using the wrong
*direction* — `expo-status-bar`'s own `'auto'` branch computes the identical inversion internally. It
uses the wrong **scheme source** (RN's raw OS scheme rather than the app's resolved preference). The
fix is therefore a source swap, not a logic change. No iOS/Android divergence exists (`barStyle` lives
on RN's shared base props, not the Android-only surface props). `SystemUI.setBackgroundColorAsync`
(`_layout.tsx:122-126`) is untouched and was already correct.

## Supplement Outcome

`vc-plan-agent` (PVL-supplement mode) verified all 3 gaps against the plan file directly rather than
trusting the report, and found them already correctly and completely inlined across every downstream
section (Acceptance Criteria, Implementation Checklist, Verification Evidence, Risks, test-gates
table). **Net-new edits this cycle: 0** — a confirmation-only pass.

Cause: `vc-validate-agent` applied the fixes inline to the plan body during its own V6 contract write.
That is a mild scope overstep (validate-agent's write role is the validate-contract section only), which
is precisely why this cycle verified rather than assumed. Orchestrator independently spot-checked the
three gap sites plus the StatusBar lock and contract fields — all confirmed present and substantive.

## Process Note

`vc-validate-agent` writing plan body text outside `## Validate Contract` should be flagged at UPDATE
PROCESS. It worked out here and cost one cycle rather than causing a defect, but the phase boundary
exists so that validate findings are confirmed by a second agent rather than self-certified.

## Next

Re-spawn `vc-validate-agent` from V1 to confirm `Gate: PASS`. Per protocol, a first-pass CONDITIONAL is
never terminal and never routes to EXECUTE; EXECUTE becomes legal only on `Gate: PASS`, or on an
explicitly user-accepted CONDITIONAL that has completed ≥1 supplement cycle.
