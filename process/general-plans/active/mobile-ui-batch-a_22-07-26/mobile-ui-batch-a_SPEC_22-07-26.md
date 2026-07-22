---
name: plan:mobile-ui-batch-a
description: "Client-side mobile UI/UX fixes batch (Track A of 13): option price deltas, product-screen state reset, coupon card layout, order-history sticky header, tab-icon scroll-to-top, branches bottom-sheet drag-to-peek, star-history order linkback"
date: 22-07-26
feature: general
---

# SPEC — Mobile UI Batch A (Client-Side Polish, 7 items)

## Summary

This batch fixes seven small but real UX papercuts in the customer-facing mobile app — all client-side,
no backend work needed. Today: option pickers (size/flavor/add-ons) don't show what they cost; opening
a second product can carry over the previous product's quantity and selections; the applied-coupon row
in the cart looks like a broken button with clipped text and a wrapping price; the sticky date header on
Order History lets rows scroll visibly through it; tapping the tab you're already on does nothing if
you've scrolled down (and doesn't return you to that tab's start if you're deeper in it); the Branches
bottom sheet feels stuck open and hard to collapse; and the Rewards star-history list shows transactions
with no link back to the order that earned them. Fixing these makes the app feel finished and
trustworthy — customers can see exactly what they're paying for, screens behave predictably when
navigating back and forth, and every tab is easy to reset to its starting point.

## User Stories / Jobs To Be Done

