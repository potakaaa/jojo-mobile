---
name: report:nav-003-screenheader-rollout
description: "EXECUTE report — NAV-003 ScreenHeader rollout across 11 (tabs) screens + folded-in NAV-001 double-count fix. All automated gates green; AC1/AC2/AC3/AC5/AC6/AC7/AC8 remain Agent-Probe-only and UNPROVEN."
date: 17-07-26
phase: nav-003-screenheader-rollout
status: COMPLETE_WITH_GAPS
feature: general-plans
plan: process/general-plans/active/nav-003-screenheader-rollout_17-07-26/nav-003-screenheader-rollout_PLAN_17-07-26.md
metadata:
  node_type: memory
  type: report
  feature: general-plans
  phase: nav-003-screenheader-rollout
---

# NAV-003 — ScreenHeader Rollout — EXECUTE REPORT

**TL;DR:** All 17 checklist file edits applied, including the VALIDATE-added 6b/7b/9b/17b
loading/error-branch coverage. Every automated gate is green (mobile typecheck exit 0 / vitest 51 /
jest 27 in 8 suites / ui 67 / lint 0 errors / Prettier clean). **Exit state is CODE DONE, not
VERIFIED** — the headline acceptance bar (header sits below the status bar, no CTA flush against the
home indicator, swipe-back) has **zero automated proof path** and the Agent-Probe walkthrough
(steps 20/20b) has **not been run**. 4 real plan/brief discrepancies found and reported below rather
than silently worked around. Plan stays in `active/`.

**Date**: 17-07-26
**Branch**: `development` (worked directly on it, per instruction — nothing committed, no branch created)
**Plan**: `nav-003-screenheader-rollout_PLAN_17-07-26.md` (Gate: CONDITIONAL, 0 FAILs, concern resolved inline)

---

## What Was Done

All 17 Touchpoints edited; each maps 1:1 to an Implementation Checklist step.

| Step | File | What was done |
|---|---|---|
| 1 | `order/_layout.tsx` | `headerShown:false` on the 6 named screens (`index`/`confirmation` already false) |
| 2 | `order/product/[productId].tsx` | Added `<SafeAreaView edges={['top']}>` wrap + `ScreenHeader`; `AddToCartBar` left OUTSIDE, unchanged |
| **2b*** | `order/product/[productId].tsx` | **Loading + error early returns wrapped identically** — see Discrepancy #1 |
| 3 | `order/cart.tsx` | `edges` `['bottom']` → `['top']`; `ScreenHeader` above `{conflictNotice}`; both clearance calls untouched |
| 4 | `order/checkout.tsx` | All 3 `edges` → `['top']`; `ScreenHeader` in **all 3** branches (AC6); clearance calls + drawer untouched |
| 5 | `order/payment-method.tsx` | `edges` `['bottom']` → `['top','bottom']` (KEPT bottom); `ScreenHeader` added |
| 6 | `order/tracking/[orderId].tsx` | New `View`+`SafeAreaView edges={['top','bottom']}` wrap + `ScreenHeader`; static `Spacing.six` kept |
| **6b** | `order/tracking/[orderId].tsx` | `isLoading` + `error \|\| !order` early returns wrapped identically (were bare `ScreenLoader`/`ScreenMessage`) |
| 7 | `order/history.tsx` | `SafeAreaView edges={['top','bottom']}` wrap + `ScreenHeader`; static `Spacing.six` kept |
| **7b** | `order/history.tsx` | **All 4** return paths (loading / error / empty-orders / FlatList) get the same header + wrap |
| 8 | `branches/_layout.tsx` | `headerShown:false` for `[branchId]` |
| 9 | `branches/[branchId].tsx` | `edges` `['top','bottom']` → `['top']`; `ScreenHeader` added; clearance call untouched |
| **9b** | `branches/[branchId].tsx` | `loading` + `error \|\| !branch` branches wrapped in `SafeAreaView edges={['top']}` + header |
| 10 | `account/_layout.tsx` | `headerShown:false` for `edit-profile`, `help` |
| 11 | `account/edit-profile.tsx` | `edges` `['bottom']` → `['top','bottom']`; `ScreenHeader` above `KeyboardAvoidingView` |
| 12 | `components/coming-soon.tsx` | Additive optional `onBack?`; `edges` ternary → constant `['top','bottom']`; `mode` derived via `useColorScheme()` |
| 13 | `account/help.tsx` | `onBack={() => router.back()}` |
| 14 | `rewards/_layout.tsx` | `headerShown:false` for `coupons` |
| 15 | `rewards/coupons.tsx` | `onBack={() => router.back()}` |
| 16 | `deals/_layout.tsx` | `headerShown:false` for `deal/[dealId]` |
| 17 | `deals/deal/[dealId].tsx` | `SafeAreaView edges={['top']}` wrap + `ScreenHeader`; clearance call at former :84 untouched |
| **17b** | `deals/deal/[dealId].tsx` | `isLoading` + `isError \|\| !deal` branches wrapped identically |
| 18 | — | Full gate list run — see §Test Gate Outcomes |
| 19 | — | 4 in-scope jest suites re-run — **4 passed, 14 tests**, no edits needed (as the plan predicted) |
| 20 / 20b | — | **NOT RUN** — Agent-Probe, requires a device/simulator. See §What Was Skipped |

