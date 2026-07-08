---
name: spec:home-tab-navigation
description: "Product-discovery SPEC for the app's first real screens: bottom tab navigator + Home landing/browse screen + placeholder tabs"
date: 08-07-26
metadata:
  node_type: spec
  type: spec
  status: locked
---

# Home Tab & Navigation — SPEC

## Summary

Right now the Jojo Potato app has no navigation and no real first screen — you just see a
design-showcase page. This SPEC covers building the app's actual starting experience: a bottom
tab bar (like most food-ordering apps have) and a "Home" screen that works like a landing page
where people can browse the menu. On iPhones that support it, the tab bar will pick up Apple's
newer "Liquid Glass" look automatically. The other tabs (Order, Rewards, Account) will exist as
simple placeholder screens for now — they'll be built out in later work. Home itself will use
made-up (not real) product and branch data, styled with the brand colors and components already
built in the design-system work, and take visual cues from jojopotato.ph (what to show) and the
Zus Coffee app (how a food-ordering home screen is typically organized).

## User Stories / Jobs To Be Done

1. As a first-time app opener, I want to land on a Home screen that immediately shows me what
   Jojo Potato sells, so that I understand what the app is for without having to explore first.
2. As a returning user, I want a persistent bottom tab bar, so that I can jump between Home,
   Order, Rewards, and Account without hunting for navigation.
3. As an iPhone user on a recent iOS version, I want the tab bar to look and feel native to my
   device (Liquid Glass on iOS 26+), so that the app feels like a first-class iOS app rather than
   a generic cross-platform shell.
4. As a user browsing Home, I want to see featured/bestseller items and a way to filter by
   flavor/category, so that I can quickly find something appealing.
5. As a user who cares about pickup, I want to see which branch I'm ordering from near the top
   of Home, so that I know where my order would come from before I start browsing.
6. As a returning/loyal user, I want a visible rewards-points teaser on Home, so that I'm
   reminded my activity earns something.
7. As a user who taps into Order, Rewards, or Account before those are built, I want a clear
   "coming soon" placeholder instead of a blank or broken screen, so that I understand the
   feature isn't available yet rather than assuming the app is broken.

## What The User Wants (Behavioral Outcomes)

- Opening the app shows a bottom tab bar with 4 tabs: **Home**, **Order**, **Rewards**, **Account**.
- The **Home** tab is selected by default when the app opens.
- Home shows, top to bottom: a greeting/header, a tappable pickup-branch selector, a promo/banner
  area, a rewards-points teaser card, a horizontally scrollable flavor/category selector, and a
  scrollable grid of featured/bestseller product cards (image, name, short description, category
  tag).
- All content on Home is realistic-looking placeholder data (no live backend), and is clearly
  understood by the team as such.
- Tapping the branch selector, rewards card, category chips, or product cards may show a visual
  pressed/selected state, but does not need to navigate anywhere yet (no product detail screen,
  no branch-picker screen exist yet — those are future work).
- Switching to **Order**, **Rewards**, or **Account** shows a simple centered "Coming soon"-style
  screen for each, styled with the app's existing brand look (not a bare white/unstyled screen).
- On an iPhone running iOS 26 or later, the tab bar renders with the system Liquid Glass
  translucent/blurred material automatically. On older iOS, Android, and web, the tab bar renders
  using each platform's normal native/standard tab styling — it must not crash or visually break.
- The existing design-token showcase screen is no longer what users see when they open the app;
  it either becomes the new Home screen's content is different from it, or it remains reachable
  as a secondary/dev-only screen (final disposition is decided in this SPEC, see Acceptance
  Criteria and Background).
- App startup behavior (splash screen, font loading) looks and feels exactly the same as before —
  users should not perceive any change in app-launch behavior.

## Flow / State Diagram

```
App Launch
   |
   v
[Splash Screen] --(fonts loaded)--> [Root Stack + Theme Provider]
   |
   v
[Bottom Tab Navigator] <-- default/initial route
   |
   |-- Home tab (selected by default) --------------------> [Home Screen]
   |                                                            |
   |                                                            |-- Greeting/header
   |                                                            |-- Pickup-branch selector (tap = visual state only)
   |                                                            |-- Promo/banner area
   |                                                            |-- Rewards-points teaser card (tap = visual state only)
   |                                                            |-- Flavor/category selector (horizontal scroll, tap = filter chip state)
   |                                                            +-- Featured/bestseller product grid (scrollable)
   |
   |-- Order tab -------------------------------------------> [Placeholder: "Order — Coming soon"]
   |
   |-- Rewards tab -----------------------------------------> [Placeholder: "Rewards — Coming soon"]
   |
   +-- Account tab -----------------------------------------> [Placeholder: "Account — Coming soon"]

Platform branch (visual only, same navigation structure):
   iOS 26+          -> tab bar renders with system Liquid Glass material
   iOS < 26         -> tab bar renders with standard native iOS tab bar
   Android          -> tab bar renders with standard native Material tab bar
   Web              -> tab bar renders with basic web tab styling
```

