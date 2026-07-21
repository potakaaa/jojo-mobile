---
name: spec:kid-friendly-ui-deals-unification
description: "Two-phase program: (A) kid-friendly UI/UX pass on apps/mobile + packages/ui only, (B) resolve the 3-way deals-model split so mobile deals reflect what admin creates"
date: 16-07-26
feature: general
---

# SPEC: Kid-Friendly Mobile UI + Deals Model Unification

## Summary

This program has two separable goals, sequenced as two phases of one plan.

**Phase A** makes the Jojo Potato mobile app noticeably easier to look at and use — bigger text,
bigger buttons, calmer screens, friendlier confirmations — so a 10-year-old can order food without
adult help. It touches only the mobile app's visuals and layout; nothing about how ordering, cart,
or checkout *works* changes.

**Phase B** fixes a real data-consistency problem: today there are three different, disconnected
places that define what a "deal" is (an old discount-table model, a new admin-managed
products-as-deals model, and a hardcoded list baked into the app). Depending which screen you look
at, "the deals" mean different things. Phase B makes one deal source true everywhere a customer
sees deals, so what admin creates in the dashboard is what customers actually see and can redeem —
without breaking the reward-coupon redemption flow that already works today.

## User Stories / Jobs To Be Done

### Phase A — kid-friendly UI

- As a young customer (around age 10), I want text and buttons big enough to read and tap easily,
  so that I don't need an adult to help me read the menu or place an order.
- As a young customer, I want each screen to show me one clear thing to do next, so that I'm not
  overwhelmed by a wall of information when I open the app.
- As a young customer, I want confirmations for things I might not mean to do (like clearing my
  cart) to use friendly, clear words — not scary technical language — so I understand what will
  happen before I tap.
- As a parent, I want my child to be able to browse and order without accidentally placing an
  order they didn't mean to place, so that I trust handing them the app.
- As the product owner, I want this visual pass to introduce zero new bugs in ordering, cart, or
  checkout, so that a "prettier" release doesn't become a "broken" release.

### Phase B — one true deals source

- As a customer, I want the deals I see in the app to be deals that actually exist and that I can
  actually get, so that I'm not shown something I can't redeem.
- As an admin, I want the deal I create in the dashboard to be the deal customers see on their
  phones, so that I don't have to maintain the same promotion in two places.
- As a customer who has already earned a reward coupon (stars program), I want redeeming that
  coupon at checkout to keep working exactly as it does today, so that a "deals cleanup" doesn't
  cost me a reward I already earned.
- As the product owner, I want a single, clearly documented answer for "what is a deal" going
  forward, so future work (e.g. the stale mobile-repoint handoff doc) doesn't get executed against
  an out-of-date plan.

## What The User Wants (Behavioral Outcomes)

### Phase A (observable, visual/interaction only)

- Every tappable button and interactive row is large enough to hit easily and reliably on a first
  try, including on cart line items and secondary actions (not just primary CTAs).
- Body text and any text carrying real information (prices, item names, order status) is large
  enough to read comfortably without squinting; only truly decorative/very-low-priority text may
  stay small.
- The Home screen and other dense screens present less at once — the most important thing to do
  is visually obvious immediately, secondary content is available but not competing for attention.
- Destructive or hard-to-undo actions (clear cart, cancel order, sign out) show a plain-language
  confirmation with clear "keep going" / "stop" choices — not raw system alert text.
- The checkout screen's existing auto-submit countdown behavior is explicitly addressed per the
  locked decision in Acceptance Criteria (see AC-A6) — not silently left as-is or silently changed.
- Visual language stays inside the existing locked design-token table (colors, type scale, radii,
  shadows) — the "kid-friendly" feel comes from applying those tokens more generously (bigger
  sizes, more spacing, simpler layouts), not from inventing a new visual system.
- All existing ordering/cart/checkout/browsing functionality behaves identically to today —
  nothing about *what happens* when a button is pressed changes, only how it looks/reads/is sized.

### Phase B (observable, data/behavior)

- A customer browsing "Deals" sees deals that were actually created and are actually active in the
  admin dashboard — not a hardcoded sample list, and not deals that no longer exist in the admin's
  database.
- A customer can view a deal's details (what's included, price) and that view matches what admin
  configured for that deal (its component items and price), not a divergent static description.
- Whatever the resolved model is, a customer redeeming a star-program reward coupon at checkout
  still gets the correct discount, with the same double-redeem and mutation-safety protections
  that exist today.
