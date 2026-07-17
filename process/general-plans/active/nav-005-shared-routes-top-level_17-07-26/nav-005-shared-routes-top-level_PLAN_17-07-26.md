---
name: plan:nav-005-shared-routes-top-level
description: "COMPLEX plan — NAV-005: kill the cross-tab-push residue bug CLASS by moving all 7 shared screens out of tab-owned stacks into 4 top-level (tabs)/ route groups (cart/, product/, history/, branch/). Repoints 9 push sites + 3 test files. apps/mobile only."
date: 17-07-26
feature: none
---

# NAV-005 — Shared screens become top-level routes — PLAN (COMPLEX)

**Date**: 17-07-26
**Status**: VALIDATED — awaiting EXECUTE approval (no source file touched)
**Complexity**: COMPLEX
**Branch**: see §Blocker B1 — repo is NOT on the branch the brief assumed. Do NOT commit.
**Feature**: none (general-plans)
**SPEC**: `./nav-005-shared-routes-top-level_SPEC_17-07-26.md`

## TL;DR

Move 7 shared screens above the tabs into 4 new top-level route groups (`cart/`, `product/`,
`history/`, `branch/`), repoint 9 push sites + 3 test files, and add one
`useHideTabBarWhile(useIsFocused())` per moved screen. ~22 files, `apps/mobile` only, no
schema/auth/API. **Zero clearance math changes** and **zero `packages/ui` changes**. The fix
itself (no tab is ever stranded) is **Agent-Probe only and cannot be proven by any gate in this
repo** — honest exit is CODE DONE, not VERIFIED.

**Complexity: COMPLEX** — 7 route moves, 4 new layouts, 9 call-site repoints, 3 test repoints,
a cascade that must land atomically, and a naming collision with two existing tabs. This is not
a SIMPLE plan and must not be forced into one.

---

## Overview / Context

Third report of the same defect (Notifications → NAV-002, Tracking → NAV-004, now Cart). The
user asked for the **class** to be killed: *"pls make sure this kind of issue is not apear again
make it like in the notification and/or order fix"*. NAV-002 and NAV-004 each moved one screen;
this plan finishes the job for the remaining seven.

The design is **user-locked** (shared screens become top-level routes). Alternatives — fix Cart
only; make cross-tab links switch tabs — were presented and rejected. This plan settles mechanics.

### The durable ownership rule (the real deliverable)

> A tab's nested Stack owns ONLY its root plus screens reachable exclusively from that root.
> Any screen reachable from two or more places lives above the tabs, as a top-level `(tabs)/`
> route owned by no tab.

**Corollary (why the scope is 7, not 4):** once a screen is above the tabs, anything it pushes
*into* a tab is itself a cross-tab push. `cart` → `checkout` would recreate the bug one screen
later. The order flow moves together or not at all.

---

## Stale premises in the task brief — corrected from source, not worked around

| # | Brief claim | Source truth (verified 17-07-26) |
|---|---|---|
| B1 | "Branch `feat/nav-shell-screenheader` (already checked out)" | **False.** `git branch --show-current` → `feat/menu-004-category-filter-polish`; HEAD `a055bde`; ~20 modified `apps/admin` files unrelated to nav. `feat/nav-shell-screenheader` exists but is not checked out. **BLOCKER — resolve before EXECUTE.** |
| B2 | Only `deals-screens.test.tsx:105` pins a moved path | **Incomplete.** Also `features/cart/__tests__/cart-branch-switch.test.tsx:5` (`import CartScreen from '@/app/(tabs)/order/cart'`) and `features/menu/__tests__/product-branch-switch.test.tsx:5` (`import ProductDetailsScreen from '@/app/(tabs)/order/product/[productId]'`). |
| B3 | "check whether any moved screen is referenced in `notification-factory.ts`" | **None are.** Pins are `tracking/[orderId]`, `deals/deal/[dealId]`, `rewards/coupons`, `rewards` (`notification-factory.ts:75-82`). **No repoint needed there.** |
| B4 | `checkout.tsx:156 -> confirmation/[orderId] [verify push vs replace]` | **`router.replace`** (`:155`), not push. Back from confirmation pops to cart — pre-existing, unchanged by this move. |
| B5 | "`pnpm --filter @jojopotato/ui test` → **68** (must stay 68)" | **71** (26 suites). Verified by running. Gate is 71. |
| B6 | "preserve `useHideTabBarWhile` (countdown drawer) … exactly" | **Impossible + would be a bug.** `useHideTabBarWhile` (`floating-tab-bar.tsx:40-46`) writes a single module-level boolean via `setTabBarHidden`; two calls in one component race on effect + cleanup. Exactly ONE call per component. Correct resolution in Step 6. |
| B7 | "§2 Clearance … verify per screen" | **Verified: no math change anywhere.** With the bar hidden, `resolveTabBarClearance(true, …)` is already the correct branch. Comments only. |
| B8 | `all-tests.md` §Known Gaps — "root typecheck is RED" | **Stale/wrong.** `pnpm --filter @jojopotato/mobile typecheck` → exit 0, zero errors. Gate is absolute. |
| B9 | (not in brief) | **Naming collision.** `(tabs)/order` and `(tabs)/branches` are tab names. Moved screens **cannot** keep those folders. New folder names are mandatory — this is what forces the 4-group shape. |

