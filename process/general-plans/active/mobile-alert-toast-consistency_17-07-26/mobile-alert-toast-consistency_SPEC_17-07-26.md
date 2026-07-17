---
name: spec:mobile-alert-toast-consistency
description: "Add a shared themed Toast to packages/ui, migrate the 7 remaining single-button Alert.alert notices onto it, convert the 1 real destructive staff confirm to ConfirmDialog, and fix the imperative-alert-in-a-hook seam in use-reorder.ts"
date: 17-07-26
feature: general
---

# SPEC: Mobile Alert/Toast Consistency Pass

## Summary

Most of the "replace raw system alerts with themed UI" work already shipped (commit `70ef07d`):
a themed `ConfirmDialog` exists in `packages/ui` and the three real customer-facing destructive
confirms (sign-out, discount-replace, branch-switch) already use it. What's left is smaller and
different in kind: **7 single-button `Alert.alert()` calls** that are notices, not confirms (they
have nothing to confirm — just an OK-style dismiss), plus **1 real destructive confirm on the staff
side** that was deliberately skipped last time because staff aren't the "kid" audience, plus **one
hook that fires an alert from inside a `catch` block**, which is architecturally different from a
screen firing an alert from a tap handler. This pass builds a shared themed `Toast` for the notices,
converts the staff confirm to the existing `ConfirmDialog`, and fixes the hook seam so it stops
reaching into React Native's alert API directly. It also fires a success toast when a customer adds
an item to cart from Product Details, replacing an existing ad-hoc inline "Added to cart ✓" text.

