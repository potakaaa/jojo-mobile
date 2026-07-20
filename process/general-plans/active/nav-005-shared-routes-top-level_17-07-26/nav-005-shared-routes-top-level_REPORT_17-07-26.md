---
name: report:nav-005-shared-routes-top-level
description: "EXECUTE report — NAV-005: 7 shared screens moved out of tab-owned stacks into 4 top-level (tabs)/ route groups (cart/, product/, history/, branch/). 9 push sites + 3 tests repointed. All automated gates green. AC1-AC5 remain Agent-Probe-only — exit is CODE DONE, not VERIFIED."
date: 17-07-26
metadata:
  node_type: memory
  type: report
  feature: none
  phase: EXECUTE
---

# NAV-005 — EXECUTE Report

**Date**: 17-07-26
**Plan**: `./nav-005-shared-routes-top-level_PLAN_17-07-26.md`
**Branch**: `feat/menu-004-category-filter-polish` (unchanged; **nothing committed**)
**Status**: **CODE DONE — NOT VERIFIED**

## TL;DR

All 26 checklist steps done. 7 screens moved above the tabs via `git mv`, 4 new top-level
layouts created, 9 push sites + 3 test files repointed. Every Fully-Automated gate is green at
its real number (typecheck 0 errors; vitest 43; jest 27; ui 71; lint 0 errors; AC7 grep 0 hits;
AC8 diff 0 bytes). **AC1–AC5 — the actual bug fix — have zero automated proof and are unproven
until the user walks U1–U8 on-device.**

**3 deviations** (all recorded below, none hard-stop). **2 plan-premise errors found and
reported rather than worked around** — one of them means the plan's codegen gate was *vacuous*
and would have passed even if codegen never ran.

---

## Per-checklist-step outcome

| Step | Outcome |
|---|---|
| 0 — branch blocker | **Discharged before starting.** PR #110 merged (`cb774e2`); `git merge-base --is-ancestor feat/nav-shell-screenheader HEAD` → true. NAV-001→004 + `ScreenHeader` present. Nothing committed, nothing stashed. |
| 1–4 — 4 layouts created | Done. `cart/`, `product/`, `history/`, `branch/_layout.tsx`, each `<Stack screenOptions={{ headerShown: false }} />`, mirroring `notifications/_layout.tsx`. `branch/_layout.tsx` carries the singular-vs-`branches`-tab warning (R7). |
| 5–8 — order flow moved | Done, **atomically**. All 4 `git mv`d together; hook added to each. |
| 9–11 — product / history / branch moved | Done via `git mv`; hook added above every early return. |
| 12–13 — layouts trimmed | Done. `order/_layout.tsx` 7 `Stack.Screen` → 1 (`index`); `branches/_layout.tsx` 2 → 1. Both doc-comments now state the ownership rule. |
| 14–19 — 9 push sites repointed | Done. All 9 verified by AC7 grep (0 hits). |
| 20–22 — 3 tests repointed | Done. |
| 23 — codegen | **Done and genuinely verified** — see §Codegen. Required deleting the stale tree and using a free port; plan's own verification greps were broken (§Plan-premise errors). |
| 24 — gates | Done. Real output in §Gate output. One real failure found and fixed (§Deviation 1). |
| 25 — AC7 grep + AC8 freeze | Both clean. AC7 = 0 hits; AC8 = 0 bytes. |
| 26 — Prettier touched files only | Done — all 24 touched files already conform; **no `--write` needed**, repo-wide `format:check` never run. |

---

## Per-screen verification table

Inset counted **exactly once** on every screen; no clearance number, argument, or the `isNested`
param name changed anywhere (comments only).

