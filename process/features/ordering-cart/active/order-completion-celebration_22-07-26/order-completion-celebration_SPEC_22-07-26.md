---
name: spec:order-completion-celebration
description: "Product-discovery SPEC — celebratory moment + review prompt when a customer's order reaches completed status. Fully greenfield: no review/rating system exists in the codebase today."
date: 22-07-26
feature: ordering-cart
---

# SPEC — Order Completion Celebration + Review Prompt

## Summary

Right now, when a customer's order is done — whether they tap "I've picked this up" themselves or
staff mark it complete — nothing special happens. The tracking screen just quietly shows a
"completed" status in the timeline, the same flat treatment as every other status change. This
SPEC is for adding a small moment of delight at that exact point (a celebration — confetti, a
friendly animation, a "you're all set!" message, something that makes finishing an order feel
good) and, right alongside it, inviting the customer to leave a review or rating for the order
they just picked up.

This is **fully greenfield** — there is no review/rating system anywhere in this codebase today
(no database table, no API route, no shared type, no UI component). Because of that, several
product questions below are genuinely undecided and are explicitly flagged for INNOVATE rather
than silently assumed.

## User Stories / Jobs To Be Done

- **As a customer who just picked up my order**, I want to see something that feels celebratory
  right when my order is marked done, so that finishing an order feels rewarding, not just
  transactional.
- **As a customer who just had a good (or bad) pickup experience**, I want an easy, low-friction
  way to say so right after the fact, so that my feedback reaches Jojo Potato while the experience
  is still fresh.
- **As a customer who doesn't want to leave a review**, I want to be able to dismiss the prompt
  without it blocking me from doing anything else, so that I'm never forced through an extra step
  to close out my order.
- **As Jojo Potato**, we want to capture customer feedback at the single moment customers are most
  likely to give it (immediately after a completed pickup), so that we start building a signal we
  don't have today.

## What The User Wants (Behavioral Outcomes)

- When an order transitions to `completed`, the customer sees a distinct celebratory visual
  moment on the order tracking screen (not merely a status-badge color change) — something that
  visibly acknowledges "your order is done."
- Immediately alongside (or following) that celebration, the customer is invited to leave a
  review/rating for the order. Skipping this invitation is always possible and never blocks the
  customer from leaving the screen or doing anything else in the app.
