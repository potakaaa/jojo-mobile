# Backlog Note: 3 pre-existing raw hex literals pinned as guard baseline

**Filed:** 17-07-26 (mobile-dark-mode-audit UPDATE PROCESS)
**Priority:** Low (baseline is green today; guard prevents new occurrences)
**Source:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/` (Section E, Gap 3
plan-supplement — apps/mobile hex-guard extension)

## Problem

The new `apps/mobile/scripts/check-theme-mode.mjs` guard (`pnpm --filter @jojopotato/mobile
guard:theme-mode`) extends hex-literal checking into `apps/mobile` (closing the gap left by
`packages/ui/scripts/check-raw-tokens.mjs`, which only ever scanned `packages/ui/src/components/**`).
During this extension, 3 pre-existing raw hex literals were found in `order-detail`/`tracking`
screens. Rather than block the fix on removing them (out of this plan's bounded scope), they were
line-pinned into the guard's baseline/allow-list so the gate is green today but fails on anything
NEW.

## What remains open

The 3 pre-existing hex literals themselves are still unfixed — they should eventually be replaced
with `theme.*` token reads to match the rest of the theming convention, but this was explicitly
deferred as out of scope for the dark-mode bug-class fix (which targets missing `mode` props, not
pre-existing hardcoded colors).

## Fix options

1. A small follow-up quick-fix (QUICK FIX lane candidate — bounded, single feature area, no
   schema/auth/API surface) to replace the 3 pinned hex literals with the correct `theme.*` token
   reads and remove them from the guard's baseline/allow-list.
2. Leave as-is indefinitely — the guard's baseline pin means no regression risk from these 3 sites;
   this is cosmetic/consistency debt, not a functional bug.
