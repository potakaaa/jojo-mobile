---
name: spec:font-tone-payment-overflow
description: "Product-discovery requirements for (1) a display-heading font-tone swap (Fredoka -> Plus Jakarta Sans ExtraBold, PRD 12 amended) and (2) fixing payment-method label overflow in packages/ui's payment-method-selector"
date: 20-07-26
metadata:
  node_type: memory
  type: spec
  feature: general
---

# SPEC — Display Font Tone Swap + Payment Method Label Overflow Fix

## Summary

Two small, independent, locked-scope changes to the mobile app's presentation layer. First, the
app's bold display headings (used for titles across every screen) currently render in Fredoka, a
rounded, playful font that reads as more "kiddie/cartoon" than the product wants. We are swapping
display headings to the same Plus Jakarta Sans family already used for body text, at its heaviest
weight, so headings read as bold and confident rather than childish — while keeping body text
exactly as it is today. The PRD's design-direction language is updated to match. Second, on the
Payment Method screen, a payment option's name can currently get visually cut off or overlap the
"Unavailable" tag next to it on narrow phone screens — we're fixing it so the name always wraps
onto a second line instead of colliding with anything.

## User Stories / Jobs To Be Done

- As a customer opening any screen with a bold section title (Home, Order, Product Details, Cart,
  Checkout, Rewards, Branches), I want the heading font to look clean and grown-up rather than
  cartoonish, so the app feels trustworthy for a real purchase, not just "cute."
- As a customer choosing how to pay at checkout, I want to read the full name of every payment
  method clearly, even on a small phone, so I never have to guess what option I'm picking.
- As a customer on a narrow screen, I want the "Unavailable" tag next to a disabled payment method
  to never overlap or crowd out the method's name, so I can still tell which methods I can't use
  and why.

## What The User Wants (Behavioral Outcomes)

**Font tone (display headings only):**
- Every bold display heading in the app (screen titles, section headers, brand wordmark contexts
  that use the display bold token) renders in the new font, not Fredoka.
- Body text (paragraphs, captions, buttons, labels) is visually unchanged — same font, same
  weights, same look as today.
- No screen shows a mix of the old and new heading font — the swap is uniform across the whole
  app, not screen-by-screen.
- The app's written design direction (in the PRD) now describes the intended tone accurately,
  instead of contradicting what's actually shipped.

**Payment method label overflow:**
- On the Payment Method screen, every method's name (e.g. "Pay at pickup", "GCash", "Maya",
  "Credit/debit card") is always fully readable — either on one line if it fits, or wrapped onto a
  second line if it doesn't.
- When a method is unavailable and shows the "Unavailable" tag next to its name, the tag never
  overlaps the name and the name is never cut off with "..." — both stay fully visible.
- This holds on the narrowest phone screen size the app supports, in both light and dark mode.
- Whether a method is selectable or greyed-out (enabled/disabled logic) is completely unaffected —
  this is a visual fix only, nothing about which methods a customer can pick changes.

## Flow / State Diagram

**Font tone (applies everywhere a display-bold heading renders — no user-driven flow, this is a
static visual change):**

```
[App launch]
     |
     v
[Fonts load: body family (unchanged) + new display-bold family]
     |
     v
[Any screen renders a display-bold heading]
     |
     v
[Heading shows in the new font] --- (no old Fredoka heading ever shown, no flash of wrong font)
```

**Payment method label overflow (Payment Method screen, per row):**

```
[Payment Method screen renders list of methods]
     |
     v
For each method row:
     |
     +--> Is the method disabled (e.g. online payment off)?
     |         |
     |        yes                          no
     |         |                            |
     |         v                            v
     |   [Name + "Unavailable" tag   [Name shown alone,
     |    shown together]             selectable]
     |         |
     |         v
     |   Does name+tag fit on one line?
     |         |
     |    yes--+--no
     |    |         |
     |    v         v
     | [one line] [name wraps to
     |             2 lines; tag
     |             stays clear of it]
     |
     v
[No overlap, no clipping, no truncation with "..." in any case]
```

## Acceptance Criteria (Testable Outcomes)

1. Every display-bold heading across Home, Order, Product Details, Cart, Checkout, Rewards, and
   Branches screens renders in the new font — no screen shows the old font for a display-bold
   heading.
   - proven by: `packages/ui` component render tests asserting the resolved `fontFamily` style on
     components that use `FontFamily.display.bold` (e.g. `BrandWordmark` and any other themed
     component consuming the display-bold token) — mirrors the existing resolved-style-assertion
     pattern already used for dark-mode regression tests in this package.
   - strategy: Fully-Automated