- Admin's existing deals CRUD (create/edit/attach components) keeps working exactly as today — no
  admin-facing behavior regresses.
- The stale `deals-mobile-repoint_HANDOFF_15-07-26.md` document is explicitly marked superseded by
  this SPEC's Phase B direction (see Acceptance Criteria AC-B1) so nobody executes it as-is later.

## Flow / State Diagram

### Phase A — screen density / confirmation pattern (illustrative, Home tab before/after)

```
BEFORE (dense, single scroll, small type/targets)
┌─────────────────────────────┐
│ Active-order banner (small) │
│ Branch card (small text)    │
│ Promo banner                │
│ Rewards + progress (dense)  │
│ Deals strip (dense)         │
│ Category + product grid     │  <- 6 competing sections, no clear "first tap"
└─────────────────────────────┘

AFTER (same sections, hierarchy set by size/spacing, not new nav)
┌─────────────────────────────┐
│ ⭐ ACTIVE ORDER (large, obvious, top)   <- only if one exists
│ 🏬 Your branch (large tap target)      <- clear "what to do first"
│ — secondary content below, same order —
│ Promo · Rewards · Deals · Menu (larger text/targets, more breathing room)
└─────────────────────────────┘
```

### Phase A — destructive-action confirm pattern

```
User taps "Clear cart" / "Cancel order" / "Sign out"
        │
        ▼
Friendly confirm sheet/dialog (not raw Alert.alert copy)
  "Clear your cart? You'll lose the items you added."
   [ Keep my cart ]      [ Yes, clear it ]
        │                        │
     (dismiss,               (perform action,
      nothing                 same as today's
      changes)                 underlying logic)
```

### Phase A — checkout auto-submit countdown (current state, decision required — see AC-A6)

```
Tap "Place order"
        │
        ▼
Confirm sheet opens, 5s countdown starts
  "Confirm order"   or   "Modify (Ns)"
        │                       │
   (tap Confirm,           (tap Modify,
    submits now)            cancels countdown)
        │
   countdown hits 0 → auto-submits with NO further tap
```

### Phase B — deal source unification (target state, pending INNOVATE for the "how")

```
TODAY (3 disconnected sources)
  Admin dashboard  ──writes──▶  products.is_deal + deal_components   (NEW model, admin-only, no public read)
  Old deals table  ──reads──▶  GET /deals, GET /deals/:id            (mobile browse UI reads this — STALE)
  Static catalog   ──reads──▶  DEAL_CATALOG in packages/utils        (mobile checkout-apply reads this — LIVE)

TARGET (one true source for what a customer sees as "a deal")
  Admin dashboard  ──writes──▶  products.is_deal + deal_components
                                        │
                                        ▼
                         (new/adjusted public read path — INNOVATE decides exact shape)
                                        │
                                        ▼
                          Mobile Deals browse + detail screens
                                        │
                    (redemption/discount math path — locked separately,
                     must keep STAR-004 coupon-apply flow intact)
```

## Acceptance Criteria (Testable Outcomes)

### Phase A

**AC-A1 — Minimum touch target size.** Every primary interactive control (buttons, cart
quantity steppers, list-item rows that navigate, icon-only buttons) has an effective tappable
area of at least 48×48 logical pixels, including `sm`-sized buttons and any icon-only controls
currently smaller than this.
- proven by: `packages/ui` jest-expo component test asserting rendered `Button`/interactive
  row layout dimensions meet the 48px floor (new test, Fully-Automated); Agent-Probe visual
  walkthrough of redesigned screens as a secondary confirmation.
- strategy: Hybrid

**AC-A2 — Minimum readable text size for informational text.** No text that conveys real
information (prices, item names, quantities, order status, form labels, confirmation body copy)
renders below 14px; primary content text (item names, prices, headlines) is 16px or larger.
Decorative/very-low-priority text (e.g. legal fine print, timestamps) may remain at today's sizes.
- proven by: `packages/ui` jest-expo snapshot/style assertions on updated `TypeScale` usage in
  touched components (Fully-Automated); Agent-Probe visual scan of redesigned screens (Hybrid
  confirmation).
- strategy: Hybrid

**AC-A3 — Reduced first-screen density.** The Home tab's above-the-fold content shows no more
than 2 competing "primary" visual elements at once (e.g. active-order status and one clear next
action); all other existing sections remain reachable by scrolling, not removed or hidden behind
new navigation.
- proven by: Agent-Probe walkthrough (no automated visual-hierarchy assertion exists in this
  repo; documented as Agent-Probe, not claimed as automated).