\* Step "2b" is my label for the product-screen loading/error coverage the plan mandates via its
validate-contract + probe 20b but never assigned a lettered sub-step. See Discrepancy #1.

**Header-count parity check (grep-verified):** checkout **3**, history **4**, tracking **3**,
product **3**, branches/[branchId] **3**, deal/[dealId] **3**, cart **1**, payment-method **1**,
edit-profile **1**. Matches the intended branch counts exactly.

---

## Per-Screen Verification Table

Final state, audited by grep against the working tree (not from memory):

| Screen | Final `edges` | Direction vs before | Final bottom-inset math | Inset counted exactly once | Loading/error branches covered |
|---|---|---|---|---|---|
| `product/[productId].tsx` | `['top']` ×3 | ADDED wrap (was none) | `AddToCartBar`'s own `insets.bottom + Spacing.four` (sibling, outside SafeAreaView) | ✓ 1 (unchanged) | ✓ (2b) |
| `cart.tsx` | `['top']` | **DROPPED `'bottom'`** | `resolveTabBarClearance(true,…) + Spacing.six + Spacing.two` (scroll); `+ Spacing.two` (footer) | ✓ **1 (was 2)** | n/a — single return |
| `checkout.tsx` | `['top']` ×3 | **DROPPED `'bottom'`** ×3 | main: `resolveTabBarClearance(true,…)` on scroll + footer. empty/unavailable: none | ✓ main **1 (was 2)**; empty/unavailable **0** (no bottom CTA — centered EmptyState) | ✓ all 3 branches (AC6) |
| `payment-method.tsx` | `['top','bottom']` | **KEPT `'bottom'`**, ADDED `'top'` | SafeAreaView `'bottom'` (sole source — no clearance call) | ✓ 1 (unchanged) | n/a — single return |
| `tracking/[orderId].tsx` | `['top','bottom']` ×3 | ADDED wrap (was none) | SafeAreaView `'bottom'` + static `Spacing.six` (breathing room, different concern) | ✓ **1 (was 0)** | ✓ (6b) |
| `history.tsx` | `['top','bottom']` ×4 | ADDED wrap (was none) | SafeAreaView `'bottom'` + static `Spacing.six` | ✓ **1 (was 0)** | ✓ (7b — all 4 paths) |
| `branches/[branchId].tsx` | `['top']` ×3 | **DROPPED `'bottom'`** | `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` on scroll | ✓ **1 (was 2)** | ✓ (9b) |
| `edit-profile.tsx` | `['top','bottom']` | **KEPT `'bottom'`**, ADDED `'top'` | SafeAreaView `'bottom'` (sole source) | ✓ 1 (unchanged) | n/a — single return |
| `help.tsx` (via ComingSoon) | `['top','bottom']` | ternary → constant | SafeAreaView `'bottom'`; the `!isNestedScreen` clearance branch untouched | ✓ 1 (unchanged) | n/a |
| `coupons.tsx` (via ComingSoon) | `['top','bottom']` | ternary → constant | same | ✓ 1 (unchanged) | n/a |
| `deal/[dealId].tsx` | `['top']` ×3 | ADDED wrap (was none) | `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` on scroll | ✓ 1 (unchanged) | ✓ (17b) |