---

## Mechanism (verified against installed source — not docs, not memory)

- `(tabs)/_layout.ios.tsx` / `_layout.android.tsx` declare exactly **5** `Tabs.Screen`
  (`index`, `order`, `rewards`, `branches`, `account`). Undeclared `(tabs)/` children
  auto-register as top-level routes. `deals`, `notifications`, `tracking` already rely on this.
- `floating-tab-bar.tsx:123-131` — `ICONS` has exactly those same 5 keys.
  `:314` — `if (!(route.name in ICONS)) return null;` filters any new folder from rendering a
  tab button. New groups need **zero** tab-bar changes.
- `floating-tab-bar.tsx:276-278` — `focusedTab = state.routes[state.index]`;
  `isFocusedTabNested = focusedTab != null && isNestedTabRoute(focusedTab)`. For a top-level
  route at its own stack root, `isNestedTabRoute` is **false** ⇒ the bar would become **visible**.
  ⇒ `useHideTabBarWhile(useIsFocused())` is load-bearing on every moved screen.
- `floating-tab-bar.helpers.ts` — `resolveTabBarClearance(isNested, footprint, insetsBottom)`
  returns `isNested ? insetsBottom : footprint + insetsBottom`. **FROZEN.**
- `(tabs)/_layout.{ios,android}.tsx` already set `backBehavior="history"`, so `router.back()`
  from a tab-sibling route returns to the calling tab. **No change needed.**

---

## Target route tree

```
(tabs)/
  index.tsx  order/  rewards/  branches/  account/   <- the 5 tabs (unchanged names)
  deals/  notifications/  tracking/                  <- already top-level (DO NOT TOUCH)

  cart/            <- NEW top-level group: the order flow
    _layout.tsx
    index.tsx                    (was order/cart.tsx)
    checkout.tsx                 (was order/checkout.tsx)
    payment-method.tsx           (was order/payment-method.tsx)
    confirmation/[orderId].tsx   (was order/confirmation/[orderId].tsx)
  product/         <- NEW
    _layout.tsx
    [productId].tsx              (was order/product/[productId].tsx)
  history/         <- NEW
    _layout.tsx
    index.tsx                    (was order/history.tsx)
  branch/          <- NEW (singular; `branches` is the tab)
    _layout.tsx
    [branchId].tsx               (was branches/[branchId].tsx)
```

**Why `cart/` groups four screens:** its root (cart) is reachable from 3 places → correctly
above the tabs. `checkout`/`payment-method`/`confirmation` are reachable **exclusively** from
that root's own chain → they correctly remain in that stack. The rule is satisfied and the
flow keeps a real back chain (checkout → back → cart is a stack pop, not a history hop).

**Why `branch/` (singular):** `(tabs)/branches` is a tab name; the folder cannot be reused.

---

## PER-SCREEN TABLE

