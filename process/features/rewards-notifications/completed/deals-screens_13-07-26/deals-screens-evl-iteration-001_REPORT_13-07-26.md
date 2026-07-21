---
name: deals-screens-evl-iteration-001
description: EVL cycle 1 — typecheck gate failed on Home entry route string; scoped fix routed
date: 2026-07-13
metadata:
  node_type: report
  type: evl-iteration
  loop: evl
  cycle: 1
  plan: deals-screens_PLAN_13-07-26.md
---

# EVL Iteration 001 — Deals Screens

## Trigger
Independent EVL confirmation run (vc-tester) after EXECUTE reported gates green.

## Gate results
- **Lint** (`pnpm -C apps/mobile exec eslint src`): PASS (exit 0, no violations).
- **Typed-routes codegen**: `.expo/types/router.d.ts` regenerated; contains `/(tabs)/deals` and `/(tabs)/deals/deal/[dealId]`.
- **Typecheck** (`pnpm -C apps/mobile exec tsc --noEmit`): **FAIL** — 6 errors total.

## Gap analysis
| # | File:line | Error | Verdict |
|---|-----------|-------|---------|
| 1 | `apps/mobile/src/app/(tabs)/index.tsx:56` | TS2345 — `'/(tabs)/deals/index'` not assignable to typed Href union | **IN-SCOPE NEW BUG** — Touchpoint #7 (Home entry). Correct route is `'/(tabs)/deals'`. |
| 2–6 | `apps/mobile/src/features/order-history/reorder.ts` / `reorder.test.ts` | Product vs MenuItem shape mismatch (priceCents/isAvailable) | **PRE-EXISTING / OUT-OF-SCOPE** — reproduced identically on baseline via `git stash`; not this plan's blast radius. |

Execute-agent's "all 5 errors pre-existing" report was inaccurate: total is 6, and gap #1 is new + in-scope. Root cause: execute-agent deviation #1 chose `/(tabs)/deals/index`, but Expo Router collapses a non-tab `index` file to the parent path `/(tabs)/deals`.

## Fix routed
vc-execute-agent (supplement mode), scoped to exactly `apps/mobile/src/app/(tabs)/index.tsx:56` — change `'/(tabs)/deals/index'` → `'/(tabs)/deals'`. No other files touched. `order-history/reorder.*` explicitly excluded (confirmed pre-existing).

## Next
Re-spawn vc-tester for the same EVL confirmation after the fix. 10-cycle cap; this is cycle 1.