**No `TAB_BAR_FOOTPRINT` term was added anywhere** — all 11 screens are bar-hidden (AC4); every
existing `resolveTabBarClearance(true, …)` call keeps its `true` (no-footprint) branch, untouched.

---

## Test Gate Outcomes

Real command output, run by me this session — not remembered, not expected:

| Gate | Result | Baseline (I measured it myself first) |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | **exit 0, ZERO errors** ✅ | exit 0 — identical |
| `pnpm --filter @jojopotato/mobile test` (vitest leg) | **51 passed (51), 5 files** ✅ | 51 — unchanged |
| `pnpm --filter @jojopotato/mobile test` (jest leg) | **27 passed, 8 suites** ✅ | 27 / 8 — unchanged |
| `pnpm --filter @jojopotato/ui test` | **67 passed, 25 suites** ✅ | 67 — unchanged (`packages/ui` untouched) |
| `pnpm --filter @jojopotato/mobile lint` | **0 errors**, 3 warnings ✅ | 3 pre-existing warnings in `scripts/dev-with-tunnel.mjs` — not mine |
| `pnpm --filter @jojopotato/ui lint` | **0 errors, 0 warnings** ✅ | clean |
| Prettier on the 17 touched files | **clean** (5 reformatted by me, then all pass) ✅ | repo-wide `format:check` left alone (structurally RED, pre-existing CRLF) |
| Step 19 — 4 in-scope jest suites | **4 passed, 14 tests** ✅ | no edits needed |

**Honest note on the jest count:** the orchestrator brief expected "MORE jest after the plan's new
cases." There are **no new cases** — the plan's Implementation Checklist contains no
test-authoring step (step 19 is explicitly a *re-run*, and the plan's own Test Infra notes defer new
coverage to backlog). jest is **27, unchanged**, which is the correct outcome for this plan as
written. Adding tests would have been scope expansion.

**Typed-routes codegen:** not required — no route files added or removed (only internal render
trees + per-screen `headerShown` options changed). No `as Href` cast introduced anywhere.

---

## Honest Per-AC Verification Tiers

**Do not read the green gates above as AC proof.** The gates prove the code compiles, imports
resolve, and existing suites still pass. They prove nothing about on-device layout.

| AC | Tier actually achieved | Status |
|---|---|---|
| **AC1** — header below status bar, 11 screens | Agent-Probe only — **not run** | ❌ **UNPROVEN** (headline risk) |
| **AC2** — back returns to correct screen | Agent-Probe only — **not run**. Code-level: `onBack={() => router.back()}` wired on all 11 | ❌ **UNPROVEN** |
| **AC3** — inset exactly once, nothing flush | Source-level diff/grep audit ✅ (table above); on-device | ⚠️ source-verified, **on-device UNPROVEN** |
| **AC4** — no bar footprint where bar hidden | Source-level grep ✅ — no `TAB_BAR_FOOTPRINT` added; all clearance calls keep `true` | ✅ source-verified |
| **AC5** — iOS swipe-back survives `headerShown:false` | **Mechanism independently CONFIRMED from installed source** (below); actual gesture Agent-Probe | ⚠️ mechanism proven, **gesture UNPROVEN** |
| **AC6** — checkout 3-branch parity | Code-verified: 3 `<ScreenHeader>` present. **Zero automated path** (see gaps) | ⚠️ code-verified, **on-device UNPROVEN** |
| **AC7** — tracking back lands on Order root | `navigate-to-tracking*.ts` untouched (mtime-proven); Agent-Probe for the rest | ⚠️ **UNPROVEN** |
| **AC8** — double-count fold-in | Source-level ✅ (cart/checkout/branches each now count once) | ⚠️ source-verified, **on-device UNPROVEN** |

### AC5 — re-verified against installed source myself
`node_modules/.pnpm/expo-router@57.0.4_83c1348ad4f734850adcefca9f2bc133/node_modules/expo-router/build/react-navigation/native-stack/views/NativeStackView.native.js`:
- **L60** — `gestureEnabled` and `headerShown` are sibling destructures of the same `options` object; no interdependency.
- **L209–213** — `gestureEnabled: Platform.OS === 'android' ? false : gestureEnabled` — `headerShown` is **never referenced** in this expression, nor in `fullScreenSwipeEnabled`.
- **L154 / 228 / 232 / 241** — the only `headerShown` uses: header config, `HeaderHeightContext` value, the header render block, `HeaderShownContext` value. None touch gesture props.

