---
name: report:nav-004-tracking-top-level-route
description: "EXECUTE report — NAV-004: Order Tracking moved to a top-level (tabs)/tracking/ route. All 12 checklist steps applied. All automated gates green. CODE DONE, not VERIFIED — AC1-AC4 are Agent-Probe."
date: 17-07-26
metadata:
  node_type: memory
  type: report
  feature: none
  phase: EXECUTE
---

# NAV-004 — Order Tracking as a top-level route — EXECUTE REPORT

**Date**: 17-07-26
**Plan**: `./nav-004-tracking-top-level-route_PLAN_17-07-26.md`
**Branch**: `feat/nav-shell-screenheader` (PR #110) — **nothing committed** (E3 honored)
**Status**: **CODE DONE — NOT VERIFIED**

**TL;DR** — All 12 checklist steps applied as written. All automated gates green: typecheck **0 errors**,
vitest **43**, jest **27**, ui **68**, lint **0 errors**, grep-zero clean, rename preserved. **One plan
error found and reported rather than worked around: the expected vitest count is 43, not 42** — the
deleted suite had 8 tests, not the 9 the plan claimed. The actual bug (AC1/AC2) has **zero automated
proof** and remains unverified pending the user's on-device walkthrough.

---

## Deviation summary

| # | Deviation | Class | Action |
|---|---|---|---|
| D1 | **Plan's expected vitest count (42) is arithmetically wrong — correct is 43** | Reported, not worked around | See §D1 below |
| D2 | SPEC AC7 says `edges={['top']}`; PLAN step 5/6 + source say `edges={['top','bottom']}` | Reported; followed PLAN | See §D2 below |
| D3 | Fixed a now-stale doc-comment path (`../_layout.tsx` → `./_layout.tsx`) inside the moved file | Within blast radius | See §D3 below |

No hard-stop-class deviation occurred. No schema/auth/API/billing/container surface was touched.

### D1 — The plan's expected vitest count is wrong (42 → actually 43)

The plan (§"Expected vitest count drop", E5) and the task brief both pre-declared **vitest 51 → 42**,
on the stated basis that `navigate-to-tracking.test.ts` held **9** `buildTrackingResetAction` cases.

**It holds 8.** Verified two independent ways *before* any file was touched:

```
✓ src/features/orders/lib/__tests__/navigate-to-tracking.test.ts (8 tests) 19ms
```

and by counting the `test(...)` blocks in the file (8). Baseline arithmetic confirms it:
`8 + 9 + 9 + 12 + 13 = 51`.

So the correct expectation is **51 − 8 = 43**. The measured post-change count is exactly **43**.

**I did not manufacture a 9th test, and did not re-add any deleted test, to hit 42.** Per E5 the
intent — delete dead code plus its tests, then state the real number — is fully honored; only the
plan's number was off by one. The deletion itself is unaffected and correct.

### D2 — SPEC/PLAN disagreement on `SafeAreaView edges`

- SPEC AC7 says all 3 branches keep `SafeAreaView edges={['top']}`.
- PLAN steps 5 & 6 say keep `edges={['top','bottom']}` **exactly as-is**.
- **Source truth**: all 3 branches use `edges={['top', 'bottom']}` (set by NAV-003).

I followed the PLAN (authoritative checklist) and the source: `['top','bottom']` is unchanged on all 3
branches. The SPEC's `['top']` appears to be copied from the Notifications template, which genuinely
uses `['top']` only because it reserves its bottom inset via `resolveTabBarClearance` instead. Tracking
has no such call, so its `'bottom'` edge is its only inset source — dropping it would have been a real
visual regression. **Flagging as a SPEC typo, not acted on.**

### D3 — Stale doc-comment path inside the moved file

The moved file's branch-preservation comment referenced `../_layout.tsx`, which resolved to
`order/_layout.tsx` before the move. After the move the governing layout is `./_layout.tsx`. Left as-is
the comment would have pointed at a layout that no longer controls this screen. Corrected to
`./_layout.tsx` — comment text only, zero code impact, inside Touchpoint 3.

---

## What was done — per checklist step

| Step | Status | Evidence |
|---|---|---|
| 1. `git mv` route → `(tabs)/tracking/[orderId].tsx` | ✅ | `git status`: `RM apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx -> apps/mobile/src/app/(tabs)/tracking/[orderId].tsx` — a **rename**, not delete+add. Empty `order/tracking/` dir removed. |
| 2. New `(tabs)/tracking/_layout.tsx` | ✅ | `<Stack screenOptions={{ headerShown: false }} />` + doc comment mirroring `notifications/_layout.tsx` (not-a-tab / ICONS allowlist / back-returns-to-caller / why `headerShown:false`), plus the NAV-004 "a route that belongs to no tab cannot leave residue in one" rationale. |
| 3. Remove `tracking/[orderId]` Stack.Screen from `order/_layout.tsx` | ✅ | `git diff --stat`: `1 -`. Exactly one line removed; every other line untouched. |
| 4. `useHideTabBarWhile(useIsFocused())` above early returns | ✅ | Hook at **line 78**; early returns at **88** (`isLoading`) and **99** (`error \|\| !order`). Rules of Hooks satisfied across all 3 return branches. `useIsFocused` gating commented as load-bearing. |
| 5. **No clearance change** | ✅ | Confirmed from source: zero `resolveTabBarClearance` calls in this screen. `edges={['top','bottom']}` and `paddingBottom: Spacing.six` left byte-identical. Only the `:104-111` comment updated (now notes the bar is *explicitly* hidden, not implicitly absent). |
| 6. Preserve all 3 branches | ✅ | `grep -c "edges={['top', 'bottom']}"` = **3**; `grep -c 'ScreenHeader title="Order Tracking"'` = **3**. Loading/error/loaded all intact, not collapsed. |
| 7. Rewrite `navigate-to-tracking.ts` as thin wrapper | ✅ | Signature **unchanged**: `useNavigateToOrderTracking(): (orderId: string) => void`. Body = `router.push({ pathname, params })` in `useCallback`. `useNavigation`, `NestedTabNavigate`, helpers import all dropped. Doc comment keeps the "only approved way / do not re-add a direct push" rule; NAV-001 reset narrative replaced with the top-level-route reason. |
| 8. Delete helpers + orphaned test | ✅ | `git rm` both. `git status`: two `D` entries. The emptied `__tests__/` dir went with them. |
| 9. Repoint pinned path (2 sites) | ✅ | `notification-factory.ts:75` and `notification-factory.test.ts:78` → `'/(tabs)/tracking/[orderId]'`. Nothing else changed in either file (`2 +-` each). |
| 10. Verify 3 call sites need zero edits | ✅ | **Confirmed — zero edits.** See §Call sites below. |
| 11. Grep-zero | ✅ | Only `floating-tab-bar.tsx:334` remains. See §Grep-zero below. |
| 12. Typed-routes codegen before typecheck | ✅ | Ran. See §Codegen below. **No `as Href` cast used anywhere.** |

## Call sites — zero edits confirmed (step 10 / E7)

All three consume the hook identically (`const f = useNavigateToOrderTracking(); f(order.id)`), and the
wrapper's signature is unchanged, so none required an edit. E7 was **not** triggered.

| Call site | Lines | Edit needed? | Proof |
|---|---|---|---|
| `(tabs)/index.tsx` (Home banner) | 37, 123, 195 | **No** | `git diff HEAD` → **empty** |
| `(tabs)/order/history.tsx` | 12, 32, 85 | **No** | `git diff HEAD` → **empty** |
| `(tabs)/order/confirmation/[orderId].tsx` | 15, 41, 136 | **No** | File *is* modified in the working tree, but that is **pre-existing NAV-003 ScreenHeader work present before this session started**. `git diff HEAD -- <file> \| grep -i tracking` → **no hits**, proving zero tracking-related edits by me. |

## Grep-zero (step 11)

```
$ grep -rn "order/tracking" apps/mobile/src
apps/mobile/src/components/floating-tab-bar.tsx:334:            // Home "Active Order" banner → order/tracking trap).
```

Exactly the one permitted hit — a frozen historical prose comment (E4: out of scope, not edited).

Dead-export sweep also clean:

```
$ grep -rn "buildTrackingResetAction|navigate-to-tracking.helpers|ORDER_TAB_NAME|ORDER_ROOT_SCREEN|ORDER_TRACKING_SCREEN|TrackingResetAction" apps/mobile/src
apps/mobile/src/features/orders/lib/navigate-to-tracking.ts:18: * machinery — and its `buildTrackingResetAction` builder — was deleted here, not
```

The single hit is prose inside my own doc comment explaining what was removed — not a code reference,
not an import. No dead exported code, no orphaned tests.

## Codegen (step 12 / E1) — ran successfully

`.expo/types/router.d.ts` was **stale** (mtime 13:20, pre-dating the 13:30 move): it still carried the
old `/(tabs)/order/tracking/[orderId]` and lacked the new path. A typecheck at that point would have
failed for the wrong reason.

First attempt failed silently and is worth recording: `npx expo start` found **port 8081 occupied**,
could not prompt in non-interactive mode, and printed `› Skipping dev server` — so **no codegen ran**
(mtime unchanged). Caught only by checking the mtime. Re-ran on `--port 8099`; codegen fired in ~30s;
dev server then stopped.

Post-codegen verification (`.expo/types/router.d.ts`, mtime 13:33):

- new `${'/(tabs)'}/tracking/[orderId]` — **present**
- `grep -c "order/tracking"` — **0** (old path fully gone)

**No `as Href` cast was used anywhere** — the typecheck is green on a genuinely regenerated route tree.

## Test Gate Outcomes — real measured output

Baselines were captured **before** any edit, so the deltas below are real, not remembered.

| Gate | Expected (plan) | Baseline | **Measured after** | Verdict |
|---|---|---|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | exit 0, 0 errors | 0 errors | **exit 0, 0 errors** | ✅ PASS (absolute gate) |
| vitest (`apps/mobile`) | 42 | 51 (5 files) | **43 (4 files)** | ✅ PASS — **plan's 42 was wrong; 43 is correct (D1)** |
| jest (`apps/mobile`) | 27 | 27 (8 suites) | **27 (8 suites)** | ✅ PASS — unchanged |
| `pnpm --filter @jojopotato/ui test` | 68 | 68 (25 suites) | **68 (25 suites)** | ✅ PASS — unchanged |
| `pnpm --filter @jojopotato/mobile lint` | 0 errors | — | **0 errors, 3 warnings** | ✅ PASS |
| `grep -rn "order/tracking" apps/mobile/src` | only `:334` | — | **only `:334`** | ✅ PASS |
| `git status` shows rename | rename | — | **`RM ... -> ...`** | ✅ PASS |
| Prettier, touched files only | clean | — | **"All matched files use Prettier code style!"** | ✅ PASS |

### vitest 51 → 43 reconciled to the deleted suite exactly

Per-file counts prove the drop is **entirely** the deleted suite and nothing else regressed:

| Suite | Baseline | After |
|---|---|---|
| `navigate-to-tracking.test.ts` | **8** | **deleted** |
| `floating-tab-bar.helpers.test.ts` | 9 | 9 |
| `menu-to-home-view.test.ts` | 9 | 9 |
| `birthday.test.ts` | 12 | 12 |
| `notification-factory.test.ts` | 13 | 13 |
| **Total** | **51** (5 files) | **43** (4 files) |

Every surviving suite kept its exact count; Test Files went 5 → 4. `51 − 8 = 43`. ✅

Lint's 3 warnings are the pre-existing "Unused eslint-disable directive" ones in
`apps/mobile/scripts/dev-with-tunnel.mjs` — not mine, not touched.

**E6 confirmed:** `all-tests.md` §Known Gaps claims root typecheck is RED. **Stale/wrong** —
`@jojopotato/mobile` typecheck exits 0 with zero errors. The gate was not weakened on its say-so.

## Per-AC verification tiers — honest

| AC | Criterion | Tier | Status |
|---|---|---|---|
| **AC1** | Back from Tracking returns to the calling screen | **Agent-Probe** | ❌ **NOT PROVEN — no automated proof exists** |
| **AC2** | Order tab never shows Tracking afterwards | **Agent-Probe** | ❌ **NOT PROVEN — this is the actual bug** |
| AC3 | No tab button / no active tab on Tracking | Agent-Probe | ❌ Not proven (mechanism source-verified only) |
| AC4 | Tab bar hidden on Tracking, restored after leaving | Agent-Probe | ❌ Not proven (hook wiring source-verified only) |
| AC5 | Identical from all 3 entry points | Hybrid | ✅ By construction — one wrapper, unchanged signature, 3 call sites verified zero-diff |
| AC6 | Deep link resolves to new path | Fully-automated | ✅ `notification-factory.test.ts` green (13 tests) |
| AC7 | All 3 branches keep SafeAreaView + ScreenHeader | Fully-automated + source | ✅ typecheck 0 errors; 3/3 both greps (see D2 on `edges`) |
| AC8 | No dead code, no orphaned tests, no stale path | Fully-automated | ✅ lint 0 errors, grep-zero clean, vitest green |
| AC9 | Bottom inset counted exactly once | Source-verified | ✅ No clearance call; `edges={['top','bottom']}` is the sole inset source; unchanged |

**AC1 and AC2 — the entire point of this change — have zero automated proof and I do not claim them.**
`apps/mobile` has a jest/jest-expo component runner and a vitest node runner; what does **not** exist is
an E2E/navigation runner. Every gate above proves the code compiles, the deep link points at the right
path, and nothing regressed. **None of them proves the user is no longer stuck.**

## Test Infra Gaps Found

1. **No RN navigation E2E runner (project-wide, 4th consecutive NAV plan blocked by it).** AC1–AC4 here
   are unprovable by any agent. A Maestro/Detox harness covering "enter screen → back → assert tab
   state" would convert AC1–AC4 (and the NAV-001/002/003 equivalents) from Agent-Probe to
   Fully-Automated. Existing backlog note:
   `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. This is a **fourth
   data point**, not a new note.
2. **`all-tests.md` §Known Gaps contains a stale claim** — "Root `pnpm typecheck` is RED as of 14-07-26".
   `@jojopotato/mobile` typecheck is green (exit 0, 0 errors), verified this session and consistent with
   the NAV-002 report. This stale line is actively dangerous: it invites an agent to accept a red
   typecheck as pre-existing. Recommend correcting it at UPDATE PROCESS.
3. **Codegen can no-op silently.** `expo start` on an occupied port prints `› Skipping dev server` and
   exits without regenerating `.expo/types/router.d.ts`, while still looking like a successful run. Any
   route-move plan must **verify the route tree changed** (mtime + grep), not just that the command ran.
   Worth adding to the NAV playbook.
4. **No lint/test guard against a stale typed-routes tree.** The route tree is a build artifact that must
   be manually regenerated; nothing fails loudly when it drifts from the filesystem.

## Blast Radius Evidence — no out-of-scope file touched

My delta is **8 files** (7 tracked + 1 new):

```
 apps/mobile/src/app/(tabs)/order/_layout.tsx       |  1 -
 .../app/(tabs)/{order => }/tracking/[orderId].tsx  | 27 ++++++-
 .../notifications/lib/notification-factory.test.ts |  2 +-
 .../notifications/lib/notification-factory.ts      |  2 +-
 .../lib/__tests__/navigate-to-tracking.test.ts     | 69 ------------------
 .../orders/lib/navigate-to-tracking.helpers.ts     | 52 --------------
 .../features/orders/lib/navigate-to-tracking.ts    | 83 +++++++---------------
 7 files changed, 54 insertions(+), 182 deletions(-)
```

plus new untracked `apps/mobile/src/app/(tabs)/tracking/_layout.tsx`.

**Frozen files verified untouched** (`git diff HEAD --stat` → empty for all):
`floating-tab-bar.tsx`, `floating-tab-bar.helpers.ts` (E4 — `resolveTabBarClearance`'s signature and
`isNested` param name intact), `(tabs)/notifications/**`, `(tabs)/_layout.{ios,android,web}.tsx`.

### ⚠️ Read `git status` carefully — it is noisier than my diff

The working tree carried **pre-existing uncommitted NAV-001/NAV-003 changes before this session began**
(baseline captured at session start). These are **NOT mine**:

`apps/admin/src/routeTree.gen.ts`, `(tabs)/account/edit-profile.tsx`, `(tabs)/branches/[branchId].tsx`,
`(tabs)/deals/deal/[dealId].tsx`, `(tabs)/order/checkout.tsx`, `(tabs)/order/confirmation/[orderId].tsx`,
`components/coming-soon.tsx`, `packages/ui/src/components/screen-header.tsx` + its test, and the
nav-001/nav-003 process docs.

Notably **`packages/ui` shows as modified in `git status`, but not by me** — that is pre-existing NAV-003
ScreenHeader work. I made zero `packages/ui` edits, and its test count is unchanged at **68**, confirming
the blast radius held.

**Nothing was committed** (E3). Branch unchanged: `feat/nav-shell-screenheader`.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/nav-004-tracking-top-level-route_17-07-26/nav-004-tracking-top-level-route_PLAN_17-07-26.md`
- **Finished:** All 12 checklist steps. Route moved (history preserved), top-level `_layout.tsx` added,
  Order-stack registration removed, focus-gated tab-bar hook added above the early returns, wrapper
  rewritten with an unchanged signature, obsolete helper + orphaned test deleted, pinned deep-link path
  repointed at both sites, codegen regenerated.
- **Verified:** typecheck 0 errors, vitest 43, jest 27, ui 68, lint 0 errors, grep-zero, rename, Prettier.
  AC5–AC9 proven.
- **Still unverified:** **AC1, AC2, AC3, AC4** — Agent-Probe only, requires the user's on-device
  walkthrough. **The actual bug is not proven fixed by any gate in this repo.**
- **Cleanup remaining:** none from this plan. Two doc-hygiene follow-ups for UPDATE PROCESS: the stale
  `all-tests.md` typecheck-RED line, and the SPEC AC7 `edges` typo (D2).
- **Next valid state:** **Keep in `active/`** pending the user's AC1–AC4 walkthrough. Per the plan's own
  Phase Completion Rules, the execute agent MUST NOT self-declare VERIFIED — and I do not.

**Classification: `Keep in active/testing`.**

## User walkthrough needed to reach VERIFIED

1. **AC1/AC2 (the bug):** Home → Active-Order banner → Tracking → back → should land on **Home**. Then tap
   the **Order tab** → must show the **Order tab's own screen, never Tracking**.
2. **AC1 from the other two entries:** Order History row → Tracking → back → **Order History**.
   Order Confirmation → "Track order" → back → **Confirmation**.
3. **AC3:** while on Tracking, no tab button for it, no tab highlighted active.
4. **AC4:** floating tab bar **hidden** on Tracking, **restored** after navigating away (the focus-gating
   check — a regression here would leave the bar hidden on the destination).