**Correction to the originating issue's framing:** the issue described this as part of a broader
"kid-friendly UI" pass and cited PRD §12 (Design Requirements) as the source of truth. Reading §12
directly: it says nothing about alerts, toasts, or dialogs specifically — it lists a visual
direction ("fun, snackable, youthful, bright"), UI principles ("clear CTAs, friendly status
labels"), and a component list (`DealCard`, `BranchCard`, etc.) that does not include a Toast or
Alert component. The "kid-friendly, no raw system alerts" framing was inferred by the prior SPEC
(`kid-friendly-ui-deals-unification_16-07-26`), not literally mandated by §12. This SPEC keeps that
inferred goal (it's a reasonable one and the prior program already committed to it), but records
that distinction so nobody mistakes "§12 says do this" for a fact.

## User Stories / Jobs To Be Done

- As a customer, I want a brief, friendly on-screen confirmation when something succeeds (item
  added to cart, a deal removed, a preference saved), so that I know it happened without an
  intrusive system popup breaking my flow.
- As a customer, I want to clearly understand when something failed and *why*, so that I don't
  think an action succeeded when it didn't.
- As a staff member, I want a clear, unambiguous confirm step before accepting or rejecting a
  customer's order, so that I don't do it by accident — but I don't need it to look "cute", since
  I'm not the app's kid audience.
- As the product owner, I want every remaining raw `Alert.alert()` call removed or replaced with a
  themed equivalent, so the app has one consistent notification language instead of three (raw
  system alerts, the new `ConfirmDialog`, and ad-hoc inline `<Text>` notices like Product Details'
  "Added to cart ✓").
- As the product owner, I want this migration to introduce zero new bugs in cart, checkout,
  reorder, or staff order actions, so a "consistency pass" doesn't become a "broken release."

## What The User Wants (Behavioral Outcomes)

- Every single-button informational/success/failure notice that currently opens a raw OS
  `Alert.alert()` instead shows a themed, in-app notification consistent with the rest of the UI.
- The staff accept/reject confirm (`(staff)/order-detail/[orderId].tsx:78`) shows the existing
  themed `ConfirmDialog` instead of a raw OS `Alert.alert()` with destructive styling, with
  identical two-choice semantics (Cancel / [Accept|Reject]) and an unchanged underlying transition.
- When a customer adds an item to cart from Product Details, they see a success notification in
  the new shared toast language, replacing the current ad-hoc inline "Added to cart ✓" text.
- The reorder hook (`use-reorder.ts`) no longer calls React Native's `Alert` API directly from
  inside a `catch` block; its failure is exposed as data its one consumer screen (`order/history.tsx`)
  can render however the resolved failure-semantics decision calls for (see the central open
  question below) — the hook itself stops making a UI decision.
- Whatever the resolved notice/failure semantics turn out to be (see the central question below),
  a customer who triggers a *failure* notice can tell, without ambiguity, that the action did not
  succeed — this is treated as a real product-safety requirement, not a cosmetic detail.
- Everything the current `Alert.alert()` calls do today in terms of underlying behavior (what data
  changes, what state clears, what navigation happens) stays identical — only the notification
  presentation changes.

## Flow / State Diagram

### Today: three disconnected notification languages

```
Raw Alert.alert() ──▶ 7 informational/failure notices + 1 staff destructive confirm
ConfirmDialog      ──▶ 3 shipped customer destructive confirms (sign-out, discount-replace, branch-switch)
Ad-hoc inline <Text> ──▶ Product Details "Added to cart ✓" (self-built, not reusable)
```

### Target: two shared, themed languages (this SPEC's boundary)

```
ConfirmDialog (existing) ──▶ any BLOCKING two-choice decision
                              (3 shipped customer sites + 1 new staff site this pass)

Toast (NEW, this SPEC)   ──▶ any single-button notice — success / info / failure
                              (7 migrating sites + 1 new add-to-cart-success site)
```

### Per-site disposition (grounded in this session's grep — every line verified)

```
apps/mobile/src/app/(tabs)/order/cart.tsx
  :139  Alert.alert('Deal removed', ...)               [auto-fired from a useEffect,
                                                          not a tap handler]           → Toast
  :159  Alert.alert('Cart updated', ...)                [auto-fired from a useEffect]  → Toast
  :181  Alert.alert('Cannot apply code', ...)           [tap handler, FAILURE]         → Toast (see Q1)

apps/mobile/src/app/(tabs)/order/product/[productId].tsx
  :103  Alert.alert('No branch selected', ...)          [tap handler, guard/FAILURE]   → Toast (see Q1)
  (new) success on add-to-cart, replacing inline "Added to cart ✓" <Text>              → Toast

apps/mobile/src/app/(tabs)/branches/[branchId].tsx
  :119  Alert.alert('Could not open maps', ...)         [async catch, FAILURE]         → Toast (see Q1)

apps/mobile/src/app/(tabs)/account/notifications.tsx
  :68   Alert.alert("Couldn't update preference", ...)  [tap handler, FAILURE]         → Toast (see Q1)

apps/mobile/src/features/orders/hooks/use-reorder.ts
  :49   Alert.alert("Couldn't reorder", ...)             [imperative, inside a hook's
                                                           catch — see hook-seam section] → Toast (see Q1),
                                                           via the hook exposing error state,
                                                           NOT the hook calling a UI API directly

apps/mobile/src/app/(staff)/order-detail/[orderId].tsx
  :78   Alert.alert(`${actionLabel} order?`, ...)       [tap handler, real 2-button
                                                          destructive confirm]           → ConfirmDialog
```

### Hook seam: `use-reorder.ts` (the fix this SPEC requires, not just a migration)

```
TODAY:
  history.tsx ──calls──▶ useReorder().reorder(order)
                              │
                              ▼
                    hook's own try/catch
                              │
                       catch ──▶ Alert.alert(...)   [hook imports 'react-native' directly
                                                      and makes a UI decision]

REQUIRED SHAPE (implementation left to INNOVATE — this is a requirement, not a design):
  history.tsx ──calls──▶ useReorder().reorder(order)
                              │
                              ▼
                    hook's own try/catch
                              │
                       catch ──▶ sets/returns an error signal (hook returns data, no RN import)
                              │
                              ▼
                    history.tsx (the ONLY consumer, confirmed by grep) renders
                    the resolved failure UI itself
```

### Toast mount point — open question, not decided here (see Q3)

```
_layout.tsx provider order today:
  BranchProvider
    └ NotificationsProvider
        └ CartSessionProvider
            └ ReorderConflictProvider
                └ OrderSessionProvider
                    └ RootNavigator (Stack.Protected: (staff) | (tabs) | (onboarding) | (auth))

ConfirmDialog's proven pattern: absolutely-positioned overlay INSIDE the screen that renders it
(fills that screen's own root, per its own doc comment — not a portal/global host).

Toast candidates (INNOVATE decides; SPEC states the requirement each must satisfy):
  (a) Screen-local overlay, same pattern as ConfirmDialog     — simplest, proven pattern,
                                                                 does NOT survive navigation
  (b) A host mounted above RootNavigator in _layout.tsx        — survives navigation, but is a
                                                                 new pattern in this codebase
  (c) Something else INNOVATE proposes
```

## Acceptance Criteria (Testable Outcomes)

Tier legend used below: **Fully-Automated** (real automated test proves it) / **Hybrid** (automated
test proves part, Agent-Probe confirms the rest) / **Agent-Probe** (manual walkthrough only,
documented as such, never claimed as automated) / **Known-Gap** (used only where proof is currently
impossible for infra reasons — flagged explicitly, not silently substituted).

**AC1 — No raw `Alert.alert(` call remains in `apps/mobile/src`, except any explicitly carved out
by this SPEC's Out-of-Scope section.**
- proven by: `grep -rn "Alert.alert(" apps/mobile/src` returns zero matches (or only the explicitly
  carved-out exception list, if any is agreed at INNOVATE/PLAN time).
- strategy: **Fully-Automated** — this is a cheap, exact grep guard; call it out as a gate PLAN
  should wire into the same regression-guard family as `guard:theme-mode`.

**AC2 — New shared `Toast` component exists in `packages/ui`, is exported, and takes a required
`mode: ThemeMode` (no default), consistent with the existing 27-component convention.**
- proven by: `packages/ui` jest-expo component test rendering `Toast` in both `mode="light"` and
  `mode="dark"` and asserting the RESOLVED style output differs between the two modes (not merely
  that a `mode` prop was passed) — the prior dark-mode-audit session found exactly this class of
  vacuous test (`button.test.tsx` passed with 3 tsc errors because `Button` never dereferenced
  `theme` on its tested paths); this criterion requires a real mutation check, mirroring
  `card.test.tsx`'s pattern.
- strategy: **Fully-Automated**

**AC3 — `Toast` does not use React Native `Modal`.**
- proven by: source-level check (no `Modal` import in the new component file) plus the fact that
  its render-toggle behavior is exercised by a jest-expo test that would fail if the component
  silently failed to render/unmount its children (the same failure mode `confirm-dialog.tsx`'s doc
  comment records for `Modal` under jest-expo).
- strategy: **Fully-Automated**

**AC4 — Each of the 7 migrating single-button sites fires the new `Toast` instead of
`Alert.alert()`, with the underlying non-UI behavior (what data changes, what state clears, what
navigation happens) unchanged.**
- proven by: one `apps/mobile` jest/vitest test per site (7 sites) asserting (a) the existing
  handler logic still runs exactly as before (state changes, navigation calls, etc. — reusing each
  site's existing test fixture where one exists) and (b) the toast-trigger call happens with the
  correct message content, in place of the removed `Alert.alert` call.
- strategy: **Fully-Automated** for 6 of 7 sites (cart.tsx x3, product screen x1, branches x1,
  notifications x1) that render as ordinary screens under the existing jest/vitest runner. The
  `use-reorder.ts` site is **Hybrid**: the hook's own unit-level behavior (still calling `reorder`
  logic correctly, returning an error signal instead of calling `Alert`) is Fully-Automated; whether
  `history.tsx` (the one confirmed consumer) visually renders that error as a toast in a way a real
  user would notice is Agent-Probe, same ceiling as every other RN visual-rendering claim in this
  repo (see AC7).

**AC5 — The staff destructive confirm (`(staff)/order-detail/[orderId].tsx:78`) uses the existing
`ConfirmDialog` component, not a new component, with identical two-choice semantics (Cancel vs.
Accept/Reject) and an unchanged underlying `handleTransition` call.**
- proven by: new `apps/mobile` jest test on `LiveOrderActions` asserting `ConfirmDialog` renders
  with the correct title/labels for both the "accept" and "reject" action paths, and that
  `handleTransition(targetStatus)` fires on confirm and does NOT fire on cancel — mirroring the
  existing per-screen `ConfirmDialog` wiring tests already proven in the prior program (Phase A).
- strategy: **Fully-Automated**

**AC6 — Product Details' ad-hoc inline "Added to cart ✓" `<Text>` is replaced by the shared `Toast`
firing on a successful add-to-cart, with the underlying add-to-cart logic (`addItem`, branch-switch
logic, etc.) unchanged.**
- proven by: new/updated `apps/mobile` jest test on the product detail screen asserting the toast
  fires (correct message) after a successful `handleAdd()` call, and that the existing
  `addedNotice`-driven inline text is removed (not left as a second, redundant notice).
- strategy: **Fully-Automated**

**AC7 — Toast visual/positioning correctness: does not visually overlap the floating tab bar, the
sticky add-to-cart bar, or the device's bottom safe area, on both tab-root and nested (non-tab-root)
screens.**
- proven by: a component-level assertion that the toast host's computed bottom offset equals (or
  exceeds) the appropriate clearance value for the screen class it renders on — this proves *intent*
  (the offset formula is correctly referenced), it does **not** prove visual non-overlap on a real
  device, since jest-expo has no layout engine and cannot render actual pixel geometry. Stated
  plainly, not dressed up as full proof.
- strategy: **Hybrid** — the offset-formula assertion above is Fully-Automated; real on-device
  non-overlap across the two screen classes (tab-root vs. nested, where nested screens' floating
  bar is hidden per the `fix-tab-bar-visibility-nav-trap` fix) is **Agent-Probe**, and per that
  prior plan's own finding, an Android result does not transfer to iOS — this criterion is only
  closed once both platforms are separately walked through.

**AC8 — Zero behavioral regression: all existing `apps/mobile` vitest + jest suites and
`packages/ui` jest-expo suites remain green (no test deletions that reduce coverage of cart,
checkout, reorder, branches, notifications, or staff order-detail logic); typecheck and lint stay
clean in both packages.**
- proven by: full `pnpm --filter @jojopotato/mobile test` (`vitest run --passWithNoTests && jest`)
  + `pnpm --filter @jojopotato/mobile typecheck` + `pnpm --filter @jojopotato/mobile lint`, and
  `pnpm --filter @jojopotato/ui test` + `pnpm --filter @jojopotato/ui typecheck`, all re-run green
  post-change.
- strategy: **Fully-Automated**

**AC9 — Failure-semantics decision (see the central open question below) is explicitly recorded
and every failure-class migrated site (`cart.tsx:181`, `product/[productId].tsx:103`,
`branches/[branchId].tsx:119`, `notifications.tsx:68`, `use-reorder.ts:49`) implements the same
resolved answer consistently — not a per-site ad-hoc choice.**
- proven by: presence check that all 5 failure sites use the same component/duration/dismiss
  pattern (grep/diff review during VALIDATE) plus the per-site tests in AC4 asserting the resolved
  pattern's actual behavior (e.g. if the answer is "errors require a tap to dismiss," a test that
  the toast does NOT auto-dismiss on a failure variant).