- **A1** — As a customer customizing a product, I want to see how much each size/flavor/add-on option
  costs (or that it's the default with no extra cost), so that I can choose confidently before adding to
  cart.
- **A2** — As a customer browsing multiple products in a row, I want each Product Details screen to start
  fresh (quantity back to 1, no leftover flavor/size/add-on picks from the last product I viewed), so
  that I never accidentally order the wrong quantity or wrong customization for the wrong item.
- **A3** — As a customer with a coupon applied in my cart, I want to clearly read the coupon's name and
  discount amount without a confusing button-shaped element that isn't tappable, so that I trust the
  discount is what I think it is.
- **A4** — As a customer scrolling my Order History, I want the sticky "date group" header (e.g. "This
  Week") to stay legible and clearly separated from the order rows scrolling beneath it, so that I always
  know which date group I'm looking at.
- **A5** — As a customer navigating the app, I want tapping the icon of the tab I'm already on to always
  bring me back to that tab's starting point — popping back to its root screen if I've drilled in, then
  scrolling to the top once I'm there — so that one tap reliably resets that tab, matching how tab bars
  behave everywhere else.
- **A6** — As a customer picking a pickup branch, I want the Branches bottom sheet to be easy to drag
  down to a small, out-of-the-way peek (not stuck at a large minimum size, and never fully gone), so
  that I can quickly see more of the map while still being able to bring the branch list back.
- **A7** — As a customer reviewing my star history in Rewards, I want each entry to show which order
  earned (or adjusted) those stars, and to be able to tap through to that order, so that I can verify my
  stars against my actual purchases.

## What The User Wants (Behavioral Outcomes)

- **A1:** Every size, flavor, and add-on option row shows its price impact next to its name/label ONLY
  when that impact is non-zero — a zero-delta (default) option shows its bare name/label with no trailing
  price text at all (no "+₱0.00", no "Included", nothing). A non-zero, positive delta renders with a
  leading "+" (e.g. "+₱12.00"). If a negative delta is ever configured (a discount-style option), it must
  render in a way that is visually distinguishable from a positive delta — never silently shown with a
  "+" sign or otherwise made to look like an upcharge. This applies everywhere these three option
  selectors are used, not just the Product Details screen.
- **A2:** Opening any Product Details screen — including navigating from one product straight to another
  without leaving the screen — always starts with quantity = 1 and no options pre-selected, matching
  what a first-time visit to that screen looks like. Required-option validation and "add to cart"
  eligibility recompute correctly from the reset state.
- **A3:** The applied-coupon area in the cart clearly separates (a) the coupon's name/title, (b) a
  "Coupon applied" or similar label with room to fully display, and (c) the discount amount, fully
  visible on one line, without any element that visually implies "tap me" unless it is actually tappable.
  The existing "Remove discount" action stays available and unambiguous.
- **A4:** The sticky date-group header in Order History is visually solid/opaque and clearly separated
  from the order rows scrolling beneath it at every scroll position — no row content is visible bleeding
  through or overlapping the header text.
- **A5:** Tapping the icon of the tab you are currently active on always resets that tab, via a two-stage
  rule: (1) if that tab's own navigation stack is NOT currently at its root screen, popping back to the
  root is the entire effect of that tap — no scroll is forced in the same gesture, the newly-revealed
  root simply shows whatever scroll position it already had; (2) if that tab's stack is ALREADY at its
  root screen, the tap instead smoothly (animated) scrolls that root screen's list back to the top. A
  second tap on the tab icon (now at root, already scrolled to top from a prior tap, or freshly revealed)
  performs stage 2. This must be implemented against the current tab back-stack shape established by the
  NAV-001 through NAV-006 work, not assumed from first principles.
- **A6:** The Branches bottom sheet can be dragged down via the normal pan gesture to a small, always-
  present peek/handle state — it is never fully dismissed/removed from the screen. From the peek state,
  the sheet can be re-expanded again by drag or tap. While the sheet is at its peek position, the map
  underneath remains pannable/interactive (dragging on the visible map area does not get captured by the
  sheet's gesture handler).
- **A7:** Every star-history entry that has a source order shows a visible reference to that order (e.g.
  an order number or short label) and is tappable, navigating the customer to that order's detail screen.
  Entries with no source order (e.g. manual adjustments/reversals) render without a tap affordance and
  without a broken/empty reference.

## Flow / State Diagram

**A2 — Product Details reset on same-stack navigation:**
```
User on Product A details
   │ taps "View Product B" (from a related-items list, deep link, etc.)
   ▼
Expo Router resolves this as NAVIGATE (not PUSH) onto the same mounted
Product Details screen instance (static `index` anchor, NAV-006 behavior)
   │
   ▼
[BEFORE FIX]                        [AFTER FIX]
quantity stays at Product A's       quantity resets to 1
selection stays at Product A's      selection resets to {}
value (e.g. 3)                      (empty)
   │                                   │
   ▼                                   ▼
Product B renders with               Product B renders exactly as a
Product A's leftover state           first-time open would
(customer risk: wrong qty/           (matches A2's stated outcome)
 wrong customization ordered)
```

**A5 — Tap-active-tab two-stage reset (pop-to-root, then scroll-to-top):**
```
Customer taps the icon of the tab that is ALREADY active
   │
   ▼
Is this tab's own stack currently at its root screen?
   │
   ├─ NO (user has drilled into a pushed/nested screen within this
   │      tab's stack, e.g. a detail screen reached from this tab)
   │      ─→ pop the stack back to root. Stop here — do NOT also
   │         scroll in this same gesture. The newly-revealed root
   │         shows whatever scroll position it already had.
   │
   └─ YES (already at root)
          ─→ smoothly (animated) scroll the root screen's list to top

   Tapping again after landing at root (from either branch) triggers
   the YES branch on the next tap.

   NOTE: must be verified against the current tab stack shape from
   NAV-001..NAV-006 (e.g. which screens are "above the tabs" siblings
   vs. genuinely nested inside a tab's own stack) — not assumed.
```

**A6 — Branches bottom sheet: drag-to-peek, never dismiss:**
```
Sheet at any snap point (peek / mid / expanded)
   │ customer drags down
   ▼
Sheet settles at its smallest defined snap point ("peek") — NOT
removed from the screen, always has a visible handle/affordance
   │
   ├─ customer drags up from peek, or taps the peek handle
   │      ─→ sheet re-expands to a larger snap point
   │
   └─ customer instead pans/drags directly on the visible map area
          (sheet at peek) ─→ map pans; the sheet's gesture handler
          does not capture that touch
```

**A7 — Star history row → order detail:**
```
Rewards tab → Star history list
   │
   ├─ entry.orderId present ──▶ row renders order reference + is tappable
   │                              │ tap
   │                              ▼
   │                         navigates to that order's detail screen
   │
   └─ entry.orderId absent (adjustment/reversal) ──▶ row renders with
                                                       no order reference,
                                                       not tappable
```

## Acceptance Criteria (Testable Outcomes)

1. **AC1 (A1):** Given a product with a size group where "Regular" has a zero delta and "Large" has a
   +₱12.00 delta (real `ProductOption.priceDeltaCents` data), the "Regular" row renders with NO trailing
   price text of any kind, and the "Large" row renders "+₱12.00" (or equivalent leading-"+" formatted
   text) distinctly from the option name.
   `proven by:` component test on the shared selector(s) rendering a mixed zero/non-zero-delta option
   set, asserting the zero-delta row has no price text node and the non-zero row does, with a leading "+".
   `strategy:` Fully-Automated
2. **AC2 (A1):** The same zero-delta-hidden / non-zero-delta-shown rendering rule appears consistently
   across FlavorSelector, SizeSelector, and AddOnSelector when driven by the same `ProductOption[]` shape.
   `proven by:` component tests, one per selector, asserting the rule holds from prop data.
   `strategy:` Fully-Automated
3. **AC3 (A1):** Given a hypothetical negative-delta option (a discount-style option, even though no
   current seed data has one), the rendered price text is visually distinguishable from a positive delta
   — e.g. it does not render with a leading "+" and does not read as an upcharge.
   `proven by:` component test using a synthetic negative-delta `ProductOption` fixture, asserting the
   rendered text differs in sign/format from the positive-delta case.
   `strategy:` Fully-Automated
4. **AC4 (A1):** On the real Product Details screen, selecting an option with a non-zero delta visibly
   changes the on-screen line-item total, and the previously-existing `unitPriceCents` running total
   still matches sum(base + selected deltas) exactly (no double-count/mismatch introduced by the new
   per-row display).
   `proven by:` existing product-details logic already has a computed total; add/extend a test asserting
   the total stays correct once price-delta text is added per row.
   `strategy:` Fully-Automated
5. **AC5 (A1):** On-device, the price-delta text (shown only for non-zero-delta rows) is legible in both
   light and dark mode and does not visually crowd or truncate the option name/label at normal device
   widths.
   `proven by:` on-device Agent-Probe walkthrough (light + dark).
   `strategy:` Agent-Probe
6. **AC6 (A2):** Given the customer opens Product A, sets quantity to 3 and selects a size, then
   navigates directly to Product B without leaving the Product Details screen, Product B's screen state
   shows quantity = 1 and no options selected.
   `proven by:` an `apps/mobile` jest RN-component regression test that mounts the screen, simulates a
   product-id param change (same mounted-component reuse pattern NAV-006 established), and asserts
   quantity/selection reset — non-vacuous by first asserting the pre-fix behavior fails this exact test.
   `strategy:` Fully-Automated
7. **AC7 (A2):** After the reset in AC6, required-option validation (the "add to cart" enable/disable
   state) recomputes correctly for Product B — it is not left evaluating Product A's stale selection.
   `proven by:` same regression test as AC6, extended to assert add-to-cart eligibility.
   `strategy:` Fully-Automated
8. **AC8 (A2):** On-device, opening Product A → Product B → Product C in sequence (via whatever real
   in-app navigation paths reach Product Details) never shows leftover quantity or selections from a
   prior product.
   `proven by:` on-device Agent-Probe walkthrough exercising at least 2 real navigation paths into
   Product Details (e.g. Home product grid, Order tab menu).
   `strategy:` Agent-Probe
9. **AC9 (A3):** With a coupon/discount applied in the cart, the coupon's title text is NOT rendered as
   or inside a tappable-looking button/pill unless it is genuinely tappable; the discount label is not
   clipped (e.g. no truncation to "Ap…" observed in the reference screenshot); the discount amount
   renders fully on one line without mid-number wrapping, for both short (e.g. "-₱5.00") and long (e.g.
   "-₱1,289.00") amounts.
   `proven by:` component test on the applied-discount cart section covering a short and a long discount
   amount plus a long coupon title, asserting no truncated/ellipsized label text and that layout doesn't
   force the amount across two lines.
   `strategy:` Fully-Automated
10. **AC10 (A3):** The existing "Remove discount" action remains present, visible, and functional after
    the layout change.
    `proven by:` component/interaction test asserting the remove action still fires its handler.
    `strategy:` Fully-Automated
11. **AC11 (A3):** On-device, the reworked coupon row is visually correct in both light and dark mode at
    normal device widths, matching the reference screenshot's intent (name/label/amount all legible, no
    false button affordance).
    `proven by:` on-device Agent-Probe walkthrough.
    `strategy:` Agent-Probe
12. **AC12 (A4):** The Order History sticky section header renders with a fully opaque background at
    every scroll position — order rows scrolling underneath never visually overlap or bleed through the
    header's date-group text.
    `proven by:` on-device Agent-Probe walkthrough (this is a runtime rendering/compositing behavior that
    `jsdom`/RN component-test rendering cannot faithfully reproduce for scroll-position compositing —
    see all-tests.md's noted jsdom/RN sticky-header limitation).
    `strategy:` Agent-Probe
13. **AC13 (A4):** A component-level regression test still asserts the section header receives an
    explicit, non-transparent background color prop/style tied to the current theme (covers the
    data/prop-wiring half of the fix even though final on-screen compositing is Agent-Probe-only; this
    test does NOT prove AC12's on-screen compositing outcome, only that the correct style is wired).
    `proven by:` `apps/mobile` jest RN-component test on the Order History screen/section-header render.
    `strategy:` Fully-Automated
14. **AC14 (A5):** Given the customer is on Tab X's root/list screen and has scrolled down, tapping Tab
    X's icon again smoothly scrolls that screen back to the top. This is a native scroll-imperative
    gesture/animation outcome; there is no RN E2E or navigation test runner in this repo, so this AC's
    proof is a device walkthrough, not a unit test.
    `proven by:` on-device Agent-Probe walkthrough.
    `strategy:` Agent-Probe
15. **AC15 (A5):** Given the customer is on Tab X but currently viewing a pushed/nested screen within
    that tab's own stack (not the root), tapping Tab X's icon pops the stack back to that tab's root
    screen and does NOT also scroll in the same gesture. This is a native navigation/gesture outcome
    proven only by a real device walkthrough against the actual stack shape.
    `proven by:` on-device Agent-Probe walkthrough.
    `strategy:` Agent-Probe
16. **AC16 (A5):** A pure unit test proves ONLY the tab-bar's decision logic — given "is this a same-tab
    re-tap" and "is this tab's stack currently at root", the correct one of {pop-to-root, scroll-to-top,
    no-op-different-tab} is selected. This test proves the decision function's correctness; it does NOT
    prove that the resulting native pop or native scroll actually happens on screen — that half is AC14/
    AC15, Agent-Probe only. Do not read this AC as covering more than the decision logic itself.
    `proven by:` `apps/mobile` vitest/jest test on the tab-bar's tap-handling decision function, isolated
    from the actual navigation/scroll calls (e.g. via injected/mocked pop and scroll callbacks).
    `strategy:` Fully-Automated
17. **AC17 (A6):** On-device, the Branches bottom sheet can be dragged down from any of its snap
    positions and settles at a small peek state via the normal pan gesture (not stuck at its current 32%
    minimum) — the sheet remains visible with a handle/affordance, never fully removed from the screen.
    This is `@gorhom/bottom-sheet` native gesture behavior with no automated coverage possible in this
    repo's current test setup; proof is a device walkthrough only.
    `proven by:` on-device Agent-Probe walkthrough.
    `strategy:` Agent-Probe
18. **AC18 (A6):** On-device, with the sheet at its peek position, panning directly on the visible map
    area moves/pans the map (the sheet's gesture handler does not intercept that touch), and the sheet
    can be re-expanded from peek by drag or tap.
    `proven by:` on-device Agent-Probe walkthrough — native map-vs-sheet gesture contention cannot be
    exercised outside a real device/simulator.
    `strategy:` Agent-Probe
19. **AC19 (A7):** Given a star-history entry with a non-null `orderId`, the rendered row shows a visible
    order reference and is tappable; tapping it navigates to that order's detail screen for the correct
    order id.
    `proven by:` `apps/mobile` jest RN-component test on the Rewards star-history list, asserting the
    order-linked row renders a reference and its press handler navigates with the correct order id.
    `strategy:` Fully-Automated
20. **AC20 (A7):** Given a star-history entry with a null `orderId` (adjustment/reversal), the rendered
    row shows no order reference and is not tappable (no broken navigation, no empty/placeholder link).
    `proven by:` `apps/mobile` jest RN-component test asserting the null-orderId row renders without a
    press handler / order reference.
    `strategy:` Fully-Automated
21. **AC21 (A7):** On-device, tapping a real star-history row with an order reference lands on the
    correct order's detail screen and the back navigation returns to Rewards.
    `proven by:` on-device Agent-Probe walkthrough.
    `strategy:` Agent-Probe

## Out Of Scope

- **Add-to-cart toast** — already implemented and firing in `product/index.tsx`; no work needed.
- **Sticky-header-exists for Order History** — the `SectionList` already uses
  `stickySectionHeadersEnabled`; this batch only fixes the header's opacity/legibility (AC12/AC13), not
  whether stickiness exists.
- **Cart badge consistency across tabs** — already verified consistent; all 5 consumers already read
  `useCart().itemCount`.
- **Track B items** (a separate, later batch): closed-branch server-side ordering gate, staff reject
  reason capture, customer-initiated order cancellation, and cart line-level option editing (changing
  a cart line's flavor/size/add-ons after it's already in the cart).
- **Backend/API changes of any kind.** All 7 items in this batch are resolvable with client-only
  (`apps/mobile` + `packages/ui`) changes; no `packages/api` route, schema, or migration work is in
  scope. (A7 does not need a new API — `GET /rewards/history` already returns `orderId`.)
- **New price-delta UI on the admin side** (`apps/admin` product-option editing) — this batch is
  customer-facing display only.
- **A general-purpose "scroll to top" utility/library adoption** — A5 covers only the tab-icon-tap
  two-stage behavior described here, not a broader scroll-restoration architecture.
- **Redesigning the Branches bottom-sheet snap-point set's larger content or the map UI itself** — A6 is
  about adding/adjusting a peek snap point and drag/gesture behavior, not a visual redesign of what's
  inside the sheet or the map screen generally.
- **Fully dismissing the Branches bottom sheet** — explicitly rejected (see A6 resolution below); the
  sheet must always remain present at minimum as a peek/handle.
- **Building a mobile E2E/navigation test runner** — this remains a standing, tracked project-wide gap
  (see `all-tests.md` Known Gaps); this batch works within the existing jest/vitest component-level
  coverage and accepts Agent-Probe as the tier for on-device/gesture/compositing/navigation behavior.

## Constraints

- **Money is in cents everywhere.** Any new price-delta display must format from `priceDeltaCents`
  (`ProductOption`) using the existing `formatCurrency` helper (`packages/utils/src/currency.ts`) — no
  new ad-hoc formatting, no float math.
- **`mode: ThemeMode` is a REQUIRED prop on every `packages/ui` component** (no default value, hardened
  by the mobile-dark-mode-audit work) — any new/changed component or prop must keep this contract; light
  and dark tokens must both be exercised, never a hardcoded color.
- **Shared component blast radius (A1):** `FlavorSelector`, `SizeSelector`, and `AddOnSelector`
  (`packages/ui/src/components/{flavor,size,addon}-selector.tsx`) are shared, theme-token-driven
  components. Changing their prop shape or rendering to add price deltas affects every consumer, not
  just `option-group-selector.tsx`. Known consumers to check: `apps/mobile/src/app/(tabs)/product/
  index.tsx` (via `option-group-selector.tsx`), and `packages/ui/src/components/component-showcase.tsx`
  (the dev-only showcase route, which must keep rendering/typechecking cleanly). Existing selector test
  suites (`packages/ui/src/components/__tests__/{flavor,size,addon}-selector.test.tsx`, if present) are
  in the blast radius and must be updated, not just added to.
- **A3's `CouponCard` (`packages/ui/src/components/coupon-card.tsx`) is also a shared component** — check
  for other consumers (e.g. a Rewards/coupon-wallet screen) before assuming cart is its only usage; do
  not silently change its behavior for a consumer this batch didn't intend to touch.
- **No RN E2E/navigation test runner exists** (`apps/mobile`, project-wide, standing gap per
  `process/context/tests/all-tests.md`). On-device gesture (A6), scroll/pop-imperative navigation (A5),
  and screen-compositing (A4 final render) behaviors are Agent-Probe by design, not a shortfall of this
  SPEC. No acceptance criterion in this batch claims Fully-Automated coverage for an actual native scroll,
  native pop, or native gesture outcome — only for pure decision/render logic that supports those
  outcomes (see AC16's explicit scope note).
- **A2's root cause is a deliberate, existing navigation behavior (NAV-006)** — the static `index` anchor
  causing PUSH→NAVIGATE downgrade and component reuse across products must NOT be reverted; the fix must
  work WITH that navigation shape (reset state on product-id change), not by reintroducing the double-
  push bug NAV-006 was written to prevent.
- **A5's pop-to-root behavior must be verified against the current tab stack shape established by
  NAV-001 through NAV-006**, not assumed from first principles — those changes moved several screens
  (Product Details, Cart, Tracking, History, Branch detail) to top-level `(tabs)/{...}` route groups
  that sit ABOVE the tab navigator as siblings, not nested inside a single tab's own stack. PLAN must
  confirm, for each tab, what "that tab's own stack" actually contains before implementing the two-stage
  rule, since a screen that is a sibling-of-tabs (not nested-inside-a-tab) may not participate in this
  behavior the same way a genuinely nested screen would.
- **A6's peek snap point must not break existing sheet behavior** — `(tabs)/branches/index.tsx`'s current
  `SNAP_POINTS` (`['32%','50%','92%']`) has no explicit `enablePanDownToClose`; achieving "drag to peek,
  never dismiss" likely means adding a smaller snap point rather than enabling pan-down-to-close (which
  would fully close the sheet — explicitly rejected). PLAN decides the exact mechanism; this SPEC only
  locks the required outcome.
- **A7 requires no backend change** — `GET /rewards/history` already returns `orderId` per row
  (`packages/api/src/routes/rewards.ts:123-132`); this is purely a client rendering/navigation change.

## Open Questions

None. All four items raised during SPEC drafting were resolved by explicit orchestrator/product decision
and are now locked into the sections above:

- **A1 zero-delta display** → show nothing for zero-delta options; leading "+" for positive deltas;
  negative deltas (if ever configured) must render visually distinct from positive — see Behavioral
  Outcomes A1, AC1–AC3.
- **A5 nested-screen tap behavior** → two-stage rule: pop-to-root first (no forced scroll in that same
  gesture), THEN scroll-to-top only once already at root — see Behavioral Outcomes A5, Flow diagram,
  AC14–AC16, and the NAV-001..NAV-006 verification Constraint.
- **A6 dismiss-vs-peek** → collapse to a small always-present peek, never fully dismiss; map must stay
  pannable at peek — see Behavioral Outcomes A6, Flow diagram, AC17–AC18, Out of Scope, Constraints.
- **A5 scroll animation style** → smooth/animated scroll-to-top (the stated default) — accepted, see
  Behavioral Outcomes A5 and Flow diagram.

## Background / Research Findings

Track A of a 13-item user-reported batch. Three items were investigated in RESEARCH and found already
correctly implemented (add-to-cart toast, Order History stickiness itself, cart badge consistency) — see
Out of Scope. The remaining 7 items above are all client-only (`apps/mobile` + `packages/ui`), verified
this session:

- **A1:** `option-group-selector.tsx:66-85` maps `ProductOption[]` into `{id,name}`/`{id,label}` shapes
  and drops `priceDeltaCents` entirely before handing off to `FlavorSelector`/`SizeSelector`/
  `AddOnSelector`. `unitPriceCents` (`product/index.tsx`) already correctly sums base + deltas — the data
  exists and the total math is already right; only the per-row display is missing. The zero-delta-hidden
  display rule is settled by the user's own reference screenshot (held by the orchestrator, not directly
  read by this agent): a Size group's "Regular" row shows no price text while "Large" shows "+12.00"; the
  Add-Ons group shows every listed (non-zero-priced) add-on with its price — i.e. only non-default,
  non-zero options carry price text in the reference design.
- **A2:** Confirmed via `product/_layout.tsx`'s own doc comment: the static `index` anchor deliberately
  makes expo-router downgrade PUSH→NAVIGATE (NAV-006), so navigating product A → product B reuses the
  same mounted screen instance. `quantity` (`useState(1)`) and `selection` (`useState<SelectionState>({})`)
  in `product/index.tsx` are never reset on a `productId` param change — confirmed both hooks have no
  effect tied to `productId`.
- **A3:** Confirmed in `cart/index.tsx:459-503` and `coupon-card.tsx`: the applied-discount branch renders
  a `CouponCard` whose `codeChip` (a solid `Palette.jyellow` pill) displays `appliedDeal?.code ??
  cart.appliedDiscount.label` — since a real "code" rarely exists for an applied server-side discount,
  the descriptive label text lands inside that yellow pill, which visually reads as a button (it's a
  `Pressable` with `accessibilityRole="button"` when `onPress` is truthy) even in cart usage where no
  `onPress` is actually wired. `discountLabel` is computed inline as
  `` `-${(discountTotalCents / 100).toFixed(2)}` `` with no currency-symbol/wrapping consideration in the
  card's fixed-width `body` column, matching the user's wrapping-number screenshot defect.
- **A4:** `history/index.tsx` already sets `stickySectionHeadersEnabled` and an explicit
  `backgroundColor: theme.background` on the section header — the user's screenshot still shows rows
  bleeding through, indicating the compositing/opacity result isn't matching the prop as authored (a
  scroll-position rendering behavior, not something visible from static source alone) — hence AC12 is
  Agent-Probe while AC13 locks the prop-wiring half as an automated regression.
- **A5:** `floating-tab-bar.tsx` currently only emits `tabPress` and calls `navigation.navigate(...)`
  (lines 334-349); there is no same-tab-re-tap pop-to-root or scroll-to-top branch today. The
  orchestrator's resolution: this is the long-established platform tab-bar convention (one tap on the
  active tab always returns to that tab's beginning, regardless of depth) — a two-stage
  pop-then-scroll rule, not a same-screen-only scroll. This interacts directly with the NAV-001..NAV-006
  route-restructuring work (several screens formerly nested under a tab's own `(tabs)/order/...` stack
  were moved to top-level `(tabs)/{product,cart,tracking,history,branch}/...` sibling route groups) —
  PLAN must verify, per tab, what actually constitutes "that tab's own stack" before implementing.
- **A6:** `(tabs)/branches/index.tsx` uses `@gorhom/bottom-sheet`'s `<BottomSheet snapPoints={SNAP_POINTS}
  .../>` (current value `['32%','50%','92%']`) with no `enablePanDownToClose` — confirmed absent from the
  current props — so the sheet structurally cannot collapse below its smallest defined snap point (32%)
  via the drag gesture. The orchestrator's resolution: collapse to a small peek, never fully dismiss —
  fully dismissing would leave the customer on a bare map with the branch list gone, trading the current
  "hard to collapse" complaint for a worse "how do I get the list back" problem. The map must stay
  pannable when the sheet is at peek, since gesture contention between the native map and the sheet
  gesture handler is the likely root cause of today's "hard to drag" complaint.
- **A7:** Backend is already done — `star_transactions.order_id` exists and `GET /rewards/history`
  already returns `orderId` per `packages/api/src/routes/rewards.ts:123-132`. Confirmed the Rewards tab
  is a real, live screen (not a `ComingSoon` placeholder — the stale claim in `all-context.md`'s Screens
  bullet predates this feature's delivery). `rewards/index.tsx`'s star-history `.map()` renders each
  transaction in a plain `<View>` (not `Pressable`/`TouchableOpacity`) with no use of the already-fetched
  `orderId` field anywhere in the row.

**Test-tiering context (from `process/context/tests/all-tests.md`):** `packages/ui` has jest-expo
component coverage (good fit for A1/A3 shared-component changes). `apps/mobile` runs vitest (pure-TS,
node env) + jest/jest-expo (RN component rendering) sequentially — good fit for A2/A4(prop-wiring only)/
A5(decision-logic only)/A7 screen-level regression tests. There is still no RN E2E/navigation runner
project-wide — on-device gesture (A6), native pop/scroll-imperative navigation (A5's actual on-screen
outcomes), and screen-compositing (A4's final render) outcomes are Agent-Probe by design, consistent
with every prior UI-polish plan in this repo's history (order-tab enhancement, mobile-dark-mode-audit,
MENU-003/004). No AC in this batch overclaims a Fully-Automated tag for a native
scroll/pop/gesture/compositing outcome itself — Fully-Automated tags are reserved for pure logic
(decision functions, prop wiring, render-from-data assertions) that support, but do not replace, the
Agent-Probe walkthroughs proving the real on-device behavior.
