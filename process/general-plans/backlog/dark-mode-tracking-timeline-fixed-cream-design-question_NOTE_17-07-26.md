# Backlog Note: Tracking screen's timeline card is permanently cream-colored in dark mode — open design question

**Filed:** 17-07-26 (mobile-dark-mode-audit UPDATE PROCESS)
**Priority:** Low (design decision, not a bug — the current fix is internally consistent)
**Source:** `process/general-plans/active/mobile-dark-mode-audit_17-07-26/` (Section C step 2,
`apps/mobile/src/app/(tabs)/order/tracking/[orderId].tsx:91,96`)

## Problem

`tracking/[orderId].tsx`'s `styles.timelineCard` is a fixed-cream (light) surface regardless of the
device/app theme. The dark-mode fix correctly pinned the `OrderStatusTimeline` component inside it
to `mode="light"` so its text reads legibly against that fixed cream surface — this is the CORRECT
technical fix given the surface is fixed. But the fix deliberately did NOT answer the underlying
design question: **should this card even be permanently cream in dark mode, or should it follow the
resolved app theme like every other surface?**

## What remains open

This is a product/design decision, not an engineering one. Two options:

1. **Keep it permanently cream** (current state) — may be an intentional design accent (e.g. a
   "receipt" visual metaphor); if so, this note can be closed as "as designed."
2. **Make it theme-aware** — remove the fixed `styles.timelineCard` cream background, let it follow
   `theme.*` tokens like other cards, and change `OrderStatusTimeline`'s `mode` prop back to the
   resolved app theme instead of the pinned `"light"`.

## Fix options

Route to a designer/product decision before any code change. If option 2 is chosen, it is a small,
bounded follow-up (single file, no schema/auth/API surface — QUICK FIX lane candidate).
