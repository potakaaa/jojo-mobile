---
phase: nav-001-tab-clearance-back-stack
date: 2026-07-17
status: COMPLETE_WITH_GAPS
feature: none
plan: process/general-plans/active/nav-001-tab-clearance-back-stack_17-07-26/nav-001-tab-clearance-back-stack_PLAN_17-07-26.md
---

# EXECUTE Exit Summary — NAV-001: Tab Bar Clearance + Back-Stack Trap

**TL;DR:** All 4 steps implemented; all Fully-Automated gates green (typecheck exit 0, vitest 51,
jest 27, `packages/ui` jest 62, lint 0 errors, Prettier clean on all 15 touched files). **Two things
the user must know before probing:**
1. **The Step 3.1 gate REJECTED the plan's primary `reset()` mechanism** — VALIDATE's VIABLE verdict
   was wrong. Took the plan's documented contingency (2-step `navigate`). This changes what you will
   be probing. Evidence below.
2. **A real plan defect found: the device safe-area inset is now DOUBLE-COUNTED on the 4 nested
   `SafeAreaView` screens.** The plan mandates both `edges={['bottom']}` AND
   `resolveTabBarClearance(true, …)` at each site — both supply the inset. Safe (never flush — the
   hard AC2 bar is met) and still a large net improvement, but ~34dp of dead space remains. I
   implemented the plan literally rather than silently redesigning. **Needs a decision.**

Status: **CODE DONE, not VERIFIED** — AC1–AC4, AC7–AC10 are Agent-Probe, owed to a device
walkthrough. Same shape as the predecessor plan.

---

## Step-1 gate (mandatory first) — PRIMARY REJECTED, CONTINGENCY TAKEN

**This is the headline finding.** The plan's primary mechanism does not exist as described.

**Method:** cheap-local — read the installed `expo-router@57.0.4` source at
`node_modules/.pnpm/expo-router@57.0.4_83c1348ad4f734850adcefca9f2bc133/node_modules/expo-router/build/useNavigation.js`.

**Finding — `useNavigation(parent)` is an ANCESTOR accessor, not a cross-tree accessor:**

```js
navigation = navigation.getParent(parent);
if (process.env.NODE_ENV !== 'production') {
    if (!navigation) { /* ... */
        throw new Error(`Could not find parent navigation with route "${parent}". Available routes are: '${ids.join("', '")}'`);
    }
}
```

It resolves its argument **only** via `navigation.getParent(...)`, walking UP from the calling
route, and throws otherwise. From Home (`(tabs)/index.tsx`), the Order tab's nested Stack is a
**sibling subtree** — never an ancestor. So `useNavigation('/order')` cannot obtain that handle at
all, and the cross-tab Home case (the one this fix exists for) would throw.

**Where VALIDATE went wrong (worth recording):** its Feasibility Probe Resolution claimed
`useNavigation(parent)` is "expo-router's own officially documented convenience for exactly this
cross-navigator case", citing the JSDoc example `useNavigation('/orders/menu')`. Re-reading that
JSDoc in full: the example is called **from `app/orders/menu/index.tsx`** and reaches `'/'`,
`'/orders'`, `'/orders/menu'` — every one an **ancestor of the caller**. The doc's own words are
"you can access **higher-order layouts**", and it explicitly documents the
`Could not find parent navigation` throw. VALIDATE read "cross-navigator" where the source says
"parent". Its residual-uncertainty note (`/order` vs `/(tabs)/order` path format) was moot — no path
string resolves a sibling. **This is exactly why the gate was mandatory ahead of the helper body.**
Its `.reset()`-is-not-focus-gated finding was correct but irrelevant once no handle is obtainable.

**Sub-case results (E1 — both required, reported separately per the contract):**

| Sub-case | Primary `useNavigation('/order').reset()` | Contingency `navigate(name, { screen })` |
|---|---|---|
| (a) **Warm** — Order tab visited earlier this session | **REJECTED** — sibling, not ancestor → throws | **TAKEN** — the 2-step sequence forces root then pushes |
| (b) **Cold-start** — Order tab never focused this session | **REJECTED** — same reason, and additionally the `lazy: true` mount concern VALIDATE raised | **TAKEN** — `navigate` mounts a not-yet-visited tab on demand by design |

