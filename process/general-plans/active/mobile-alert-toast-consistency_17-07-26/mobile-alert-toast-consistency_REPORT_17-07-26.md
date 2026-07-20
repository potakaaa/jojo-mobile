---
phase: mobile-alert-toast-consistency
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: general
plan: process/general-plans/active/mobile-alert-toast-consistency_17-07-26/mobile-alert-toast-consistency_PLAN_17-07-26.md
---

# EXECUTE REPORT — Mobile Alert/Toast Consistency Pass

Steps 1–13 implemented. All 9 gates green. Two findings need orchestrator/user attention
before archival: one **material offset defect in the plan's own derivation** (CONCERN-1) and
one **duplicated timer ownership** the plan specifies twice (CONCERN-2).

## What Was Done

| Step | Outcome |
|---|---|
| 1 | `packages/ui/src/components/toast.tsx` — 3 severities, required `mode`, no `Modal`, no reanimated, plain conditional render. Exported from `index.ts`. 19 tests. |
| 2 | `ADD_TO_CART_BAR_HEIGHT` (101) in `add-to-cart-bar.tsx`; `CART_FOOTER_HEIGHT` (72) in `cart.tsx`; `MinTouchTarget` re-exported from `constants/theme.ts`. |
| 3 | `features/shared/hooks/use-toast.ts` — replace-latest, success-only auto-dismiss, unmount teardown. 9 tests. |
| 4 | `use-reorder.ts` — RN `Alert` import dropped; returns `error: string | null`; cleared at each `reorder()` start. 3 tests. |
| 5 | `history.tsx` — added `useSafeAreaInsets` + `insets` (had none); renders reorder error as an error Toast. |
| 6 | `history-screen-dark-mode.test.tsx` mock gains `error: null`. |
| 7 | `cart.tsx` ×3 — deal-removed → `warning`, cart-updated → `warning`, cannot-apply-code → `error`. 5 tests. |
| 8 | `product/[productId].tsx` — guard failure → error toast; 2 success sites → success toast; `addedNotice` state + inline `<Text>` + orphan style DELETED. 5 tests. |
| 9 | `branches/[branchId].tsx` — maps-open catch → error toast. 3 tests. |
| 10 | `account/notifications.tsx` — preference failure → error toast. 4 tests. |
| 11 | `(staff)/order-detail/[orderId].tsx` — `Alert.alert` confirm → `ConfirmDialog` + `pendingAction` state. 6 tests. |
| 12 | `scripts/check-no-raw-alert.mjs` + `guard:no-raw-alert` script. |
| 13 | Full 9-gate sequence, all green. |

## Test Gate Outcomes

| # | Gate | Result |
|---|---|---|
| 1 | `pnpm --filter @jojopotato/ui typecheck` | ✅ 0 errors |
| 2 | `pnpm --filter @jojopotato/ui test` | ✅ 84/84, 25 suites (was 65/65, 24) |
| 3 | `pnpm --filter @jojopotato/ui check-tokens` | ✅ OK |
| 4 | `pnpm --filter @jojopotato/mobile typecheck` | ✅ 0 errors |
| 5 | `pnpm --filter @jojopotato/mobile lint` | ✅ exit 0 (3 pre-existing warnings in untouched `dev-with-tunnel.mjs`) |
| 6 | `pnpm --filter @jojopotato/mobile test` | ✅ vitest 40/40 (baseline, unchanged) + jest 72/72, 18 suites (was 37/37, 13) |
| 7 | `pnpm --filter @jojopotato/mobile guard:theme-mode` | ✅ 28 components tracked (was 27 — `Toast` auto-tracked), 190 call sites (was 184) |
| 8 | `pnpm --filter @jojopotato/mobile guard:no-raw-alert` | ✅ 157 files, 0 call sites |
| 9 | `pnpm format:check` | ✅ clean |
| AC1 | `grep -rn "Alert.alert(" apps/mobile/src` | ✅ **0** |

Measured baseline before any edit: **0 typecheck errors in both packages** (confirming the
stale "3 pre-existing errors" note in `all-context.md` is indeed obsolete).

**Tests are mutation-verified, not merely green.** Every critical assertion was proven to fail
against a deliberately broken implementation:

| Mutation | Caught by |
|---|---|
| All severities auto-dismiss | `warning`/`error` never-dismiss tests (both packages) |
| `message` dropped from Toast timer deps | replace-latest countdown test |
| `Colors[mode]` → `Colors.light` | 4 mode tests |
| `clearTimer()` dropped from `showToast` | replace-latest tests |
| unmount cleanup effect removed | timer-leak test |
| `setError(null)` dropped | stale-error test |
| staff `onConfirm` neutered | confirm-path test |

This mattered: the `warning`/`error` never-dismiss tests assert `not.toHaveBeenCalled()` and so
pass *vacuously* if fake timers aren't installed — mutation testing is the only thing separating
real coverage from theatre here.

## Plan Deviations

All within blast radius; none touch auth/billing/schema/API/container/secrets.

1. **`use-toast` + `use-reorder` tests are jest `*.test.tsx`, not vitest `*.test.ts`** (plan Touchpoints).
   *Why:* proven empirically — `apps/mobile`'s vitest is `environment: 'node'` with no RN transform;
   both hooks transitively import react-native (`@jojopotato/ui` barrel / `@/lib/api-client`), and
   vitest dies parsing react-native's own `index.js`. jest/jest-expo owns `*.test.tsx` and already
   stubs these. *Impact:* none on coverage — same assertions, working runner.
2. **AC3's "no `Modal` import" proven at RENDER level, not by reading source.**
   *Why:* `packages/ui/tsconfig.json` pins `types: ["jest","react"]`; node's `fs` is unavailable and
   no package declares `@types/node`. A source-read check would mean adding a devDep AND widening
   `types` for all of `packages/ui/src` — letting an RN library package reach for node APIs.
   *Impact:* strictly stronger — catches a `Modal` anywhere in the tree, including transitively.
3. **`history.tsx` aliases `error: reorderError`.** Plan said "destructure `error`", but `error` is
   already taken by `useOrderHistory()` on the line above. Mechanical necessity.
4. **`test-utils/render.tsx` gains `toastOverlayBottom()`** (not in Touchpoints) — shared helper for
   AC7's resolved-offset assertions across 4 screen tests; the file's own docstring exists so screens
   "never re-derive" such helpers.
5. **`check-theme-mode.mjs` `HEX_BASELINE` line 408 → 412.** Baseline is keyed by line number; my
   edits shifted a pre-existing hex. Verified byte-identical and that my diff adds **zero** new hex.
6. **Two doc comments reworded** to drop the literal `Alert.alert(` token so the raw AC1 grep returns
   0 (the guard already ignored them — it strips comments by design).

## Concerns

### CONCERN-1 (material, needs a decision before the Agent-Probe session)

**The plan's `bottomOffset` derivations are web-only; on iOS/Android the toast will likely render
on top of the sticky bars it is meant to clear.**

Both `styles.footer` (`cart.tsx`) and `styles.bar` (`add-to-cart-bar.tsx:51`) have their
`paddingBottom` **overridden at runtime on non-web**:

```
Platform.OS !== 'web' && { paddingBottom: getFloatingTabBarClearance(insets.bottom) }
```

`getFloatingTabBarClearance(0)` = 61 + 0 + 8 + 24 = **93** — empirically confirmed this session: a
rendered branch screen shows `contentContainerStyle` `paddingBottom: 93`.

| Constant | Plan value (web padding) | Real non-web height | Plan `bottomOffset` |
|---|---|---|---|
| `ADD_TO_CART_BAR_HEIGHT` | 101 (`8+24` padding) | ~172 + insets.bottom | 109 |
| `CART_FOOTER_HEIGHT` | 72 (`16+8` padding) | ~165 + insets.bottom | 80 |

With `insets.bottom = 0` (typical Android), a toast at `bottom: 109` occupies ~[109, 169] while the
bar's *content* spans ~[93, 172] — a direct overlap covering the Add-to-Cart button. This is exactly
the failure AC7 exists to prevent, and it is the same class of error the plan's own Gap 6 note
caught for the hint row (it counted the hint but not the padding override).

**AC7's automated leg cannot catch this** — it asserts the `bottomOffset` *formula*, so it goes green
either way. The on-device Agent-Probe walkthrough is where it would surface.

**I implemented the plan's numbers exactly as specified** rather than changing a twice-PVL'd,
explicitly-locked constant on my own initiative. Recommended fix (needs approval):
`bottomOffset = <bar content height> + getFloatingTabBarClearance(insets.bottom) + Spacing.two`,
computed at the call site (both screens already have `insets`).