| # | Old path | New path | Pushers repointed | Bar hidden | Inset source (counted once) |
|---|---|---|---|---|---|
| 1 | `order/cart.tsx` | `cart/index.tsx` | `deals/deal/[dealId]:79`, `order/index:60`, `use-reorder:72` | ADD `useHideTabBarWhile(useIsFocused())` | 2× `resolveTabBarClearance(true,…)` (unchanged); `SafeAreaView edges={['top']}` |
| 2 | `order/checkout.tsx` | `cart/checkout.tsx` | `cart/index:446` (same stack) | **REPLACED** countdown-gated call (B6) | 2× `resolveTabBarClearance(true,…)` (unchanged); drawer keeps own `insets.bottom` |
| 3 | `order/payment-method.tsx` | `cart/payment-method.tsx` | `cart/checkout:370` | ADD | `SafeAreaView edges={['top','bottom']}` — only source (no clearance call) |
| 4 | `order/confirmation/[orderId].tsx` | `cart/confirmation/[orderId].tsx` | `cart/checkout:155` (**`router.replace`**, B4) | ADD | `SafeAreaView edges={['top','bottom']}` — only source |
| 5 | `order/product/[productId].tsx` | `product/[productId].tsx` | `(tabs)/index:153`, `order/index:36` | ADD | `AddToCartBar` sibling owns `insets.bottom`; `edges={['top']}` |
| 6 | `order/history.tsx` | `history/index.tsx` | `account/index:91`, `order/index:68` | ADD | `SafeAreaView edges={['top','bottom']}` — only source |
| 7 | `branches/[branchId].tsx` | `branch/[branchId].tsx` | `(tabs)/index:145`, `branches/index:112` | ADD | 1× `resolveTabBarClearance(true,…)` (unchanged); `edges={['top']}` |

**`ScreenHeader` + top inset preserved in every return branch** (source-reviewed, AC6): cart (1
main + conditional sub-branches), checkout (3: `:243`/`:261`/`:278`), payment-method (1),
confirmation (3), product (3), history (4), branch (3). `checkout.tsx`'s `countdown === null`
footer conditional is byte-for-byte unchanged.

**B6 guard — exactly one hook CALL per screen** (precise `grep -cE "^\s*useHideTabBarWhile\("`):

```
cart/index.tsx : 1    cart/checkout.tsx : 1    cart/payment-method.tsx : 1
cart/confirmation/[orderId].tsx : 1    product/[productId].tsx : 1
history/index.tsx : 1    branch/[branchId].tsx : 1
```

Every call sits **above all early returns** (Rules of Hooks).

---

## Grep-zero result for old paths (AC7)

```
$ grep -rn "(tabs)/order/cart\|(tabs)/order/checkout\|(tabs)/order/history\|\
(tabs)/order/payment-method\|(tabs)/order/confirmation\|(tabs)/order/product\|\
(tabs)/branches/\[branchId\]" apps/mobile/src
[AC7 hits: 0 — expect 0]
```

**PASS.** Note this required one file the plan did not enumerate — see Deviation 2.

---

## Codegen — did it genuinely run?

**Yes, verified — and the plan's own verification for this step was broken.**

The user's dev server was already running on **port 8081** (PID 12608 = `expo/bin/cli start
--port 8081`) — the exact NAV-004 trap. Used free ports (8082/8083); logs show
`Waiting on http://localhost:8082` / `:8083`, never `Skipping dev server`.

Simply running `expo start` was **not sufficient**: the first run rewrote `router.d.ts` with an
identical 19,118-byte stale union (mtime moved, content unchanged). Deleting the file first and
regenerating produced a clean **15,750-byte** tree.

| Evidence | Before | After clean regen |
|---|---|---|
| mtime | 16:10:03 | **16:21:33** (changed) |
| size | 19,118 B | **15,750 B** (stale routes purged) |
| all 7 NEW paths present | partial | **yes** (`/(tabs)/cart` ×3, `/(tabs)/history` ×3, `cart/checkout` ×4, `cart/payment-method` ×4, `cart/confirmation/[orderId]` ×3, `product/[productId]` ×3, `branch/[branchId]` ×3) |
| all 7 OLD paths absent | no (4× `order/cart`, 3× `branches/[branchId]`) | **yes — 0 each** |
| tab roots `/(tabs)/order`, `/(tabs)/branches` survive | yes | **yes** (×3 each) |

**No `as Href` cast was used anywhere.**

### Live environmental hazard (not a code defect) — needs the user

The user's long-running 8081 dev server holds a **stale in-memory route map** (its watcher
missed the renames) and periodically rewrites `router.d.ts` with a union of old + new routes —
including routes for files that no longer exist. Reproduced deterministically:

| Route tree | Old routes | `pnpm --filter @jojopotato/mobile typecheck` |
|---|---|---|
| Clean full-scan regen (15,750 B) | 0 | **exit 0** |
| Stale 8081 rewrite (19,118 B) | 7 (deleted files) | **fails** — `'/(tabs)/cart'` not assignable |

The clean regen is authoritative (it collapses `cart/index.tsx` → `/(tabs)/cart`, exactly as
`order/index.tsx` → `/(tabs)/order` already works, and exactly the path the plan specifies).
A map listing deleted files is definitively stale.