- strategy: Agent-Probe

**AC-A4 — Friendly confirmation pattern for destructive actions.** Every destructive/hard-to-undo
action currently using `Alert.alert()` (clear cart, cancel order, sign out, and any other
destructive action found during EXECUTE) is replaced with a plain-language custom
confirm component (reusing/extending `@jojopotato/ui`) with two clearly labeled choices; the
underlying action performed on confirm is unchanged from today.
- proven by: `apps/mobile` jest component test per touched screen asserting the custom confirm
  renders and both choices call the correct existing handler (Fully-Automated, new tests);
  Agent-Probe visual/copy check (Hybrid confirmation).
- strategy: Hybrid

**AC-A5 — Zero behavioral regression in ordering/cart/checkout.** All existing passing
`apps/mobile` vitest + jest suites remain green with no test deletions that reduce coverage of
ordering/cart/checkout logic; typecheck and lint stay clean.
- proven by: full `pnpm --filter @jojopotato/mobile test` + `pnpm --filter @jojopotato/mobile
  typecheck` + `pnpm --filter @jojopotato/mobile lint` re-run post-change (Fully-Automated).
- strategy: Fully-Automated

**AC-A6 — Checkout auto-submit countdown decision is explicitly recorded.** See Open Questions
Q1 for the decision itself. Whatever is decided (kept as-is / redesigned into an explicit two-tap
confirm with no silent auto-submit / other), the resulting behavior has a named test:
- If kept as-is: proven by existing checkout tests remaining green (Fully-Automated, no new
  behavior to test) — Agent-Probe re-confirms the countdown still reads clearly at larger type
  sizes.
- If redesigned to remove silent auto-submit: proven by a new `apps/mobile` jest test on
  `checkout.tsx` asserting no state transition places an order without an explicit tap (Fully-
  Automated) — **currently blocked by a known test-infra gap**: the shared reanimated jest mock
  lacks `FadeIn/FadeOut/SlideInDown/SlideOutDown/Easing/cancelAnimation`, so any test rendering
  `checkout.tsx` crashes today (see Constraints). This gap must be closed as a prerequisite, or the
  criterion is provable by Agent-Probe only until then (documented, not silently claimed as
  automated).
- strategy: Hybrid (contingent on the decision — see Open Questions Q1)

**AC-A7 — No new visual tokens invented.** Every color/type/spacing/radius/shadow value used in
the redesign traces to the existing `packages/ui/src/theme.ts` token table (or an explicit,
user-approved addition to that table) — no new hardcoded hex/px values introduced in screen code.
- proven by: `pnpm lint` custom rule if one exists, else manual diff review during VALIDATE
  confirming no new literal color/size values in touched files (Hybrid — no automated
  token-literal linter currently exists in this repo).
- strategy: Hybrid

### Phase B

**AC-B1 — Deals model decision is locked and the stale handoff doc is superseded.** This SPEC's
answer to Open Questions Q2 is the authoritative direction; a note is added to
`process/features/admin-dashboard/active/admin-dashboard_14-07-26/deals-mobile-repoint_HANDOFF_15-07-26.md`
marking it superseded by this SPEC (or the doc is moved to `backlog/` with a superseded marker) —
it must never be executed as-is by a future session.
- proven by: presence of the superseded marker (Fully-Automated grep check during VALIDATE).
- strategy: Fully-Automated

**AC-B2 — Mobile deals browse reflects the admin-managed model.** The customer-facing Deals list
and Deal Details screens source their data (name, price, component items) from the same
`products.is_deal` + `deal_components` data admin manages — not from the old `deals` table and not
from a hardcoded catalog.
- proven by: new `packages/api` vitest/supertest integration test(s) covering the new/adjusted
  public read route(s) against seeded `is_deal` products (Fully-Automated); new `apps/mobile`
  jest/vitest test(s) confirming the browse/detail screens render from the new data shape
  (Fully-Automated).
- strategy: Fully-Automated