- strategy: **Fully-Automated** for the consistency check; the specific proving test for whatever
  pattern is chosen is described in AC4/AC10 (no double-counting).

**AC10 — Component-level style/behavior assertions check RESOLVED rendered output, not merely prop
presence, for every new automated test in this SPEC.**
- proven by: reviewer confirmation during VALIDATE that no new test only asserts a prop was passed
  without asserting a rendered/resolved effect (mirroring the explicit anti-pattern found in
  `button.test.tsx` pre-fix, and the `card.test.tsx` pattern used as the fix precedent).
- strategy: **Fully-Automated** (a lint-style review gate, not a runtime test) — flagged so PLAN
  treats "assert style output" as a hard requirement on every new test file this SPEC produces, not
  a nice-to-have.

## Out Of Scope

- Top bar / header consistency work across `(tabs)` vs. `(staff)`. Confirmed during RESEARCH: this
  is not an inconsistent mix — the customer `(tabs)` shell correctly follows the documented Expo
  Router convention (tab-root screens `headerShown:false`, nested screens get the native header +
  back button), while the entire `(staff)` shell deliberately uses `headerShown:false` with its own
  bespoke headers. It is a clean shell-level split between two internally-consistent systems, not a
  bug — deferred to its own future task if ever revisited. Recorded here so a future reader doesn't
  re-file it as an oversight.
