---
name: backlog:rewards-progress-bar-battle-pass-semantics
description: "STAR-002 progress bar tracks current_stars vs MIN active reward — should track lifetime_stars toward next unclaimed tier under battle-pass model"
date: 14-07-26
metadata:
  node_type: memory
  type: backlog
  feature: rewards-notifications
---

# Backlog NOTE — Rewards Progress Bar Battle-Pass Semantics

**Created:** 2026-07-14 (STAR-003 UPDATE PROCESS)
**Priority:** Medium
**Source:** STAR-003 Out of Scope + `star-003-reward-unlock_PLAN_14-07-26.md` §Out of Scope

## Problem

STAR-002's Rewards screen progress bar uses `current_stars` (resets on refund) vs `MIN active reward required_stars` for its progress fraction. Under the battle-pass model delivered by STAR-003, the semantically correct tracker is:

- **X axis:** `lifetime_stars` (monotonic, never decremented) — reflects earned progress that cannot be taken away
- **Target:** next UNCLAIMED active tier's `required_stars` (i.e. the lowest tier where no `coupons` row with `status='available'` or `status='used'` exists for this user), not the absolute MIN active reward

The current bar can show "backwards" progress (e.g. 5/5 visually unlocked, then a refund brings `current_stars` to 4 → bar goes back to 4/5) even though the unlock is permanent and the coupon still exists.

## Root Cause

STAR-002 was planned before STAR-003 finalized the battle-pass model. STAR-002 used `current_stars` as the progress dimension (reasonable for an earn/spend model); STAR-003 locked `lifetime_stars` as the progress dimension (correct for battle-pass). These two plans were built sequentially and STAR-003 explicitly flagged this mismatch as out of scope.

## Fix Options

1. **API change (recommended):** Update `GET /rewards/summary` to return `lifetimeStars` as the progress value AND the next unclaimed tier (not the global MIN active reward) as `requiredStars`. This requires a `coupons` join in the summary handler. Update the Rewards screen bar to use `lifetimeStars/nextUnclaimedRequiredStars`. All gate-proven by the existing API integration suite.
2. **Display-only:** Keep the API as-is and transform on the client — `current_stars` today could be replaced by a `lifetime_stars` field already returned in `/summary` (`lifetimeStars`). Minimal API change: just return the next-unclaimed tier in summary instead of global min. Still requires the coupons join.

**Recommended approach:** Option 1 (API + client aligned). The API knows both `lifetime_stars` and the user's unlock history — the summary endpoint is the right place to compute the "next unclaimed tier."

## STAR-003 Dependency

Fix requires `coupons` rows to exist (STAR-003 migrates the table + partial index). STAR-003 is now delivered and merged — this fix can be implemented.

## Acceptance Criteria

- `GET /rewards/summary` returns the next unclaimed tier's `required_stars` as `requiredStars`
- Progress bar uses `lifetime_stars` / `nextUnclaimedRequiredStars` 
- After a refund, the bar does NOT decrease (lifetime is monotonic)
- After unlocking all tiers, bar shows "all rewards unlocked" state
- Proven by: updated `rewards.integration.test.ts` + `star-progress-bar.test.tsx` + Agent-Probe on device

## Blocked By

Nothing — STAR-003 is delivered. This is a design refinement, not a dependency gap.