The primary fails for **both** sub-cases for the same structural reason, so E1's warm/cold split did
not discriminate between mechanisms here — the lazy-mount risk VALIDATE flagged never got a chance
to matter. Recorded honestly rather than presented as if the cold-start case were separately probed.

**Mechanism implemented (the plan's documented contingency, no third mechanism improvised):**

```
1. navigate('order', { screen: 'index' })                              → forces Order's stack to root
2. navigate('order', { screen: 'tracking/[orderId]', params: {…} })    → pushes Tracking on top
```
Net stack `[index, tracking/[orderId]]`. This is the `navigate(name, { screen })` pattern the
predecessor plan (`fix-tab-bar-visibility-nav-trap_15-07-26`, Fix B / its own Step-1 gate) already
verified **empirically on-device**, reused verbatim — the plan's stated fallback. Because each
`navigate` targets the Order tab **by name**, one uniform helper serves all 3 call sites (AC4
requires identical behavior), including from inside the Order stack itself.

Route names verified against source, not assumed: tab `order` (`_layout.ios.tsx:35`), root `index`
and target `tracking/[orderId]` (`order/_layout.tsx:11,17`).

**Honesty bound:** this is a *static* rejection of the primary and a *precedent-backed* choice of the
contingency. Neither is a runtime confirmation of the 2-step sequence in this app — no RN navigation
runner exists. AC4's runtime behavior remains Agent-Probe.

---

## CONCERN — device safe-area inset is now double-counted on 4 nested screens

**Not a deviation — the plan says to do both. Flagging rather than silently redesigning.**

PLAN Step 2 mandates, at every nested `SafeAreaView` site, BOTH:
- flip `edges={[]}` → `edges={['bottom']}` (SafeAreaView applies `paddingBottom: insets.bottom`), AND
- `paddingBottom: resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)` — which **returns
  `insets.bottom`** by definition.

Both supply the inset, so it lands twice. Verified structurally: `styles.safeArea` is `flex: 1`, and
`cart.tsx`'s `styles.footer` is `position:'absolute', bottom: 0` — absolutely positioned against the
parent's **padding** edge, so it sits above SafeAreaView's new bottom padding while also applying its
own.

Per-site arithmetic on a 34dp-inset device (e.g. iPhone home indicator):

| Site | Before | After (as implemented) | Ideal (single inset source) |
|---|---|---|---|
| `cart.tsx` footer | 85+34+8 = **127** | 34+34+8 = **76** | 34+8 = 42 |
| `cart.tsx` scroll | 85+34+24+8 = **151** | 34+34+24+8 = **100** | 66 |
| `checkout.tsx` footer | 85+34 = **119** | 34+34 = **68** | 34 |
| `notifications.tsx` | 85+34+16 = **135** | 34+34+16 = **84** | 50 |
| `branches/[branchId].tsx` | 85+34 = **119** | 34+34 = **68** | 34 |

**Assessment:** strictly better than today (the ~85dp dead bar footprint IS gone — AC3's literal
wording is met), and AC2 (never flush) is met with room to spare, so **no gate fails and nothing is
unsafe**. But ~34dp of dead space remains, which is partly the complaint issue #96 filed. On a
0-inset device the two designs are identical.

**Why I did not "fix" it:** choosing a single inset source is a design decision INNOVATE locked, and
the two candidate designs (SPEC Background names both — the `coming-soon.tsx` `edges`-native pattern
vs. the hand-rolled pattern) were explicitly INNOVATE's call, not EXECUTE's. Deviating would have
been creative redesign.

**Recommended resolution (for the user / a follow-up):** keep ONE source per site. Cleanest given the
locked helper: keep `edges={['bottom']}` and drop the inset term from the nested paddings (i.e. pass
`0` as `insetsBottom`, or use the extra terms alone) — OR revert the `edges` flip and keep
`resolveTabBarClearance` as the sole source. Either is a small, mechanical change. Every affected
line carries an inline `NOTE (flagged in the NAV-001 EXECUTE report)` comment pointing here. Confirm
during the AC2/AC3 walkthrough, then pick.

---

## What Was Done

**Step 1 — bar/helpers refactor + pure tests (per plan, exact).**
- `floating-tab-bar.helpers.ts`: added `resolveTabBarClearance(isNested, footprint, insetsBottom)`.
  Zero-RN-import contract preserved (verified: vitest node-env suite still runs).
- `floating-tab-bar.tsx`: extracted and exported `TAB_BAR_FOOTPRINT = BAR_CONTENT_HEIGHT +
  Spacing.two + Spacing.four` (= 85); `getFloatingTabBarClearance` is now
  `TAB_BAR_FOOTPRINT + insetsBottom`. **Signature and numeric output unchanged** (61+x+8+16 vs
  85+x — all three constants are integers, so identical). Doc comments rewritten to explain the
  footprint-vs-safe-area split so the conflation bug is not reintroduced.
- `__tests__/floating-tab-bar.helpers.test.ts`: +6 cases (nonzero-footprint proves the isNested
  branch genuinely ignores it; both branches at `insetsBottom=0`; no-rounding assertion; a
  nested-<-root invariant).

**Step 2 — 6 nested-site edits (all `isNested` hardcoded `true`, each with its E2 invariant comment).**
`cart.tsx` (2 sites + `edges` flip), `checkout.tsx` (2 sites + `edges` flip — only the
`countdown === null` branch touched, the `countdown !== null` confirm-drawer sibling left alone),
`branches/[branchId].tsx` (`edges={['top']}` → `['top','bottom']`, additive),
`account/notifications.tsx`, `add-to-cart-bar.tsx`.
- Atomicity: for each file the `edges` flip landed **before or with** the padding reduction, so no
  intermediate state ever lacked the inset. (Sites are non-contiguous within a file, so a literal
  single-Edit was not possible; ordering guarantees the property the constraint protects.)
- **`add-to-cart-bar.tsx` — INNOVATE's correction CONFIRMED true.** The dynamic entry sits *after*
  `styles.bar` in the style array, so left-to-right merge means it overrode the static
  `paddingBottom: Spacing.four` on iOS/Android — this file WAS reserving the full ~85dp of dead bar
  height on Product Details. Replaced with `insets.bottom + Spacing.four` (the plan's preferred
  explicit form). No `SafeAreaView` added (scope discipline); `styles.bar`'s static padding untouched.
  This is the one nested site with **no** double-count (no SafeAreaView) — it is now fully correct.

**Step 3 — back-stack helper + 3 call sites.** Gate above. Split per plan:
- `features/orders/lib/navigate-to-tracking.helpers.ts` (**new**) — pure `buildTrackingResetAction`
  + route-name constants. Separate file (not colocated) so the vitest node-env test can import it
  without pulling `expo-router`, per the plan's explicit "independently importable" requirement and
  the `floating-tab-bar.helpers.ts` precedent.
- `features/orders/lib/navigate-to-tracking.ts` (**new**) — `useNavigateToOrderTracking()` hook form
  (plan-preferred: all 3 call sites are component render bodies). Header comment documents the
  contingency path taken, per plan 3.2. The builder is genuinely consumed — the dispatcher iterates
  its `routes` to emit the 2 navigates, so it is not decorative.
- `__tests__/navigate-to-tracking.test.ts` (**new**) — 8 cases: exact shape, 2 entries in order,
  index focuses tracking, params passthrough, root has no params, no-stale-screen invariant,
  empty-`orderId` edge case, fresh-object-per-call.
- 3 call sites now use the hook: `history.tsx` (`openOrder`),
  `confirmation/[orderId].tsx` ("Track your order"), `(tabs)/index.tsx` (`ActiveOrderBanner`).
  Hooks placed above early returns (rules of hooks). All other navigation calls at those sites
  (`router.replace('/(tabs)/order')`, `router.push('/(tabs)/order/cart')`, etc.) untouched.
  `(tabs)/index.tsx`'s OWN clearance call was **not** touched (it is a tab root) — only the banner push.
- Verified: **zero** direct `router.push` into `tracking/[orderId]` remains anywhere.

**Step 4 — Deals.** 4.2 applied unconditionally as instructed: `deal/[dealId].tsx` clearance →
`resolveTabBarClearance(true, TAB_BAR_FOOTPRINT, insets.bottom)`. Confirmed no `SafeAreaView` in the
file (matches plan) → no `edges` flip, and **no double-count here either**. 4.1/4.3 visibility
question: see Skipped below.

---

## What Was Skipped or Deferred

- **Step 4.1 / 4.3 — the Deals VISIBILITY question (SPEC Open Question 1) is OWED, unanswered.** It
  is Agent-Probe by definition (is the bar currently shown or hidden on Deal Details on-device?) and
  cannot be resolved headlessly. Per instruction I reproduced today's behavior and built **no**
  branching mechanism. Structural prediction stands (`deal/[dealId]` is pushed inside the `deals`
  stack → `isNestedTabRoute` almost certainly already returns `true` → bar already hidden), but that
  is a prediction, not a verification. **Outcome A vs B is undecided.** If the walkthrough judges the
  already-hidden bar a defect (Outcome B), that needs a per-screen carve-out = a follow-up plan, NOT
  this plan's scope — I stopped at that boundary as Step 4.3 requires. SPEC Open Question 1 therefore
  does **not** get its final answer at this plan's closeout, contrary to plan step 4.4 — it cannot,
  without the device.
- **AC1–AC4, AC7–AC10 Agent-Probe walkthrough — OWED.** No RN navigation simulator/E2E runner exists.
- **No high-risk evidence pack** — correctly not required (validate-contract: none of the 6 classes apply).

---

## Test Gate Outcomes

Commands verbatim from the plan's `## Exact Gate Commands` / `process/context/tests/all-tests.md`.

| Gate | Result |
|---|---|
| `pnpm --filter @jojopotato/mobile typecheck` | **PASS** — exit 0, **zero** errors |
| `pnpm --filter @jojopotato/mobile test` | **PASS** — vitest **51 passed** (5 files), jest **27 passed** (8 suites) |
| `pnpm --filter @jojopotato/mobile lint` | **PASS** — **0 errors** (3 pre-existing warnings in `scripts/dev-with-tunnel.mjs`, unrelated) |
| `pnpm --filter @jojopotato/ui test` | **PASS** — 62 passed, 24 suites (untouched-package regression guard) |
| Prettier (15 touched files) | **PASS** — "All matched files use Prettier code style!" |

- vitest 51 = 37 baseline + 6 (`resolveTabBarClearance`) + 8 (`buildTrackingResetAction`). Zero
  regressions; `notification-factory.test.ts` green (AC9 pinned route — no route string touched).
- **Pre-existing typecheck errors: NONE observed.** The 3 BRN-001/002/003 errors the handoff warned
  about (`@gorhom/bottom-sheet`, `expo-maps`, `expo-location` stubs) do **not** reproduce on
  `development` — typecheck is fully clean. The predecessor report notes the same ("already resolved
  on `development`"). Nothing suppressed.
- **Observation (not blocking):** `all-tests.md` documents apps/mobile vitest at 44 tests and the
  predecessor report at 47; the actual baseline here is 37. Branch-state drift in the docs, not a
  regression from this work — worth reconciling at UPDATE PROCESS.
- `pnpm format:check` (repo-wide) reports 147 unformatted files. **Pre-existing and out of blast
  radius** (`packages/ui`, `packages/utils`, …). I verified via `git show HEAD:<file>` that all my
  touched files were Prettier-clean at HEAD, so I formatted only my own 15.

---

## Plan Deviations

**None.** Every edit follows the checklist as written. Two discrepancies were found in the *plan/
contract* and are reported rather than worked around:

- **D1 — VALIDATE's feasibility verdict was wrong** (primary `reset()` mechanism unobtainable
  cross-tab). Resolved by taking the plan's own documented contingency — an anticipated,
  pre-authorized path, so not a deviation. Full evidence in the Step-1 gate section.
- **D2 — the plan's Step 2 double-mandates the inset** (CONCERN section). Implemented literally.

Minor, non-semantic notes: Step 2.1 labels `cart.tsx:301` "footer" when it is the scroll content
(`:414` is the footer) — the instruction ("identical treatment at both, preserve extra terms") was
unambiguous, and each site's own extra terms were preserved exactly. All plan line-number citations
were re-grepped and found **exact** — no drift anywhere.

---

## Test Infra Gaps Found

- **No RN navigation E2E/simulator runner** (Detox/Maestro/Playwright) — forces AC1–AC4, AC7–AC10 to
  Agent-Probe, and is the direct reason the Step 3.1 gate had to be settled by reading package source
  rather than by running the navigation. Existing project-wide backlog note covers it:
  `process/general-plans/backlog/mobile-e2e-navigation-harness_NOTE_09-07-26.md`. **No new note needed.**
- No new runner or infra introduced (as the plan predicted — both new pure functions fit the existing
  vitest node-env precedent).

---

## Honest Per-AC Verification Tiers

| AC | Tier | State |
|---|---|---|
| AC5 (`resolveTabBarClearance` ignores footprint when nested) | Fully-Automated | ✅ **PROVEN** — 6 new vitest cases |
| AC6 (safe-area term independent of bar term) | Fully-Automated | ✅ **PROVEN** — same suite |
| AC4 (pure layer — reset action shape) | Fully-Automated | ✅ **PROVEN** — 8 new vitest cases |
| Regression (7 tab-root callers still compile, signature unchanged) | Fully-Automated | ✅ **PROVEN** — typecheck exit 0 |
| Regression (lint, existing suite, pinned route) | Fully-Automated | ✅ **PROVEN** |
| AC1 (bar visible only on 5 tab roots) | Agent-Probe | ⬜ **OWED** — unchanged by this work, but re-confirm |
| AC2 (**hard** — never flush against inset) | Agent-Probe | ⬜ **OWED** — highest priority; double-count makes flush structurally very unlikely |
| AC3 (no dead bar-height space) | Agent-Probe | ⬜ **OWED** — ~85dp removed; see CONCERN re: residual ~34dp |
| AC4 (nav-state — back from Tracking, all 3 entries incl. cold-start) | Agent-Probe | ⬜ **OWED** — probe the **contingency** mechanism, not `reset` |
| AC7 (Deals) | Agent-Probe | ⬜ **OWED** — and Open Question 1 still unanswered |
| AC8 (native header/back unaffected) | Agent-Probe | ⬜ **OWED** |
| AC9 (checkout countdown bar-hide, visual) | Agent-Probe | ⬜ **OWED** — `useHideTabBarWhile` consumed, never modified |
| AC10 (repeated tab switching) | Agent-Probe | ⬜ **OWED** |

**No automated coverage is claimed for any visual or navigation-stack-state behavior.**

---

## Closeout Packet

- **Selected plan:** `process/general-plans/active/nav-001-tab-clearance-back-stack_17-07-26/nav-001-tab-clearance-back-stack_PLAN_17-07-26.md`
- **Finished:** all 4 steps — `resolveTabBarClearance` + `TAB_BAR_FOOTPRINT` split, 7 nested clearance
  sites corrected (6 Step-2 + Deals), centralized `useNavigateToOrderTracking` wired into all 3 push
  sites, 14 new automated tests.
- **Verified vs unverified:** pure-function correctness + no-signature-break + lint/typecheck/suite =
  automated-verified. Everything visual and nav-state = **unverified**, owed Agent-Probe.
- **Remaining:** (1) device walkthrough of the 8 Agent-Probe ACs; (2) **decide the double-inset
  question** (CONCERN section); (3) answer SPEC Open Question 1 → possibly a follow-up plan for
  Outcome B.
- **Closeout classification:** **Keep in active/testing.** CODE DONE; VERIFIED requires the
  walkthrough per the plan's Phase Completion Rules. Do not archive to `completed/`.
- **Next plan path:** none created. If Deals Outcome B or the double-inset cleanup is chosen, each
  warrants its own small plan.

## Forward Preview

- **Test Infra Found:** vitest node-env (`*.test.ts`) + jest-expo (`*.test.tsx`) both green; no new
  runner introduced. `packages/ui` jest unaffected (62/24).
- **Blast Radius Changes:** exactly as planned — 12 modified + 3 new, all under `apps/mobile/src`.
  One addition beyond the plan's file list: `navigate-to-tracking.helpers.ts` split out from
  `navigate-to-tracking.ts` (the plan explicitly delegated file layout to EXECUTE and required the
  pure builder be importable without expo-router). `apps/admin/src/routeTree.gen.ts` was already
  dirty at session start — not touched by this work.
- **Commands to Stay Green:** `pnpm --filter @jojopotato/mobile typecheck` /
  `... lint` / `... test`; `pnpm --filter @jojopotato/ui test`.
- **Dependency Changes:** none.

## Follow-up plan stubs created

None. Two candidates are named above (double-inset cleanup; Deals Outcome B) but both are gated on
Agent-Probe findings that do not exist yet — writing stubs now would presume their outcome.

## CONTEXT_PARTIAL items

None. All required context (plan, SPEC, PVL report, predecessor plan+report, `all-context.md`,
`all-tests.md`, installed expo-router source) was available and read.