- The celebration always fires for the customer's own self-confirm ("I've picked this up") flow,
  since that path is deterministic and already has a reliable success signal
  (`useCompleteOrder()`'s `onSuccess`).
- The celebration is a one-time moment per order — reopening a completed order later (e.g. from
  Order History) does not replay the celebration.

## Flow / State Diagram

```
                     ┌─────────────────────────┐
                     │ Order status: ready      │
                     │ (tracking screen open)   │
                     └────────────┬─────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              │                                         │
   customer taps "I've picked                staff marks order
   this up" -> confirms in                    complete (external
   ConfirmDialog                              to this screen)
              │                                         │
              ▼                                         ▼
   useCompleteOrder().onSuccess                 next poll tick returns
   fires deterministically                      status: completed
   (reliable, existing signal)                  (see Open Decision D3 —
              │                                  detection reliability
              │                                  differs from the self-
              │                                  confirm path)
              └───────────────────┬───────────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │ CELEBRATION MOMENT        │
                     │ (visual acknowledgment    │
                     │ order is done)            │
                     └────────────┬─────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │ REVIEW / RATING PROMPT    │
                     │ - Leave a review          │
                     │ - Skip / dismiss          │
                     └──────┬──────────┬────────┘
                            │          │
                  customer rates   customer skips
                  / submits        or dismisses
                            │          │
                            ▼          ▼
                     ┌─────────────────────────┐
                     │ Tracking screen returns   │
                     │ to normal completed state │
                     │ (celebration does not     │
                     │ replay on re-visit)        │
                     └─────────────────────────┘
```

## Acceptance Criteria (Testable Outcomes)

Only criteria that can be locked without an implementation decision are listed here. Criteria
that depend on an Open Decision below (rating scale, persistence, staff-completed detection) are
intentionally NOT written yet — they get written into the plan once INNOVATE resolves those
decisions.

1. **AC1 — Celebration fires on customer self-confirm.** When the customer taps "I've picked this
   up" and confirms, and the mutation succeeds, a celebratory UI moment is shown before or as part
   of the screen returning to its completed state.
   `proven by:` new unit/component test exercising `useCompleteOrder()`'s `onSuccess` path,
   asserting the celebration trigger fires. `strategy:` Fully-Automated.

2. **AC2 — Celebration does not fire on stale mount.** Opening an already-completed order (e.g.
   from Order History, or reopening the tracking screen for an order that was completed in a
   previous session) does NOT replay the celebration.
   `proven by:` component test mounting the tracking screen with an order whose status is already
   `completed` on first render, asserting no celebration trigger fires.
   `strategy:` Fully-Automated.

3. **AC3 — Review prompt is dismissible without side effects.** The customer can dismiss/skip the
   review prompt, and doing so does not block navigation, does not retry-prompt on the same visit,
   and has no effect on the order's own state (status, star crediting, etc.).
   `proven by:` component test asserting a Skip/dismiss action closes the prompt and the customer
   can navigate away. `strategy:` Fully-Automated.

4. **AC4 — No push/notification side effect.** This feature does not add or rely on a push
   notification — `OrderNotificationEvent` deliberately excludes `completed` today, and this SPEC
   does not reopen that decision. The celebration and prompt are in-app-only, observed only while
   the customer has the tracking screen open (or wherever INNOVATE places the trigger — see D3).
   `proven by:` code-review check that no new `OrderNotificationEvent` member is added.
   `strategy:` Fully-Automated (static check / grep-based regression test).

## Out Of Scope

- **Building a full reviews/ratings backend product** (moderation, public display of reviews,
  admin review-management UI, aggregate rating shown on branch/product pages) — this SPEC is
  about the celebration + prompt moment only. Whether reviews persist anywhere durable at all is
  an Open Decision (D2), not an assumed yes.
- **Push notifications for order completion.** `OrderNotificationEvent` stays as-is; no new push
  event type is added by this work.
- **Staff-facing UI.** Nothing in the `(staff)` shell changes.
- **Retroactively celebrating/prompting for orders completed before this feature ships.** Only
  orders that transition to `completed` after this feature is live are in scope.
- **Incentivizing reviews (discounts/stars for leaving a review).** Not part of this pass — if
  wanted later, it's a separate feature building on whatever this SPEC produces.
- **Editing/deleting a submitted review after the fact.** Out of scope for a first cut, if review
  persistence is even chosen (see D2).

## Constraints

- The trigger point must be the order's `completed` status (not `ready`, not any other status) —
  this is the only status matching "order done" per `packages/api/src/routes/lib/order-state-machine.ts`.
- No backend push/notification path may be (re)added for order completion — `OrderNotificationEvent`
  stays frozen per current design intent (confirmed in RESEARCH).
- Must reuse existing themed UI primitives and conventions (`packages/ui`) wherever a suitable one
  exists; only build new components (e.g. a star-rating input) when nothing reusable exists today.
- Must follow the existing dark/light theming convention (`mode: ThemeMode`, required prop, no
  default) for any new `packages/ui` component.
- The review prompt must never block the customer from leaving the screen (no forced modal with no
  dismiss path) — this is a hard UX requirement from the user stories above, not merely a nice-to-have.
- Whatever detection mechanism is chosen for the celebration trigger, it must not cause a duplicate
  or repeated celebration for the same order on the same device session.

## Open Decisions For INNOVATE

These are the genuinely undecided product questions this SPEC deliberately does not lock. Each
should be resolved with the user during INNOVATE before PLAN begins — they materially change scope
and effort.

- **D1 — What is being rated?** Options: (a) the order as a whole (single rating/review), (b) the
  branch/pickup experience specifically, (c) individual products in the order, (d) some
  combination. This determines the data shape and how much UI is needed (one rating widget vs. a
  per-item list).
- **D2 — Does review submission persist anywhere durable in this pass, or is a first cut UI-only
  (celebration + prompt UI that collects input but doesn't yet write it anywhere real)?** A
  UI-only first cut is dramatically smaller (no new DB table/migration/API route) but produces no
  usable data yet. A persisted version requires a new schema (no rating/review precedent exists
  anywhere in `packages/api/src/db/schema/`), a new API route, and a new shared type in
  `packages/types`.
- **D3 — Must the celebration/prompt handle the staff-completed case (order was `ready` when the
  tracking screen was open, and the NEXT poll tick returns `completed` because staff completed it
  from their side), or is self-confirm-only acceptable for v1?** Self-confirm-only is simple and
  reuses `useCompleteOrder()`'s existing `onSuccess` callback directly. Handling the staff-completed
  case requires new client state (a previous-status ref/comparison) since no "status changed from
  X to Y" transition-detection hook exists today, and must be built carefully to avoid false-firing
  on an already-completed mount (see AC2).
- **D4 — Rating scale / input shape**, if D2 chooses to persist and D1 chooses a rating (not just
  free text): stars 1–5? thumbs up/down? Numeric NPS-style? There is no existing precedent — no
  interactive star-rating input exists in `packages/ui` today (only display-only progress
  components like `star-progress-bar.tsx`).
- **D5 — Is a written comment/text field included, or rating-only?** Affects both UI complexity and
  (if D2 persists) schema shape.
- **D6 — Where does the celebration render?** Only on the tracking screen (customer must have it
  open at the moment of completion), or does it also need to surface later (e.g. next app open, or
  from Order History) if the customer wasn't looking at the tracking screen when the order
  completed? This interacts directly with D3.
- **D7 — Visual treatment of the celebration itself.** No confetti/lottie library exists in this
  repo today (`package.json` has neither `lottie-react-native` nor a confetti package); reanimated
  v4.5.0 is the only animation tool currently in use. Is a reanimated-based visual acceptable, or
  does this warrant adding a new animation dependency?
- **D8 — Can the customer edit/change a rating after submitting it in the same session**, if D2
  persists? (Minor, but affects the interaction design.)

## Background / Research Findings

Captured verbatim from this session's prior RESEARCH pass:

- **No review/rating system exists anywhere in this codebase.** Confirmed via full grep of
  `packages/api/src/db/schema/` (27 files), `packages/types/src/` (22 files), and a repo-wide grep
  for `review|rating` (only unrelated hits: help copy, legal terms, code-review-process artifacts).
  No table, route, type, or UI component exists. No backlog note or prior plan scoped it either.
- **Trigger point is `completed` status.** `packages/types/src/order.ts` `OrderStatus` union:
  `pending | accepted | preparing | flavoring | ready | completed | cancelled | rejected`. State
  machine (`packages/api/src/routes/lib/order-state-machine.ts:10-25`): `ready → {completed,
  cancelled}`; terminal = `{completed, cancelled, rejected}`.
- **Two paths reach `completed`:** staff marks it complete (staff-side action, external to the
  customer's screen), or the customer self-confirms pickup via `PATCH /orders/:orderId/complete`
  (delivered by `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/` — read in
  full for prior art). Star crediting already fires exactly once on this transition.
  `OrderNotificationEvent` deliberately has no `completed` member — no push fires on completion by
  design, so any celebration must be purely an in-app client-side moment.
- **Client-side detection, confirmed by reading the actual code this session:**
  `apps/mobile/src/features/orders/hooks/use-order-query.ts` polls `GET /orders/:orderId` every
  10s (`ORDER_POLL_INTERVAL = 10_000`, `staleTime: 0`, foreground-only via
  `refetchIntervalInBackground: false`) while non-terminal, and auto-stops once terminal
  (`isTerminalStatus`). There is no "status changed from X to Y" transition-detection hook — the
  tracking screen (`apps/mobile/src/app/(tabs)/tracking/index.tsx`) just re-renders whatever the
  latest poll returns.
  - **Self-confirm path (reliable):** `useCompleteOrder()`
    (`apps/mobile/src/features/orders/hooks/use-complete-order.ts:29-40`) has a deterministic
    `onSuccess(order, orderId)` callback that fires immediately when the customer's own tap
    succeeds. This is the easy, already-available signal for D3's "self-confirm-only" option.
  - **Staff-completed path (harder):** when staff completes the order while the customer's
    tracking screen is open, the only signal is the next poll returning `completed` — detecting
    that as a fresh transition (vs. the screen having mounted already-completed) requires new
    client state (a previous-status ref) that doesn't exist today.
  - The tracking screen currently gates its "I've picked this up" button on `order.status ===
    'ready'` exactly (not `!isTerminalStatus`), and already has a `ConfirmDialog` in place for the
    self-confirm action — read in full at
    `apps/mobile/src/app/(tabs)/tracking/index.tsx` this session.
- **Available UI building blocks confirmed by reading `packages/ui/src/index.ts` and the component
  source this session:**
  - Animation: reanimated v4.5.0 is used app-wide (e.g. the `LiveBadge` pulsing-dot pattern in
    `tracking/index.tsx`, `order-status-timeline.tsx`, `skeleton.tsx`). No `lottie-react-native`,
    no confetti library in `package.json`.
  - `ConfirmDialog` (`packages/ui/src/components/confirm-dialog.tsx`) is the existing
    Modal-based "post-action prompt" precedent — already used on the tracking screen for the
    self-confirm-pickup flow (statusBarTranslucent Modal, themed card, two-button action row,
    controlled visibility).
  - `Toast` (`packages/ui/src/components/toast.tsx`) is the other Modal-based primitive available.
  - `star-progress-bar.tsx` / `reward-progress-card.tsx` are DISPLAY-ONLY loyalty progress
    components (battle-pass style) — there is NO interactive star-rating input component (tap-to-
    rate 1–5) anywhere in the codebase; one would need to be built new in `packages/ui` if a
    star-rating review UI is wanted (relevant to D4).
- **Money/DB precedent, if D2 chooses to persist:** `packages/api` uses Drizzle + Postgres. Pattern
  is `packages/api/src/db/schema/{name}.ts` + a numbered drizzle migration
  (`packages/api/drizzle/000N_....sql`). No existing precedent for a rating scale — genuinely
  undecided (D4).
- **Prior art worth reading in full before INNOVATE:**
  `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/` — the most recently
  delivered plan touching this exact screen and the `completed` transition; establishes the
  `ConfirmDialog` + `useCompleteOrder()` pattern this SPEC's celebration trigger will likely build
  on top of.