| # | Current path | New path | Pushed by | Tab bar action | Clearance (inset counted once) | `_layout`? |
|---|---|---|---|---|---|---|
| 1 | `order/cart.tsx` | `cart/index.tsx` | `deals/deal/[dealId]:79` (cross), `order/index:60` (cross after move), `use-reorder:72` | **ADD** `useHideTabBarWhile(useIsFocused())` | **No change.** `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` at `:322` (`+ Spacing.four` restores `styles.content`) and `:440` (`+ Spacing.two` restores `styles.footer`). Bar hidden ⇒ `true` still correct. Inset from `resolveTabBarClearance` only; `SafeAreaView edges={['top']}`. Comments only. | shared `cart/_layout.tsx` |
| 2 | `order/checkout.tsx` | `cart/checkout.tsx` | `cart/index:446` (same stack) | **REPLACE** `useHideTabBarWhile(countdown !== null)` (`:171`) with `useHideTabBarWhile(useIsFocused())` — see B6 | **No change.** `:304` (`+ Spacing.four`), `:396` (`+ Spacing.two`), `:431` `insets.bottom + Spacing.four` (countdown drawer — its own source, untouched). 3 return branches (`:243`, `:261`, `:278`) each already carry `ScreenHeader` + `SafeAreaView` — preserve all. Comments only. | shared |
| 3 | `order/payment-method.tsx` | `cart/payment-method.tsx` | `cart/checkout:370` (same stack) | **ADD** | **No change.** No `resolveTabBarClearance` call. `SafeAreaView` is its only inset source (`:35-41`); `styles` `paddingBottom: Spacing.four` (`:75`) is breathing room. | shared |
| 4 | `order/confirmation/[orderId].tsx` | `cart/confirmation/[orderId].tsx` | `cart/checkout:155` — **`router.replace`** (B4) | **ADD** | **No change.** No `resolveTabBarClearance` call. Already headerless; 3 return branches (`:44`, `:54`, `:72`). | shared |
| 5 | `order/product/[productId].tsx` | `product/[productId].tsx` | `(tabs)/index:153` (cross), `order/index:36` (cross after move) | **ADD** | **No change.** No `resolveTabBarClearance` call; `insets.bottom + Spacing.four` is the single source (`:183` comment). 3 return branches (`:149`, `:162`, `:176`). | `product/_layout.tsx` |
| 6 | `order/history.tsx` | `history/index.tsx` | `account/index:91` (cross), `order/index:68` (cross after move) | **ADD** | **No change.** No `resolveTabBarClearance` call and no bottom CTA (`:96-98` comment). `paddingBottom: Spacing.six` (`:159`) stays. 4 return branches (`:41`, `:51`, `:66`, `:87`). | `history/_layout.tsx` |
| 7 | `branches/[branchId].tsx` | `branch/[branchId].tsx` | `(tabs)/index:145` (cross), `branches/index:112` (cross after move) | **ADD** | **No change.** `:176` `resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom) + Spacing.four`. Update the `:165` comment ("isNested hardcoded true: always pushed inside…") → hidden via `useHideTabBarWhile`. 3 return branches (`:102`, `:115`, `:147`). | `branch/_layout.tsx` |

**Clearance rule for EXECUTE:** do **not** change any number, any `resolveTabBarClearance`
argument, or the `isNested` param name. The `true` argument means "drop the bar footprint",
which remains correct because the bar stays hidden. Only the surrounding comment rationale
changes (from "always nested" to "hidden via `useHideTabBarWhile(useIsFocused())`").

---

## Touchpoints

### Created (8)
| File | Purpose |
|---|---|
| `apps/mobile/src/app/(tabs)/cart/_layout.tsx` | Stack, all `headerShown:false`; doc-comment mirroring `notifications/_layout.tsx` |
| `apps/mobile/src/app/(tabs)/product/_layout.tsx` | Stack, `headerShown:false` |
| `apps/mobile/src/app/(tabs)/history/_layout.tsx` | Stack, `headerShown:false` |
| `apps/mobile/src/app/(tabs)/branch/_layout.tsx` | Stack, `headerShown:false` |
| (4 moved screen files land via `git mv` — see Moved) | |

### Moved via `git mv` (7)
`order/cart.tsx`→`cart/index.tsx`; `order/checkout.tsx`→`cart/checkout.tsx`;
`order/payment-method.tsx`→`cart/payment-method.tsx`;
`order/confirmation/[orderId].tsx`→`cart/confirmation/[orderId].tsx`;
`order/product/[productId].tsx`→`product/[productId].tsx`;
`order/history.tsx`→`history/index.tsx`; `branches/[branchId].tsx`→`branch/[branchId].tsx`.

### Modified (11)
| File:line | Change |
|---|---|
| `(tabs)/order/_layout.tsx` | Remove the 6 non-index `Stack.Screen` entries; keep `index` only |
| `(tabs)/branches/_layout.tsx` | Remove the `[branchId]` `Stack.Screen`; keep `index` only |
| `(tabs)/order/index.tsx:36` | `/(tabs)/order/product/[productId]` → `/(tabs)/product/[productId]` |
| `(tabs)/order/index.tsx:60` | `/(tabs)/order/cart` → `/(tabs)/cart` |
| `(tabs)/order/index.tsx:68` | `/(tabs)/order/history` → `/(tabs)/history` |
| `(tabs)/index.tsx:145` | `/(tabs)/branches/[branchId]` → `/(tabs)/branch/[branchId]` |
| `(tabs)/index.tsx:153` | `/(tabs)/order/product/[productId]` → `/(tabs)/product/[productId]` |
| `(tabs)/branches/index.tsx:112` | `/(tabs)/branches/[branchId]` → `/(tabs)/branch/[branchId]` |
| `(tabs)/deals/deal/[dealId].tsx:79` | `/(tabs)/order/cart` → `/(tabs)/cart` |
| `(tabs)/account/index.tsx:91` | `/(tabs)/order/history` → `/(tabs)/history` |
| `features/orders/hooks/use-reorder.ts:72` | `/(tabs)/order/cart` → `/(tabs)/cart` |

### Modified — tests (3)
| File:line | Change |
|---|---|
| `features/deals/__tests__/deals-screens.test.tsx:105` | assertion `'/(tabs)/order/cart'` → `'/(tabs)/cart'` |
| `features/cart/__tests__/cart-branch-switch.test.tsx:5` | import `@/app/(tabs)/order/cart` → `@/app/(tabs)/cart` |
| `features/menu/__tests__/product-branch-switch.test.tsx:5` | import `@/app/(tabs)/order/product/[productId]` → `@/app/(tabs)/product/[productId]` |