**Verdict: CONFIRMED.** `headerShown:false` cannot disable swipe-back. This matches SPEC §7 Claim 1
and is now independently re-verified, not inherited.

---

## Plan / Source Discrepancies Found (reported, not worked around)

### 1. `product/[productId].tsx` loading/error coverage has no lettered sub-step (plan-internal inconsistency)
The plan's Dimension finding (*Section A feasibility*) states product's `isLoading`/`isError` early
returns "were NOT covered by the original checklist … **added as 6b/7b above**." They were not:
step **6b**'s text names only `tracking/[orderId]`, step **7b**'s names only `history`. Neither
mentions `product/[productId]`.

However **three** other plan surfaces name it explicitly: the validate-contract test-gate row
("AC1/AC2 loading/error-state coverage … `product/[productId]`, …"), probe step **20b**, and the
Dimension finding itself. Intent is unambiguous → **I implemented it** (labelled "2b" above).
Recommend the plan text be corrected at UPDATE PROCESS.

### 2. `confirmation/[orderId].tsx` — orchestrator brief contradicts the plan (I followed the plan)
The brief lists under HARD constraints: *"`confirmation/[orderId].tsx` is a byte-for-byte dedup onto
`ScreenHeader` … Zero pixel change is a HARD AC."* The **plan says the opposite**: it is in
`## Not-to-Touch` ("reference-only"), and SPEC §5 Out of Scope calls the dedup "**optional, not
required**". It appears in no Touchpoint and no checklist step.

**I did NOT touch it** — EXECUTE implements the plan exactly, and the plan explicitly forbids it.
If the dedup is genuinely wanted, it needs a plan amendment. Flagging rather than guessing.

### 3. `ComingSoon` — internal ambiguity about the centered title
`## Public Contracts` says the header renders *"above its centered content **instead of the bare
centered title**"*. Step 12 says render it *"before the existing centered `content` View"* and does
not mention removing the title. Doing both literally renders the title **twice** (once in the
header, once large and centered).

**Resolution:** followed Public Contracts — when `onBack` is present the centered title is
suppressed and the header carries it; the "Coming soon" subtitle and `children` are untouched. When
`onBack` is absent the render is byte-identical to before (backward compatible — grep confirms
exactly 2 callers, `help.tsx` + `coupons.tsx`, both updated here).

### 4. `branches/[branchId].tsx` — header gets double horizontal padding (cosmetic, followed plan anyway)
`styles.safeArea` on this screen carries `paddingHorizontal: Spacing.four`, and `ScreenHeader` adds
its own `paddingHorizontal: Spacing.four`. Inserting the header inside that SafeAreaView (as the
plan directs) indents it **2× Spacing.four** — visibly further right than on the other 10 screens.
Not an AC violation (ACs cover the *top* inset, not horizontal), and fixing it would be an
unapproved deviation. **Add to the step-20 walkthrough**; a one-line
`style={{ paddingHorizontal: 0 }}` on that screen's header is the likely fix.

### Minor notes (no action needed)
- **Step 6** lists imports for `tracking/[orderId]` as `router`/`ScreenHeader`/`SafeAreaView`/`useTheme`, but the same step's `mode={mode}` requires `useColorScheme` too — added.
- **Dead `title` options removed.** With `headerShown:false`, `options={{ title: 'X' }}` configures a header that never renders. Replaced with `options={{ headerShown: false }}` on all 11 entries; titles now live in each `<ScreenHeader>`. Within blast radius, no behavior change.
- **All plan line-number citations were accurate** (cart `:280`/`:317-320`/`:435-436`; checkout `:235`/`:252`/`:274`/`:284-287`/`:371`; branches `:137`/`:146`; deal `:84`; edit-profile `:79`; coming-soon `:34`/`:41-42`). No drift.

---

## What Was Skipped or Deferred

