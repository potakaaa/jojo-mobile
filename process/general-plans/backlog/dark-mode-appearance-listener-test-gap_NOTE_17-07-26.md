# Backlog Note: Live `Appearance` OS-theme-change listener cannot be tested under jest-expo

**Filed:** 17-07-26 (mobile-dark-mode-audit UPDATE PROCESS)
**Priority:** Low (Known-Gap, not a defect — substitute coverage exists)
**Source:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/` (SPEC AC8, Validate
Contract gap-resolution `D`)

## Problem

SPEC acceptance criterion 8 ("System preference picks up OS theme change on resume from
background") required a real test mocking `Appearance.addChangeListener` firing a simulated
preference-change event and asserting `useColorScheme()`'s returned value updates. This was
genuinely attempted, not skipped.

## Root cause

jest-expo stubs `Appearance` at two separate layers, so `useColorScheme()` never actually calls
`addChangeListener` under the jest test harness — proven by 3 independent probes during EXECUTE.
There is no listener event to simulate because the listener registration itself never fires in this
environment.

## What exists instead

`apps/mobile/src/features/auth/__tests__/use-color-scheme-appearance.test.tsx` — 5
resolver-precedence tests covering the hook's non-listener behavior (initial resolution,
preference-override precedence, etc.).

## What remains open

The actual live OS-background-resume behavior (app resumes from background, OS theme changed while
backgrounded, app picks it up without restart) is Agent-Probe only — no agent can complete this; it
requires a physical device/simulator and a human tester.

## Fix options

1. Accept as a permanent Known-Gap (recommended) — this is a testing-harness limitation, not a code
   defect; `useColorScheme()`'s resolver logic itself is covered.
2. If jest-expo's `Appearance` mock is ever unstubbed/improved upstream, revisit.
3. Add this scenario to a future on-device Agent-Probe checklist (see the sibling on-device-walkthrough
   backlog note filed alongside this one).
