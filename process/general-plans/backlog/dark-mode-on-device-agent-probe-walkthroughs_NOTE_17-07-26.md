# Backlog Note: On-device Agent-Probe walkthroughs owed for mobile dark-mode fix

**Filed:** 17-07-26 (mobile-dark-mode-audit UPDATE PROCESS)
**Priority:** Medium (blocks the plan reaching VERIFIED status, per its own Phase Completion Rules)
**Source:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/` (SPEC AC 5-8, plan
Section E step 9)

## Problem

The mobile-dark-mode-audit plan is CODE DONE and EVL-green (all automated gates pass), but its own
`## Phase Completion Rules` require the following manual on-device walkthroughs before it can be
classified VERIFIED. No agent can perform these — they require physical/simulator hardware and a
human tester.

## Owed walkthroughs (do NOT assume one transfers to the other)

1. **Android StatusBar legibility, all 4 OS/app theme combinations** (OS light + app light, OS
   light + app dark, OS dark + app light, OS dark + app dark).
2. **iOS StatusBar legibility, same 4 combinations — a SEPARATE walkthrough from Android.** The
   plan's own feasibility probe warned iOS StatusBar behavior may differ mechanically even though
   the derivation function (`resolveStatusBarStyle`) is shared code.
3. **App-restart persistence** of the theme preference across a real app restart.
4. **OS-background-resume behavior pickup** — app backgrounded, OS theme changed, app resumed,
   confirm the app picks up the new OS theme without restart (when preference is `'system'`).

## Where to record results

Update the plan file's own Verification Evidence / Validate Contract gap-resolution `D` rows
directly, and flip the plan's status from CODE DONE to VERIFIED once all 4 walkthroughs are
performed and their outcomes (pass, or a tracked known-sub-case gap) are recorded.

## Fix options

This is a pure manual-verification task, not a code fix. No automated substitute is possible for
physical-pixel legibility or real OS lifecycle events.