**AC-B3 — STAR-004 coupon-apply flow keeps working unchanged.** The existing reward-coupon
redemption flow (`POST /coupons/apply`, double-redeem guard, zero-mutation-of-past-orders
guarantee) continues to pass all of its existing acceptance criteria with no regressions,
regardless of how Phase B resolves deal browsing.
- proven by: full existing `packages/api` `coupons.integration.test.ts` suite (AC1-AC4 incl. "AC3
  — deal parity" and "AC4 — zero mutation") re-run green with zero modifications needed to pass
  (Fully-Automated) — if a modification IS needed, it must be reviewed as a deliberate, documented
  change, not an incidental break.
- strategy: Fully-Automated

**AC-B4 — Admin deals CRUD keeps working unchanged.** The existing `admin-deals.integration.
test.ts` suite (AC1-AC11, incl. the create-with-components wizard and the snapshot-integrity
guarantee) continues to pass unmodified.
- proven by: full `admin-deals.integration.test.ts` suite re-run green (Fully-Automated).
- strategy: Fully-Automated

**AC-B5 — Old deals-table model's disposition is explicit.** The SPEC's chosen direction states
plainly whether the old `GET /deals`/`GET /deals/:id` routes and the old `deals`/`deal_products`/
`deal_branches` tables are (a) left dormant untouched (current state), (b) deprecated/removed, or
(c) something else — this is not left ambiguous for INNOVATE to guess at.
- proven by: presence of the explicit statement in this SPEC (see Open Questions Q2 resolution) —
  Fully-Automated presence check, not a runtime test.
- strategy: Fully-Automated

**AC-B6 — No regression in existing deals read-route tests unless deliberately retired.** If the
old `deals.test.ts` suite (302 lines, OLD model) is kept, it must stay green; if it is
deliberately retired as part of the resolved direction, that retirement is called out explicitly
in the EXECUTE report, not silently deleted.
- proven by: `deals.test.ts` suite status explicitly reported (Fully-Automated check: either
  "green" or "explicitly retired with reason" — both are acceptable terminal states, silent
  deletion is not).
- strategy: Fully-Automated

## Out Of Scope

### Phase A

- Any change to navigation structure, screen count, or information architecture beyond
  reordering/resizing existing sections for clarity (no new tabs, no removed tabs, no new
  multi-step flows).
- Any change to business logic: pricing math, cart totals, order placement rules, deal
  eligibility rules, auth rules.
- Any API, schema, or backend change of any kind.
- Building an automated navigation/E2E test runner (Detox/Maestro/Playwright) — this remains a
  documented project-wide gap, not something this program closes.
- Full accessibility audit (screen reader support, dynamic type scaling beyond the token changes
  described here) — flagged as a good future follow-up, not in this scope.
- Rebranding, new illustrations/icon sets, or any visual language outside the locked design-token
  table.

### Phase B

- Coupons/promo-code entry UI — remains disabled/out of scope exactly as it is today (no `code`
  column on the new model, no Coupon Wallet feature).
- Real pricing/cart-apply support for the 4 "complex" old-model deal types (buy_one_take_one,
  free_item, free_upgrade, bundle) — these were never cart-applicable and stay that way.
- Star/rewards accrual logic changes — STAR-001/002/003 stay as-is; only the coupon-apply
  consumption path (STAR-004) is a non-regression constraint, not a target for new work.
- The dormant `deals`/`deal_products`/`deal_branches`/`coupons.deal_id` schema reserved for a
  future ADM-008 (Promotion→Offer→Coupon) — not touched, not repurposed, by this program.
- Live payment processing — unrelated and unaffected.

## Constraints

- **Phase A must not touch** `packages/api`, any schema, any route, or any file outside
  `apps/mobile` and `packages/ui` (plus their existing test files).
- **Phase A visual tokens** must come from the existing locked table in
  `packages/ui/src/theme.ts` / `process/general-plans/active/jojopotato-design-system_08-07-26/`.
  A genuinely new token (e.g. a new type-scale step) may be added to that table but must be
  presented to the user as an explicit deviation, not invented silently mid-EXECUTE.
- **Known test-infra gap (Phase A):** the shared jest reanimated mock
  (`apps/mobile/src/test-utils/jest-setup.ts`) lacks `FadeIn/FadeOut/SlideInDown/SlideOutDown/
  Easing/cancelAnimation`, so any jest test that renders `checkout.tsx` currently crashes. Any
  Phase A acceptance criterion touching checkout's rendered behavior is Agent-Probe-only until
  this gap is closed (closing it is a reasonable candidate PLAN checklist item, not mandatory).
- **Phase B must never mutate or delete** the dormant `deals`/`deal_products`/`deal_branches`
  tables or the reserved `coupons.deal_id`/`orders.deal_id` columns — they stay reserved for
  future ADM-008.
- **Phase B must not break** `packages/api`'s `coupons.integration.test.ts` (STAR-004 flow) or
  `admin-deals.integration.test.ts` (admin CRUD) — both are hard non-regression gates.
- Sequencing constraint (see Open Questions Q3 for the explicit confirm): Phase A ships first as
  the lower-risk, UI-only change; Phase B ships second once its model direction is locked via
  INNOVATE, since it touches API/schema/mobile-data-layer surfaces.
- Both phases are governed by this single SPEC — INNOVATE and PLAN run once per phase, but neither
  phase re-opens this SPEC's locked decisions once EXECUTE begins for that phase.

## Open Questions

**Q1 — Checkout auto-submit countdown: in scope or out for Phase A?**
Owner: user (safety-relevant UX decision, cannot be inferred).
Recommendation: treat the countdown's *visual/copy* presentation as in-scope (larger text,
friendlier "Modify (Ns)" / "Confirm order" labels, consistent with AC-A2/AC-A4) but treat removing
the *silent auto-submit-on-timeout* behavior as an explicit, separately-flagged change — because
it is a behavior change, not a pure visual one, and the user said "touch only UI/UX." Recommended
default: **keep the auto-submit timing behavior exactly as today, restyle only its presentation**,
unless the user says otherwise. This SPEC records that recommendation as accepted by default;
proceed under it unless corrected.

