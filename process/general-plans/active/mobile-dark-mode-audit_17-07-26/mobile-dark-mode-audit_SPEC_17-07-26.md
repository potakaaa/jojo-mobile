---
name: spec:mobile-dark-mode-audit
description: "Product-discovery SPEC for the mobile dark-mode screen audit + Android StatusBar legibility fix"
date: 17-07-26
feature: general-plans
---

# Mobile Dark-Mode Audit + StatusBar Legibility — SPEC

## Summary

Dark mode already works at the infrastructure level (the theme-preference store, the resolver
hook, and the Account-tab toggle are all correct and untouched by this work). What's broken is
two narrower things: (1) a handful of screens render unreadable text because a shared UI
component silently defaults to light-mode styling when a screen forgets to tell it which mode
to use, and (2) on Android, the status bar can become invisible when the phone's system theme
and the user's chosen app theme disagree. This SPEC locks what "screens render correctly in
dark mode" and "status bar stays visible" mean, so the fix can be planned and reviewed without
guessing.

**Important framing change from the original request:** the original write-up suspected
"per-screen token misuse" (screens using the wrong color variable). Investigation this session
found something narrower and more mechanical: 15 of 17 screens that use the shared `Card`
component pass the correct mode; exactly 2 forgot to, and `Card` silently falls back to a
`'light'` default instead of erroring or following the screen's real theme. The same
silent-default pattern exists in every other shared themed component (`Badge`, `Button`,
`Input`, `ProductCard`, etc. — roughly 26 components total), so the same class of bug could be
hiding anywhere those components are used without their `mode` prop passed. The audit's real job
is to find every place this omission happened — not to rewrite the theming system.

## User Stories / Jobs To Be Done

- As a customer using dark mode, I want every screen I visit (tabs, product pages, cart,
  checkout, order tracking, order history, branch details, notifications, deals, auth screens)
  to display legible text and correctly colored surfaces, so that I can actually read and use
  the app instead of hitting an unreadable page.
- As a customer, I want the Android status bar (clock, battery, signal icons) to stay visible
  no matter how my phone's system theme and the app's chosen theme combine, so that I never lose
  system information at the top of the screen.
- As a customer, when I switch the theme toggle (System / Light / Dark) in Account settings, I
  want every visible screen to update immediately, and I want my choice to still be in effect the
  next time I open the app.
- As a customer with the "System" theme preference, when I change my phone's system theme while
  the app is in the background, I want the app to reflect that change when I come back to it.
