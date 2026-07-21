---
name: plan:mobile-alert-toast-consistency
description: "Add shared themed Toast to packages/ui, migrate 7 Alert.alert() notices, convert 1 staff destructive confirm to ConfirmDialog, fix use-reorder.ts's imperative-alert hook seam"
date: 17-07-26
feature: general
---

# PLAN: Mobile Alert/Toast Consistency Pass

Date: 17-07-26
Status: PLAN — PVL cycle 1 in progress (supplement applied, re-validation pending)

Complexity: **COMPLEX** (new shared component + hook contract change + 8 call sites across
6 files + 2 new exported constants + new test files across two runners). Not a phase program
(single session, no cross-phase validation gates needed).

## Overview / Context

Client-presentation-only pass: build one shared `Toast` component (3 severities) in
`packages/ui`, migrate the 7 remaining `Alert.alert()` notice sites plus 1 new add-to-cart
success site onto it, convert the 1 staff destructive confirm to the existing `ConfirmDialog`,
and fix `use-reorder.ts`'s imperative-alert hook seam. Full requirements and acceptance criteria
live in the locked SPEC — see `## Acceptance Criteria (Reference)` below for the direct pointer
and a summary table; this plan does not restate the SPEC's prose.

## TL;DR

Build one shared `Toast` component (success/error severity as a prop, no reanimated, no RN
`Modal`, screen-root mounted like `ConfirmDialog`) in `packages/ui`. Migrate 7 `Alert.alert()`
notice sites + 1 new add-to-cart success site to it. Convert the 1 staff destructive confirm to
the existing `ConfirmDialog`. Fix `use-reorder.ts` to return `error: string | null` instead of
calling `Alert.alert` from inside a hook. Two new exported footer-height FUNCTIONS
(`getCartFooterHeight(insetsBottom)`, `getAddToCartBarHeight(insetsBottom)`) — insets-dependent,
not static constants — so `bottomOffset` is never a guessed number AND never a web-only number
(both bars override their StyleSheet `paddingBottom` at runtime; see Step 2 for the full defect
and fix).
No `## Validate Contract` is written here — vc-validate-agent writes it next.

## Branch Context

Current branch: `spec/mobile-dark-mode-audit` (unmerged, no PR yet — carries the required-`mode`-
prop hardening + StatusBar fix + `check-theme-mode.mjs` guard, with owed on-device Agent-Probe
walkthroughs per that plan's own Phase Completion Rules).

**Decision: stack this work on the SAME branch.** Rationale: `Toast` MUST satisfy the same
required-`mode`-prop convention `check-theme-mode.mjs` enforces (that guard already lives on this
branch, not on `main`) — building `Toast` on a fresh branch off `main` would mean the guard doesn't
exist yet to catch a regression during this pass's own development. Stacking also means one PR
review cycle instead of two nested ones.

**Does this change what the dark-mode plan's owed walkthroughs must cover?** Yes, partially. The
dark-mode plan's owed 4-way OS/app StatusBar matrix walkthrough is unaffected (StatusBar has
nothing to do with alerts/toasts). But two of the screens in THIS plan's scope
(`order/cart.tsx`, `order/product/[productId].tsx`) are on the dark-mode plan's own touched-file
list — a human doing the dark-mode plan's on-device walkthrough after this plan lands will now
also see the new `Toast`/`ConfirmDialog` UI on those screens instead of the old `Alert.alert()`
popups. This is not a new requirement on the dark-mode plan (its walkthrough is about StatusBar
color, not alerts) but it IS a heads-up: the walkthrough screenshots/description in that plan's
report should be understood to reflect pre-this-pass UI. No action item — just flagged so nobody
is confused later about why a screenshot shows an `Alert.alert()` that no longer exists.

## Acceptance Criteria (Reference)

Full AC1-AC10 text lives in the locked SPEC:
`process/general-plans/active/mobile-alert-toast-consistency_17-07-26/mobile-alert-toast-consistency_SPEC_17-07-26.md`
(§Acceptance Criteria). This plan does not restate them — see the `## Verification Evidence` table
below for the plan-side gate-to-criterion mapping. Summary:

| AC | One-line criterion |
|---|---|
| AC1 | Zero raw `Alert.alert(` calls remain in `apps/mobile/src` |
| AC2 | `Toast` exists, exported, required `mode` prop, resolved-style-verified |
| AC3 | `Toast` uses no RN `Modal` |
| AC4 | All 7 migrating sites fire `Toast` with unchanged underlying behavior |
| AC5 | Staff destructive confirm uses `ConfirmDialog`, identical semantics |
| AC6 | Product Details' `addedNotice` replaced by `Toast`, no redundant notice |
| AC7 | Toast clears tab bar / sticky footer / safe area (Hybrid — offset formula automated, on-device Agent-Probe) |
| AC8 | Zero regression across full `apps/mobile` + `packages/ui` suites |
| AC9 | Consistent severity assignment across all failure/warning sites |
| AC10 | Every new test asserts resolved output, not prop presence |

## Touchpoints

**New files:**
- `packages/ui/src/components/toast.tsx` — new shared `Toast` component
- `packages/ui/src/components/__tests__/toast.test.tsx` — jest-expo component tests
- `apps/mobile/src/features/shared/hooks/use-toast.ts` — new `useToast()` hook
- `apps/mobile/src/features/shared/hooks/__tests__/use-toast.test.ts` — vitest (pure-TS, timer/teardown)
- `apps/mobile/src/features/orders/hooks/__tests__/use-reorder.test.ts` — vitest, new coverage for the widened return shape
- `apps/mobile/scripts/check-no-raw-alert.mjs` — new grep guard (AC1), same family as `check-theme-mode.mjs`

**Modified files (exact lines verified this session):**
- `packages/ui/src/index.ts:7` area — add `export * from './components/toast';`
- `apps/mobile/src/app/(tabs)/order/cart.tsx` — imports (`:16` drop `Alert`, `:19` add `Toast`/
  `getFloatingTabBarClearance`), `:139` (`Alert.alert('Deal removed', ...)`), `:159` (`Alert.alert('Cart
  updated', ...)`), `:181` (`Alert.alert('Cannot apply code', ...)`), plus new `Toast` render +
  `useToast()` wiring, plus export the new `getCartFooterHeight(insetsBottom)` height FUNCTION derived
  from this file's own `styles.footer` (see Step 2 below — corrected from an earlier static-constant
  draft that missed the runtime `paddingBottom` override; the function is insets-dependent, not a
  fixed number)
- `apps/mobile/src/app/(tabs)/order/product/[productId].tsx` — imports (`:7` drop `Alert`, add
  `Toast`), `:34` (delete `addedNotice` state), `:86` (`setAddedNotice(false)` → delete),
  `:100-105` (`Alert.alert('No branch selected', ...)` → Toast error), `:127` (`setAddedNotice(true)`
  → toast success), `:137` (`setAddedNotice(true)` in `confirmBranchSwitch` → toast success),
  `:198-200` (delete `addedNotice`-driven `<Text>`), plus `Toast` render wired to `AddToCartBar`'s
  `getAddToCartBarHeight(insetsBottom)` height function (insets-dependent, not a static constant
  — see Step 2)
- `apps/mobile/src/app/(tabs)/branches/[branchId].tsx` — imports (`:12` drop `Alert`, add `Toast`),
  `:118-120` (`Alert.alert('Could not open maps', ...)` → Toast error), plus `Toast` render