**Total: ~22 files.**

### Read-only for context
`(tabs)/notifications/{_layout,index}.tsx`, `(tabs)/tracking/{_layout,[orderId]}.tsx`,
`components/floating-tab-bar.{tsx,helpers.ts}`, NAV-002/NAV-004 plans + reports.

---

## Public Contracts

| Contract | Change | Consumer impact |
|---|---|---|
| Route paths (7) | **CHANGED** — all 7 hrefs move | Internal callers repointed (11 files). **Deep-link consequence: any external deep link or stored push payload targeting an old path will 404.** `notification-factory.ts` pins **none** of the 7 (B3), so in-app notification routing is unaffected. Risk is limited to hand-built/external links. |
| `resolveTabBarClearance(isNested, footprint, insetsBottom)` | **UNCHANGED — FROZEN** | AC8 asserts zero diff |
| `useHideTabBarWhile(active)` | **UNCHANGED** (new callers only) | none |
| `@jojopotato/ui` `ScreenHeader` | **UNCHANGED** | none |
| API / schema / auth | **NONE** | none |

---

## Blast Radius

- **Packages:** `apps/mobile` **only**. `packages/ui` untouched (AC: ui stays 71).
- **Files:** ~22 (8 created incl. moves, 7 `git mv`, 11 modified, 3 of which are tests).
- **Risk class:** navigation-structure change. **Not** a high-risk class — no auth, billing,
  schema, migration, public API, container, or secret surface.
- **Blast-radius ceiling:** everything under `apps/mobile/src/app/(tabs)/` except the frozen
  list, plus 1 hook and 3 test files.

### Not-to-touch list (hard)
`(tabs)/notifications/**`, `(tabs)/tracking/**`, `(tabs)/deals/**` (except the one push at
`deal/[dealId].tsx:79`), `(tabs)/_layout.{ios,android,web}.tsx`, `components/floating-tab-bar.tsx`,
`components/floating-tab-bar.helpers.ts`, `packages/**`, `(staff)/**`, `(auth)/**`,
`(onboarding)/**`, the 5 tab root `index.tsx` files (except the 2 push lines in `(tabs)/index.tsx`),
`account/edit-profile`, `account/help`, `rewards/coupons`. No new dependencies. Web out of scope.

---

## Implementation Checklist

**Pre-condition — ✅ RESOLVED 17-07-26, EXECUTE may proceed:**

0. ~~**Resolve the branch.**~~ **RESOLVED — user chose to land NAV-005 on the current branch,
   `feat/menu-004-category-filter-polish`.**

   The blocker's premise is discharged: **PR #110 was MERGED** — commit
   `cb774e2 "Merge pull request #110 from potakaaa/feat/nav-shell-screenheader"` is in this
   branch's history, `git merge-base --is-ancestor feat/nav-shell-screenheader HEAD` returns true,
   and `git log HEAD..feat/nav-shell-screenheader` is empty (zero divergence). So **all of NAV-001
   → NAV-004 plus `ScreenHeader` are already present here** — `(tabs)/tracking/` and
   `(tabs)/notifications/` exist on this branch. This branch is a valid, up-to-date base; the
   nav-shell branch is now historical.

   **STILL BINDING — the working tree is dirty with ~135 unrelated files** (MENU-004/MENU-003
   work, `apps/admin`, `packages/api/src/db/seed`). Therefore:
   - **Do NOT commit.** The orchestrator handles commits; the user's other work must not be swept in.
   - **Do NOT stash, discard, revert, or `git add -A`** anything. Touch only the files this plan's
     Touchpoints name.
   - Prove scope at the end with `git status` / `git diff --stat`, and state explicitly that no
     MENU/admin/seed file was modified.

**Route groups (create layouts first so codegen has targets):**

1. Create `(tabs)/cart/_layout.tsx` — `<Stack screenOptions={{ headerShown: false }} />`.
   Doc-comment must state: top-level, not a tab; hidden from `FloatingTabBar` via the `ICONS`
   allowlist; lives above the tabs so `router.back()` returns to the calling tab; screens render
   the in-content `<ScreenHeader>` and own their top inset. Mirror `notifications/_layout.tsx`.
2. Create `(tabs)/product/_layout.tsx` — same shape.
3. Create `(tabs)/history/_layout.tsx` — same shape.
4. Create `(tabs)/branch/_layout.tsx` — same shape. Comment MUST note it is singular and
   distinct from the `branches` **tab**, to stop a future reader from merging them back.

**Move the order flow (atomic — steps 5-8 land together):**

