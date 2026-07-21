---
phase: customer-mark-picked-up-section-c
date: 2026-07-21
status: COMPLETE
feature: ordering-cart
plan: process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md
---

# EXECUTE REPORT — Section C (Mobile), checklist items 16–20

**TL;DR:** All 5 Section C items applied. The reanimated mock extension (step 16) worked and
regressed nothing — 28 pre-existing suites / 115 pre-existing tests all still pass. AC9 and AC10
landed as **real, non-vacuous automated tests** (11 new jest cases), each proven to fail under a
deliberate mutation of the code they guard. All 5 gates green. `packages/api` / `packages/types`
untouched.

Scope executed: Section C only. Sections A+B (`packages/api`) were executed concurrently by a
second agent; Section D is the EVL cross-package pass and is not claimed here.

## What Was Done

| # | Item | File | Status |
|---|---|---|---|
| 16 | `Easing` + `withRepeat` added to the jest reanimated mock | `apps/mobile/src/test-utils/jest-setup.ts` (M) | done |
| 17 | `completeOrder(orderId)` API client fn | `apps/mobile/src/features/orders/lib/api-client.ts` (M) | done |
| 18 | `useCompleteOrder()` mutation hook | `apps/mobile/src/features/orders/hooks/use-complete-order.ts` (NEW) | done |
| 19 | `ready`-gated button + ConfirmDialog | `apps/mobile/src/app/(tabs)/tracking/index.tsx` (M) | done |
| 20 | AC9/AC10 screen test | `apps/mobile/src/app/(tabs)/tracking/__tests__/index.test.tsx` (NEW) | done |

### Step 16 — the prerequisite, and its hard-stop check

The plan's premise was verified empirically **before** editing, via a throwaway probe rendering the
tracking screen under jest. It failed exactly as predicted:

```
TypeError: Cannot read properties of undefined (reading 'inOut')
  > 41 |  withTiming(0.15, { duration: 900, easing: Easing.inOut(Easing.ease) }),
```

`Easing` was `undefined`. The mock now supplies identity curves (`ease`/`linear`/`quad`/`cubic`/
`sin`/`circle`/`exp`), identity modifiers (`in`/`out`/`inOut`), a `bezier` factory, and
`withRepeat` as a passthrough consistent with the existing `withTiming`/`withSpring` stubs. The
probe was deleted once green.

**Hard-stop condition did NOT trigger — no regression.** Evidence: baseline was 28 suites / 115
tests; immediately after the mock edit the suite read 29 suites / 116 tests, the deltas being
exactly the one probe suite and its one test. Every pre-existing suite and test still passed. No
suite was narrowed, skipped, or deleted.

### Contract alignment (informational)

The concurrent Section A agent's route landed at `PATCH /orders/:orderId/complete`, body-less,
responding `{ order: serializeOrder(...) }`. The client written here matches on all three points.
No coordination edit was needed in either direction.

## What Was Skipped or Deferred

- **AC11** (on-device: confirm → screen shows `completed`, polling stops) — Agent-Probe by design;
  no RN navigation/E2E runner exists project-wide. Unchanged standing gap, already accepted in the
  validate-contract's Known Gaps.
- **Section D** cross-package gates (`packages/api` test/typecheck, root `format:check`) — belongs
  to the EVL pass, not to this Section C scope.

## Test Gate Outcomes

| Gate | Baseline (pre-edit) | Final | Result |
|---|---|---|---|
| `mobile test` — vitest | 13 files / 94 tests | 13 files / 94 tests | pass (no vitest tests added) |
| `mobile test` — jest | 28 suites / 115 tests | **29 suites / 126 tests** | pass (+1 suite, +11 tests) |
| `mobile typecheck` | 0 errors (exit 0) | 0 errors (exit 0) | pass |
| `mobile guard:theme-mode` | OK — 32 components / 216 call sites | OK — 32 components / **218** call sites | pass (+2 = Button, ConfirmDialog) |
| `prettier --check` (touched files) | n/a | clean | pass |
| `mobile lint` (extra sanity check) | 5 warnings / 0 errors | 5 warnings / 0 errors | pass (all warnings pre-existing, in untouched files) |

**Note on the typecheck baseline:** the task brief warned of 2 pre-existing NAV-005 typed-route
errors. On this branch (`development`) the measured baseline was **0 errors**, so no pre-existing
errors had to be tolerated and every error surfaced during the work was mine to fix.

### Non-vacuous proof for AC9 / AC10

Both criteria were driven red-first, then mutation-tested to confirm they actually bite:

| Mutation applied to `tracking/index.tsx` | Expected | Observed |
|---|---|---|
| Gate weakened: `order.status === 'ready'` → `!isTerminalStatus(order.status)` | AC9 negative cases fail | **4 failed** (pending/accepted/preparing/flavoring) |
| Confirm bypassed: `onPress` calls `completion.mutate(orderId)` directly | AC10 fails | **3 failed** (all AC10 cases) |

Both mutations were reverted and the suite returned to green. The initial red run (before step 19)
failed 4 of 11 — the 7 "does not render" cases passed vacuously at that point, which is precisely
why the positive `ready` case and the two mutation probes are the load-bearing evidence rather
than the negative cases alone.

## Plan Deviations

All five are within-blast-radius implementation detail; none touch a hard constraint.