2. Body text (regular/medium/semibold/bold/extrabold body weights) is unchanged in every screen —
   no body-text component's rendered font family changes as a result of this work.
   - proven by: full `packages/ui` + `apps/mobile` existing test suites remain green with zero
     changes required to any body-text-asserting test case (a regression guard, not a new test).
   - strategy: Fully-Automated

3. The app's font loading list (`useFonts()` in `_layout.tsx`) contains no font weight that has
   zero consumers after the swap.
   - proven by: a repo-wide grep/reference check (0 remaining source references to the dropped
     weight identifiers) run as part of the change's own verification, plus `apps/mobile` typecheck
     passing with the corresponding imports removed.
   - strategy: Fully-Automated

4. The PRD's design-direction section (§12) describes the shipped tone accurately and no longer
   uses language that contradicts the new, more grown-up heading style.
   - proven by: manual doc review during PLAN/EXECUTE (this is a documentation criterion, not a
     runtime behavior — no automated test applies).
   - strategy: Agent-Probe (doc review only; Known-Gap not applicable — this is prose, not code)

5. On the Payment Method screen, a payment method's label plus its "Unavailable" badge (when
   present) never visually overlap or get clipped — the label wraps to a second line when it
   doesn't fit, matching the existing wrap behavior already used for each method's caption text.
   - proven by: a new `packages/ui` render test in `payment-method-selector.test.tsx` asserting the
     label `Text` element carries wrap-safe style properties (e.g. `numberOfLines`/`flexShrink`
     equivalent to the caption's existing pattern) for the longest real label ("Credit/debit card")
     paired with a disabled state (badge present).
   - strategy: Fully-Automated

6. `isMethodDisabled`'s enabled/disabled determination for every payment method is byte-identical
   before and after this change — this is a layout-only fix.
   - proven by: the existing 5 render cases in `payment-method-selector.test.tsx` continue to pass
     unmodified in their disabled/enabled assertions (regression guard).
   - strategy: Fully-Automated

7. The Payment Method screen renders correctly (no overlap/clipping, correct enabled/disabled
   visuals) in both light and dark mode.
   - proven by: an Agent-Probe on-device/simulator walkthrough — no automated visual-diff/E2E
     runner exists for `apps/mobile` today (standing project-wide gap, see
     `process/context/tests/all-tests.md`); this is the same class of residual already carried by
     every recent `apps/mobile` UI-only fix in this repo (not new debt).
   - strategy: Agent-Probe

## Out Of Scope

- Body text font/weights — Plus Jakarta Sans body tokens (`FontFamily.body.*`) are untouched.
- The `PaymentMethod` type/enum and its values — no change to what payment methods exist.
- `isMethodDisabled` behavior/semantics — no change to which methods are enabled or disabled, or
  under what condition (`onlinePaymentEnabled`).
- `checkout.tsx` and `confirmation/[orderId].tsx` — neither screen renders
  `payment-method-selector.tsx` (they only import its label/icon maps), so neither is touched by
  the overflow fix.
- Adding any new font family/dependency — the display-tone swap must reuse an already-loaded font
  weight, not introduce a new package.
- `apps/admin` (the web admin dashboard) — it has its own separate, web-only font/token system
  (ported into Tailwind CSS, not the `@expo-google-fonts/fredoka` npm package) and is not affected
  by this change; not in scope.
- Any other visual/typography audit beyond these two named items (e.g. type scale, spacing,
  color) — this SPEC is strictly the font-tone swap and the one overflow bug.

## Constraints

- Font-family changes must go through the shared `packages/ui/src/theme.ts` `FontFamily` token map
  only — never a per-screen or per-component hardcoded font family (existing repo convention, see
  `theme.ts`'s locked-table comment).
- The new display font must already be loaded (or become loaded) via `useFonts()` in
  `apps/mobile/src/app/_layout.tsx` — no new font package dependency.
- Any font weight left with zero consumers after the swap must be removed from both the
  `useFonts()` load list and its import — dead font weights must not ship.
- The payment-method-selector component must keep its required `mode: ThemeMode` prop contract
  (no default value) per the repo's theming convention — the overflow fix must not regress this.
- `apps/mobile`/`packages/ui` conventions apply: kebab-case files, no inline hardcoded colors, use
  existing shared components/tokens.
- PRD (`docs/jojo-potato-mobile-prd.md`) §12 must be amended in the same change as the font swap —
  not left stale, not addressed in a separate follow-up.

## Open Questions

None. All decisions were locked with the user during RESEARCH:
1. PRD §12 is amended in this change (confirmed).
2. Scope is display headings only; body text untouched (confirmed).
3. Replacement is Plus Jakarta Sans ExtraBold reusing the already-loaded, currently-unused
   `PlusJakartaSans_800ExtraBold` weight — zero new font dependency (confirmed).
4. Both Fredoka weights (`Fredoka_600SemiBold`, `Fredoka_700Bold`) are dropped from the load list
   once repointed, since Fredoka has zero remaining consumers after the swap; the
   `@expo-google-fonts/fredoka` package dependency is removed from `apps/mobile/package.json` since
   research confirmed this is its only consumer in the mobile app (`apps/admin`'s "Fredoka"
   comments refer to its own separate web font system and are out of scope, see §Out Of Scope)
   (confirmed).
5. Payment-method label fix approach is wrap (matching the existing caption pattern), not
   truncate/ellipsize (confirmed).

## Background / Research Findings

**Font tone:**
- Font loading lives in `apps/mobile/src/app/_layout.tsx:1-8,99-107` — `useFonts()` currently loads
  7 static weights (2 Fredoka, 5 Plus Jakarta Sans).
- The font token map is `packages/ui/src/theme.ts:204-216` (`FontFamily.display.*` /
  `FontFamily.body.*`), governed by a locked-table comment (`theme.ts:6-8`, "Do not invent new
  hexes/weights/radii/shadows outside that table") — this SPEC represents an explicit, flagged
  amendment to that table, following the same precedent as the earlier `MinTouchTarget` addition
  (`theme.ts:109-118`).
- Reference-count sweep: `FontFamily.display.bold` (Fredoka_700Bold) has 65 references across ~40
  files — the only display weight in real use today. `FontFamily.display.semibold`
  (Fredoka_600SemiBold) and `FontFamily.body.extrabold` (PlusJakartaSans_800ExtraBold) both have
  zero references anywhere in the codebase — currently dead weight, loaded but unused.
- Body stack (`FontFamily.body.regular/medium/semibold/bold`) is already graded and in active use
  (31/67/38/42 references respectively) — this SPEC does not touch it.
- `app.config.ts` (~line 78) registers the `expo-font` plugin bare, with no `fonts:` array — all
  weight loading happens via `useFonts()` in `_layout.tsx`, so no `app.config.ts` change is needed
  for this SPEC.
- `docs/jojo-potato-mobile-prd.md:1348-1356` (§12 Visual Direction) currently reads "Fun /
  Snackable / Youthful / Bright / Promo-driven / Not too corporate / Not overly complex" — the
  user's locked decision requires this language to be amended to reflect a more professional/
  neutral display tone in the same change, without contradicting the rest of §12's product
  character.
- Grep confirms `@expo-google-fonts/fredoka` is imported only by `apps/mobile/src/app/_layout.tsx`
  in the mobile app; the only other "Fredoka" mentions in the repo are in `apps/admin` (a
  completely separate TanStack Start web app that ports brand tokens into Tailwind CSS directly,
  not via the `@expo-google-fonts/fredoka` npm package) and are unaffected by removing the mobile
  package dependency.

**Payment method label overflow:**
- Bug location: `packages/ui/src/components/payment-method-selector.tsx`. The label `Text`
  (`styles.label`, ~line 128/186) has no `numberOfLines` or shrink-safe styling, while the sibling
  caption `Text` right below it (line 137) already has `numberOfLines={2}`. The row container
  (`styles.labelRow`) is `flexDirection: 'row'`, `alignItems: 'center'` — label and the
  "Unavailable" badge sit side by side with nothing forcing the label to yield space or wrap.
- `isMethodDisabled` (lines 79-83) is a pure function and is explicitly out of scope for behavior
  change — this is purely a layout fix.
- Single live consumer: `apps/mobile/src/app/(tabs)/cart/payment-method.tsx:57-62`. `checkout.tsx`
  and `confirmation/[orderId].tsx` only import the label/icon maps exported alongside the
  component, not the component itself — confirmed out of blast radius.
- Existing coverage: `packages/ui/src/components/__tests__/payment-method-selector.test.tsx` (5
  render cases) must stay green; none of the existing cases currently assert label-wrap behavior,
  so a new case is expected.
- Longest real label to verify against: "Credit/debit card" — most likely to collide with the
  "Unavailable" badge on the narrowest supported screen width.
- The component already requires `mode: ThemeMode` with no default (per the repo's hardened
  theming convention from the `mobile-dark-mode-audit_17-07-26` work) — must not regress.

**User brainstorm input (verbatim intent captured during RESEARCH):**
- "The font feels too kiddie/cartoon for the display headings — we want something that still reads
  bold but more grown-up, without touching the body text people are already used to reading."
- "Don't add a new font just for this — if we already have something loaded that fits, use that."
- "The payment method screen text is getting cut off / overlapping the Unavailable tag on smaller
  phones — just make it wrap like the description text below it already does, don't truncate it."