## Acceptance Criteria (Testable Outcomes)

1. Launching the app shows a bottom tab bar with exactly 4 tabs — Home, Order, Rewards, Account —
   and Home is the initially selected tab.
   - proven by: manual verification via `pnpm ios` / `pnpm android` / `pnpm web` (app launches to Home with visible 4-tab bar)
   - strategy: Agent-Probe

2. The Home screen renders all six content sections (greeting/header, branch selector, promo
   banner, rewards teaser, category selector, product grid) without runtime errors, using
   placeholder data only.
   - proven by: manual verification via `pnpm ios` (visual scroll-through of Home) + `pnpm typecheck` (no type errors in Home screen and its mock data module)
   - strategy: Hybrid

3. Tapping each of the Order, Rewards, and Account tabs shows a styled "coming soon" placeholder
   screen (uses brand colors/typography, not a bare unstyled screen) with no crash.
   - proven by: manual verification via `pnpm ios` / `pnpm android` (tap through all 4 tabs, confirm no crash and consistent styling)
   - strategy: Agent-Probe

4. On a device/simulator running iOS 26+, the tab bar visually renders with the Liquid Glass
   system material; on older iOS/Android/web the app still launches and functions with a
   platform-appropriate tab bar (no crash, no blank screen).
   - proven by: manual visual verification via `pnpm ios` on an iOS 26+ simulator (Liquid Glass look) and `pnpm android` / `pnpm web` (no crash, tab bar visible) — this is an external OS-rendering behavior that cannot be asserted by an automated test given no test runner exists in this repo
   - strategy: Agent-Probe

5. App startup sequence (splash screen shown → fonts loaded → first screen shown) behaves
   identically to pre-change behavior; no added delay or visual flash introduced by the new
   navigator.
   - proven by: manual verification via `pnpm ios` (observe splash-to-Home transition)
   - strategy: Agent-Probe

6. The whole monorepo passes `pnpm typecheck` and `pnpm lint` after the change, with the new
   screens and navigator included.
   - proven by: `pnpm typecheck` and `pnpm lint` (root scripts, run via turbo across all packages)
   - strategy: Fully-Automated

7. The former design-token showcase content is not what users see on first app launch (Home tab
   shows the new browse-style content instead); the SPEC's decision on where the showcase content
   goes (removed vs. relocated) is implemented as decided.
   - proven by: manual verification via `pnpm ios` (confirm Home tab shows browse content, not the showcase) + code review that showcase content matches the disposition decided in this SPEC
   - strategy: Hybrid

## Out Of Scope

- Real backend/API integration for menu items, branches, or rewards (no backend is chosen yet —
  see repo Open Questions in context).
- Product detail screens, cart, checkout, or any ordering flow (belongs to the `ordering-cart`
  feature area, not this SPEC).
- Real branch-picker screen/logic, geolocation, or map integration (belongs to `pickup-branches`).
- Real rewards/points calculation or notifications (belongs to `rewards-notifications`).
- Authentication or account management screens beyond the placeholder (belongs to `auth-accounts`).
- Building out the Order, Rewards, and Account tabs beyond a placeholder screen.
- Automated end-to-end or component test coverage (no test runner exists in this repo yet;
  verification is typecheck/lint + manual Expo run per `process/context/tests/all-tests.md`).
- Any EAS Build/Submit or CI wiring.
- Pixel-perfect Android/web parity — those platforms must work and not look broken, but visual
  polish is judged against iOS first, per the repo's "iOS-first, Android-ready" principle.

## Constraints

- Must nest inside the existing root `_layout.tsx` (Stack → ThemeProvider → font-gate →
  splash-screen handling) without altering that startup sequence's behavior.
- Must reuse the existing brand tokens and components from the shared UI package (colors,
  spacing, typography, shadows, existing button/wordmark components) — no new/ad-hoc design
  tokens invented for this work.
- Must work fully offline with local mock/placeholder data — no network calls, no real backend,
  no auth.
- Must not crash or render blank on Android or web, even though Liquid Glass is an iOS-only visual
  treatment.