**Q2 — Which deals-model direction does Phase B lock?**
Owner: user, with a recommendation from this SPEC to ground INNOVATE.
Options considered:
  (a) Mobile browse AND apply both move to the new `is_deal`/`deal_components` model; retire the
      old `deals` table's public routes.
  (b) Mobile browse moves to the new model; checkout-apply keeps using the STATIC catalog
      (`DEAL_CATALOG`) exactly as STAR-004 built it — browse and redemption become two
      intentionally separate code paths (deal-as-product for browsing, coupon-code for
      discounting).
  (c) Something else (e.g. the static catalog itself becomes admin-managed instead of hardcoded).
Recommendation: **(b)**. STAR-004's coupon-apply flow is a working, tested, in-scope-locked
feature (its own SPEC explicitly states the static catalog is out of scope to change); unifying
browsing onto the admin-managed model gives the real product win (admin's deal is what customers
see) without touching STAR-004's redemption math at all, which is the safest path to satisfy both
"nothing breaks" constraints simultaneously. This SPEC records (b) as the locked direction unless
the user corrects it before INNOVATE begins.
Resolution recorded: **(b)** is locked for this SPEC (see AC-B2, AC-B3, AC-B5). The old `deals`
table's public routes are left dormant/untouched per AC-B5 option (a) — not deprecated in this
program (a future workstream may retire them once mobile browse fully repoints).

**Q3 — Sequencing: Phase A first, Phase B second — confirmed or reversed?**
Owner: user.
Recommendation: **confirmed as stated** — Phase A is pure UI/UX with no schema/API risk and can
ship independently; Phase B touches API/schema/mobile-data-layer and benefits from Phase A's
calmer UI patterns (e.g. the friendly-confirm component) being available if Phase B's INNOVATE
decides a redemption-conflict confirmation is needed. No technical reason to reverse. Recorded as
accepted unless the user corrects it.

All three questions above have a recorded default/recommendation and are NOT blocking SPEC
completion — proceed to INNOVATE under these recorded defaults; the user may correct any of them
at the Phase-End Recommendation Gate below without needing to re-open this document.

## Background / Research Findings

**Phase A grounding:**
- `process/general-plans/active/jojopotato-design-system_08-07-26/` locked the full token table
  (colors/type/spacing/radii/shadows), traced from the live jojopotato.ph site. Status: CODE DONE.
  `packages/ui/src/theme.ts` is the enforced source of truth — `TypeScale.body = 16`,
  `bodySmall = 14`, `caption = 12`; `Spacing`/`Radii`/`Shadows` tokens also exist.
- `process/general-plans/active/shared-ui-component-library_09-07-26/` built the current 24-
  component `packages/ui` set in a "flat comic" style (2px ink borders, hard offset shadows, pill
  radii, Fredoka display font) — functionally the same visual language `apps/admin` separately
  named "Tactile Comic Brutalism."
  `Button`'s `md` size uses `paddingVertical: 12` / `paddingHorizontal: 24` (borderline vs. a
  48px kid-friendly floor depending on line-height); `sm` buttons are smaller still and are used
  in places like checkout's "Change" action.