- `(tabs)/rewards/index.tsx:259`'s raw RN `Modal` (the roadmap popup) — the only raw `Modal` usage
  in the app. Unrelated to alert/toast semantics; not requested for this pass.
- Any change to underlying business logic: what data changes, what gets cleared, what navigation
  happens, pricing/eligibility/order-placement rules. Only the notification *presentation* layer
  changes.
- Any API, schema, or backend change of any kind — this is a client-presentation-only pass.
- Building an automated RN navigation/E2E test runner (Detox/Maestro/Playwright) — remains a
  documented project-wide gap (see `process/context/tests/all-tests.md` Known Gaps), not something
  this pass closes. AC7's on-device geometry proof stays Agent-Probe/Hybrid because of this gap, not
  because this pass is skipping due diligence.
- Extending the shared jest reanimated mock (`FadeIn`/`SlideInDown`/etc.) — the prior program
  documented this gap; this pass's own AC-testability requirement (no `Modal`) is written
  specifically so `Toast` does not need reanimated layout-animation primitives to be testable, so
  this pass does not need to touch that mock. If INNOVATE later finds it does need those primitives,
  that becomes a new, explicitly flagged constraint — not a silent scope creep.
- The already-shipped `ConfirmDialog` component itself and its 3 existing customer-facing call
  sites (sign-out, discount-replace, branch-switch) — not touched, not re-validated, not re-planned.