- `apps/mobile/src/app/(tabs)/account/notifications.tsx` — imports (`:5` drop `Alert`, add `Toast`),
  `:65-69` (`onToggleMarketing`'s `Alert.alert("Couldn't update preference", ...)` → Toast error),
  plus `Toast` render
- `apps/mobile/src/features/orders/hooks/use-reorder.ts` — `:5` drop `import { Alert }`, `:20`
  widen return type to `{ reorder, isReordering, error: string | null }`, `:27` clear `error` at
  reorder() start, `:48-52` (`catch { Alert.alert(...) }` → `catch { setError(...) }`)
- `apps/mobile/src/app/(tabs)/order/history.tsx` — **`history.tsx` currently has ZERO `useSafeAreaInsets` import and no `insets` variable (grep-confirmed this session) — add `import { useSafeAreaInsets } from 'react-native-safe-area-context';` and `const insets = useSafeAreaInsets();`.** (`branches/[branchId].tsx` and `account/notifications.tsx` were checked too — both ALREADY import and use it, confirmed via `grep -n "useSafeAreaInsets"` on both files; only `history.tsx` needs this addition.) Also `:29` destructure `error` from `useReorder()`, render it as an error-severity `Toast`
- `apps/mobile/src/features/orders/__tests__/history-screen-dark-mode.test.tsx` — `:126-129`
  `mockUseReorder.mockReturnValue({ reorder: jest.fn(), isReordering: false })` → add `error: null`
- `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` — `:1-30` imports (drop `Alert`, add
  `ConfirmDialog` from `@jojopotato/ui`), `:69-179` `LiveOrderActions` — replace
  `confirmThenTransition`'s `Alert.alert(...)` (`:77-90`) with local `pendingAction` state +
  `<ConfirmDialog>` render
- `apps/mobile/src/constants/theme.ts:1-11` — add `MinTouchTarget` to the existing
  `export { ... } from '@jojopotato/ui';` re-export block (verified this session: it is currently
  NOT re-exported here, and `grep -rn "MinTouchTarget" apps/mobile/src` returns zero hits today —
  `cart.tsx`'s `getCartFooterHeight` derivation would fail to compile without this line). Chosen
  over importing `MinTouchTarget` directly from `@jojopotato/ui` in `cart.tsx` because every other
  theme token `cart.tsx` uses already comes through this same local re-export barrel — consistent
  with the file's existing pattern, not a new import style.
- `apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` — export a new
  `getAddToCartBarHeight(insetsBottom)` height FUNCTION (see Step 2 — SUPERSEDES both the original
  static-constant draft AND the Gap-6 always-tall-variant static-constant fix; the bar's
  `paddingBottom` is a runtime override of `styles.bar`'s stylesheet value — Platform.OS-dependent
  and insets-dependent — so no static number can ever be correct, see Step 2)
- `process/context/tests/all-tests.md` — add the new `check-no-raw-alert` guard row (UPDATE PROCESS, not this plan's job to write the contract, but the row should exist once the guard ships)

**Read-only reference (not modified):** `packages/ui/src/components/confirm-dialog.tsx`,
`packages/ui/src/theme.ts`, `apps/mobile/src/components/floating-tab-bar.tsx`,
`apps/mobile/src/features/menu/components/add-to-cart-bar.tsx` (read for the height-derivation
pattern before the one-line constant export edit).

## Public Contracts

- **New export from `@jojopotato/ui`:** `Toast` component + `ToastProps` + `ToastSeverity` type
  (`'success' | 'warning' | 'error'` — SUPERSEDES the original 2-variant design; user decision this
  session added `'warning'` as a distinct tap-required-but-not-blame-assigning severity — see Step 1).
- **New export from `@jojopotato/ui`:** none beyond `Toast` — no new theme tokens. `Toast`'s
  severity→token mapping mirrors `badge.tsx`'s existing `BadgeVariant` pattern exactly (verified
  against source): `success` → `Palette.green`/`Palette.cream` label, `warning` →
  `Palette.jorange`/`Palette.ink` label, `error` → `Palette.jred`/`Palette.cream` label. No new
  hexes invented.
- **Widened hook return contract:** `useReorder(): { reorder, isReordering, error: string | null }`
  — additive field, backward-compatible with the one real consumer once `history.tsx` is updated in
  the same plan (no external contract break because there is exactly one real consumer, grep-verified
  in SPEC).
- **New exported FUNCTIONS (SUPERSEDES the earlier static-constant design — see Step 2 for the
  material derivation defect that forced this):** `getAddToCartBarHeight(insetsBottom: number):
  number` (from `add-to-cart-bar.tsx` — always computed as the hint-VISIBLE height per the
  Gap-6 always-tall resolution, AND now correctly insets-/platform-dependent by calling
  `getFloatingTabBarClearance(insetsBottom)` directly — the SAME function the bar itself calls for
  its own `paddingBottom` override — instead of hand-copying that function's expanded arithmetic
  into a fixed number), `getCartFooterHeight(insetsBottom: number): number` (from `cart.tsx`, same
  fix — calls `getFloatingTabBarClearance(insetsBottom)` directly). Both follow the
  `BAR_CONTENT_HEIGHT`/`getFloatingTabBarClearance` precedent in `floating-tab-bar.tsx:148-162`, and
  both depend on `MinTouchTarget` being re-exported from `apps/mobile/src/constants/theme.ts`
  (Gap 1 fix, see Touchpoints). **A static constant is structurally wrong here**: both
  `add-to-cart-bar.tsx` and `cart.tsx` override their StyleSheet `paddingBottom` at runtime via a
  JSX `style={[...]}` array that calls `getFloatingTabBarClearance(insets.bottom)` — a function of
  the caller's safe-area insets — so the real rendered height can never be a fixed number; it must
  be recomputed per-render from `insets.bottom` (and, for the add-to-cart bar, per-platform, since
  its override is `Platform.OS !== 'web'`-guarded while `cart.tsx`'s footer override is NOT
  platform-guarded — verified against the override lines themselves, see Step 2).
- No API, schema, or backend contract changes (client-presentation-only, per SPEC Out of Scope).

## Blast Radius

- **Packages touched:** `packages/ui` (1 new component + export + test), `apps/mobile` (8 call
  sites across 6 screen/hook files + 1 test file + 1 new hook + 1 new guard script + 2 new constant
  exports).
- **File count:** 6 modified screens/hooks + 1 modified test + 2 new source files + 1 new guard
  script + 2 new test files + 1 index.ts export line = **13 files touched or created**.
- **Risk class:** none of auth/billing/schema/migration/public-API/container/secrets apply — this
  is a pure client-presentation change (confirmed by SPEC Out of Scope). Standard risk: React state
  refactor correctness (do the underlying behaviors stay identical) and a new shared component's own
  quality bar (theming, no-Modal, required-mode-prop compliance).

## Implementation Checklist — Dependency Order (sequenced steps)

Steps must run in this order — each depends on the previous step's artifact existing.

### Step 1 — Build `Toast` in `packages/ui`

File: `packages/ui/src/components/toast.tsx`

Design (locked by SPEC + INNOVATE, no further creative decisions needed):

```
export type ToastSeverity = 'success' | 'warning' | 'error';

export interface ToastProps {
  visible: boolean;
  message: string;
  severity: ToastSeverity;
  mode: ThemeMode;              // REQUIRED, no default (commit 996079f convention)
  bottomOffset: number;         // caller-computed, Toast does NOT read insets
  onDismiss: () => void;        // called on tap (warning/error) or auto-timer fire (success)
}
```

**Dismissal behavior by severity (locked, user decision this session):**
- `success` → auto-dismiss ~2500ms
- `warning` → TAP REQUIRED, no auto-timeout
- `error` → TAP REQUIRED, no auto-timeout

Rationale for the 3rd variant: an unsolicited state change with financial consequence (the user did
nothing wrong, but their cart changed and missing it costs them money — a higher total, or a
silently-lost reward) is neither a routine success (auto-dismiss loses the safety guarantee) nor a
user-fault failure (`'error'` red overstates blame). `'warning'` is the design system's existing
word for exactly this case (see `badge.tsx`'s `BadgeVariant`).

- `mode: ThemeMode` — required prop, no default. This is what makes `check-theme-mode.mjs`
  auto-track it (the script derives tracked components from source; a required `mode` prop with no
  default is the tracking signal).
- Plain conditional render: `if (!visible) return null;` — mirrors `confirm-dialog.tsx:51` exactly.
  NO reanimated import. NO RN `Modal` import.
- Rendered as an absolutely-positioned `View` (`position: 'absolute'`, `left`/`right: 0`,
  `bottom: bottomOffset`, `zIndex: 20`, `elevation: 20`) — same z-index precedent as
  `confirm-dialog.tsx`'s `overlay` style (`:106-107`). Unlike `ConfirmDialog` it is NOT a full-screen
  scrim (a toast should not block the rest of the screen) — it's a bottom-anchored card only, no
  `Pressable` backdrop.
- **Severity → visual mapping** — mirrors `packages/ui/src/components/badge.tsx`'s existing
  `BadgeVariant` pattern verbatim (verified against source this session), a `Record<ToastSeverity,
  string>` pair for background + label/icon color:
  ```ts
  const SEVERITY_BACKGROUND: Record<ToastSeverity, string> = {
    success: Palette.green,   // '#1a9a4a', theme.ts:38
    warning: Palette.jorange,
    error: Palette.jred,      // '#E81E26', theme.ts:24
  };
  const SEVERITY_LABEL_COLOR: Record<ToastSeverity, string> = {
    success: Palette.cream,
    warning: Palette.ink,
    error: Palette.cream,
  };
  ```
  Card background uses `Colors[mode].backgroundElement` (theme-resolved surface, unchanged across
  severities); the severity color drives a left accent bar/icon + optionally the message text color
  when it needs to read against that accent. **Naming divergence, intentional, not a bug:** `Badge`
  calls its most-severe variant `danger`; `Toast` calls its equivalent `error` — different
  components, own vocabularies, same underlying `Palette.jred` token.
  - Icon: a small `Ionicons` glyph — **`alert-triangle` does NOT exist in this app's pinned `@expo/vector-icons@15.1.1` Ionicons glyphmap (validate-agent checked the installed glyphmap JSON directly; corrected here).** Use `checkmark-circle` for success, `warning-outline` for warning, `alert-circle` for error — all 3 confirmed present in the installed glyphmap. `Ionicons` is already a dependency (used in `floating-tab-bar.tsx`, `order-detail/[orderId].tsx`).
- **NO JSX spread on the exported component's call sites** — every consumer passes explicit named
  props (`<Toast visible={...} message={...} severity={...} mode={mode} bottomOffset={...}
  onDismiss={...} />`). This is a HARD CONSTRAINT — do not let a future refactor introduce
  `{...toast}` spread; it fails `check-theme-mode.mjs`'s spread-attribute guard.
- Export from `packages/ui/src/index.ts` (append `export * from './components/toast';` after the
  `confirm-dialog` export line, matching the existing append-only pattern).

**Token mapping CLOSED, not open** — `badge.tsx` has been read (source-verified this session:
`export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger'`, with
`VARIANT_BACKGROUND`/`VARIANT_LABEL_COLOR` maps at `badge.tsx:14-25` using exactly
`Palette.green`/`Palette.jorange`/`Palette.jred`/`Palette.cream`/`Palette.ink`). No PRE-EXECUTE
action item remains for this decision — the mapping above is final.

### Step 2 — Export the two footer-height FUNCTIONS (dependency for Step 3+)

**MATERIAL DERIVATION DEFECT FOUND DURING EXECUTE (PVL cycle 3, orchestrator-verified against
source; user approved this fix). Both `ADD_TO_CART_BAR_HEIGHT` (the prior fixed value 101) and
`CART_FOOTER_HEIGHT` (the prior fixed value 72) were WRONG for the same underlying reason and are
SUPERSEDED entirely by insets-dependent FUNCTIONS below — do not reintroduce either as a static
constant.**

**Root cause (durable rule for this codebase, apply anywhere a layout constant is derived from a
`StyleSheet.create` block):** reading a component's `StyleSheet.create` block alone is UNSOUND —
the JSX `style={[...]}` array on the rendered element can override any StyleSheet value at
runtime, and in both of these components it overrides the EXACT term being derived
(`paddingBottom`). The correct derivation reads the rendered style array, not just the stylesheet,
and — when the override is itself a function of a runtime value (here, `insets.bottom`) — the
derived helper must be a FUNCTION of that same runtime value, never a fixed number. This is the
same class of defect as Gap 6 (the flex `gap` term that PVL cycle 2 found) — cycle 2 fixed the
*shape* of the tall-variant sum but still treated the whole thing as a static export; this cycle
fixes the remaining unsoundness, that the sum itself is insets-dependent.

Verified overrides (both bars — read in full before touching either function):
- `add-to-cart-bar.tsx:82` — `Platform.OS !== 'web' && { paddingBottom:
  getFloatingTabBarClearance(insets.bottom) }` overrides `styles.bar`'s stylesheet
  `paddingBottom: Spacing.four` (24). **Platform-guarded**: on web this override does NOT apply,
  so the web `paddingBottom` stays the stylesheet's `Spacing.four` (24).
- `cart.tsx:436-438` — `styles.footer, { paddingBottom: getFloatingTabBarClearance(insets.bottom) +
  Spacing.two }` overrides `styles.footer`'s stylesheet `paddingBottom: Spacing.two` (8). **NOT
  platform-guarded** (verified against the override line itself — no `Platform.OS` check
  present) — this override applies on every platform, web included.

`getFloatingTabBarClearance(insetsBottom) = BAR_CONTENT_HEIGHT(61) + insetsBottom + Spacing.two(8)
+ Spacing.four(24)` = `93 + insetsBottom` (`floating-tab-bar.tsx:161-162`, `BAR_CONTENT_HEIGHT` at
`:148`) — this is the ONE function both bars call for their own override; the fix below calls it
directly rather than hand-copying its expanded arithmetic.

**`getAddToCartBarHeight(insetsBottom: number): number`** — always computed as the hint-VISIBLE
(tall) variant, per Gap 6's resolution (unchanged: still option (a), always-tall, for the same
rejected-alternatives reasoning as before — lifting `showHint` state or `onLayout` measurement is
still out of scope for this plan). NEW this cycle: platform-split, insets-dependent, and calls
`getFloatingTabBarClearance` directly instead of the fixed number `93`:

```ts
// add-to-cart-bar.tsx (co-located with the styles it derives from)
const BAR_HINT_HEIGHT = 17;           // one bodySmall line, visible only when showHint && !canAdd
const BAR_HINT_ROW_GAP = Spacing.one; // 4 — styles.bar's own `gap`, between hint <Text> and row <View>
const BAR_TEXT_BLOCK_HEIGHT = 14 + Spacing.one + 22; // ~40 — price text stack
const BAR_ROW_CONTENT_HEIGHT = Math.max(BAR_TEXT_BLOCK_HEIGHT, MinTouchTarget); // 48 (Button floor)
// Everything above `paddingBottom` in styles.bar, hint-visible: border(2) + paddingTop(Spacing.two=8)
// + hint(17) + gap(4) + row(48) = 79 — this part of the sum is NOT insets/platform-dependent.
const BAR_STATIC_PORTION = 2 + Spacing.two + BAR_HINT_HEIGHT + BAR_HINT_ROW_GAP + BAR_ROW_CONTENT_HEIGHT; // 79

export function getAddToCartBarHeight(insetsBottom: number): number {
  // Mirrors add-to-cart-bar.tsx:82's own Platform.OS !== 'web' override EXACTLY — this function
  // must never diverge from the bar's own conditional, since it is deriving that same bar's height.
  const paddingBottom = Platform.OS !== 'web'
    ? getFloatingTabBarClearance(insetsBottom)   // non-web: 93 + insetsBottom
    : Spacing.four;                              // web: 24 (stylesheet value, no override applies)
  return BAR_STATIC_PORTION + paddingBottom;
  // non-web: 79 + 93 + insetsBottom = 172 + insetsBottom
  // web:     79 + 24               = 103
}
```

Requires `Platform` imported from `react-native` in `add-to-cart-bar.tsx` (already imported there
for the existing `Platform.OS !== 'web'` check at `:82` — no new import). `getFloatingTabBarClearance`
must be imported from `floating-tab-bar.tsx` (new import — verify it is exported there; if not
already exported, export it additively, same append-only pattern as everywhere else in this plan).
Depends on `MinTouchTarget` being re-exported from `apps/mobile/src/constants/theme.ts`'s barrel
(Gap 1 fix, unchanged from prior cycles — see Touchpoints).

Callers pass `bottomOffset={getAddToCartBarHeight(insets.bottom) + Spacing.two}` (small buffer
above the bar, unchanged rationale from prior cycles). **The product screen must have `insets` in
scope via `useSafeAreaInsets()` to call this — verify at EXECUTE time whether
`product/[productId].tsx` already imports it (the bar itself calls `useSafeAreaInsets` internally,
but that does not put `insets` in the PARENT screen's scope); if absent, add the import + hook call
the same way `history.tsx`'s Gap 1 fix does (see Touchpoints).**

**`getCartFooterHeight(insetsBottom: number): number`** — same fix pattern, and simpler (no
platform split, since the footer's override is NOT platform-guarded):

```ts
// cart.tsx (co-located with the footer that owns this value)
export function getCartFooterHeight(insetsBottom: number): number {
  const paddingBottom = getFloatingTabBarClearance(insetsBottom) + Spacing.two; // 93+insetsBottom+8
  return Spacing.three + MinTouchTarget + paddingBottom;
  // Spacing.three(16) + MinTouchTarget(48) + (101 + insetsBottom) = 165 + insetsBottom
}
```

`cart.tsx` already has `insets` in scope (the footer's own inline override already reads
`insets.bottom`) — no new import needed there. Callers pass
`bottomOffset={getCartFooterHeight(insets.bottom) + Spacing.two}`.

**Concrete failure this fix prevents (confirmed by the orchestrator against source before this
supplement): Android at `insets.bottom = 0`, the OLD static `CART_FOOTER_HEIGHT` (72) placed the
toast at `bottom: 80`, spanning ~[80,140] — but the real footer height at those insets is
165+0=165, so the button row sits at roughly [117,165] and the toast at [80,140] directly overlaps
it.** With the corrected function: `getCartFooterHeight(0) + Spacing.two = 165 + 8 = 173` — clears
the real 165dp footer with an 8dp buffer, matching the original design intent. The same class of
failure applied to the add-to-cart bar (worse on non-web, where the static 101/109 undercounted a
real 172+insets/180+insets bar by over 60dp) and to the web variant (static number vs. the real
platform-specific 103).

**Net effect vs. the pre-fix state:** the pre-fix constants (101/109 for the bar, 72/80 for the
footer) were derived by reading ONLY the two components' `StyleSheet.create` blocks and were
correct ONLY for `Platform.OS === 'web'` with `insets.bottom === 0` — every non-web device, and
every device with nonzero safe-area insets (i.e. essentially all real iOS/Android hardware), was
undercovered. This was not a corner-case edge — it was the common case on real devices.

### Step 3 — `useToast()` hook
### Step 3 — `useToast()` hook

File: `apps/mobile/src/features/shared/hooks/use-toast.ts`

```ts
export interface ToastState {
  visible: boolean;
  message: string;
  severity: ToastSeverity;
}

export function useToast(): {
  toast: ToastState;
  showToast: (message: string, severity?: ToastSeverity) => void; // default 'success'
  hideToast: () => void;
} {
  // internal useState<ToastState>, internal timer ref (useRef<ReturnType<typeof setTimeout> | null>)
  // showToast: clears any existing pending timer FIRST (replace-latest, no queue), sets state visible,
  //   if severity === 'success' schedules a ~2500ms auto-dismiss timer; error severity schedules NOTHING
  // hideToast: clears the pending timer (if any) and sets visible: false
  // useEffect cleanup on unmount: clear any pending timer (prevents setState-after-unmount)
}
```

- Screens call `showToast(message, severity)` explicitly (not via a spread) — each call site
  passes 3 named `Toast` props (`visible={toast.visible} message={toast.message}
  severity={toast.severity}`) plus `mode`, `bottomOffset`, and `onDismiss={hideToast}` — 6 EXPLICIT
  props, never `{...toast}`.
- Replace-latest semantics: calling `showToast` while a toast is already visible cancels the
  pending auto-dismiss timer (if any) and immediately shows the new message/severity — this is the
  natural behavior of "clear any existing pending timer first, then set new state," no extra logic
  needed.

### Step 4 — `use-reorder.ts` hook-seam fix

- Drop `import { Alert } from 'react-native'` (line 5).
- Add `const [error, setError] = useState<string | null>(null);`
- At the top of `reorder()`'s try block (or immediately before, still inside `useCallback`): `setError(null);`
- Replace the `catch { Alert.alert(...) }` block with `catch { setError('We were unable to load the latest menu for this order. Please try again.'); }` (same message text, just re-homed).
- Widen return: `return { reorder, isReordering, error };`
- Update `useCallback` deps array if needed (no new deps required — `setError` is stable from `useState`).

### Step 5 — `history.tsx` consumes the widened hook

- `const { reorder, isReordering, error } = useReorder();`
- Add `const { toast, showToast, hideToast } = useToast();`
- Add a `useEffect` (or inline check) that calls `showToast(error, 'error')` when `error` transitions
  from null to non-null — OR simpler: render the reorder error directly without funneling through
  `useToast`'s replace-latest state if `history.tsx` has no other toast need (this screen has
  exactly one toast source, so a direct `useEffect(() => { if (error) showToast(error, 'error'); },
  [error])` is correct and keeps `useToast` as the single source of visible/severity/message state).
- Render `<Toast visible={toast.visible} message={toast.message} severity={toast.severity}
  mode={mode} bottomOffset={insets.bottom + Spacing.four} onDismiss={hideToast} />` at the screen
  root (this screen has no sticky footer, so the plain `insets.bottom + Spacing.four` formula from
  the SPEC's per-site clearance table applies).

### Step 6 — `history-screen-dark-mode.test.tsx` mock update

- `mockUseReorder.mockReturnValue({ reorder: jest.fn(), isReordering: false, error: null })` — add
  the `error: null` field at line ~127-129. Without this, `history.tsx`'s new `useEffect` reading
  `error` from a partially-typed mock could either compile-error (if strictly typed) or silently
  read `undefined` — add explicitly to avoid ambiguity either way.

### Step 7 — Migrate `cart.tsx`'s 3 sites (deal-removed, cart-updated, cannot-apply-code)

- Drop `Alert` from the `react-native` import (line 16).
- Add `import { Toast } from '@jojopotato/ui';` and `import { useToast } from '@/features/shared/hooks/use-toast';`. `getCartFooterHeight` is defined in this same file (co-located) — no import needed. Also import `getFloatingTabBarClearance` from `floating-tab-bar.tsx` (new import, used inside `getCartFooterHeight`).
- `const { toast, showToast, hideToast } = useToast();`
- `:139` — `Alert.alert('Deal removed', result.message)` → `showToast(\`Deal removed — ${result.message}\`, 'warning')`. **Severity: `'warning'`, USER-DECIDED this session (supersedes this plan's earlier `'error'` draft call).** Rationale: this is an unsolicited state change with financial consequence — the user did nothing wrong, but their cart changed and missing it costs money (a higher total). `'error'` overstates it as user fault; `'success'` auto-dismiss loses the safety guarantee. `'warning'` (tap-required, same as error, no auto-timeout) is correct.
- `:159` — `Alert.alert('Cart updated', 'Re-apply your reward code to redeem it.')` → `showToast('Cart updated — re-apply your reward code to redeem it.', 'warning')`. Same rationale and severity as `:139` — an automatic state change with a real cost (a silently-lost reward) if missed.
- `:181` — `Alert.alert('Cannot apply code', result.message)` → `showToast(result.message, 'error')` (unambiguous failure per SPEC).
- Render `<Toast visible={toast.visible} message={toast.message} severity={toast.severity} mode={mode} bottomOffset={getCartFooterHeight(insets.bottom) + Spacing.two} onDismiss={hideToast} />` inside the `SafeAreaView`, after the two existing `ConfirmDialog` renders (screen root, matches existing pattern). `insets` is already in scope in this file (the footer's own inline style already reads `insets.bottom`).

### Step 8 — Migrate `product/[productId].tsx` (guard-failure + new add-to-cart success + delete addedNotice)

- Drop `Alert` from the `react-native` import (line 7). Add `Toast` import + `useToast` import.
- Delete `const [addedNotice, setAddedNotice] = useState(false);` (line 34).
- Delete `setAddedNotice(false);` inside `handleChange` (line 86).
- `:100-105` — replace `Alert.alert('No branch selected', 'Please select a pickup branch before adding items.'); return;` with `showToast('Please select a pickup branch before adding items.', 'error'); return;`
- `:127` (`handleAdd`'s success path) — replace `setAddedNotice(true);` with `showToast('Added to cart', 'success');`
- `:137` (`confirmBranchSwitch`'s success path) — replace `setAddedNotice(true);` with `showToast('Added to cart', 'success');`
- Delete the `{addedNotice ? <Text ...>Added to cart ✓</Text> : null}` block (lines 198-200) — do not leave a redundant second notice (explicit SPEC AC6 requirement).
- Render `<Toast ... bottomOffset={getAddToCartBarHeight(insets.bottom) + Spacing.two} .../>` at screen root, after the existing `ConfirmDialog` render. **Verify `insets` is in scope on this screen (via `useSafeAreaInsets()`) before this line compiles — if not already imported, add it the same way as history.tsx's Gap 1 fix (see Touchpoints).** Also import `getAddToCartBarHeight` from `add-to-cart-bar.tsx`.

### Step 9 — Migrate `branches/[branchId].tsx` (async catch)

- Drop `Alert` import (line 12). Add `Toast` + `useToast` imports.
- `:118-120` — replace `Linking.openURL(url).catch(() => Alert.alert('Could not open maps', 'No maps app is available to show directions.'));` with `Linking.openURL(url).catch(() => showToast('No maps app is available to show directions.', 'error'));`
- Render `<Toast ... bottomOffset={insets.bottom + Spacing.four} .../>` — this screen has no sticky footer (grep-verified: only a `ScrollView` + `SafeAreaView`), so the plain nested-screen clearance formula applies per SPEC's per-site table.

### Step 10 — Migrate `account/notifications.tsx` (tap-handler failure)

- Drop `Alert` import (line 5). Add `Toast` + `useToast` imports.
- `:68` — replace `Alert.alert("Couldn't update preference", result.error ?? 'Please try again.');` with `showToast(result.error ?? 'Please try again.', 'error');`
- Render `<Toast ... bottomOffset={insets.bottom + Spacing.four} .../>` — no sticky footer on this screen (grep-verified).

### Step 11 — Convert `(staff)/order-detail/[orderId].tsx`'s destructive confirm to `ConfirmDialog`

- Drop `Alert` import (currently used ONLY for this one confirm — verify no other `Alert.alert` call
  exists in this file before removing the import; grep-verified this session: line 78 is the only
  usage).
- Add `import { ConfirmDialog } from '@jojopotato/ui';` (Button/Card already imported from
  `@jojopotato/ui` on line 10 — add ConfirmDialog to that same import).
- In `LiveOrderActions`, replace `confirmThenTransition`'s `Alert.alert(...)` body with local state:
  ```ts
  const [pendingAction, setPendingAction] = useState<{ status: OrderStatus; label: string } | null>(null);
  function confirmThenTransition(targetStatus: OrderStatus, actionLabel: string) {
    setPendingAction({ status: targetStatus, label: actionLabel });
  }
  ```
- Render at the bottom of `LiveOrderActions`'s returned JSX:
  ```tsx
  <ConfirmDialog
    visible={pendingAction !== null}
    title={`${pendingAction?.label ?? ''} order?`}
    message={`Are you sure you want to ${(pendingAction?.label ?? '').toLowerCase()} this order?`}
    confirmLabel={pendingAction?.label ?? 'Confirm'}
    cancelLabel="Cancel"
    variant="destructive"
    mode={mode}
    onConfirm={() => {
      const action = pendingAction;
      setPendingAction(null);
      if (action) handleTransition(action.status);
    }}
    onCancel={() => setPendingAction(null)}
  />
  ```
- `LiveOrderActionsProps` already receives `mode: ThemeMode` (line 48) — no new prop needed.
- **Identical two-choice semantics preserved**: Cancel does nothing (same as `Alert.alert`'s
  `{ text: 'Cancel', style: 'cancel' }`); confirm calls `handleTransition(targetStatus)` exactly as
  before (same as the old `onPress: () => handleTransition(targetStatus)`).

### Step 12 — New AC1 guard script

File: `apps/mobile/scripts/check-no-raw-alert.mjs` — mirrors `check-theme-mode.mjs`'s existing
script family (same directory, same "small grep-based CI-adjacent guard" shape). Logic:
```js
// grep -rn "Alert.alert(" apps/mobile/src → must return zero matches
// exit 1 with a clear message listing any remaining matches; exit 0 on zero matches
```
Add a `package.json` script: `"guard:no-raw-alert": "node scripts/check-no-raw-alert.mjs"` in
`apps/mobile/package.json` (mirrors the existing `guard:theme-mode` script entry — read that
script entry's exact wording before adding this one, to match its style).

### Step 13 — Full regression pass (all packages touched)

Run, in order:
1. `pnpm --filter @jojopotato/ui typecheck`
2. `pnpm --filter @jojopotato/ui test` (jest-expo — includes new `toast.test.tsx`)
3. `pnpm --filter @jojopotato/ui check-tokens`
4. `pnpm --filter @jojopotato/mobile typecheck`
5. `pnpm --filter @jojopotato/mobile lint`
6. `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest` — includes new
   `use-toast.test.ts`, `use-reorder.test.ts`, and updated `history-screen-dark-mode.test.tsx`)
7. `pnpm --filter @jojopotato/mobile guard:theme-mode`
8. `pnpm --filter @jojopotato/mobile guard:no-raw-alert` (new)
9. `pnpm format:check`

## Test Coverage Plan (per `vc-test-coverage-plan`)

**Area: `packages/ui` — `Toast` component**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Renders message + resolves DIFFERENT resolved styles (background + label/icon color) across all 3 SEVERITIES × 2 MODES (6 assertions: success/warning/error × light/dark) | `pnpm --filter @jojopotato/ui test` — new `toast.test.tsx`, asserting `StyleSheet.flatten` on the card/accent surface for each of the 6 combinations, per the `SEVERITY_BACKGROUND`/`SEVERITY_LABEL_COLOR` maps (mirrors `card.test.tsx`'s mutation-check pattern) | Real theming compliance across the full severity×mode matrix, not prop-presence | Real device rendering/animation |
| Fully-automated | Dismiss-timer behavior by severity: `success` auto-dismisses after ~2.5s; `warning` does NOT; `error` does NOT (3 assertions, not 2) | `pnpm --filter @jojopotato/ui test` under `jest.useFakeTimers()` — advance timers ~2500ms, assert `onDismiss` called for `success` only; assert `onDismiss` is NEVER called for `warning` or `error` regardless of elapsed time | The core Q1 safety behavior (missed-warning/failure prevention) across all 3 severities | Real-world timing/animation smoothness |
| Fully-automated | Renders nothing when `visible=false` | Same suite — `queryByText` returns null | Conditional-render correctness (no Modal needed) | — |
| Fully-automated | No RN `Modal` import in source | Source-level check during code review / `grep -c "from 'react-native'" toast.tsx` combined with reading the import list | AC3 compliance | — |

Failing stub (Fully-Automated row 1):
```
test("should resolve 6 distinct styles across 3 severities x 2 modes (success/warning/error x light/dark)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: Toast severity+mode-dependent resolved styling")
})
```
Failing stub (Fully-Automated row 2):
```
test("should auto-dismiss success toast after ~2.5s but never auto-dismiss warning or error toasts", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: Toast severity-based auto-dismiss (3-way)")
})
```

**Area: `apps/mobile` — `useToast()` hook**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Timer cleanup on unmount (no setState-after-unmount warning/leak) | `pnpm --filter @jojopotato/mobile test` — new `use-toast.test.ts` (vitest, `renderHook` + unmount mid-timer, assert no error thrown / no leaked timer) | Hook doesn't leak timers or crash on unmount | Real RN timer precision |
| Fully-automated | `showToast(message, severity?)` defaults to `'success'`; only `'success'` schedules an auto-dismiss timer — `'warning'`/`'error'` schedule NOTHING | Same file — call `showToast('msg')` with no severity arg, assert `toast.severity === 'success'` and a timer is scheduled; call `showToast('msg', 'warning')` and `showToast('msg', 'error')`, assert NO timer is scheduled for either | The default-severity contract + per-severity timer-scheduling correctness (3-way) | Visual rendering |
| Fully-automated | `showToast` called twice in succession replaces the first (no queue), across severities | Same file — call `showToast('a')` (defaults to `'success'`) then `showToast('b', 'warning')` before the first timer fires; assert final state is `'b'`/`'warning'`, only one timer pending, and the original success timer is cancelled | Replace-latest semantics (D2) unchanged across all 3 severities | Visual transition between toasts |

Failing stub:
```
test("should replace an in-flight toast when showToast is called again before auto-dismiss", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: useToast replace-latest, no queue")
})
```

**Area: `apps/mobile` — `use-reorder.ts` error-state**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `error` is null initially, set on catch, cleared at next `reorder()` call | `pnpm --filter @jojopotato/mobile test` — new `use-reorder.test.ts` (vitest), mock `getMenu` to reject, assert `error` becomes non-null; call `reorder()` again with a resolving mock, assert `error` resets to null at the start | The hook-seam fix's core contract (D3) | Screen-level rendering of the error |
| Fully-automated | No `Alert` import remains in this file | grep check during code review, or `check-no-raw-alert.mjs` itself (this file is inside `apps/mobile/src`) | AC1 compliance for this specific site | — |

Failing stub:
```
test("should clear a stale error at the start of each reorder() call and set error on catch", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: use-reorder error-state lifecycle")
})
```

**Area: `apps/mobile` — 6 screen wiring tests (jest, `*.test.tsx`)**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `cart.tsx` — deal-removed/cart-updated fire `showToast(..., 'warning')`; cannot-apply-code fires `showToast(..., 'error')`; correct message in place of the removed `Alert.alert`, and existing state changes (`clearDiscount`, `setAppliedCouponCode`) still run identically | `pnpm --filter @jojopotato/mobile test` — new/extended `cart.test.tsx` (or extend existing dark-mode test file if one exists for cart; else new file) | AC4/AC9 for 3 of 7 sites | Visual toast rendering on device |
| Fully-automated | `product/[productId].tsx` — add-to-cart success fires `showToast('Added to cart', 'success')`, `addedNotice` `<Text>` no longer renders, guard failure fires error toast | Same test family | AC4/AC6 | Visual rendering |
| Fully-automated | `branches/[branchId].tsx` — maps-open failure fires error toast, existing `.catch()` behavior unchanged | Same test family | AC4 | Visual rendering |
| Fully-automated | `account/notifications.tsx` — preference-update failure fires error toast, `setMarketingOptIn` call unchanged | Same test family | AC4 | Visual rendering |
| Fully-automated | `order-detail/[orderId].tsx` `LiveOrderActions` — `ConfirmDialog` renders correct title/labels for accept AND reject paths; `handleTransition` fires on confirm only, never on cancel | New `live-order-actions.test.tsx` (or extend an existing staff test file), mirroring `confirm-dialog.test.tsx`'s pattern exactly | AC5 | Visual rendering |
| Fully-automated | `cart.tsx` — simultaneous-notice DEFENSIVE regression test: deal-removed and cart-updated effects cannot both fire for the same state transition (locks the currently-undocumented mutual-exclusivity invariant via `cart.appliedDiscount?.source`) | New assertion in the cart test file simulating both effect conditions in one render pass, asserting only one `showToast` call occurs | The replace-latest policy is safe given this app's actual effect shape (D2's flagged defensive test) | Every conceivable future effect ordering — only today's shape |

Failing stubs (one per row, same format as above — omitted here for brevity per row, each named
after its Scenario column text).

**Area: `apps/mobile` — AC7 Hybrid offset proof**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Each screen's rendered `<Toast bottomOffset={...}>` prop resolves to the CORRECT insets-dependent formula for its screen class (tab-root-with-footer vs nested-no-footer), across MULTIPLE `insets.bottom` values (0 and a nonzero value, e.g. 34) — not just insets=0 | Component test parametrized over `insets.bottom` (mock `useSafeAreaInsets`), asserting the prop value passed to `Toast` equals `getCartFooterHeight(insets.bottom) + Spacing.two` / `getAddToCartBarHeight(insets.bottom) + Spacing.two` for each of the 5 screens at each insets value | Formula-reference correctness across real device insets, not just the insets=0 case that the pre-fix static constants silently assumed | Real pixel non-overlap on a device |
| Fully-automated | `product/[productId].tsx`'s `bottomOffset` is computed from `getAddToCartBarHeight(insets.bottom)` (the ALWAYS-TALL hint-inclusive height, Gap 6) on BOTH web and non-web `Platform.OS`, and MUST exercise the `showHint && !canAdd` state specifically, not just the hint-hidden default | Component test rendering the product screen with `canAdd=false` and `showHint=true` (or the equivalent props/state that trigger the hint), asserting `bottomOffset` still equals `getAddToCartBarHeight(insets.bottom) + Spacing.two` (i.e. the SAME value regardless of hint visibility, since the derivation is always the tall variant) for BOTH a mocked `Platform.OS = 'ios'`/`'android'` value and `'web'` — a test that only exercises the hint-HIDDEN state, or only one platform, would pass while the real overlap ships, per this cycle's own orchestrator-found defect | The always-tall, platform-and-insets-aware derivation actually covers the state and platform where the bug would otherwise occur | Real pixel non-overlap on a device (still Agent-Probe, below) |
| Agent-Probe | On-device visual check: toast does not visually overlap the floating tab bar / sticky footer / safe area, on iOS AND Android separately — INCLUDING the product screen with the required-options hint visible (Gap 6 state) | Manual walkthrough on each of the 5 screens, both platforms, both light/dark mode, PLUS one explicit pass on the product screen with an incomplete required-option selection so the hint renders | Real visual non-overlap, including the hint-visible edge case | — (this is the final proof; nothing automated closes this) |

Gap resolution for AC7's Agent-Probe residual:
| Gap | Resolution options |
|---|---|
| On-device toast clearance not verifiable headlessly | A) N/A — no automated fix exists (jest-expo has no layout engine). B) N/A. C) **Accept as known-gap, Agent-Probe required** — rationale: matches the same accepted ceiling as the dark-mode plan's own StatusBar walkthrough and `fix-tab-bar-visibility-nav-trap`'s own AC1-AC5; this is a project-wide, structural limitation, not a corner this plan is cutting. D) Roll into the SAME owed on-device walkthrough session as the dark-mode plan's 4-way StatusBar matrix (both need physical iOS + Android devices) — recommend combining them into one Agent-Probe session per the Branch Context note above. |

**Area: `apps/mobile` — AC8 zero-regression full suite**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | Full `apps/mobile` + `packages/ui` suites green post-change, typecheck/lint clean | Step 13's full command sequence (all 9 commands) | No regression in cart/checkout/reorder/branches/notifications/staff logic | Coverage of surfaces this pass doesn't touch (unchanged from before) |

### High-Risk Class Check

None of this plan's areas match a high-risk class (auth/billing/schema/API/container/secrets) —
per SPEC Out of Scope, this is a pure client-presentation change. No hybrid-minimum override applies.

### Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| On-device toast/tab-bar/footer pixel non-overlap (iOS + Android) | jest-expo has no layout engine — project-wide, pre-existing gap | Agent-Probe, combined with the dark-mode plan's owed walkthrough session (see Branch Context) |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `check-no-raw-alert.mjs` — zero `Alert.alert(` matches in `apps/mobile/src` | Fully-Automated | AC1 |
| `toast.test.tsx` — resolved style differs light/dark, no default `mode` | Fully-Automated | AC2 |
| Source review — no `Modal` import in `toast.tsx` + render-toggle test passes | Fully-Automated | AC3 |
| 6 screen wiring tests (cart×3, product, branches, notifications) + `use-reorder.test.ts` | Fully-Automated (6/7) / Hybrid (reorder screen-render leg) | AC4 |
| `live-order-actions.test.tsx` — ConfirmDialog wiring, confirm/cancel semantics | Fully-Automated | AC5 |
| product screen test — toast fires, `addedNotice` text removed | Fully-Automated | AC6 |
| Offset-formula assertions incl. hint-visible state (Fully-Automated) + on-device walkthrough incl. hint-visible edge case (Agent-Probe) | Hybrid | AC7 |
| Full `pnpm test`/`typecheck`/`lint` sequence, all packages, Step 13 | Fully-Automated | AC8 |
| Cross-site consistency check — confirms all 5 `'error'` sites (`cart.tsx:181`, `product/[productId].tsx:103`, `branches/[branchId].tsx:119`, `notifications.tsx:68`, `use-reorder.ts`) use `'error'` consistently, AND both cart auto-fired sites (`cart.tsx:139`, `:159`) use `'warning'` consistently — plus per-site behavior tests | Fully-Automated | AC9 |
| Manual review during VALIDATE: no new test asserts prop-presence only | Fully-Automated (review gate) | AC10 |

## Test Infra Improvement Notes

- No RN component/E2E navigation runner exists (project-wide gap, unchanged by this pass) — AC7's
  on-device leg and all "visual" claims stay Agent-Probe, consistent with every other RN-visual
  claim in this repo.
- Consider adding `check-no-raw-alert.mjs`'s row to `process/context/tests/all-tests.md`'s Commands
  table during UPDATE PROCESS (this plan does not write context docs — flagged for that phase).
- **New durable lesson (PVL cycle 3, this pass):** a layout-derivation test must assert against the
  RENDERED style array (or, absent a layout engine, the function that reproduces it), never against
  a value read off `StyleSheet.create` alone — the JSX `style={[...]}` override on
  `add-to-cart-bar.tsx`/`cart.tsx` is exactly the kind of runtime override a stylesheet-only read
  misses. Recommend this rule get folded into `all-tests.md`'s general guidance during UPDATE
  PROCESS, since it is not specific to this plan's components and the same defect class already
  bit this plan twice (Gap 6, then this correction).

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/mobile-alert-toast-consistency_17-07-26/mobile-alert-toast-consistency_PLAN_17-07-26.md`
2. **Last completed phase/step:** PLAN (this document). No EXECUTE steps have started.
3. **Validate-contract status:** pending — placeholder only (see below). `vc-validate-agent` must
   run before EXECUTE.
4. **Supporting context files loaded this session:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, the locked
   SPEC (`mobile-alert-toast-consistency_SPEC_17-07-26.md`), `confirm-dialog.tsx` + its test,
   `theme.ts`, all 8 blast-radius source files (cart.tsx, product/[productId].tsx,
   branches/[branchId].tsx, notifications.tsx, use-reorder.ts, order-detail/[orderId].tsx,
   floating-tab-bar.tsx, add-to-cart-bar.tsx), history.tsx, history-screen-dark-mode.test.tsx.
5. **Next step for a fresh agent resuming mid-execution:** confirm which of Steps 1-13 above are
   done by checking for `packages/ui/src/components/toast.tsx`'s existence (Step 1 marker) and
   `apps/mobile/src/features/shared/hooks/use-toast.ts`'s existence (Step 3 marker); re-run Step 13's
   full gate sequence regardless of where resumed, since every step after Step 3 depends on Steps 1-3
   compiling cleanly.

## Phase Completion Rules

- **CODE DONE** (may claim once Steps 1-13 are all green): all Fully-Automated gates in Step 13 pass,
  AC1-AC6, AC8-AC10 are provable by automated test, and AC9's cross-site consistency check passes.
- **NOT VERIFIED / stays in `active/`** until the AC7 Agent-Probe on-device walkthrough (both iOS
  and Android, separately) is performed by the user — same standard the dark-mode-audit plan set for
  itself. **Recommendation: combine this walkthrough with the dark-mode plan's still-owed 4-way
  StatusBar matrix into ONE physical-device session**, since both plans need the same iOS+Android
  hardware and both are currently blocking archival on the same branch.
- Do not archive this plan to `completed/` until that Agent-Probe session is done and its result is
  recorded in an EXECUTE/EVL report co-located in this task folder.

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl
supersedes: 2026-07-17 (outer-pvl) — outer PVL cycle 2 has current evidence (cycle 1 was CONDITIONAL, never written as a full contract; this is the first written contract for this plan)

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (only S7 — 13 files in blast radius). No multi-package/schema/auth/phase-program/depth-request signal present. The plan's own Dependency Order is strictly sequential (Steps 1-13 each depend on the prior step's artifact), which itself argues against any fan-out.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Zero raw `Alert.alert(` calls remain in `apps/mobile/src` | Fully-Automated | `apps/mobile/scripts/check-no-raw-alert.mjs` via `pnpm --filter @jojopotato/mobile guard:no-raw-alert` | B |
| AC2 | `Toast` exported, required `mode` prop, resolved style differs by mode | Fully-Automated | `packages/ui/src/components/__tests__/toast.test.tsx` (6-combo severity×mode resolved-style assertions) | B |
| AC3 | `Toast` uses no RN `Modal` | Fully-Automated | `toast.test.tsx` render-toggle test + source-level `Modal`-import check | B |
| AC4 | 7 migrating sites fire `Toast`, underlying behavior unchanged | Fully-Automated (6/7) / Hybrid (reorder screen-render leg) | per-site `*.test.tsx` (cart×3, product, branches, notifications) + `use-reorder.test.ts` | B |
| AC5 | Staff destructive confirm uses `ConfirmDialog`, identical two-choice semantics | Fully-Automated | `live-order-actions.test.tsx` | B |
| AC6 | `addedNotice` replaced by `Toast`, no redundant notice | Fully-Automated | product screen test asserting toast fires + old inline text gone | B |
| AC7 | Toast clears floating tab bar / sticky footer / safe area, incl. add-to-cart-bar hint-visible state | Hybrid | offset-formula component test (incl. `showHint && !canAdd` state, per Gap 6) + on-device Agent-Probe walkthrough | D |
| AC8 | Zero regression, both packages, typecheck/lint/tests/guards/format all clean | Fully-Automated | Step 13's full 9-command sequence | B |
| AC9 | Consistent severity assignment across all failure/warning sites | Fully-Automated | cross-site consistency review + per-site behavior tests | B |
| AC10 | Every new test asserts resolved output, not prop presence | Fully-Automated (review gate) | VALIDATE-time manual review of every new test file (performed this pass — see Dimension findings) | B |

gap-resolution legend: A — proven now / B — fixed in this plan (gate added by this plan's checklist) / C — deferred to a named later phase/plan / D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: no `Known-Gap` strategy value used above — AC7's on-device leg is the one named residual, carried as gap-resolution D (Agent-Probe, explicitly combined with the dark-mode plan's owed StatusBar walkthrough per Branch Context), not disguised as a passing automated gate.

Legacy line form (retained so existing validate-contract consumers still parse):
- `packages/ui` — Toast component: [Fully-automated: `pnpm --filter @jojopotato/ui test`] | [Fully-automated: `pnpm --filter @jojopotato/ui typecheck`] | [Fully-automated: `pnpm --filter @jojopotato/ui check-tokens`]
- `apps/mobile` — screens/hooks/guards: [Fully-automated: `pnpm --filter @jojopotato/mobile typecheck`] | [Fully-automated: `pnpm --filter @jojopotato/mobile lint`] | [Fully-automated: `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest`)] | [Fully-automated: `pnpm --filter @jojopotato/mobile guard:theme-mode`] | [Fully-automated: `pnpm --filter @jojopotato/mobile guard:no-raw-alert`] | [Fully-automated: `pnpm format:check`]
- AC7 on-device geometry: [agent-probe: 5 screens × iOS/Android × light/dark, incl. product screen with an incomplete required-option selection so the hint renders — see Gap 6]

Dimension findings:
- Infra fit: PASS — pure client-presentation change, no container/runtime/proxy surface.
- Test coverage: PASS — exhaustive, resolved-style/behavior assertions throughout (no prop-presence-only tests found); fake-timer 3-way dismiss, unmount-teardown, and replace-latest tests all explicitly specified.
- Breaking changes: PASS — widened `useReorder()` return is additive; single real consumer (`history.tsx`) confirmed by grep and updated in-plan; test mock updated (Step 6).
- Security surface: PASS — no auth/billing/schema/API/secrets surface touched (SPEC Out of Scope confirms).
- Plan structural conformance (`validate-plan-artifact.mjs`): PASS — independently re-run this session, 0 failures / 0 warnings; `## Overview / Context` and `## Acceptance Criteria (Reference)` carry real content (a scope paragraph + a 10-row AC summary table with a pointer to the locked SPEC), not stub headings added to satisfy a regex.
- Section A — Toast component + height constants (Steps 1-2): PASS (cycle 2) — all 3 cycle-1 gaps closed and independently re-verified: (1) `MinTouchTarget` re-export added to `apps/mobile/src/constants/theme.ts`'s existing barrel, consistent with how `cart.tsx`/`add-to-cart-bar.tsx` already consume every other token through that same barrel; (2) `ADD_TO_CART_BAR_HEIGHT` now uses `Math.max(BAR_TEXT_BLOCK_HEIGHT, MinTouchTarget)`; (3) icon mapping corrected to `checkmark-circle`/`warning-outline`/`alert-circle` (`alert-triangle` confirmed absent from the pinned `@expo/vector-icons@15.1.1` Ionicons glyphmap, re-confirmed this cycle against my own cycle-1 primary-source glyphmap dump — direct file access is guarded this cycle by the repo's node_modules/vendor scout-block hook, so I cross-checked against my own already-captured evidence rather than re-deriving); `alert-triangle` appears ONLY inside a corrective note, never as a live mapping (grep-confirmed). Fresh finding this cycle (Gap 6 residual): the always-tall `ADD_TO_CART_BAR_HEIGHT` fix still omitted `styles.bar`'s own `gap: Spacing.one` (4dp) between the hint `<Text>` and the `row` `<View>` (real siblings in a column-flex `View`, confirmed by reading `add-to-cart-bar.tsx:88-95` directly) — undercounted the tall variant by 4dp (97 vs. real 101). Proved this did NOT cause an actual AC7 overlap (the existing `+ Spacing.two` buffer left 4dp of clearance even pre-fix: bottomOffset 105 vs. real bar height 101) but fixed it anyway as a documentation-accuracy issue, applied directly to the plan text this pass (see Plan updates applied below) rather than bouncing to a 3rd plan-agent cycle, since it was a 1-line mechanical addition with a proven-safe interim state.
- Section B — `useToast()` + `use-reorder.ts` + `history.tsx` (Steps 3-6): PASS (cycle 2) — `history.tsx`'s Touchpoints entry now explicitly states the missing `useSafeAreaInsets` import + `insets` variable addition; re-confirmed `branches/[branchId].tsx` and `account/notifications.tsx` already import it (both grep-verified again this cycle, holds from cycle 1).
- Section C — `cart.tsx` 3 sites (Step 7): PASS — unchanged from cycle 1, all line numbers verified exact.
- Section D — `product/[productId].tsx` (Step 8): PASS — unchanged from cycle 1, all line numbers verified exact.
- Section E — `branches/[branchId].tsx` + `notifications.tsx` (Steps 9-10): PASS — unchanged from cycle 1.
- Section F — Staff `ConfirmDialog` conversion (Step 11): PASS — unchanged from cycle 1.
- Section G — Guard script + regression suite (Steps 12-13): PASS — unchanged from cycle 1.

Open gaps: none blocking. AC7's on-device leg is a named, accepted Hybrid residual (gap-resolution D above), not a silent substitution — see Test Infra Improvement Notes and Phase Completion Rules in the plan body, which already correctly keep this plan in `active/` until that walkthrough is done.

What This Coverage Does NOT Prove:
- `check-no-raw-alert.mjs` proves no *new* raw `Alert.alert(` call exists at gate time — it does not prevent a future PR from reintroducing one; it is a standing regression gate, not a one-time migration proof.
- `toast.test.tsx`'s 6-combo resolved-style assertions prove the severity×mode token mapping is wired correctly under jest-expo — they do not prove real device color rendering, animation smoothness, or accessibility contrast ratios.
- The offset-formula component tests (AC7's Fully-Automated leg) prove the `bottomOffset` prop value matches the stated `getAddToCartBarHeight(insets.bottom)`/`getCartFooterHeight(insets.bottom)` formula for each screen class, insets value, and (for the bar) platform, including the hint-visible state — they do NOT prove real pixel non-overlap on a device; jest-expo has no layout engine. The functions are now insets-dependent (deriving from `getFloatingTabBarClearance` directly, the same call the bars themselves make) rather than a single hand-copied number, which structurally reduces — but does not eliminate — this residual risk: the tests confirm the FORMULA is applied consistently, not that the underlying `getFloatingTabBarClearance` constants (`BAR_CONTENT_HEIGHT`, `Spacing.two`, `Spacing.four`) themselves stay accurate if `floating-tab-bar.tsx` changes, nor that the resulting offset is visually "enough" on every physical device/font-scale combination.
- `use-reorder.test.ts`'s hook-level assertions prove the error-state lifecycle is correct in isolation — they do not prove `history.tsx` visually renders that error as a toast in a way a real user would notice (that leg is Agent-Probe, folded into AC7's residual).
- Step 13's full regression pass proves no *automated* test regresses — it does not exercise the RN navigation/E2E surface (no such runner exists in this repo, project-wide known gap, unchanged by this plan).
- The `MinTouchTarget` re-export fix, the Gap 6 arithmetic fix, and this cycle's insets/platform-derivation fix are all proven only by `tsc --noEmit` (compiles) and the offset-formula tests (values match the stated function output) — none is proven by a dedicated unit test asserting the literal derivation arithmetic against the *real* rendered `add-to-cart-bar.tsx`/`cart.tsx` DOM tree on a physical device (no layout engine exists under jest-expo, project-wide known gap). Deriving from `getFloatingTabBarClearance` directly (rather than a hand-copied expanded number) removes one entire class of drift — a future change to that function's own constants now automatically propagates to both toast offsets instead of silently going stale — but a change to either bar's OWN static-portion layout (padding, border width, hint text size) would still require a matching manual update to `BAR_STATIC_PORTION`/`getCartFooterHeight`'s own literal terms, with no automated test catching the mismatch. This residual risk category is unchanged from `BAR_CONTENT_HEIGHT` itself and is accepted on the same basis.
Accepted by: session (this PVL cycle) — accepted as a documented, non-blocking residual consistent with the project-wide "hand-derived layout constant" pattern already used for `BAR_CONTENT_HEIGHT`/`getFloatingTabBarClearance`.

Gate: PASS (no FAILs, plan updated — 6 cycle-1 gaps closed and independently re-verified, plus 1 fresh cycle-2 residual found and fixed directly in the plan text this pass)

**Post-PASS plan supplement (PVL cycle 3, PLAN-side correction only — Gate: PASS above is
UNCHANGED, not re-run; this note documents a plan-text correction to a derivation the contract
above already validated in principle but whose EXECUTE-time formula was defective):**

`ADD_TO_CART_BAR_HEIGHT`/`CART_FOOTER_HEIGHT` were both static constants derived by reading only
each bar's `StyleSheet.create` block — but both bars override `paddingBottom` at runtime via a
JSX `style={[...]}` array that calls `getFloatingTabBarClearance(insets.bottom)` (a function of
the caller's safe-area insets; the add-to-cart bar's override is additionally
`Platform.OS !== 'web'`-guarded, while the cart footer's override is not). The static values were
therefore correct ONLY for `Platform.OS === 'web'` at `insets.bottom === 0` — every non-web device
and every device with nonzero safe-area insets (i.e. essentially all real hardware) would see the
toast overlap the bar it is supposed to clear, the exact failure AC7 exists to prevent. Root cause
recorded as a durable rule in Step 2: deriving a layout constant from `StyleSheet.create` alone is
unsound in this codebase whenever the rendered `style` array can override the derived term — read
the rendered style array, not just the stylesheet, and if the override is a function of a runtime
value, the derived helper must be a function of that same value, never a fixed number. Both
constants are now `getAddToCartBarHeight(insetsBottom)`/`getCartFooterHeight(insetsBottom)`
functions that call `getFloatingTabBarClearance` directly (the same function the bars themselves
call), so they are correct at every insets value and, for the add-to-cart bar, on every platform.
This does not reopen any Dimension finding above (Sections A-G) beyond Section A, whose Step 1-2
scope this correction lives entirely inside — no other section's line numbers, behavior, or gate
changed. The AC7 residual noted below is updated accordingly, not newly introduced.

## Autonomous Goal Block

```
SESSION GOAL: Mobile Alert/Toast Consistency Pass — build shared Toast in packages/ui, migrate
8 Alert.alert() sites to Toast/ConfirmDialog, fix use-reorder.ts's imperative-alert hook seam.
Charter + umbrella plan: N/A — single plan (not a phase program).
Autonomy: Standard /goal autonomous execution — CONDITIONAL findings apply-and-proceed;
BLOCKED items go to backlog + continue; irreversible/outward-facing actions without explicit
contract instruction are a hard stop.
Hard stop conditions / safety constraints:
- No new branch — stack on `spec/mobile-dark-mode-audit` (already decided this session); do not
  merge or open a PR without explicit user instruction.
- No schema/auth/API/billing surface may be touched — if EXECUTE discovers any, stop and return
  to PLAN (this plan's own Blast Radius confirms none apply today).
- Do not archive this plan to `completed/` until the owed AC7 on-device Agent-Probe walkthrough
  (iOS + Android separately) is performed by the user and recorded in a co-located EXECUTE/EVL
  report — combine with the dark-mode plan's owed 4-way StatusBar matrix in one physical-device
  session per this plan's own Branch Context note.
- 13-file blast radius is fixed; do not expand scope onto rewards/index.tsx's raw Modal or top-bar
  consistency (both explicitly Out of Scope in the SPEC).
Next phase: EXECUTE (Steps 1-13, sequential, single vc-execute-agent, opus — plan's own
Dependency Order section is the execution order).
Validate contract: inline in this plan file (## Validate Contract section above), Gate: PASS.
Execute start: `pnpm --filter @jojopotato/ui typecheck && pnpm --filter @jojopotato/ui test &&
pnpm --filter @jojopotato/ui check-tokens && pnpm --filter @jojopotato/mobile typecheck &&
pnpm --filter @jojopotato/mobile lint && pnpm --filter @jojopotato/mobile test && pnpm --filter
@jojopotato/mobile guard:theme-mode && pnpm --filter @jojopotato/mobile guard:no-raw-alert &&
pnpm format:check` | e2e spec: none (no RN E2E runner exists, project-wide gap) | probe scenario:
AC7 on-device 5-screen × iOS/Android × light/dark walkthrough, incl. product screen with an
incomplete required-option selection so the add-to-cart-bar hint renders | high-risk pack: no
(pure client-presentation change, no high-risk class present).
```
