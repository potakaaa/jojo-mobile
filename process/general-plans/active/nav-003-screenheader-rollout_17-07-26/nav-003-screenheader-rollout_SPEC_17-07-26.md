---
name: plan:nav-003-screenheader-rollout-spec
description: "Replace native headers with shared ScreenHeader on 12 (tabs) client screens across 5 nested Stacks"
date: 17-07-26
feature: general-plans
---

# NAV-003 — ScreenHeader Rollout — SPEC

## 1. Problem

Every customer-facing `(tabs)` screen currently uses React Navigation's native header
(`headerShown:true` + `Stack.Screen options={{ title: ... }}`) for its top bar. The user wants
these replaced with the shared in-content `<ScreenHeader>` from `@jojopotato/ui`, matching the
pattern already shipped on `apps/mobile/src/app/(tabs)/notifications/index.tsx` (delivered this
session, uncommitted).

## 2. Why (native header → in-content header)

`ScreenHeader` is the app's established alternative to a native header — it exists because a
custom control injected into React Navigation's native `headerLeft` slot cannot be given the
right gap/inset from the outside. Rolling it out to all 12 client detail/nested screens gives one
consistent header implementation instead of two (native title bar vs. in-content component),
matching the pattern already used by `(staff)/**` and `notifications/**`.

## 3. Scope — 12 screens, 5 layouts

Source-verified against `apps/mobile/src/app/(tabs)/**/_layout.tsx` (17-07-26):

| # | Layout file | Screen | Current `Stack.Screen` title |
|---|---|---|---|
| 1 | `order/_layout.tsx:12` | `product/[productId].tsx` | "Product Details" |
| 2 | `order/_layout.tsx:13` | `cart.tsx` | "Cart" |
| 3 | `order/_layout.tsx:14` | `checkout.tsx` | "Checkout" |
| 4 | `order/_layout.tsx:15` | `payment-method.tsx` | "Payment Method" |
| 5 | `order/_layout.tsx:17` | `tracking/[orderId].tsx` | "Order Tracking" |
| 6 | `order/_layout.tsx:18` | `history.tsx` | "Order History" |
| 7 | `branches/_layout.tsx:8` | `[branchId].tsx` | "Branch Details" |
| 8 | `account/_layout.tsx:8` | `edit-profile.tsx` | "Edit Profile" |
| 9 | `account/_layout.tsx:9` | `help.tsx` | "Help" |
| 10 | `rewards/_layout.tsx:8` | `coupons.tsx` | "Coupons" |
| 11 | `deals/_layout.tsx:14` | `deal/[dealId].tsx` | "Deal Details" |

That is 11 distinct screen files across 5 layouts (the orchestrator brief said "12" counting
`confirmation/[orderId]` as a nominal member of the Order list; source confirms it is ALREADY
`headerShown:false` at `order/_layout.tsx:16` with a hand-rolled ScreenHeader-identical header —
see §7 Claim 2 — and is explicitly OUT OF SCOPE for conversion, only optionally eligible for a
pure dedup swap). Tab roots (`index` in each of the 5 layouts) are headerless already and stay
untouched.

## 4. Acceptance Criteria

- **AC1 (HARD, per-screen)**: on every in-scope screen, `<ScreenHeader>` renders with the correct
  title, and the title sits fully below the device status bar / notch — never overlapped. Proof:
  Agent-Probe only (no automated tool can assert on-device placement).