- **Steps 20 + 20b (Agent-Probe walkthrough) — NOT RUN.** Requires a physical device or simulator; no agent can perform it. This is the **only** proof path for AC1/AC2/AC3/AC5/AC6/AC7/AC8. Skipping it means those ACs are **UNPROVEN, not proven-by-omission**.
- **No new tests added** — the plan authorises none (see §Test Gate Outcomes).
- **`packages/ui` untouched** — the plan requires no change there, and none was needed.
- **`order/confirmation/[orderId].tsx` untouched** — see Discrepancy #2.
- **Nothing committed, no branch created** — per instruction.

---

## Test Infra Gaps Found

1. **AC1/AC3 (top inset + no-flush) across ~12 screens has ZERO automated proof.** No visual-regression or on-device tooling exists. This is the single largest risk in this change and is **not** laundered as automated anywhere in this report.
2. **`checkout.tsx` is not jest-testable** — the shared reanimated mock (`apps/mobile/src/test-utils/jest-setup.ts`) lacks `FadeIn`/`FadeOut`/`SlideInDown`/`SlideOutDown`; the screen crashes at render under jest. **AC6's 3-branch parity therefore has no automated fallback at all.** Pre-existing, out of scope, not fixed. Recommend extending the mock as a backlog item (already tracked in `all-tests.md` §Known Gaps).
3. **Header-render + `onBack` ARE automatable today and are not covered.** `apps/mobile` HAS a working jest/jest-expo component runner, and 4 in-scope screens already render under it. A `getByText('Cart')` + `fireEvent.press(getByLabelText('Go back'))` assertion is entirely feasible. The plan chose not to add them; recommend a backlog item. (Precise framing: jest could prove the header **renders with the right title and fires onBack** — it could **never** prove the header **sits below the status bar**.)
4. **The 4 in-scope jest suites do not guard this change's markup.** They assert data/branch-switching logic; they would pass even if `ScreenHeader` were omitted entirely. What they *do* prove (non-trivially) is that all 4 edited screens still **mount without crashing** under the new SafeAreaView/ScreenHeader tree.
5. **`branches/[branchId].tsx` has no dedicated jest suite** — `branches-screen.test.tsx` covers the branches *list*, not the detail screen. Agent-Probe-only for this screen.
6. **No E2E/navigation runner** (no Detox/Maestro/Playwright) — AC2/AC7 back-target behavior is unprovable automatically. Project-wide, pre-existing.
7. **`process/context/tests/all-tests.md` §Known Gaps (~L178) is STALE and WRONG.** It claims root `pnpm typecheck` is RED on mobile. I ran `pnpm --filter @jojopotato/mobile typecheck` **twice this session** (before and after my edits): **exit 0, zero errors** both times. Flag for UPDATE PROCESS to correct or timestamp-qualify.

---

## Blast-Radius Evidence — no out-of-scope file touched

`git diff --stat` is **useless for attribution here**: this change lands on **six stacked
uncommitted workstreams** (NAV-001, NAV-002, notifications tab-bar/back corrections,
`backBehavior`, `ScreenHeader`, and now NAV-003), so the repo-wide diff shows all of them. Used
file mtimes instead. **My session began ~11:38.**

**My 17 files — all mtime ≥ 11:41:**
`order/_layout.tsx` 11:41:49 · `branches/_layout.tsx` 11:42:00 · `account/_layout.tsx` 11:42:03 ·
`rewards/_layout.tsx` 11:42:07 · `deals/_layout.tsx` 11:42:13 · `cart.tsx` 11:43:15 ·
`checkout.tsx` 11:43:42 · `payment-method.tsx` 11:43:52 · `tracking/[orderId].tsx` 11:44:28 ·
`branches/[branchId].tsx` 11:45:29 · `coming-soon.tsx` 11:45:59 · `help.tsx` 11:46:05 ·
`edit-profile.tsx` 11:47:08 · `product/[productId].tsx` 11:47:07 · `history.tsx` 11:47:08 ·
`coupons.tsx` 11:47:08 · `deal/[dealId].tsx` 11:47:08

**Frozen / out-of-scope files — all mtime ≤ 11:01, i.e. predate my session entirely:**