- Home tab (`(tabs)/index.tsx`) is a dense 6-section single scroll (active-order banner, branch
  card, promo banner, rewards+progress, deals strip, category+product grid).
- Checkout (`order/checkout.tsx`) has a real 5-second auto-submit countdown: tapping "Place order"
  opens a confirm sheet; if the user doesn't tap "Modify (Ns)" within 5 seconds, the order
  auto-submits with no further tap (confirmed by reading the countdown `useEffect`/`setTimeout`
  logic directly, lines ~144-170 and ~309-398 of `checkout.tsx`).
- Multiple screens use native `Alert.alert()` for both benign and destructive confirmations, with
  system-styled small text and blunt wording (e.g. "Clear it and start a new order").
- Test coverage: 21 `packages/ui` jest-expo component tests exist; `AddonSelector`,
  `BranchListItem`, `GoogleButton`, `BrandWordmark` currently have zero tests. `apps/mobile` has a
  jest/jest-expo RN component runner (added 15-07-26) PLUS a vitest pure-TS runner; the shared
  reanimated jest mock lacks layout-animation exports, so tests rendering `checkout.tsx` currently
  crash (documented known gap, `process/context/tests/all-tests.md`). No navigation/E2E runner
  exists at all (project-wide known gap).
- The core ordering journey (Home→Product→Cart→Checkout→Confirmation) is already lean at ~4
  screen navigations — the friction identified is information density per screen, not screen
  count, which is why this SPEC frames the fix as resizing/reordering, not restructuring.

**Phase B grounding:**
- Three parallel "deal" representations exist today:
  1. OLD DB model — `deals`/`deal_products`/`deal_branches` tables, public `GET /deals`,
     `GET /deals/:id` routes (`packages/api/src/routes/deals.ts`), read by mobile's
     `use-deals.ts`/`use-deal.ts` for browse/detail UI only.
  2. NEW admin model — `products.is_deal = true` + self-referential `deal_components` junction
     (migration `0007_fearless_crystal.sql`, renumbered per code comments), exposed only via
     admin-gated `packages/api/src/routes/admin/deals.ts` CRUD. No public/customer route reads
     this model today.
  3. STATIC catalog — `packages/utils/src/deals-catalog.ts`'s in-memory `DEAL_CATALOG`, the
     actual live path mobile's checkout-apply flow uses today (`POST /coupons/apply` →
     `resolveCouponDiscount` → `findCatalogDealByCode`), shipped by STAR-004
     (`process/features/rewards-notifications/active/star-004-reward-redemption_15-07-26/`).
     STAR-004's own SPEC/plan explicitly locks this catalog as static/out-of-scope-to-change.
- `process/features/admin-dashboard/active/admin-dashboard_14-07-26/
  deals-mobile-repoint_HANDOFF_15-07-26.md` proposes repointing mobile browse to model 2 and
  **retiring** `apply-deal.ts`/`eligibility.ts`/`use-deal-usage.ts` — this is now STALE, because
  those files are live dependencies of STAR-004's coupon-apply flow
  (`eligibility.ts`'s `checkDealEligibility`/`computeDealDiscountCents` are re-exported and used
  server-side in `coupon-apply.ts`; `use-deal-usage.ts` reads real order history). Executing that
  handoff as-is would break STAR-004 and its test suite (AC3/AC4 in `coupons.integration.
  test.ts`). This SPEC's Q2/AC-B1 resolution formally supersedes it.
- Must not touch: `deals`/`deal_products`/`deal_branches` schema and `coupons.deal_id`/
  `orders.deal_id` columns — explicitly dormant/reserved for a future ADM-008
  (Promotion→Offer→Coupon), confirmed accurate in current code comments.
- Test files affected by any Phase B change: `packages/api/src/routes/__tests__/deals.test.ts`
  (OLD model, 302 lines), `packages/api/src/lib/__tests__/admin-deals.integration.test.ts` (NEW
  model, 860 lines), `packages/api/src/routes/__tests__/coupons.integration.test.ts` (STATIC
  catalog apply path, 340 lines, incl. "AC3 — deal parity" / "AC4 — zero mutation").
- No customer-facing route currently returns `deal_components` at all — building one (or
  extending an existing menu route) is a prerequisite for any Phase B resolution and is left to
  INNOVATE/PLAN to design concretely.
