---
name: backlog:guard-theme-mode-branch-not-merged
description: "guard:theme-mode is RED on development (25 pre-existing violations) because mobile-dark-mode-audit's fixes haven't merged yet"
date: 20-07-26
metadata:
  node_type: memory
  type: backlog
  feature: staff-dashboard
  priority: P2
---

# Backlog: `guard:theme-mode` red on `development` — pending merge, not new debt

**Priority:** P2 — blocks a clean `pnpm --filter @jojopotato/mobile guard:theme-mode` exit on
`development` today; does not block any individual feature's correctness.
**Filed during:** STAFF-005 (#106) dashboard-home UPDATE PROCESS, 20-07-26.

## Problem

On the current `development` branch, `pnpm --filter @jojopotato/mobile guard:theme-mode` exits 1
with 25 violations, all in `apps/mobile/src/features/branches/lib/map-style.ts` (raw hex literals)
and the two `use-color-scheme.ts`/`.web.ts` wrapper files (the guard's intentional RN
`useColorScheme` allowlist boundary — these are expected findings in isolation, but the guard
script version currently on `development` doesn't yet carry the allowlisting/fixes that
`mobile-dark-mode-audit_17-07-26` (still in `process/general-plans/active/`, not yet merged)
already implemented on its own branch.

Confirmed pre-existing and unrelated to STAFF-005: stashing all STAFF-005 changes reproduces the
identical 25 violations. The dashboard-home work adds zero new violations.

## What Must Be Done

Once `mobile-dark-mode-audit_17-07-26` merges into `development`, re-run `guard:theme-mode` — it
should go green (or drop to the already-tracked 3-hex-literal baseline documented in
`dark-mode-hex-literal-baseline_NOTE_17-07-26.md`, which is a different, narrower finding about
`order-detail`/`tracking` screens). If it is still red after that merge, `map-style.ts`'s hex
literals need the same token-based fix pattern applied elsewhere in that audit.

## Fix options

1. Merge `mobile-dark-mode-audit_17-07-26` into `development` (its own plan is pending owed
   on-device Agent-Probe walkthroughs before archival — this note doesn't change that gate, just
   flags the downstream `development`-branch consequence).
2. If `map-style.ts` still needs work after merge, treat it as a QUICK FIX lane candidate (bounded,
   single feature area — `apps/mobile/src/features/branches/`).