| File | mtime | Owner |
|---|---|---|
| `floating-tab-bar.tsx` | 10:08:33 | NAV-001 (FROZEN) |
| `floating-tab-bar.helpers.ts` | 10:08:33 | NAV-001 (FROZEN — signature + `isNested` name) |
| `__tests__/floating-tab-bar.helpers.test.ts` | 10:08:33 | NAV-001 |
| `navigate-to-tracking.ts` | 10:03:12 | NAV-001 |
| `navigate-to-tracking.helpers.ts` | 10:02:53 | NAV-001 |
| `packages/ui/src/index.ts` | 11:01:17 | ScreenHeader workstream |
| `packages/ui/src/components/screen-header.tsx` | 10:58:37 | ScreenHeader workstream |
| `(tabs)/_layout.ios.tsx` | 10:53:33 | backBehavior workstream |
| `(tabs)/_layout.android.tsx` | 10:53:36 | backBehavior workstream |
| `(tabs)/notifications/index.tsx` | 10:59:12 | NAV-002 |
| `order/confirmation/[orderId].tsx` | 10:04:08 | (untouched — Discrepancy #2) |
| `(tabs)/index.tsx` | 10:08:34 | NAV-001 |
| `deals/index.tsx` | 07:36:50 | (untouched) |
| `menu/components/add-to-cart-bar.tsx` | 10:01:06 | NAV-001 |

**Conclusion: zero out-of-scope files touched.** `packages/ui/**` and all NAV-001-owned files are
untouched by this session — corroborated by `packages/ui` tests holding at exactly 67/67 and its
lint staying clean.

**Attribution warning:** because six device-unverified workstreams are stacked uncommitted on
`development`, any defect the eventual Agent-Probe walkthrough finds will be **hard to attribute**
to a single workstream. Recommend committing these in separate, labelled commits before the
walkthrough so a bisect is possible.

---

## Closeout Packet

- **Selected plan**: `process/general-plans/active/nav-003-screenheader-rollout_17-07-26/nav-003-screenheader-rollout_PLAN_17-07-26.md`
- **What was finished**: all 17 checklist file edits incl. VALIDATE-added 6b/7b/9b/17b (+ the unlabelled product-screen equivalent); all automated gates green; no out-of-scope file touched.
- **Verified vs unverified**: typecheck/lint/vitest/jest/ui/Prettier + the source-level inset math and the AC5 mechanism are **verified**. AC1/AC2/AC3/AC5-gesture/AC6/AC7/AC8 on-device are **UNVERIFIED** — steps 20/20b not run.
- **What remains**: (a) the Agent-Probe walkthrough (20 + 20b), mandatory per the plan's own Phase Completion Rules; (b) resolve Discrepancies #1, #2, #4; (c) `all-tests.md` L178 stale-line correction; (d) 3 recommended test-infra backlog items.
- **Closeout classification**: **`Keep in active/testing`.** The plan's Phase Completion Rules explicitly forbid marking VERIFIED on code-complete + automated-green alone. This is **CODE DONE**, not VERIFIED. **Do not archive.**
- **Follow-up plan stubs created**: none (no new plan file was authorised by this plan; recommendations are recorded here for UPDATE PROCESS to file as backlog notes).
- **CONTEXT_PARTIAL items**: none — all routed context files loaded and read.

---

## Forward Preview

### Test Infra Found
`apps/mobile` has **two** runners: vitest (pure-TS, node env, 51 tests) + jest/jest-expo (RN
component, 27 tests / 8 suites). `packages/ui` has jest-expo (67 tests / 25 suites). What does
**not** exist: any E2E/navigation runner, and any visual-regression tool. `checkout.tsx` is
un-jest-testable (reanimated layout-animation mock gap).

### Blast Radius Changes
17 files, all `apps/mobile` (16 under `src/app/(tabs)/**` + `src/components/coming-soon.tsx`).
Zero files outside `apps/mobile`. No API/schema/auth surface. No new dependency.
`ComingSoonProps` gained one optional additive prop (`onBack?`), app-local only.

### Commands to Stay Green
```
pnpm --filter @jojopotato/mobile typecheck   # exit 0, zero errors
pnpm --filter @jojopotato/mobile lint        # 0 errors (3 pre-existing warnings in scripts/)
pnpm --filter @jojopotato/mobile test        # vitest 51 + jest 27 (8 suites)
pnpm --filter @jojopotato/ui test            # 67 (25 suites)
pnpm --filter @jojopotato/ui lint            # clean
npx prettier --check <touched files only>    # never repo-wide (structurally RED, pre-existing CRLF)
```

### Dependency Changes
None.