1. **`Easing` mock covers more than `inOut`/`ease`.** The plan's parenthetical named those two; I
   added the sibling curves and modifiers in the same identity style. Rationale: the file's existing
   `makeAnimationBuilder` Proxy already takes this "don't make the next call site re-open this file"
   posture, and the plan's own Test Infra Improvement Notes frame this mock as reusable infra. Zero
   behavioural risk — every member is identity.
2. **AC9 asserts all 7 non-`ready` statuses**, where the plan asked for "at least `preparing` and
   `completed`". Stronger than the minimum: a sample of two would still pass under a
   `!isTerminalStatus(...)` mistake, which is exactly the mutation probe run above. Testing all
   seven is what makes that probe fail.
3. **A third AC10 case was added** ("confirming sends exactly one request for this order"). The
   plan's wording covers "fires no mutation until confirmed"; without the positive counterpart the
   suite would also pass if the button were wired to nothing at all.
4. **`ConfirmDialog` is rendered inside the `ready`-gated block**, not as a sibling of the
   `ScrollView`. The plan did not specify placement. Sharing one lifecycle with the button avoids a
   race where a poll lands `completed` while the dialog is open, leaving the user able to confirm
   into a guaranteed 409 whose inline error text had just unmounted. Being a `Modal`, tree position
   costs no layout.
5. **The mutation is sent with the route param `orderId`, not `order.id`.** These are the same value
   in practice, but `useOrderQuery` keys its cache on the route param, so using it keeps the
   `['order', orderId]` invalidation guaranteed to hit the query that is actually mounted.

### Constraints honoured (explicit confirmation)

- `use-order-query.ts` was **not edited** — `staleTime: 0`, `refetchIntervalInBackground: false`,
  and the terminal-status `refetchInterval` callback are all untouched (LIVE-001 E4). The new hook
  only invalidates the key from outside.
- **E2 (theming):** the button sits in the `ScrollView` content *below* `styles.timelineCard`, i.e.
  on `theme.background`, so it takes the **device-scheme `mode`** — not `mode="light"`. The layout
  did not force it onto the cream card, so the `Colors.light.*` fallback in E2 was not needed. An
  in-file comment states which surface it sits on and warns against copying the timeline's pinned
  `mode="light"` down. Error text uses the `theme.accent` token, no raw hex.
- **Confirm-dialog divergence from staff is documented in code** (`tracking/index.tsx`), stating it
  is deliberate and asking a future reader not to "fix" the inconsistency.
- No file under `packages/api/` or `packages/types/` was created, edited, or deleted by this agent.

## Test Infra Gaps Found

- **Closed:** the reanimated mock's missing `Easing`/`withRepeat`. Any screen using timing curves or
  repeating animations is now jest-renderable — reusable beyond this plan.
- **Still open (unchanged, out of scope):** `cancelAnimation` remains absent from the mock. The
  layout-animation builders (`FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`) are in fact already
  present via the existing Proxy, so the plan's note that they "remain absent" is slightly stale —
  flagging for UPDATE PROCESS rather than editing the plan here.
- **Gotcha worth carrying forward:** `ConfirmDialog` mounts inside an RN `Modal` and is **not**
  queryable synchronously after `fireEvent.press`. Tests must `await fireEvent.press(...)` and use
  `findBy*` / `waitFor`. A synchronous `getByTestId` fails with "Unable to find an element". This
  cost one debug cycle here; `features/staff/__tests__/live-order-actions.test.tsx` is the working
  precedent.
- **Jest CLI note:** this repo's jest version takes `--testPathPattern` (singular). `--testPathPatterns`
  is rejected.

## Closeout Packet

- **Selected plan:** `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/customer-mark-picked-up_PLAN_21-07-26.md`
- **Finished:** Section C, checklist items 16–20, complete.
- **Verified:** AC9 and AC10 by real passing automated tests, each mutation-proven non-vacuous. All
  5 mobile-side gates green against a measured clean baseline.
- **Still unverified:** AC11 (Agent-Probe, on-device, owed by the user). Sections A/B/D are outside
  this agent's scope and are not claimed.
- **Remaining cleanup:** none within Section C. Changes are uncommitted; branch/commit strategy left
  to the orchestrator.
- **Follow-up plan stubs created:** none.
- **CONTEXT_PARTIAL items:** none.
- **Best next state:** `Keep in active/testing` — Section C is code-complete, but the plan's Phase
  Completion Rules require the AC11 walkthrough before VERIFIED, and Sections A/B/D must clear EVL.

## Forward Preview

**Test Infra Found.** `apps/mobile` jest now renders animation-using screens. New durable constraint
for future screen tests: RN `Modal`-based components (`ConfirmDialog`) need awaited presses and
async queries.

**Blast Radius Changes.** None beyond the plan. 3 files modified + 2 created, all under
`apps/mobile/`. `packages/api`, `packages/types`, `packages/ui`, `packages/utils`, `apps/admin`
untouched by this agent.

**Commands to Stay Green.**
```
pnpm --filter @jojopotato/mobile test
pnpm --filter @jojopotato/mobile typecheck
pnpm --filter @jojopotato/mobile guard:theme-mode
pnpm format:check
```

**Dependency Changes.** None. No package added, removed, or version-bumped.