## Constraints

- **`mode` is a REQUIRED prop on all `packages/ui` themed components — no default value** (locked
  by commit `996079f`, `apps/mobile/scripts/check-theme-mode.mjs`). The new `Toast` MUST take a
  required `mode: ThemeMode`. This is a compile-time gate — `check-theme-mode.mjs` derives its
  tracked-component list from source and will auto-track `Toast` once it has a required `mode` prop
  with no JSX spread attributes on its call sites.
- **No React Native `Modal`.** `confirm-dialog.tsx`'s own doc comment (lines ~33-34) records: "RN
  `Modal` does not render its children in the jest-expo test tree after a visibility toggle, which
  would make the AC-A4 per-screen wiring gates untestable." `Toast` MUST follow the same
  absolutely-positioned-overlay pattern (or an equivalent non-`Modal` approach) or it cannot be
  proven by an automated test the way this SPEC's acceptance criteria require.
  See `packages/ui/src/components/confirm-dialog.tsx` for the exact reference implementation shape
  (a `View` with `zIndex: 20`/`elevation: 20`, not a `Modal`).
- **Clearance formula.** `getFloatingTabBarClearance(insetsBottom)` in
  `apps/mobile/src/components/floating-tab-bar.tsx:161-162` computes
  `BAR_CONTENT_HEIGHT (61dp) + insetsBottom + Spacing.two + Spacing.four`. `add-to-cart-bar.tsx`
  already reserves this exact clearance as its own bottom padding on non-web platforms. Any toast
  that can appear on a tab-root screen must clear both the floating tab bar and (where present) the
  sticky add-to-cart bar, plus the device's own bottom safe area. Per `fix-tab-bar-visibility-nav-trap_15-07-26`
  (delivered, not yet Agent-Probe-verified end to end): the floating bar is hidden on nested
  (non-tab-root) screens, so the correct clearance **differs between tab-root and nested screens** —
  this must be a first-class requirement for wherever a toast can appear, not a footnote.