5. `git mv "apps/mobile/src/app/(tabs)/order/cart.tsx" "apps/mobile/src/app/(tabs)/cart/index.tsx"`.
   Add `useIsFocused` to the `expo-router` import and `useHideTabBarWhile` to the
   `@/components/floating-tab-bar` import (`TAB_BAR_FOOTPRINT` already imported at `:20`).
   Add `useHideTabBarWhile(useIsFocused());` **above every early return** (Rules of Hooks).
   **Do not touch** the `resolveTabBarClearance` calls at `:322`/`:440` — update their comments
   only (bar hidden via the hook, not via "nested").
6. `git mv .../order/checkout.tsx .../cart/checkout.tsx`. **Replace** `useHideTabBarWhile(countdown !== null)`
   (`:171`) with `useHideTabBarWhile(useIsFocused());` — **one call only** (B6: the hook writes a
   single module boolean; two calls race). This is strictly stronger: hidden-while-focused ⊇
   hidden-while-countdown. **Leave the `countdown === null` footer conditional and all 3 return
   branches (`:243`/`:261`/`:278`) exactly as they are.** No clearance edits.
7. `git mv .../order/payment-method.tsx .../cart/payment-method.tsx`. Add the hook above returns.
8. `git mv ".../order/confirmation/[orderId].tsx" ".../cart/confirmation/[orderId].tsx"`.
   Add the hook above all 3 return branches (`:44`/`:54`/`:72`).

**Move the remaining shared screens:**

9. `git mv ".../order/product/[productId].tsx" ".../product/[productId].tsx"`. Add the hook above
   all 3 return branches (`:149`/`:162`/`:176`).
10. `git mv .../order/history.tsx .../history/index.tsx`. Add the hook above all 4 return
    branches (`:41`/`:51`/`:66`/`:87`).
11. `git mv ".../branches/[branchId].tsx" ".../branch/[branchId].tsx"`. Add the hook above all 3
    return branches (`:102`/`:115`/`:147`). Update the `:165` comment; **do not** change `:176`'s
    `resolveTabBarClearance(true, …)` call.

**Trim the vacated tab layouts:**

12. `(tabs)/order/_layout.tsx` — remove the `product/[productId]`, `cart`, `checkout`,
    `payment-method`, `confirmation/[orderId]`, `history` `Stack.Screen` entries. Keep `index`.
    Update the doc-comment: the Order tab now owns only its root; shared screens moved to
    top-level groups per the ownership rule.
13. `(tabs)/branches/_layout.tsx` — remove the `[branchId]` `Stack.Screen`. Keep `index`.
    Update the doc-comment likewise.

**Repoint every push call site (9):**

14. `(tabs)/order/index.tsx` — `:36` → `/(tabs)/product/[productId]`; `:60` → `/(tabs)/cart`;
    `:68` → `/(tabs)/history`.
15. `(tabs)/index.tsx` — `:145` → `/(tabs)/branch/[branchId]`; `:153` → `/(tabs)/product/[productId]`.
16. `(tabs)/branches/index.tsx:112` → `/(tabs)/branch/[branchId]`.
17. `(tabs)/deals/deal/[dealId].tsx:79` → `/(tabs)/cart`.
18. `(tabs)/account/index.tsx:91` → `/(tabs)/history`.
19. `features/orders/hooks/use-reorder.ts:72` → `/(tabs)/cart`.

**Repoint tests (3):**

20. `features/deals/__tests__/deals-screens.test.tsx:105` — assertion → `'/(tabs)/cart'`.
21. `features/cart/__tests__/cart-branch-switch.test.tsx:5` — import → `@/app/(tabs)/cart`.
22. `features/menu/__tests__/product-branch-switch.test.tsx:5` — import →
    `@/app/(tabs)/product/[productId]`.

**Regenerate typed routes + verify (do NOT skip; NAV-004 was burned here):**

23. Run `npx expo start --port 8082` (or any **free** port) from `apps/mobile`, wait for the
    route tree to be written, then stop it. **Verify it actually regenerated:** check
    `apps/mobile/.expo/types/router.d.ts` mtime changed AND
    `grep -c '(tabs)/cart' apps/mobile/.expo/types/router.d.ts` > 0 AND
    `grep -c '(tabs)/order/cart' apps/mobile/.expo/types/router.d.ts` == 0.
    **If `expo start` prints "Skipping dev server", the port was occupied and NOTHING was
    regenerated — retry on a free port.** **NEVER `as Href`-cast to silence a type error.**