**Impact: none on the deliverable** — `.expo/` is gitignored (`.gitignore:9`), so this file is
not part of any diff. **Action for the user: restart the 8081 dev server** and the tree
self-corrects. If typecheck is ever seen red on this branch, regenerate the tree before
believing it.

---

## Gate output (REAL, as run)

| Gate | Expected | **Actual** | Verdict |
|---|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | exit 0, zero errors | `TYPECHECK_EXIT=0`, no diagnostics | **PASS** (against clean route tree; see hazard above) |
| `pnpm --filter @jojopotato/mobile test` (vitest) | 43 | `Test Files 4 passed (4)` / `Tests 43 passed (43)` | **PASS** |
| `pnpm --filter @jojopotato/mobile test` (jest) | 27 | `Test Suites: 8 passed, 8 total` / `Tests: 27 passed, 27 total` | **PASS** |
| `pnpm --filter @jojopotato/ui test` | 71 | `Test Suites: 26 passed, 26 total` / `Tests: 71 passed, 71 total` | **PASS** — proves `packages/ui` untouched (confirms B5: 71, brief's "68" was wrong) |
| `pnpm --filter @jojopotato/mobile lint` | 0 errors | `✖ 3 problems (0 errors, 3 warnings)` — all 3 in `scripts/dev-with-tunnel.mjs` | **PASS** (warnings pre-existing, not ours) |
| AC7 grep | 0 hits | 0 hits | **PASS** |
| AC8 `git diff` tab-bar files | empty | **0 bytes** | **PASS** |
| B6 hook call count | 1 per screen | 1 × 7 screens | **PASS** |
| Codegen verified | tree changed | 19,118 → 15,750 B, old purged | **PASS** |
| Prettier (touched files only) | clean | `All matched files use Prettier code style!` | **PASS** |

Baseline typecheck was also run **before** any edit: exit 0 — independently confirming **B8**
(`all-tests.md` §Known Gaps' "root typecheck is RED" claim is **stale and wrong**).

---

## Plan deviations

### Deviation 1 — `jest-setup.ts` needed `useIsFocused` (not in Touchpoints) — REAL failure, fixed

**What:** Added `useIsFocused: () => true` to the shared `expo-router` mock in
`apps/mobile/src/test-utils/jest-setup.ts` (+ doc-comment).

**Why:** Not cosmetic — the plan's mandated `useHideTabBarWhile(useIsFocused())` broke 6 jest
tests across 2 suites with a **real** error:
`TypeError: (0 , _expoRouter.useIsFocused) is not a function`. The repo's shared expo-router
stub (`jest-setup.ts:55`) never had `useIsFocused`. The plan enumerated the 3 test files that
*pin paths* but not this one, because the need only appears once the hook is added.

**Why here and not per-test:** it is the single shared stub every screen test uses (DRY, and it
covers all 7 moved screens at once). Stubbed `true` because a screen being rendered by a test is
the focused screen — which is also the branch that exercises the hide path.

**Impact:** test-infra only; no production code. jest returned to exactly its 27 baseline.

### Deviation 2 — `use-deal.ts:8` doc-comment repointed (not in Touchpoints)

**What:** `(tabs)/order/cart.tsx` → `(tabs)/cart/index.tsx` in a doc-comment.

**Why:** The plan's Modified list enumerates *push sites*, so it missed this. But the AC7 gate is
a **raw string match** and would have failed on it — and the reference is stale after the move
regardless. Comment-only; zero behavior change.

### Deviation 3 — 2 extra stale comment references corrected

`product/[productId].tsx` (`../_layout.tsx` → `./_layout.tsx`, since the layout is now a sibling)
and `branch/[branchId].tsx` (`order/cart, order/checkout` → `cart/index, cart/checkout`).
Comment-only; both were made false by the move.

**Not a deviation, explicitly verified:** no `resolveTabBarClearance` argument, number, or the
`isNested` param name changed (AC8 = 0 bytes). Only comment rationale changed, per plan.

---

## Plan-premise errors found (reported, not worked around)

| # | Plan claim | Source truth |
|---|---|---|
| **P1** | Step 23 / Test gates: verify codegen via `grep -c '(tabs)/cart' router.d.ts` > 0 and `grep -c '(tabs)/order/cart' router.d.ts` == 0 | **The gate is vacuous — it can never pass, and never fails.** The tree writes paths as `` `${'/(tabs)'}/cart/index` ``, so the literal substring `(tabs)/cart` **never appears**: *both* greps always return 0. "new > 0" therefore always fails, and "old == 0" always passes — it would have reported clean even if codegen never ran, i.e. it does **not** close the NAV-004 hole it was written for (VALIDATE P2). Correct form must match `(tabs)'}/cart`. Used the corrected greps; results in §Codegen. |
| **P2** | Test gates: `grep -c "useHideTabBarWhile" <file>` → "expect 1 each (imports counted — expect 2 incl. import line; assert no THIRD)" | **Naive — cannot distinguish a double-call.** It counts the import line *and* any comment mentioning the hook, so the count is not a call count. (The template it copies, `notifications/index.tsx`, would itself score >2.) Used a precise call-site gate instead: `grep -cE "^\s*useHideTabBarWhile\("` → exactly 1 per screen. |

Both are gate-quality defects, not code defects. **B5 (ui=71) and B8 (typecheck green) were
re-confirmed correct by running.** B2/B3/B4/B7/B9 all held as the plan stated.

---

## Which tests were updated and why

| File | Change | Why |
|---|---|---|
| `features/deals/__tests__/deals-screens.test.tsx:105` | assertion `'/(tabs)/order/cart'` → `'/(tabs)/cart'` | Pins the Deals→Cart push path, which moved. Without it the assertion tests a dead route. |
| `features/cart/__tests__/cart-branch-switch.test.tsx:5` | import `@/app/(tabs)/order/cart` → `@/app/(tabs)/cart` | Imports the moved module; would not resolve otherwise. |
| `features/menu/__tests__/product-branch-switch.test.tsx:5` | import `@/app/(tabs)/order/product/[productId]` → `@/app/(tabs)/product/[productId]` | Same. |
| `test-utils/jest-setup.ts` | added `useIsFocused` to shared mock | Deviation 1 — real `TypeError`, 6 tests failing. |

No test was weakened, skipped, or deleted. Counts are unchanged from baseline (vitest 43,
jest 27) — the suites still assert the same behavior, now against the new paths.

---

## Honest per-AC tiers

| AC | Tier | Status |
|---|---|---|
| **AC1** Deals→Cart→back lands on Deals; Order tab shows root | **Agent-Probe** | **UNPROVEN** — no automated tier exists |
| **AC2** U2/U3/U4 — no tab stranded from any cross-tab entry | **Agent-Probe** | **UNPROVEN** |
| **AC3** U5 — order-flow back chain pops in order | **Agent-Probe** | **UNPROVEN** |
| **AC4** U6 — reorder→Cart→back returns to History | **Agent-Probe** | **UNPROVEN** |
| **AC5** U7/U8 — bar hidden on all 7; countdown unchanged | **Agent-Probe** | **UNPROVEN** (structural evidence only: 1 hook call/screen, focus-gated) |
| AC6 no lost `ScreenHeader`/top inset in any branch | Hybrid (source review + typecheck) | **PASS** |
| AC7 no stale push path | Fully-Automated | **PASS** — 0 hits |
| AC8 `resolveTabBarClearance` frozen | Fully-Automated | **PASS** — 0 bytes |
| AC9 all gates green at real baselines | Fully-Automated | **PASS** |

**AC1–AC5 are the entire point of this change and have ZERO automated proof.** `apps/mobile` has
a jest/jest-expo component runner and a vitest node runner, but **no E2E/navigation runner and no
visual-regression tooling** — navigator back-stack residue cannot be asserted by any gate in this
repo. This bug class has been found by the user on-device three times and by automated gates zero
times. The gates above prove the refactor did not break compilation or existing tests. They do
**not** prove the bug is fixed.

**Maximum claimable status per the plan's own Phase Completion Rules: CODE DONE, not VERIFIED.**

---

## Test Infra Gaps Found

1. **No RN E2E/navigation runner** (standing, project-wide). The sole reason AC1–AC5 are
   unprovable. Third consecutive instance of this class shipping without automated proof —
   concrete evidence for prioritising
   `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`.
2. **The codegen gate as specified was vacuous** (P1) — a verification step intended to catch the
   NAV-004 silent no-op that could not have caught it. Corrected form recorded above; worth
   copying into any future route-moving plan.
3. **The `grep -c useHideTabBarWhile` gate cannot count calls** (P2) — use `^\s*useHideTabBarWhile\(`.
4. **A long-running expo dev server silently corrupts `router.d.ts`** with a stale route map
   containing deleted routes, making typecheck fail on correct code (or, worse, pass on a missed
   repoint). New durable gotcha: regenerate the tree from a deleted file with no other expo server
   running before trusting typecheck on any route move.
5. **Cheap unclaimed mitigation** (not in scope): a jest render test asserting each moved screen
   calls `useHideTabBarWhile` exactly once with `useIsFocused()` would catch a wrong argument,
   which the grep gate cannot.

---

## Scope proof — no MENU / admin / api / seed file touched

`git status --porcelain` flags many files ` M` that have **zero content diff** — a stat-cache /
CRLF artifact (`core.autocrlf = true`, no `.gitattributes`; the whole working tree is CRLF).
Verified explicitly: every not-to-touch file is **0 bytes of diff** —
`_layout.{ios,android,web}.tsx`, `notifications/{_layout,index}.tsx`,
`tracking/{_layout,[orderId]}.tsx`, `deals/_layout.tsx`, `rewards/{_layout,coupons}.tsx`,
`account/{_layout,edit-profile,help}.tsx`, and both frozen tab-bar files.

`git diff --numstat` (real content changes only):

```
apps/mobile — 20 files:
 1  1  (tabs)/account/index.tsx              25  8  (tabs)/branch/[branchId].tsx
12  4  (tabs)/branches/_layout.tsx            1  1  (tabs)/branches/index.tsx
37 14  (tabs)/cart/checkout.tsx              15  1  (tabs)/cart/confirmation/[orderId].tsx
34 14  (tabs)/cart/index.tsx                 11  1  (tabs)/cart/payment-method.tsx
 1  1  (tabs)/deals/deal/[dealId].tsx        15  1  (tabs)/history/index.tsx
 2  2  (tabs)/index.tsx                      22 18  (tabs)/order/_layout.tsx
 3  3  (tabs)/order/index.tsx                16  2  (tabs)/product/[productId].tsx
 1  1  features/cart/__tests__/cart-branch-switch.test.tsx
 1  1  features/deals/__tests__/deals-screens.test.tsx
 1  1  features/deals/hooks/use-deal.ts
 1  1  features/menu/__tests__/product-branch-switch.test.tsx
 1  1  features/orders/hooks/use-reorder.ts
10  2  test-utils/jest-setup.ts

untracked (new): (tabs)/{cart,product,history,branch}/_layout.tsx

OUTSIDE apps/mobile — 1 file:
 3  1  packages/api/src/db/seed/seed.ts     <-- PRE-EXISTING user work, present in the
                                                session-start git snapshot; never opened by me.
```

**Every `apps/mobile` change is a plan Touchpoint** (plus the 3 documented deviations).
`apps/admin` content diff = **0 bytes**. No MENU, `apps/admin`, `packages/api`, or seed file was
modified by this session. **Nothing was committed, stashed, discarded, reverted, or `git add`ed.**
All 7 moves used `git mv` (history preserved — shown as `RM` renames).

---

## Closeout packet

- **Selected plan:** `process/general-plans/active/nav-005-shared-routes-top-level_17-07-26/nav-005-shared-routes-top-level_PLAN_17-07-26.md`
- **Finished:** all 26 steps; 7 moves + 4 layouts + 9 push repoints + 3 test repoints; the
  ownership rule is now documented in `order/_layout.tsx`, `branches/_layout.tsx`, and all 4 new
  layouts (R7 mitigation against a future re-merge).
- **Verified:** compilation and regression only — typecheck 0, vitest 43, jest 27, ui 71, lint 0
  errors, AC7 0 hits, AC8 0 bytes, B6 1-call-per-screen, codegen clean.
- **Still unverified:** **AC1–AC5** (U1–U8 on-device walkthrough) — the actual fix.
- **Remaining cleanup:** user should restart the 8081 expo dev server (stale route map).
- **Single best next state:** **Keep in `active/`.** Do not archive; do not commit. The plan's own
  rules reserve VERIFIED for the user's walkthrough.

**Classification: `Keep in active/testing`.**

---

## Next step for the user (U1–U8)

1. **Restart the dev server on 8081** (its route map is stale — see §Codegen hazard).
2. Walk: **U1** Deals→Apply→Cart→back (lands on Deals; Order tab shows its root) · **U2** Home→
   Product→back · **U3** Home→Branch→back · **U4** Account→History→back · **U5** Cart→Checkout→
   Payment→back×3 · **U6** History→Reorder→Cart→back · **U7** tab bar hidden on all 7 moved
   screens · **U8** checkout countdown drawer unchanged.
3. If U1–U8 pass, the plan may move to **VERIFIED** — only the user can make that call.
