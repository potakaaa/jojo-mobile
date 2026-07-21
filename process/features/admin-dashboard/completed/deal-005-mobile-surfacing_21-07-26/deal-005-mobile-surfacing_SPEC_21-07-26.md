---
name: spec:deal-005-mobile-surfacing
description: "Product-discovery SPEC for DEAL-005 Phase 3 — annotate currently-live deals on mobile with their available days/hours (issue #127)"
date: 21-07-26
feature: admin-dashboard
---

# DEAL-005 Phase 3 — Mobile Surfacing of Live Deal Schedules (SPEC)

## Summary

Some deals on the menu are only available at certain times — e.g. a Friday-evening bundle, or a
lunch-hours-only combo. Right now the app already correctly hides these deals when they're closed,
but when a scheduled deal IS showing (it's currently live), there's nothing on the card or detail
screen telling the customer it won't be there tomorrow, or that it disappears at 5pm. A customer
can browse a deal, get excited about it, and then find it gone the next time they open the app,
with no idea why. This phase adds a small, honest label — "Available Mon–Fri, 8:00 AM – 8:25 PM" —
to any live deal that has a schedule, so customers understand the deal is time-limited before they
commit to it. Deals with no schedule (the normal, always-on case) are untouched — no new text
appears for them.

## User Stories / Jobs To Be Done

1. **As a customer browsing the Deals tab**, I want to see when a currently-available deal is
   normally offered (which days, which hours), so I understand it's a limited-time offer and not a
   permanent menu item.
2. **As a customer looking at the Home tab's deals strip**, I want the same time-window
   information at a glance, so I don't have to open the deal to find out it's about to disappear.
3. **As a customer viewing a Deal Details screen**, I want the fullest, clearest version of the
   availability info (days + hours, or the end date for a one-off window), so I can decide whether
   to come back for it later.
4. **As a customer looking at a deal with no configured schedule**, I want to see nothing extra —
   the deal just behaves like a normal, always-available menu item, so the UI isn't cluttered with
   irrelevant "always available" noise.

## What The User Wants (Behavioral Outcomes)

- When a deal that is currently showing on the menu (i.e. it already passed the server's live/
  visible check — nothing about *whether* a deal shows changes in this phase) has a recurring
  schedule (specific days of the week + a daily time range), the app displays a short,
  human-readable line stating which days and what hours it's available, e.g. "Available Mon–Fri,
  8:00 AM – 8:25 PM."
- When a live deal instead has only a one-time absolute window (a specific start/end timestamp,
  no recurrence — the Phase 1 shape) with a defined end, the app displays when that window closes,
  e.g. "Available until Jul 25, 6:00 PM" (exact copy is an implementation detail — the requirement
  is that the customer can tell when it stops being offered).
- When a live deal has zero schedule rows (the default, always-available case — the majority of
  deals today), the app shows nothing extra. No blank line, no "Always available" filler text
  unless a later design pass wants that — the AC only requires that no incorrect or confusing text
  appears.
- All displayed times/days reflect the branch's real-world (Manila) clock — the same wall-clock
  meaning an admin configured in the admin dashboard — not the customer's device timezone or raw
  UTC. A customer in a different timezone reading "Available Mon–Fri 8:00 AM – 8:25 PM" must see
  the same Manila-local meaning an admin who set the schedule intended.
- This is read-only, informational surfacing. Nothing about which deals are shown, nothing about
  cart behavior, nothing about order placement changes in this phase — those rules are already
  correct and untouched.
- A deal that has stopped being live (window closed) may still show briefly until the customer's
  next refresh — this is existing, accepted app behavior and explicitly not something this phase
  is required to fix (see Out of Scope).

## Flow / State Diagram

```
Customer opens Deals tab / Home strip / Deal Details
              │
              ▼
   [existing, unchanged] Server returns only deals
   that are currently live (already-live check,
   no change here)
              │
              ▼
   Does this deal have ≥1 deal_schedules row?
              │
      ┌───────┴────────┐
      │ No              │ Yes
      ▼                 ▼
  Show deal card    Does it have recurrence
  with NO extra     (days + daily time range)?
  schedule text            │
                    ┌───────┴────────┐
                    │ Yes             │ No (absolute
                    ▼                 │ window only)
          "Available Mon–Fri,         ▼
           8:00 AM – 8:25 PM"   "Available until
           (Manila wall-clock)   Jul 25, 6:00 PM"
                    │                 │
                    └───────┬─────────┘
                             ▼
                 Card / strip / detail renders
                 with the annotation
                             │
                             ▼
        Time passes, window closes → next refetch
        (existing fetch-on-focus behavior, not
        changed here) drops the deal from the list
        as it already does today
```

## Acceptance Criteria (Testable Outcomes)

1. **A live deal with a recurring schedule (days + daily time range) shows a days+hours summary.**
   The summary correctly reflects which days of the week the deal recurs on and the daily start/
   end time, grouped in a readable way (e.g. consecutive days collapse to a range like "Mon–Fri"
   rather than listing every day individually) — matching the display quality already established
   by the existing branch-hours formatter (`packages/utils`'s day-grouping/12-hour formatting
   precedent).
   `proven by:` a `packages/utils` unit-test suite covering: consecutive-day grouping, non-
   consecutive days (e.g. "Mon, Wed, Fri"), single-day, all-7-days, and 12-hour time formatting
   including midnight/noon edge values.
   `strategy:` Fully-Automated.

2. **A live deal with an absolute-only window (no recurrence) shows a clear "available until"
   date/time.** No recurrence-day text appears for this shape.
   `proven by:` unit test asserting the formatter branches correctly when `recur_days` is null/
   empty but `ends_at` is present.
   `strategy:` Fully-Automated.

3. **A live deal with zero `deal_schedules` rows shows no schedule annotation at all.** This is the
   majority existing-deal shape and must not regress — no placeholder or "Always available" text
   is required or permitted to leak in as a bug.
   `proven by:` unit test asserting the formatter/serializer returns nothing (absent/undefined
   field) for a schedule-less deal, plus a server serializer test confirming the field is omitted
   from the wire payload for such a deal.
   `strategy:` Fully-Automated.

4. **Displayed days/times are Manila wall-clock correct, not device-timezone or raw-UTC.** A
   `recur_start_time`/`recur_end_time`/`recur_days` set that means "8:00 AM–8:25 PM, Mon–Fri
   Manila time" must render as exactly that, regardless of the formatting code running on a device
   in a different UTC offset, and must not silently reuse a naive `getDay()`/`getHours()` against
   the stored UTC instant (the exact bug class Phase 2's `toManilaWallClock()` was built to avoid
   on the server side — this AC exists because Phase 3 introduces a NEW client-side (or
   server-serialized, decision left to INNOVATE/PLAN) formatting path that could reintroduce it).
   `proven by:` unit test(s) constructing a schedule whose UTC storage crosses a Manila calendar-
   day boundary before 08:00 Manila time (mirroring Phase 2's own regression test) and asserting
   the rendered day/time labels are still correct.
   `strategy:` Fully-Automated.

5. **The annotation appears on the Deals tab list.** `proven by:` component/screen-level manual
   walkthrough (no RN test runner exists in this repo — project-wide gap; not claimed as
   automated). `strategy:` Agent-Probe.

6. **The annotation appears on the Home tab's deals strip.** `proven by:` manual walkthrough.
   `strategy:` Agent-Probe.

7. **The annotation appears on the Deal Details screen.** `proven by:` manual walkthrough.
   `strategy:` Agent-Probe.

8. **A deal with multiple union'd `deal_schedules` rows displays a sensible, non-broken
   summary** (e.g. either the currently-active window's hours, or a combined listing) — must not
   crash, show garbled text, or silently pick a wrong row. Given admin authoring is currently
   single-row-only (see backlog note `deal-005-one-window-per-deal`), this AC only needs to prove
   the display logic doesn't break on multi-row input, not that it's polished for that case.
   `proven by:` unit test with 2 non-overlapping `deal_schedules` rows on one deal, asserting the
   formatter produces valid, non-throwing output.
   `strategy:` Fully-Automated.

9. **No regression to existing menu consumers.** The change to carry schedule data on the wire (or
   however INNOVATE/PLAN decides to expose it) is additive — the regular non-deal menu and
   always-live deals (no `deal_schedules` rows) are byte-identical in every other response field.
   `proven by:` existing `packages/api` menu/branches integration-test suite re-run green, plus a
   new assertion that the schedule field is optional/absent where not applicable.
   `strategy:` Fully-Automated.

## Out Of Scope

- **Upcoming/"Starts Friday" teaser for not-yet-live deals.** The server-side live/visible filter
  is completely unchanged — a deal that hasn't started yet, or has already ended, is still hidden
  exactly as today. This phase only annotates deals that are ALREADY showing.
- **Any change to the menu-filter/live-check logic** (`branches.ts`, `orders.ts`,
  `isDealScheduleLive()`). Those are correct today and untouched.
- **Cart-gating or checkout-time enforcement changes.** Order placement already re-validates
  server-side; this phase adds no new client-side gating.
- **Auto-drop / live refetch when a window closes while the screen is open** (`refetchInterval` or
  similar). Explicitly deferred — see backlog note `deal-005-mobile-expiry-refetch_NOTE_21-07-26.md`.
  Fetch-on-focus stays as-is; a card may linger until the next refocus.
- **Admin-side authoring changes.** Phase 2 already delivered the admin UI for creating schedules;
  nothing here changes admin.
- **The cart screen's legacy coupon/discount-code display** (`use-deals.ts`/`use-deal.ts`, the old
  `GET /deals` discount-model consumer). That is a separate, narrower surface untouched by this
  phase.
- **Multi-row admin authoring** (letting an admin configure "lunch AND dinner" as two schedule
  rows through the UI). Already tracked separately in
  `deal-005-one-window-per-deal_NOTE_20-07-26.md`; this phase only needs the mobile display layer
  to not break on multi-row data, not to make authoring it easy.

## Constraints

- Must reuse the Manila-wall-clock semantics already established by Phase 2's server-side
  `toManilaWallClock()` and `isDealScheduleLive()` — any new formatting logic (client or server)
  must produce results consistent with that existing source of truth, not reinvent timezone math.
- Must not change the wire-frozen fields of the existing menu/deal response shapes for non-deal
  products or schedule-less deals — additive only.
- No RN component/E2E test runner exists in `apps/mobile` today (standing project-wide gap) — any
  AC that requires visually confirming on-screen rendering is Agent-Probe, not claimed as
  automated.
- Reuse existing display conventions where they fit (e.g. `DealCard`'s existing `validUntil`
  caption prop, `packages/utils`'s day-grouping/12-hour formatter precedent in `hours.ts`) rather
  than inventing new formatting/visual patterns — approach/reuse decisions belong to INNOVATE, but
  the SPEC constrains that no ad-hoc, one-off formatting logic duplicating already-solved patterns
  should be needed.
- Money/pricing is entirely unaffected — this phase touches no discount or pricing logic.

## Open Questions

None. All product decisions needed to write ACs were locked in this session's clarification round
(scope = annotate live deals only, no upcoming-teaser, no cart-gating, no menu-filter change,
fetch-on-focus auto-drop behavior stays as-is).

## Background / Research Findings

- All 3 mobile deal surfaces (Deals tab list `(tabs)/deals/index.tsx`, Home strip
  `(tabs)/index.tsx`, deal detail `(tabs)/deals/deal/[dealId].tsx`) share one hook,
  `useDealProducts()`, which calls `getMenu(branchId, {isDeal:true})`. The detail screen derives
  from the same cached list via `.find()` — there is no separate detail fetch, so wiring schedule
  data through the one shared hook covers all three surfaces.
- The wire contract today carries zero schedule data: `serializers.ts`'s `ApiMenuProduct`
  (~line 198-214) has no schedule field, and `branches.ts:207` computes `liveDealIds` purely to
  filter the list at line 225, then discards the window/schedule info — it never reaches the
  client. Any new schedule display needs new data to travel over the wire (an INNOVATE/PLAN
  decision, not decided here).
- Stored schedule shape (`deal_schedules` table, from DEAL-005 Phase 1/2): `recur_days` (int array,
  0=Sun..6=Sat), `recur_start_time` / `recur_end_time` ("HH:mm", Manila wall-clock), plus absolute
  `starts_at`/`ends_at` timestamps. A deal can have multiple rows (the union-of-windows semantic
  from Phase 1, narrowed per-row by recurrence in Phase 2); admin authoring today only ever writes
  one row per deal (tracked gap, not a Phase 3 concern).
- Reuse candidates already in the codebase, noted for INNOVATE/PLAN (not a design decision here):
  `DealCard`'s existing `validUntil?: string` caption prop (renders a "Valid until: …" row) in
  `packages/ui`; `packages/utils/src/hours.ts`'s day-grouping (`DISPLAY_DAYS`/`DAY_LABELS`) and
  `to12Hour()` 12-hour time formatter, already Manila-offset-aware (`tzOffsetHours` default 8); the
  branch-detail hours block in `(tabs)/branch/index.tsx` as a UI precedent. No client-side
  Manila-wall-clock formatter currently exists for `deal_schedules`' stored shape specifically —
  one will need to be written or adapted.
- User's locked decisions this session: (1) scope is annotate-live-deals-only — no "Starts Friday"
  upcoming teaser, no menu-filter change, no cart-gating (research's sub-feature (b) explicitly
  cut); (2) keep fetch-on-focus, no `refetchInterval` — a card may linger past its window until
  refocus, accepted as self-explanatory once the end-time is shown, tracked separately in
  `deal-005-mobile-expiry-refetch_NOTE_21-07-26.md`.