24. Run all gates (see Verification Evidence). Fix any red before reporting.
25. Run the AC7 grep guard and the AC8 freeze check (both below). Both must be clean.
26. Prettier the touched files only, LF-normalized. Do **not** run repo-wide `format:check`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` → exit 0, zero errors (**absolute gate**, baseline verified 0) | Fully-Automated | AC9 + AC6 (a lost import/prop surfaces here) |
| `pnpm --filter @jojopotato/mobile test` → vitest **43**, jest **27** (baselines verified) | Fully-Automated | AC9; the 3 repointed test files must stay green |
| `pnpm --filter @jojopotato/ui test` → **71** (baseline verified — brief's "68" was wrong, B5) | Fully-Automated | AC9 — proves `packages/ui` untouched |
| `pnpm --filter @jojopotato/mobile lint` → 0 errors (3 pre-existing warnings in `scripts/dev-with-tunnel.mjs` are not ours) | Fully-Automated | AC9 |
| `grep -rn "(tabs)/order/cart\|(tabs)/order/checkout\|(tabs)/order/history\|(tabs)/order/payment-method\|(tabs)/order/confirmation\|(tabs)/order/product\|(tabs)/branches/\[branchId\]" apps/mobile/src` → **zero hits** | Fully-Automated | AC7 — no stale push path remains |
| `git diff -- apps/mobile/src/components/floating-tab-bar.helpers.ts apps/mobile/src/components/floating-tab-bar.tsx` → **empty** | Fully-Automated | AC8 — frozen surface untouched |
| `grep -c "useHideTabBarWhile" <each moved screen>` → exactly **1** per file | Fully-Automated | B6 guard — no double-call |
| Typed-routes codegen actually ran (mtime changed + new paths present + old paths absent in `router.d.ts`) | Fully-Automated | C5 — guards the NAV-004 silent no-op |
| Source review: every return branch of all 7 moved screens still renders `<ScreenHeader>` inside `<SafeAreaView edges={['top', …]}>` | Hybrid (agent reads all branches) | AC6 |
| **U1** Deals → Apply → Cart → back lands on Deals; Order tab shows its root | **Agent-Probe** | **AC1 — the actual fix. UNPROVABLE by gate.** |
| **U2/U3/U4** Home→Product→back; Home→Branch→back; Account→History→back — no tab stranded | **Agent-Probe** | **AC2. UNPROVABLE by gate.** |
| **U5** Cart→Checkout→Payment→back×3 pops in order | **Agent-Probe** | **AC3. UNPROVABLE by gate.** |
| **U6** History→Reorder→Cart→back returns to History | **Agent-Probe** | **AC4. UNPROVABLE by gate.** |
| **U7/U8** tab bar hidden on all 7 moved screens; checkout countdown unchanged | **Agent-Probe** | **AC5. UNPROVABLE by gate.** |

### Honest verification position

`apps/mobile` **has** a jest/jest-expo component runner and a vitest node runner. It has **no
E2E/navigation runner and no visual-regression tooling**. Navigator back-stack residue — the
entire point of this change — cannot be asserted by any gate in this repo. AC1–AC5 are
Agent-Probe only and remain **UNPROVEN** until the user walks them on-device.

**This bug class has been found by the user on-device three times and by automated gates zero
times.** The gates below prove the refactor did not break compilation or existing tests. They do
**not** prove the bug is fixed. Honest exit state: **CODE DONE, not VERIFIED.**

---

## Test Infra Improvement Notes

- **Standing project-wide gap:** no RN E2E/navigation runner exists, so no navigation regression
  (this class included) can be caught automatically. Tracked at
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. This plan is
  the third consecutive instance of the same class shipping without automated proof — worth
  citing as evidence next time that backlog item is prioritised.
- **Cheap partial mitigation (not in this plan's scope):** a jest render test could assert each
  moved screen calls `useHideTabBarWhile` exactly once. The `grep -c` gate above covers the same
  ground for free; a real test would additionally catch a wrong argument.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `useHideTabBarWhile` double-call in `checkout.tsx` silently races the tab bar | Step 6 replaces, never supplements; `grep -c` gate asserts exactly 1 per file |
| R2 | Typed-routes codegen silently no-ops on an occupied port (NAV-004 hit this) | Step 23's 3-part verification (mtime + new paths present + old paths absent); free port |
| R3 | A missed push site 404s at runtime, invisible to typecheck if cast | AC7 grep gate; `as Href` banned; typed routes make the correct paths compile-checked |
| R4 | Hook added below an early return → Rules-of-Hooks crash | Explicit per-screen return-branch line numbers in the per-screen table; lint gate |
| R5 | External deep link to an old path 404s | Called out in Public Contracts; `notification-factory.ts` verified clean (B3); no in-app pin remains |
| R6 | Wrong branch / unrelated `apps/admin` diff swept into the change | Step 0 blocker: resolve branch before touching a file; never stash the admin work |
| R7 | Someone later merges `branch/` back into the `branches` tab, reviving the class | `branch/_layout.tsx` doc-comment states the rule and the reason (Step 4) |

---

## Phase Completion Rules

This is a single-phase plan. It is complete only when **all** of the following hold:

| # | Rule |
|---|---|
| 1 | Step 0 (branch blocker) resolved with the user before any file is touched. |
| 2 | All 26 checklist steps done. Steps 5–8 (the order flow) landed **together** — a partial move recreates the bug one screen later and is a FAIL, not a partial pass. |
| 3 | Every Fully-Automated gate in Verification Evidence is green at its stated real number (typecheck exit 0; vitest 43; jest 27; ui 71; lint 0 errors; AC7 grep zero hits; AC8 diff empty; codegen verified). |
| 4 | No file on the Not-to-touch list appears in `git diff`. |
| 5 | An EXECUTE report is written to this task folder as `nav-005-shared-routes-top-level_REPORT_{date}.md`, recording real gate output (not restated expectations) and every deviation. |

**Status vocabulary (honest):**

- **CODE DONE** — rules 1–5 hold. **This is the maximum status EXECUTE may claim.** AC1–AC5
  (the actual fix) are Agent-Probe only and unproven by any gate in this repo.
- **VERIFIED** — CODE DONE **plus** the user has walked U1–U8 on-device and confirmed no tab is
  stranded. **Only the user can move this plan to VERIFIED.** No agent may claim it.

The task folder stays in `active/` until the user confirms the walkthrough. Do not archive on
CODE DONE. Do not commit.

---

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/general-plans/active/nav-005-shared-routes-top-level_17-07-26/nav-005-shared-routes-top-level_PLAN_17-07-26.md`
2. **Last completed phase/step:** VALIDATE complete; validate-contract written below. **No source
   file has been touched.** Checklist steps 0–26 all outstanding.