### CONCERN-2 (design duplication the plan mandates twice)

The 2500ms success auto-dismiss timer is specified in **both** Step 1 (`ToastProps`: `onDismiss` is
"called on tap … or auto-timer fire (success)") and Step 3 (`useToast` "schedules a ~2500ms
auto-dismiss timer"), and **both** test suites are required to prove their own side. No reading
leaves one owner with both test sets deliverable, so I implemented both as written. It is not a
correctness bug (`hideToast` is idempotent; the component's effect deps `[visible, severity, message]`
keep the two in sync) and it makes `Toast` self-contained for `packages/ui` consumers that don't use
the hook — but it is redundant, and worth collapsing to one owner in a follow-up.

### CONCERN-3 (minor)

`ADD_TO_CART_BAR_HEIGHT`/`CART_FOOTER_HEIGHT` are hand-derived layout constants pinned by tests to
literal numbers (101/109). A future layout change to those bars invalidates them silently — the same
residual the validate-contract already accepts for `BAR_CONTENT_HEIGHT`.

## Test Infra Gaps Found

1. **NEW, durable, cost me the most time this session — `@testing-library/react-native` v14 is async
   throughout in this repo.** `render`, `act`, `unmount`, `rerender`, `renderHook`, AND `fireEvent`
   all return promises and **must be awaited**. An unawaited call does not fail its own test — it
   leaks an open act scope that silently corrupts *later, unrelated* tests in the same file
   ("You seem to have overlapping act() calls"). My `Promise.all` of three concurrent renders plus a
   bare `unmount()` broke 4 downstream tests, and only A/B isolation found it. Worth adding to
   `all-tests.md`.
2. `jest.getTimerCount()` is unusable for asserting a hook's own timers — React/RN schedule ~3 of
   their own during render+act. Filter a `setTimeout` spy by the distinctive delay instead.
3. `beforeEach(() => jest.someCall())` (concise arrow) returns the Jest object. `apps/mobile`
   (`@jest/globals` types) rejects this at tsc; `packages/ui` (`@types/jest`) does not. Runtime is
   unaffected, but it is a real cross-package inconsistency.
4. Ionicons forwards `testID` but **not** `name` — assert the rendered glyph character, not
   `props.name`.
5. RN `Switch` needs `fireEvent(el, 'valueChange', v)`; `fireEvent.press` silently does nothing.
6. `packages/ui` has no `@types/node` and pins `types: ["jest","react"]` — source-reading tests are
   not possible there without widening the package's type surface.

## Forward Preview

**Test Infra Found:** see gaps above; the async-RTL rule (gap 1) is the highest-value addition to
`process/context/tests/all-tests.md`, alongside the new `guard:no-raw-alert` row.

**Blast Radius Changes:** `packages/ui` +2 files (`toast.tsx`, its test), `index.ts` +1 line.
`apps/mobile` +7 files, 11 modified. No schema/API/auth surface touched.

**Commands to Stay Green:** the 9-gate sequence in the validate contract, unchanged, plus the new
`pnpm --filter @jojopotato/mobile guard:no-raw-alert`.

**Dependency Changes:** none. No package added; `@expo/vector-icons` was already a direct dependency
of `packages/ui`.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/mobile-alert-toast-consistency_17-07-26/mobile-alert-toast-consistency_PLAN_17-07-26.md`
- **Finished:** Steps 1–13; AC1–AC6, AC8–AC10 automated-proven and mutation-verified.
- **Verified vs unverified:** all 9 automated gates green and independently re-runnable. AC7's
  on-device leg (5 screens × iOS/Android × light/dark, incl. the hint-visible product state) is
  **owed** — and CONCERN-1 predicts it will FAIL as currently specified.
- **Remaining:** resolve CONCERN-1 before the walkthrough; decide CONCERN-2; UPDATE PROCESS should
  add the `guard:no-raw-alert` row + the async-RTL gotcha to `all-tests.md`.
- **Best next state:** `Keep in active/testing` — per the plan's own Phase Completion Rules the AC7
  Agent-Probe session is required before archival, and CONCERN-1 should be settled first.

**Follow-up plan stubs created:** none (CONCERN-1/2 raised here for orchestrator routing rather than
unilaterally re-planning a twice-PVL'd locked decision).

**CONTEXT_PARTIAL:** none.