- **AC2 (HARD, per-screen)**: `onBack={() => router.back()}` fires and returns to the correct
  prior screen (verified navigation target unchanged from today's native back button).
- **AC3 (HARD, per-screen)**: no screen-local CTA, footer, or bottom bar ends up flush against the
  device home indicator / gesture bar. Every in-scope screen's final bottom-inset math counts the
  device safe-area inset exactly once (never zero, never twice).
- **AC4 (HARD)**: the floating tab bar's ~85dp footprint (`TAB_BAR_FOOTPRINT`) is never reserved
  on a screen where the bar does not render. Bar-visibility per screen must be confirmed from
  `floating-tab-bar.tsx`'s `isFocusedTabNested` logic (see §7 Claim 3), not assumed.
  Bar-visibility fact for all 11 in-scope screens: **hidden** (every one is a pushed/nested screen;
  none is a tab root). No in-scope screen needs the floating-bar footprint term.
- **AC5 (HARD)**: iOS edge-swipe-back gesture is not lost when `headerShown:false` replaces
  `headerShown:true`. Proof required from installed `expo-router`/`react-native-screens` source
  (see §7 Claim 1), not memory/inference.
- **AC6 (MEDIUM)**: `checkout.tsx`'s 3 return branches (`isEmpty`, `isBranchUnavailable`, main)
  all render the same `ScreenHeader` — the countdown-drawer / `useHideTabBarWhile` behavior is
  otherwise byte-identical to today.
- **AC7 (MEDIUM)**: `tracking/[orderId].tsx` back navigation still lands on the Order tab root
  (unchanged — `navigate-to-tracking*.ts` is not touched by this plan).
- **AC8 (LOW)**: the folded-in NAV-001 double-count fix removes the redundant safe-area-inset
  source on `cart.tsx`, `checkout.tsx`, and `branches/[branchId].tsx` (see §7 Claim 5 / PLAN
  per-screen table) — each ends this rollout with the bottom inset counted exactly once.

## 5. Out of Scope

- `apps/mobile/src/app/(tabs)/order/confirmation/[orderId].tsx` — already `headerShown:false`
  with a hand-rolled ScreenHeader-identical block (dedup optional, not required — see §7 Claim 2).
- `floating-tab-bar.tsx`, `floating-tab-bar.helpers.ts`, `navigate-to-tracking*.ts`,
  `(tabs)/_layout.{ios,android,web}.tsx`, `(tabs)/notifications/**`, the 5 tab roots,
  `deals/index.tsx`, `(staff)/**`, `(auth)/**`, `(onboarding)/**`.
- No new dependency. No schema/auth/API surface change.
- No `packages/ui` change (the one apps/mobile-local `ComingSoon` change is NOT a `packages/ui`
  change — see PLAN §Touchpoints).

## 6. Constraints (inherited, locked)

- No CTA/footer may end up flush against the device home indicator on any screen (NAV-001).
- The tab-bar footprint must never be reserved where the bar is hidden (issue #96's core bug).
- `checkout.tsx`'s `useHideTabBarWhile` countdown behavior and its `countdown===null` footer
  conditional stay byte-identical.
- `tracking/[orderId]` back must still land on the Order root.
- `resolveTabBarClearance`'s signature and `isNested` param name are FROZEN (NAV-001 owns
  `floating-tab-bar.helpers.ts`; a vitest test consumes it).

## 7. Unverified-Claims Verification Ledger

Every claim from the prior fast-mode agent's (fabricated-artifact) report, re-checked from source
this session (17-07-26):

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | iOS swipe-back survives `headerShown:false` | **CONFIRMED** | `node_modules/.pnpm/expo-router@57.0.4_.../node_modules/expo-router/build/react-navigation/native-stack/views/NativeStackView.native.js` — the `SceneView` component destructures `gestureEnabled` and `headerShown` as fully independent option fields (single destructure line, no interdependency); `gestureEnabled` is passed straight to `ScreenStackItem` (`gestureEnabled: Platform.OS === 'android' ? false : gestureEnabled`) with `headerShown` never referenced in that expression. `headerShown` only gates the header render block, the `topInset` (`isParentHeaderShown \|\| ...`) calc, and the `HeaderHeightContext` value — nothing that touches `gestureEnabled`/`fullScreenSwipeEnabled`. Turning `headerShown` off does not disable the swipe gesture. |
| 2 | `confirmation/[orderId].tsx` already hand-rolls a ScreenHeader-identical header | **CONFIRMED** | `order/confirmation/[orderId].tsx:70-80` styles block (`header`/`headerTitle`) is byte-identical to `ScreenHeader`'s spec: `flexDirection:'row'`, `gap: Spacing.three`, `paddingHorizontal: Spacing.four`, `paddingTop: Spacing.one`, `paddingBottom: Spacing.two`; `Ionicons name="arrow-back" size={24}`; `FontFamily.display.bold` / `TypeScale.h2`; `hitSlop={8}`; `accessibilityLabel="Go back"`. Already `headerShown:false` (`order/_layout.tsx:16`) and `edges={['top','bottom']}` (line 41/51/69). |
| 3 | The floating tab bar is HIDDEN on `deal/[dealId]` | **CONFIRMED** | `deals` is auto-appended to the Tabs `state.routes` (not a declared `Tabs.Screen`, confirmed by `floating-tab-bar.tsx:305-311`'s own doc comment + the `ICONS` allowlist filter). `floating-tab-bar.tsx:277-279`: `focusedTab = state.routes[state.index]`; `isFocusedTabNested = isNestedTabRoute(focusedTab)`; `isHidden = hidden \|\| isFocusedTabNested`. `isNestedTabRoute` (`floating-tab-bar.helpers.ts:32-34`) returns true when `route.state.index > 0`. On `deal/[dealId]` (pushed, index 1 within the `deals` stack) this is true → bar hidden. On `deals/index` (index 0) it is false → bar shown. This directly contradicts issue #96's premise that "deals screens still show the tab bar" for the details screen specifically — worth recording as a real finding: the details screen was never the bug; `deals/index` (the list root, index 0) is the one that legitimately shows the bar. |
| 4 | `coming-soon.tsx` nested branch lacks a top safe-area edge because the native header supplies it | **CONFIRMED** | `coming-soon.tsx:34`: `edges={isNestedScreen ? ['bottom'] : ['top','bottom']}`. Doc comment (`coming-soon.tsx:11-17`) states nested screens "are framed by the native `Stack` header ... and are NOT overlaid by the floating tab bar." Turning the native header off for `help.tsx`/`coupons.tsx` (both call `<ComingSoon isNestedScreen>`) removes their only top-inset source — confirmed real trap, addressed in PLAN. |
| 5 | Per-screen edges/bottom-math/inset-count table | **CONFIRMED, fully re-derived from source** | See PLAN §Per-Screen Table — every cell re-derived independently against the actual file, not copied from the claim. All double-counts (`cart.tsx`, `checkout.tsx`, `branches/[branchId].tsx`) and zero-counts (`tracking/[orderId].tsx`, `history.tsx`) confirmed exactly as claimed. |
| 6 | `apps/mobile` has a jest/jest-expo component runner and 4 in-scope screens already render under it; `checkout.tsx` is NOT jest-testable | **CONFIRMED** | `find apps/mobile -iname '*.test.tsx'` lists `account-edit-profile-screen.test.tsx`, `cart-branch-switch.test.tsx`, `deals-screens.test.tsx`, `product-branch-switch.test.tsx` (plus `account-screen.test.tsx`, `branches-screen.test.tsx` — 2 MORE in-scope-adjacent suites not named in the original claim: `branches-screen.test.tsx` covers the branches list, not `[branchId]` detail, so it is not a direct regression guard for this plan's `branches/[branchId].tsx` change). `checkout.tsx` imports `react-native-reanimated`'s `FadeIn/FadeOut/SlideInDown/SlideOutDown` (checkout.tsx:31) which the shared jest reanimated mock (`apps/mobile/src/test-utils/jest-setup.ts`, per `all-tests.md` Known Gaps) does not export — confirmed not jest-testable today. Real baseline run this session (17-07-26): `pnpm --filter @jojopotato/ui test` → **67/67 passing**; `pnpm --filter @jojopotato/mobile test` → vitest **51/51** + jest **27/27** (8 suites). `pnpm --filter @jojopotato/mobile typecheck` → **exit 0, zero errors** — this REFUTES `all-tests.md`'s Known Gaps line claiming root typecheck is RED (stale as of 14-07-26; the doc itself is dated pre-15-07-26 deltas). Recorded as an UPDATE PROCESS item, not fixed by this plan. |

## 8. Traceability

Each PLAN step must cite one of AC1–AC8. See PLAN §Implementation Checklist.