- No new test runner may be introduced as part of this SPEC's scope — verification stays at
  typecheck/lint + manual Expo run (introducing a runner is a separate, explicitly proposed
  decision per the repo's testing context).
- File/code conventions must follow repo norms: kebab-case filenames, camelCase
  functions/variables, PascalCase components, `@/*` import alias inside the mobile app.
- Placeholder/mock data must be clearly identifiable as placeholder (not disguised as real
  content) so nobody mistakes it for live data later.

## Open Questions

None — the following decisions carried over from RESEARCH as open items have been resolved by
this SPEC and are recorded in Background below for INNOVATE/PLAN to execute against:

- Liquid Glass approach: resolved (native tab API, with documented fallback risk).
- Tab set: resolved (Home, Order, Rewards, Account — 4 tabs).
- Mock-data approach: resolved (local static mock module using existing shared types).
- Showcase screen disposition: resolved (see Background).
- Folder/routing choice: resolved (general-plans, this task folder).

## Background / Research Findings

**Current state:** No tab navigator exists yet. `apps/mobile/src/app/` has only `_layout.tsx`
(root Stack: splash-hide-on-fonts-loaded → font gate → ThemeProvider → Stack → StatusBar) and
`index.tsx` (currently a design-token showcase screen from the just-completed design-system
work). No navigation packages are installed yet. `app.json` has typed routes enabled. A new tab
navigator must nest inside the existing root layout, not replace it.

**Liquid Glass decision:** Research found two paths — `expo-router/unstable-native-tabs`
(renders the real native iOS tab bar, gets Liquid Glass "for free" on iOS 26+, but is explicitly
alpha/unstable, capped at 5 tabs on Android, no nested navigation inside native tabs, some
FlatList scroll-to-top limitations) versus the stable `Tabs` component plus a hand-rolled blur
package for a manual glass look (more code, a new dependency, no alpha risk). Recommendation
carried into this SPEC: use the native-tabs path, since it directly satisfies the user's explicit
ask for "the liquid glass" with the least custom code, and this is early-stage foundation work
where revisiting the choice later (if the alpha API proves unstable) is acceptable. INNOVATE will
confirm this and define the concrete integration approach; PLAN will implement it.

**Tab set decision:** Four tabs — **Home**, **Order**, **Rewards**, **Account** — chosen to align
with the four existing planned feature areas (`ordering-cart`, `pickup-branches`,
`auth-accounts`, `rewards-notifications`), while keeping pickup/branch selection as part of Home
rather than a separate tab (matching the Zus Coffee pattern of surfacing pickup/branch context
near the top of Home instead of in its own tab). Four tabs comfortably respects the native-tabs
5-tab Android cap with room to spare.

**Home screen content shape:** jojopotato.ph structurally offers: hero/tagline, featured/
bestseller product grid, flavor/category selector, value-prop messaging, catering/franchising
CTAs, branch/location previews, and social proof. Zus Coffee's home pattern offers: a prominent
pickup/branch selector near the top, a tappable rewards/points card, and reward-teaser mechanics
reinforced on the home screen. This SPEC synthesizes both into the six-section Home composition
listed in Behavioral Outcomes above — this is a structural/pattern borrowing, not literal content
or copy from either source.

**Mock-data decision:** Home's placeholder product/category/branch/rewards content will use a
local static mock data source built on the already-existing shared placeholder types in the types
package (menu item, menu category, pickup branch, rewards account shapes) — these types exist
today but nothing consumes them yet. This keeps the mock data structurally realistic and easy to
swap for real data later, without inventing new ad-hoc shapes.

**Showcase screen disposition decision:** The design-token showcase screen currently at the app's
entry point will stop being what users see on launch. Given this repo has no established
"dev-only route" convention and no test runner, the SPEC's directive is: replace the current
entry screen's content with the real Home screen (the showcase's purpose — proving the design
tokens render correctly — has already been served now that real usage begins here); do not
introduce a new dev-route convention for this work. If the team wants to keep a live swatch
reference later, that is a separate, explicitly-scoped follow-up rather than part of this SPEC.

**Folder/routing decision:** This work is scoped to `process/general-plans/active/
home-tab-navigation_08-07-26/`, consistent with the just-completed design-system plan in the same
top-level location, rather than creating a new `process/features/app-shell/` folder. This keeps
ceremony proportional — this is foundational app-shell work, not yet a large multi-artifact
feature area with 5+ durable artifacts.

**Constraints carried from repo context:** iOS-first/Android-ready (no platform may crash or be
left blank); no backend/auth/DB/payments decided (Home must run fully offline on mock data);
branding is real (post design-system work) and must be reused, not reinvented; no test runner
configured (verification is typecheck/lint + manual Expo run); kebab-case files, camelCase
functions, PascalCase components, `@/*` alias, `@jojopotato/*` workspace scope for imports.