- As the engineering team, we want a way to prove — not just claim — that this class of bug
  (a themed component rendered without knowing which mode it's in) cannot silently recur, so a
  future screen doesn't reintroduce the same defect.

## What The User Wants (Behavioral Outcomes)

- Every screen in the app (5 tab roots, all pushed/nested screens under each tab, the pre-login
  `(auth)` stack, and the `(staff)` shell) is visually correct in both Light and Dark: no
  unreadable text (light-on-light or dark-on-dark), no invisible buttons/borders, no jarring
  mismatched panels.
- The Android status bar's icon/text color always contrasts against whatever surface is actually
  drawn beneath it — never white-on-white or black-on-black — across all 4 combinations of
  (system theme) x (app theme preference).
- The same 4 combinations are visually correct on iOS (iOS's status bar behavior may differ
  technically from Android's, but the user-visible bar must still be legible in all 4 cases).
  On iOS, "always contrasts" additionally means the bar auto-adapts as it currently does when the
  app's own theme preference is System — but for an explicit Light/Dark app preference this bar
  must still track the app's preference, not silently defer to the OS scheme.
- Toggling the theme preference updates every currently-visible surface without needing an app
  restart; the choice persists across an app restart.
- With "System" selected, backgrounding the app, changing the OS theme, and resuming the app
  picks up the new OS theme without any user action.
- No future screen or shared component silently renders in the wrong mode because a `mode` prop
  was forgotten — this is provable by an automated check, not just a one-time manual sweep.

## Flow / State Diagram

```
Theme resolution (already correct, not being changed):

  theme-preference.ts (secure-store: 'system'|'light'|'dark')
              │
              ▼
   use-color-scheme.ts  ──(if 'system')──> RN Appearance API (live, incl. on app resume)
              │
              ▼
        resolved scheme: 'light' | 'dark'
              │
              ├──> use-theme.ts -> Colors[scheme]  (used by screens directly)
              │
              └──> passed explicitly as `mode` prop to @jojopotato/ui components
                          │
                          ▼
              ┌───────────────────────────────────────────┐
              │  THE BUG CLASS (this SPEC's target):       │
              │  Card/Badge/Button/... default mode='light' │
              │  when a screen forgets to pass `mode`.      │
              │  Component renders light surface + screen's │
              │  real (possibly dark) text tokens overlaid  │
              │  = unreadable.                              │
              └───────────────────────────────────────────┘

Known-bad call sites found this session (starting point, not the full list):
  order/history.tsx:74   <Card> (no mode passed) -> text at :76-91 unreadable in dark
  order/cart.tsx:239     <Card> (no mode passed) -> text at :240-241,247 unreadable in dark

Audit obligation: sweep the ~80 other call sites of any `mode`-taking component to find
the rest of this class (see Acceptance Criteria).

StatusBar bug (separate defect, same root shape — following OS instead of app state):

  _layout.tsx:96   colorScheme resolved (correct)
       │                              │
       ├──> SystemUI.setBackgroundColorAsync (:122-126)   [correct — follows app theme]
       ├──> nav ThemeProvider (:143)                       [correct — follows app theme]
       └──> <StatusBar style="auto" /> (:149)               [WRONG — "auto" follows OS scheme,
                                                               not the resolved app theme]

  Mismatch case: OS dark + app preference light -> StatusBar (auto) reads OS dark -> draws
  light content -> surface underneath is light (app preference) -> invisible bar.
```

## Acceptance Criteria (Testable Outcomes)

Each criterion below restates one of the user's 9 original acceptance criteria, honestly tiered
by how it will actually be proven. No criterion is marked Fully-Automated unless a real
automated test can assert it today with the runner that exists (`apps/mobile` jest/jest-expo,
established 15-07-26 — see Background).

1. **Order History renders correctly in dark mode** (no unreadable/invisible/clipped text).
   - proven by: a new `card.test.tsx` unit test (packages/ui) asserting `Card` renders the
     dark-mode surface color when `mode="dark"` is passed, PLUS a `history-screen.test.tsx`
     RTL render test (mocking `useColorScheme` -> `'dark'`) asserting the rendered `Card`
     receives/resolves dark tokens, not the light default.
   - strategy: Fully-Automated

2. **Every tab root (Home, Order, Rewards, Branches, Account) renders correctly in both themes.**
   - proven by: RTL render-smoke tests per tab root (mock scheme = light, then dark; assert no
     thrown error and assert any themed child components receive a mode matching the mocked
     scheme — reusing the existing screen-test pattern from `branches-screen.test.tsx` /
     `account-screen.test.tsx`).
   - strategy: Fully-Automated for "component receives correct mode prop / no crash"; Hybrid for
     "looks visually correct" — RTL confirms prop wiring, not pixel-level legibility. Visual
     confirmation of final contrast/legibility is Agent-Probe (see criterion 9 tiering note).

3. **Every pushed screen (product details, cart, checkout, payment method, confirmation,
   tracking, order history, branch details, notifications, deals list, deal details) renders
   correctly in both themes.**
   - proven by: same RTL render-smoke + mode-prop-assertion pattern as criterion 2, one test file
     per screen (or per screen group where screens share a container).
   - strategy: Fully-Automated for prop-wiring/no-crash; Hybrid for full visual confirmation
     (same split as criterion 2).

4. **The `(auth)` stack and the `(staff)` shell render correctly in both themes.**
   - proven by: same RTL pattern extended to `(auth)/*` and `(staff)/*` screens.
   - strategy: Fully-Automated for prop-wiring/no-crash; Hybrid for full visual confirmation.

5. **Android status bar is legible in all 4 combinations** (OS light/app light, OS light/app
   dark, OS dark/app light, OS dark/app dark).
   - proven by: a pure unit test on the extracted `resolveStatusBarStyle(appScheme)` (or
     equivalent) function — asserts app-scheme-in, bar-style-out mapping is correct and does NOT
     depend on OS scheme. This proves the derivation logic is right.
   - strategy: Hybrid. The derivation function is Fully-Automated. Actually observing the
     physical status bar pixels being legible on a real/emulated Android device across all 4 OS
     x app combinations is not reachable by the jest/RTL runner (no OS-chrome rendering) —
     that residual is Agent-Probe / Known-Gap, tracked explicitly, not silently assumed passing.

6. **Same 4 combinations verified on iOS.**
   - proven by: same derivation-function unit test as criterion 5 (shared logic, platform
     difference is only in how `expo-status-bar` applies the style, not in the app-side
     derivation).
   - strategy: Hybrid, same split as criterion 5 — derivation logic automated, on-device
     legibility is Agent-Probe / Known-Gap.

7. **Switching the toggle updates every visible surface without a restart, and persists across
   a restart.**
   - proven by: this is unchanged, existing, already-working behavior per Finding 1
     (`use-color-scheme.ts`/`theme-preference.ts` are sound and out of scope for changes) —
     re-confirmed by existing/adjacent tests exercising `useThemePreference`'s
     `useSyncExternalStore` store, if such a test exists; if not, a light regression test is
     acceptable but is not the primary deliverable of this work.
   - strategy: Hybrid. The store's reactivity is unit-testable; the actual multi-surface visual
     update and the "survives an app restart" (secure-store persistence across process restart)
     claim cannot be observed by a jest render test — that residual is Agent-Probe.

8. **With preference "system", changing the OS theme while backgrounded is picked up on
   resume.**
   - proven by: RN's `Appearance.addChangeListener` reactivity is a platform primitive already
     relied upon (Finding 1) and out of scope to rebuild; a targeted unit test can mock an
     `Appearance` change event and assert `useColorScheme()`'s returned value updates.
   - strategy: Hybrid. The listener-wiring is Fully-Automated-testable via a mocked event; actual
     OS-level backgrounding behavior is Agent-Probe / Known-Gap.

9. **No new direct imports of RN's `useColorScheme` outside `use-color-scheme.ts` /
   `use-color-scheme.web.ts`, and no new hardcoded colors duplicating `theme.ts` tokens; AND
   (added by this SPEC per the user's explicit full-audit requirement) every `mode`-taking
   `@jojopotato/ui` component call site across `apps/mobile/src/app/**` either passes `mode`
   explicitly or is confirmed to intentionally rely on a fixed/default mode.**
   - proven by: a grep-backed regression test (or lint-guard script, exact mechanism is an
     INNOVATE decision — see Open Questions) that fails CI if a new raw `useColorScheme` import
     appears outside the two allowed files, and a second guard/test enumerating every themed
     component call site and asserting each one either passes `mode` or appears on an explicit,
     reviewed allow-list (for genuinely-intentional fixed-mode usage, if any exists).
   - strategy: Fully-Automated. This is the one criterion in the whole set that is 100%
     mechanically checkable — it is a grep/AST scan, not a rendered-pixel judgment — and it is
     also the durable prevention mechanism the user asked for ("provable, not just fixed once").

**Audit-completeness sub-requirement (elevated to its own checkable item, not an assumption):**
The plan must produce and the execute phase must certify a full enumeration of every call site
of every `mode`-taking `@jojopotato/ui` component under `apps/mobile/src/app/**` (~80 sites per
Finding 4, in addition to the 17 `Card` sites already checked), classifying each as
"correct / needs fix / intentionally fixed-mode." This enumeration itself is proven by the same
grep/AST guard script named in criterion 9 — the script's own passing output IS the completed
audit's evidence artifact.

## Out Of Scope

- Rebuilding, replacing, or materially changing `theme-preference.ts`, `use-color-scheme.ts`
  (or its `.web.ts` sibling), `use-theme.ts`, or the Account-tab System/Light/Dark toggle. These
  are confirmed working (Finding 1) and are explicitly user-forbidden to touch.
- `apps/admin` (the TanStack Start web admin dashboard). It has its own, separate Tailwind v4
  `@theme` token system and is not part of the mobile RN dark-mode substrate at all.
- Deciding HOW to fix the two known-bad call sites and the audit's remaining findings (call-site
  fix vs. changing the shared component's default) — this is an INNOVATE-phase design decision,
  not a SPEC-time decision. See Open Questions.
- Deciding the exact mechanism for the "no more silent mode-default bugs" guard (custom ESLint
  rule vs. a grep-backed test script vs. something else) — also an INNOVATE-phase decision. The
  requirement is only that SOME automated, CI-enforceable guard exists; the mechanism is not
  locked here.
- Full on-device Agent-Probe verification of the 4 OS/app StatusBar combinations on both real
  Android and iOS hardware — flagged explicitly as a residual manual-verification item, not
  claimed as automated coverage (see criteria 5–6, 7, 8 tiering).
- Any new dark-mode-specific branding, color palette redesign, or `theme.ts` token changes
  themselves — this work fixes mis-application of existing tokens, not the tokens' values.
- Promotion to a dedicated feature folder — this SPEC intentionally stays in
  `process/general-plans/active/` given the currently-confirmed small blast radius (2 known
  sites + a bounded ~80-site sweep). If the sweep at PLAN time reveals broad, systemic breakage
  requiring changing ~26 shared component defaults, promoting to a feature folder is an available
  PLAN-time option, not a decision made in this SPEC.

## Constraints

- Must not rebuild or materially alter the theme-preference store, the resolver hook, or the
  toggle UI (user-stated hard constraint, reconfirmed sound by RESEARCH — Finding 1).
- Every fix must read colors via `theme`/`Colors` tokens from `@jojopotato/ui`, per
  `CLAUDE.md` §Theming — never a hardcoded hex, never a direct RN `useColorScheme` call outside
  the two allowed hook files.
- Where a component's surface is pinned to a fixed `mode` by design, its own text must use that
  same mode's tokens (`Colors.light.*` / `Colors.dark.*}), never the device-scheme `theme`
  (this is the existing, correct convention already documented in `CLAUDE.md`; the bug is a
  missing `mode` prop, not a misunderstanding of this rule).
- The automated test runner for this work is `apps/mobile`'s jest/jest-expo suite (established
  15-07-26 — see Background). `packages/ui`'s `Card` currently has zero test coverage; new tests
  for it belong to `packages/ui`'s own jest-expo runner.
- Changing any of the ~26 shared components' `mode` default (e.g. `Card`'s `mode: ThemeMode =
  'light'` default) is itself a behavior change with its own blast radius across every existing
  consumer of that component — if INNOVATE selects this approach, PLAN must treat it as a
  cross-cutting change requiring its own regression sweep, not a drive-by edit.
- iOS's `StatusBar` legibility mechanism is not necessarily identical to Android's under the
  hood (Finding 6 diagnosis is Android-specific); the fix must be verified/adapted for iOS
  behavior too, not assumed to transfer unchanged.

## Open Questions

*(Surfaced for INNOVATE — not answered here.)*

1. **Fix location for the mode-default bug class:** fix at each call site (pass `mode`
   explicitly wherever missing) vs. fix at the component level (make `mode` a required prop, or
   make the default scheme-aware instead of hardcoded `'light'`)? The latter touches ~26 shared
   components and every consumer — a materially larger blast radius. Owner: INNOVATE.
2. **Prevention-mechanism choice:** a grep-backed test/script guard (orchestrator's provisional
   lean, given the defect is currently only 2 sites — a bespoke ESLint rule is disproportionate)
   vs. a custom ESLint rule vs. some other CI check. Recorded here as provisional only; INNOVATE
   may revisit. Owner: INNOVATE.
3. **Feature-folder promotion:** if the full call-site sweep (criterion 9 / the audit
   sub-requirement) turns up widespread breakage beyond the currently-known 2 sites, should this
   work be promoted from `process/general-plans/active/` into a dedicated feature folder before
   PLAN proceeds? Owner: PLAN, decided once the sweep's findings are in.

No items remain that block finalizing this SPEC — all three questions above are legitimately
downstream design/scope decisions, not missing information needed to describe user intent.

## Background / Research Findings

- **Substrate is sound (do not touch):** `theme-preference.ts` is a `useSyncExternalStore`
  module store (`system|light|dark`, expo-secure-store-backed). `use-color-scheme.ts:12-17`
  resolves the preference and falls back to RN's `useColorScheme()` for `'system'`, which is
  reactive to live OS changes via RN's internal `Appearance.addChangeListener` (covers criterion
  8's underlying mechanism). `use-theme.ts:9-14` does `Colors[scheme === 'dark' ? 'dark' :
  'light']`. The web variant (`use-color-scheme.web.ts:13-27`) correctly defers the OS read until
  post-hydration. A grep confirmed only these two files import RN's raw `useColorScheme` — no
  screen bypasses the wrapper.

- **Root cause (reframes original "per-screen token misuse" hypothesis):** it is a
  **prop-default bug**, not screens picking the wrong token. `packages/ui/src/components/
  card.tsx:17` defaults `mode = 'light'`. Two call sites pass no `mode` prop at all:
  `apps/mobile/src/app/(tabs)/order/history.tsx:74` (text children at `:76-91` use
  `theme.text`/`theme.textSecondary`) and `apps/mobile/src/app/(tabs)/order/cart.tsx:239`
  (reorder-conflict notice, text at `:240-241,247`). Net effect: a permanently light `Card`
  surface overlaid with real-scheme (possibly dark) text — near-white-on-cream in dark mode.

- **Scope of the clean set:** 15 of 17 `Card` call sites correctly thread `mode={mode}`
  (verified across `(staff)/*`, `(tabs)/account/*`, `(tabs)/branches/[branchId].tsx`,
  `(tabs)/checkout.tsx`, `(tabs)/rewards/index.tsx`, `(auth)/*`, `(onboarding)/index.tsx`). The
  17th clean-but-irrelevant site is dev-only `component-showcase.tsx:241`.

- **The bug class is structurally possible anywhere, not just `Card`:** every `mode`-taking
  component in `packages/ui` defaults to `'light'` — `Badge`, `Button`, `Input`, `EmptyState`,
  `BranchCard`, `CartItem`, `CartSummary`, `ConfirmDialog`, `CouponCard`, `DealCard`,
  `FlavorSelector`, `GoogleButton`, `NotificationRow`, `OrderStatusBadge`,
  `OrderStatusTimeline`, `PaymentMethodSelector`, `PickupTimeBadge`, `ProductCard`,
  `RewardProgressCard`, `RewardsTerms`, `SizeSelector`, `StarProgressBar`, `Toggle`,
  `AddonSelector`, `BrandWordmark`, `BranchListItem`. Roughly 80 non-`Card` call sites across
  `apps/mobile/src/app/**` were NOT exhaustively verified this session (only 2 high-traffic
  screens were spot-checked, both clean) — this is exactly the sweep the user's audit
  requirement covers, and it is now a checkable SPEC requirement (see Acceptance Criteria,
  audit-completeness sub-requirement), not an assumption of cleanliness.

- **Placeholders are unaffected:** `ComingSoon` (`apps/mobile/src/components/
  coming-soon.tsx:29,33,45-46`) is already theme-correct, so `rewards/coupons.tsx` and
  `account/help.tsx` (which use it) are not part of the broken set.

- **StatusBar diagnosis, confirmed exactly as originally reported:** `_layout.tsx:149`'s single
  `<StatusBar style="auto" />` line is the entire defect. `"auto"` resolves its content color
  from the **OS** color scheme, while the app's actual surface color comes from the **persisted
  theme preference** (already correctly driving `SystemUI.setBackgroundColorAsync` at
  `_layout.tsx:122-126` and the nav `ThemeProvider` at `:143`, both reading the same resolved
  `colorScheme` computed at `:96`). When OS and app-preference disagree, the bar's content color
  and the surface color mismatch and the bar becomes invisible.

- **Test infra is more capable than the stale docs suggest (relevant to AC tiering):**
  `process/context/tests/all-tests.md` still records "no RN component/E2E runner for
  apps/mobile" as a project-wide gap. This is stale — a jest/jest-expo runner landed 15-07-26
  (`apps/mobile/jest.config.js`, `test-utils/render.tsx`, `jest-setup.ts`, 6 existing
  `*.test.tsx` suites, e.g. `branches-screen.test.tsx`, `account-screen.test.tsx`). This means
  the `Card`/mode-default bug class is fully automatable today (mock `useColorScheme` ->
  `'dark'`, render, assert computed style/props via RTL) — reflected in the Fully-Automated and
  Hybrid tiering above rather than defaulting everything to Agent-Probe.
  `packages/ui`'s `Card` currently has zero test coverage (no `card.test.tsx` exists yet).
  **This SPEC records that UPDATE PROCESS must correct the stale claim in
  `process/context/tests/all-tests.md`** once this work's tests land, so future agents don't
  re-read the outdated "no RN runner" gap.

- **User's known standing preference (from durable memory):** the user strongly prefers real
  automated tests over Agent-Probe claims. This SPEC's AC tiering above is written to honor that
  — nothing here is downgraded to Agent-Probe that the jest runner can actually assert; the
  Agent-Probe/Known-Gap residuals named (on-device StatusBar pixel legibility, actual app-restart
  persistence, actual OS-background-resume behavior) are genuinely unreachable by a
  component-render test, not convenience downgrades.