3. **Validate-contract status:** written (17-07-26) — see `## Validate Contract`.
4. **Supporting context loaded:** `process/context/all-context.md` (+ §Theming), `tests/all-tests.md`
   (its §Known Gaps typecheck-RED claim is stale — B8), NAV-002 plan/report, NAV-004 plan/report,
   `(tabs)/notifications/**` and `(tabs)/tracking/**` as templates, installed `expo-router@57.0.4`.
5. **Next step for a fresh agent:** resolve **Step 0 (branch blocker)** with the user first. Then
   execute steps 1–26 in order. The order flow (steps 5–8) must land together — a partial move
   recreates the bug one screen later. Do not commit. Do not touch the frozen list. Report
   **CODE DONE, not VERIFIED** — AC1–AC5 need a user walkthrough.

---

## Validate Contract

**Generated-by:** outer-pvl
**date:** 2026-07-17
**Date:** 17-07-26
**Plan:** `process/general-plans/active/nav-005-shared-routes-top-level_17-07-26/nav-005-shared-routes-top-level_PLAN_17-07-26.md`

### Gate: CONDITIONAL

0 FAILs / 2 CONCERNs (both accepted, see below) / 10 PASSes.

### Layer 1 dimensions

| Dimension | Status | Findings |
|---|---|---|
| Infra fit | PASS | Route-tree mechanism verified against installed `expo-router@57.0.4` and the live `floating-tab-bar.tsx` (`ICONS` 5 keys; `:314` filter; `:276-278` focus logic). `deals`/`notifications`/`tracking` are three shipped precedents for the same shape. Naming collision (B9) identified and designed around. |
| Test coverage | **CONCERN** | The 5 acceptance criteria that define the change (AC1–AC5) have **no automated tier available** — no RN E2E/navigation runner exists. Accepted as known-gap: documented in Verification Evidence, backlog note already exists, honest exit is CODE DONE. Compile/regression coverage is real (typecheck + 43 + 27 + 71 + lint + 3 mechanical greps). |
| Breaking changes | **CONCERN** | 7 route paths change. All 11 in-app callers enumerated and repointed; `notification-factory.ts` verified to pin none of them (B3). Residual: external/stored deep links to old paths 404. Accepted — no such link is known to exist, and the same risk was accepted and uneventful in NAV-002/NAV-004. |
| Security surface | PASS | No auth, billing, schema, migration, public API, container, secret, or trust-boundary surface. Navigation structure only. Not a high-risk class ⇒ no evidence pack required. |

### Layer 2 sections

| Section | Status | Notes |
|---|---|---|
| Route groups (steps 1–4) | PASS | 4 new folders; all names collision-free against the 5 `ICONS` keys; no tab-bar change needed. |
| Order-flow move (steps 5–8) | PASS | Edit targets uniquely matchable. Highest-risk edit is step 6 (`useHideTabBarWhile` replace-not-add) — mitigated by an explicit `grep -c == 1` gate. Steps 5–8 must land atomically; called out in the checklist and handoff. |
| Remaining moves (steps 9–11) | PASS | Per-screen return-branch line numbers verified from source; hook placement above early returns specified per file. |
| Layout trims (steps 12–13) | PASS | Both `_layout` files keep `index`; entries to remove are exact. |
| Call-site repoints (steps 14–19) | PASS | All 9 sites grep-verified at the stated lines. AC7 grep gate catches a miss. |
| Test repoints (steps 20–22) | PASS | 3 files; B2 caught the 2 the brief missed. Suites must stay 43/27. |
| Codegen + gates (steps 23–26) | PASS | Step 23's 3-part verification closes the NAV-004 silent-no-op hole. Baselines are real, not inherited from the brief (B5/B8 corrected by running). |

