---
name: backlog:reward-unlocked-notification-type
description: "Add 'reward_unlocked' to NotificationType UI enum when notifications UI is built"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: rewards-notifications
---

# Backlog NOTE — `reward_unlocked` NotificationType UI Enum

**Created:** 2026-07-14 (STAR-003 UPDATE PROCESS)
**Priority:** Low
**Source:** STAR-003 Step 1b deferral + `star-003-reward-unlock_PLAN_14-07-26.md` §Out of Scope

## Problem

STAR-003 writes `notifications` rows with `type='reward_unlocked'` (free-form `varchar` in the DB — no enum constraint). The mobile `NotificationType` union in `packages/types/src/notifications.ts` does NOT include `'reward_unlocked'` yet. When the notifications UI is built and starts reading `type` from the API, it will receive an unrecognized string value.

## Current State

`packages/types/src/notifications.ts` has a `NotificationType` union (placeholder; check current values). The DB `notifications.type` column is an unconstrained `varchar` so STAR-003's write is compatible at the DB level. No mobile consumer renders notifications yet — the `(tabs)/rewards/` and notifications screens are either placeholder or unbuilt.

## Fix

Add `'reward_unlocked'` to the `NotificationType` union in `packages/types/src/notifications.ts`. One-line additive change, no migration, no API contract change.

**Timing:** Do this when the notifications UI screen or notification-display components are built (PUSH-002/003 work). Adding it now before any consumer exists is harmless but low-value; doing it as part of the notifications feature ensures the type is tested alongside its consumers.

## Acceptance Criteria

- `'reward_unlocked'` is a member of `NotificationType`
- At least one mobile component renders a push notification with this type
- `pnpm turbo run typecheck` green (no change needed unless a consumer is built simultaneously)

## Related

- `PUSH-002/003` — push notification delivery feature
- `packages/api/src/lib/reward-unlock-notify.ts` — the writer (uses the string directly, no enum)
- `packages/types/src/notifications.ts` — the target file