- **Mount point is undecided by this SPEC (see Q3).** `_layout.tsx`'s provider nesting is
  `BranchProvider > NotificationsProvider > CartSessionProvider > ReorderConflictProvider >
  OrderSessionProvider > RootNavigator`. `ConfirmDialog`'s existing overlay pattern only fills its
  own screen-root parent — a toast that must survive navigation (if that's the resolved answer)
  needs a host mounted higher than any individual screen. This SPEC states the requirement (does a
  toast need to survive navigation? does it need to show on unauthenticated screens?) without
  picking the mount point — that is INNOVATE's job.
- Theming per CLAUDE.md §Theming: single resolver `useColorScheme()` (or `useTheme()`); text
  rendered on a fixed-`mode` surface must use that same mode's tokens, not the device scheme.
- `apps/mobile/scripts/check-theme-mode.mjs` (`guard:theme-mode`) hard-fails on JSX spread
  attributes on any tracked `packages/ui` component's call sites, and bans raw RN `useColorScheme`
  imports outside the two wrapper hook files — any `Toast` call site written during this pass must
  respect both rules.
- `use-reorder.ts` is a hook with exactly one confirmed consumer (`history.tsx`) — grep-verified
  this session (test-mock imports in `history-screen-dark-mode.test.tsx` aside). The hook-seam fix
  (exposing error state instead of calling `Alert` directly) must not change `useReorder()`'s
  existing `{ reorder, isReordering }` return shape in a way that breaks that one real consumer
  without an accompanying, deliberate update to it.

## Open Questions

**Q1 — Failure-notice semantics: can a themed toast for a *failure* (not just a success/info
notice) be safely auto-dismissing, or does it need to force acknowledgment?**
Owner: user (this is a real product-safety tradeoff, not inferable from the codebase).

This is the central design question of this pass. Three of the seven migrating sites are FAILURES,
not neutral notices: `'Cannot apply code'` (cart.tsx:181), `"Couldn't update preference"`
(notifications.tsx:68), and `"Couldn't reorder"` (use-reorder.ts:49). Two more are guard/failure-ish
depending on framing: `'No branch selected'` (product screen, a validation guard) and `'Could not
open maps'` (branches screen, an async failure). An auto-dismissing toast **can be missed** — and a
user who misses a failure toast may believe the action succeeded when it did not. Today's
`Alert.alert()` forces a tap to dismiss, so it can never be silently missed; whatever replaces it
must not quietly regress that guarantee without a deliberate decision.

Options (presented neutrally; INNOVATE picks, this SPEC does not):
- **(a) One toast component, two variants.** Success/info toasts auto-dismiss quickly (~2-3s);
  failure-variant toasts use a distinct visual treatment (color/icon) and either a longer duration
  or require an explicit tap-to-dismiss, so a failure can't be missed the way a success can.
- **(b) Toasts for success/info only; failures stay a one-button blocking notice.** Reuse (or
  lightly adapt) the same "one dialog primitive" pattern this program already has —
  `ConfirmDialog` with a single action — for the 3-5 failure sites, and build `Toast` only for the
  success/info sites. Fewer new UI surfaces, but two components instead of one shared "Toast."
- **(c) Toast for everything, but failures require a tap to dismiss (no auto-timeout at all).**
  Splits the difference: one visual language, but the auto-dismiss behavior is conditional on
  severity, not a separate component.
- (d) Something else the user proposes.

Recommendation: **(a)**, because it keeps one shared component (satisfying "a shared themed Toast")
while treating the real safety concern (missed failures) as a variant property rather than a
separate surface — but this is a genuine tradeoff and the user should decide, not this document.

**Q2 — Does the new `Toast` need to survive screen navigation, or is a screen-local overlay
(mirroring `ConfirmDialog`'s existing pattern) sufficient?**
Owner: user / INNOVATE.
Every one of the 8 sites in this pass's scope fires its notice on the SAME screen the user is
already looking at (none of the 7 migrating call sites nor the new add-to-cart-success site
navigates away immediately after firing) — grep-verified this session. This means a screen-local
overlay (the proven, already-tested `ConfirmDialog` pattern) may be sufficient for every concrete
site in THIS pass's scope. However, a "shared Toast" is likely to be reused by future screens that
DO navigate right after a notice (e.g. "Order placed" before jumping to confirmation) — deciding
now whether to build the simpler screen-local version or the more durable cross-navigation host
avoids a rebuild later. Recommendation: **build the screen-local overlay now** (matches every
concrete need in scope, reuses the proven `ConfirmDialog` shape, keeps this pass's blast radius
small) and treat a persistent/global host as a follow-up if a future feature needs it — but this is
INNOVATE's call once the tradeoff is visible, not locked here.

**Q3 — Which screen classes can show a toast, and does the clearance/offset requirement differ for
them?**
Owner: INNOVATE (mechanical, but the SPEC records the constraint so it isn't missed).
Per the Constraints section: tab-root screens need clearance for the floating tab bar (and the
sticky add-to-cart bar where present); nested screens (where the floating bar is hidden per
`fix-tab-bar-visibility-nav-trap`) need less. This SPEC requires that whichever screens actually use
`Toast` in this pass's scope (cart, product details, branches detail, account/notifications, order
history) each get the correct clearance for their own screen class — not a single hardcoded offset
copied from one screen to all.

All three questions have a recorded recommendation and do **not** block SPEC completion — proceed
to INNOVATE under the stated recommendations; the user may correct any of them at the Phase-End
Recommendation Gate without re-opening this document.

## Background / Research Findings

**Already shipped, not in scope (commit `70ef07d`, in this branch's history):**
`packages/ui/src/components/confirm-dialog.tsx` exists, is exported (`packages/ui/src/index.ts`),
and has a real jest-expo test suite (`__tests__/confirm-dialog.test.tsx`). Three customer-facing
destructive confirms already consume it — grep-verified this session:
`(tabs)/account/index.tsx` (sign-out), `(tabs)/order/cart.tsx` (discount-replace + branch-switch),
`(tabs)/order/product/[productId].tsx` (branch-switch). `ConfirmDialog`'s doc comment explicitly
records why it is a plain absolutely-positioned overlay and not RN `Modal`: "RN `Modal` does not
render its children in the jest-expo test tree after a visibility toggle, which would make the
AC-A4 per-screen wiring gates untestable." This is the load-bearing precedent for this SPEC's
"no `Modal`" constraint.

**The 8 sites in scope for this pass, grep-verified this session at these exact lines** (all
confirmed by direct `grep -rn "Alert.alert(" apps/mobile/src` — no site is inferred):
- `(tabs)/order/cart.tsx:139` — `'Deal removed'` (fires from a `useEffect` re-eligibility check,
  not a tap handler)
- `(tabs)/order/cart.tsx:159` — `'Cart updated'` (fires from a `useEffect` reward-baseline check)
- `(tabs)/order/cart.tsx:181` — `'Cannot apply code'` (tap handler, failure)
- `(tabs)/order/product/[productId].tsx:103` — `'No branch selected'` (tap handler, guard/failure)
- `(tabs)/branches/[branchId].tsx:119` — `'Could not open maps'` (async `.catch()`, failure)
- `(tabs)/account/notifications.tsx:68` — `"Couldn't update preference"` (tap handler, failure)
- `features/orders/hooks/use-reorder.ts:49` — `"Couldn't reorder"` (imperative, inside a hook's
  `catch` block — the only site of this architectural shape)
- `(staff)/order-detail/[orderId].tsx:78` — real 2-button destructive confirm (accept/reject),
  deliberately deferred by the prior plan with the stated reason "staff aren't the kid audience" —
  now explicitly in scope for conversion to `ConfirmDialog`.

**`use-reorder.ts` consumer check (grep-verified):** `useReorder()` is imported and called by
exactly one real screen, `(tabs)/order/history.tsx` (`const { reorder, isReordering } =
useReorder();`). The only other references are test-mock imports in
`features/orders/__tests__/history-screen-dark-mode.test.tsx`. This confirms the hook-seam fix's
blast radius is exactly one consumer screen, not an unknown fan-out.

**Product Details' existing ad-hoc notice (grep-verified):** `(tabs)/order/product/[productId].tsx`
already has a self-built `addedNotice` boolean state driving an inline `<Text>` reading "Added to
cart ✓" (line ~199) — set to `true` in `handleAdd()`'s success path (line ~125). This is exactly
the kind of one-off pattern the new shared `Toast` is meant to replace, and confirms the add-to-cart
success case does NOT navigate away immediately (the user stays on the product screen), which is
relevant to Q2.

**`packages/ui`/`apps/mobile` test runner reality (verified against `package.json` directly, not
assumed from context docs):** `packages/ui`'s `test` script is `jest` (jest-expo). `apps/mobile`'s
`test` script is `vitest run --passWithNoTests && jest` — BOTH runners, sequentially; vitest owns
pure-TS `*.test.ts` files (node env, no rendering), jest owns RN component `*.test.tsx` files. Any
new component-level test for a screen belongs in a `*.test.tsx` file under jest; any new pure-logic
test (e.g. the hook's error-state shape) belongs in a `*.test.ts` file under vitest.

**Clearance formula (verified against source, exact line numbers):**
`apps/mobile/src/components/floating-tab-bar.tsx:161-162` —
`getFloatingTabBarClearance(insetsBottom) = BAR_CONTENT_HEIGHT (61dp, computed from
`ICON_CHIP_SIZE + Spacing.half + 15 + Spacing.one * 2`) + insetsBottom + Spacing.two + Spacing.four`.
`apps/mobile/src/features/menu/components/add-to-cart-bar.tsx:51` already calls this exact function
for its own bottom padding on non-web platforms. There is no artifact literally named "NAV-001" —
the real, relevant precedent is `process/general-plans/active/fix-tab-bar-visibility-nav-trap_15-07-26/`,
which hides the floating tab bar on nested (non-tab-root) screens. That plan's own EXECUTE report
records it deliberately did NOT strip clearance reservations from several nested-screen call sites,
because some of them (checkout's footer, cart's checkout bar, add-to-cart-bar's own safe-area
padding) serve double duty and removing them risks content flush against the device's home
indicator — an unverifiable-headlessly visual regression. That plan's AC1-AC5 (bar visibility by
screen depth) are still Agent-Probe-owed as of this session (its own report says "CODE DONE, not
yet ✅ VERIFIED"), which is why this SPEC treats "does the toast clear the bar correctly on both
screen classes" as Hybrid, not Fully-Automated, in AC7 — the underlying show/hide behavior it
depends on isn't itself fully device-verified yet either.

**`_layout.tsx` provider nesting (verified, exact order):**
`BranchProvider > NotificationsProvider > CartSessionProvider > ReorderConflictProvider >
OrderSessionProvider > RootNavigator` (`Stack.Protected` 4-way role/onboarding/auth split). No
existing provider in this tree is a UI-overlay host — `ConfirmDialog`'s pattern is screen-local, not
provider-mounted. This confirms Q2/Q3 are genuinely open (nothing in the current tree already
answers "can a toast survive navigation" for free).

**PRD §12 (Design Requirements), read directly this session:** lists a visual direction (fun,
snackable, youthful, bright, easy to understand, promo-driven, not too corporate, not overly
complex), UI principles (big deal cards, clear CTAs, visual reward progress, minimal checkout
steps, large product photos, friendly status labels, strong empty states, fast reorder actions),
and an "Important Components" list (`DealCard`, `BranchCard`, `ProductCard`, `RewardProgressCard`,
`StarProgressBar`, `OrderStatusTimeline`, `CouponCard`, `CartItem`, `FlavorSelector`,
`SizeSelector`, `PickupTimeBadge`). It says nothing about alerts, toasts, dialogs, or notification
patterns specifically, and does not list a Toast/Alert component. This confirms the correction
stated in the Summary: the "no raw system alerts" framing is a reasonable, already-committed-to
inference from the prior program, not a literal §12 mandate.

**Prior plan precedent (`kid-friendly-ui-deals-unification_16-07-26`, Phase A, delivered):**
established `ConfirmDialog`'s shape, its "no Modal" rationale, its `mode`/`variant` prop contract,
and the per-screen wiring test pattern this SPEC's AC5 explicitly reuses. It also explicitly
deferred the staff order-detail confirm with the documented reason "staff aren't the kid audience,"
which this SPEC now resolves by bringing that site in scope (not overriding the reasoning — staff
UX consistency has its own value independent of the "kid-friendly" framing).

**Standing user preference (from memory):** the user wants real automated tests over Agent-Probe
wherever achievable. This SPEC's acceptance criteria are written to make every criterion that CAN
be proven automatically say so explicitly (AC1-AC6, AC8-AC10), and to be blunt where automation is
genuinely impossible (AC7's on-device geometry check) rather than let a Hybrid proxy quietly stand
in for full proof.