### Plan updates applied at VALIDATE

| # | Change | Why |
|---|---|---|
| P1 | Added the `grep -c "useHideTabBarWhile" == 1` gate | Makes the R1 double-call risk mechanically caught, not review-caught |
| P2 | Added the 3-part codegen verification to step 23 | The NAV-004 silent no-op is a known, repeated failure |
| P3 | Added the `git diff` freeze check on the tab-bar files | AC8 was assertable but unasserted |
| P4 | Corrected all baselines by running them (ui 71 not 68; typecheck green not RED) | Brief and `all-tests.md` were both wrong |

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | **STOP before step 1.** Confirm the target branch with the user. Repo is on `feat/menu-004-category-filter-polish` with an unrelated dirty `apps/admin` tree. Never stash or discard that work. | Entry |
| E2 | Use `git mv`, not delete+create, for all 7 moves — preserves history and makes the diff reviewable. | Steps 5–11 |
| E3 | In `checkout.tsx`, `useHideTabBarWhile` must appear **exactly once** after your edit. If you find yourself writing a second call, stop — you have misread B6. | Step 6 |
| E4 | Do not change any `resolveTabBarClearance` argument, number, or param name. If a clearance value looks wrong, that is a separate plan — record it, do not fix it. | Steps 5–11 |
| E5 | If `expo start` prints "Skipping dev server", the route tree was NOT regenerated. Retry on a free port. Never `as Href`-cast to silence a resulting type error — a type error there means a real 404. | Step 23 |
| E6 | Report real gate numbers. If a number differs from this contract, report the difference — do not restate the expected value. | Step 24 |
| E7 | Exit as **CODE DONE, not VERIFIED**. AC1–AC5 require a user on-device walkthrough. Do not claim the bug is fixed. | Exit |

### Test gates

```bash
pnpm --filter @jojopotato/mobile typecheck    # exit 0, ZERO errors (absolute)
pnpm --filter @jojopotato/mobile test         # vitest 43, jest 27
pnpm --filter @jojopotato/ui test             # 71 (proves packages/ui untouched)
pnpm --filter @jojopotato/mobile lint         # 0 errors

# AC7 — no stale push path
grep -rn "(tabs)/order/cart\|(tabs)/order/checkout\|(tabs)/order/history\|(tabs)/order/payment-method\|(tabs)/order/confirmation\|(tabs)/order/product\|(tabs)/branches/\[branchId\]" apps/mobile/src   # expect: no matches

# AC8 — frozen surface
git diff -- apps/mobile/src/components/floating-tab-bar.helpers.ts apps/mobile/src/components/floating-tab-bar.tsx   # expect: empty

# B6 guard — exactly one hook call per moved screen
grep -c "useHideTabBarWhile" "apps/mobile/src/app/(tabs)/cart/index.tsx" "apps/mobile/src/app/(tabs)/cart/checkout.tsx"   # expect: 1 each (imports counted — expect 2 incl. import line; assert no THIRD)

# Codegen actually ran
grep -c '(tabs)/cart' apps/mobile/.expo/types/router.d.ts        # expect: > 0
grep -c '(tabs)/order/cart' apps/mobile/.expo/types/router.d.ts  # expect: 0
```

Prettier: touched files ONLY, LF-normalized. Repo-wide `format:check` is structurally RED
(~138 files, pre-existing CRLF) — **not ours, do not attempt to fix.**

### Open gaps carried into EXECUTE

| Gap | Disposition |
|---|---|
| AC1–AC5 have no automated tier (no RN E2E/navigation runner) | **Accepted known-gap.** Backlog note exists (`mobile-e2e-navigation-harness_NOTE_09-07-26.md`). Exit is CODE DONE. |
| External deep links to the 7 old paths would 404 | **Accepted.** No known consumer; `notification-factory.ts` pins none. Same risk accepted uneventfully in NAV-002/NAV-004. |
| Branch is unresolved (B1) | **Blocker, not a gap.** E1 gates EXECUTE on it. |

### Strategy recommendation for EXECUTE

**Sequential — 1 agent (opus).** Score 2/7 (S1 no — one package; S2 no; S3 no — design locked;
S4 no; S5 no; S6 no — not a high-risk class; **S7 yes** — 22 files; **plus** the atomic-cascade
constraint). Parallel subagents are **wrong here**: the 7 moves share `order/_layout.tsx`, the
route tree, and one codegen step — agents would collide, and a partial move recreates the bug.
Agent-team adds coordination cost with nothing to coordinate. Cost guard: not triggered.
