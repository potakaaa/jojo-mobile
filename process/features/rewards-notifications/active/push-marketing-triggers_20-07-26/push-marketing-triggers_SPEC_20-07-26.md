---
name: spec:push-marketing-triggers
description: Product-discovery SPEC for PUSH-005 (#82) — wiring real marketing/retention triggers (coupon expiring, one-more-order nudge, reward unlocked, new deal, branch promo) into the PUSH-004 scheduler substrate
date: 20-07-26
metadata:
  node_type: memory
  type: spec
  feature: rewards-notifications
  phase: SPEC
---

# SPEC — PUSH-005: Real Marketing/Retention Push Triggers (#82)

## Summary

Today, opted-in customers never receive a marketing or retention push — not because the
system can't send them, but because nobody has told it *when*. PUSH-004 built the pipe
(scheduler, send provider, opt-in gate, notification log); PUSH-003 built the on/off
switch and the in-app notification list. This SPEC is what fills the pipe: five real,
data-driven triggers that watch a customer's actual state (an about-to-expire coupon, a
near-miss on a reward, a reward that just unlocked, a new deal, a branch promo an admin
wants to send) and turn each one into a real push notification — safely, once each, and
only for customers who asked for marketing pushes.

## User Stories / Jobs To Be Done

- As a **customer with a coupon about to expire**, I want a reminder before it expires,
  so that I don't lose a discount I already earned.
- As a **customer one order away from unlocking a reward**, I want a nudge telling me
  I'm close, so that I'm motivated to come back and place that order.
- As a **customer who just unlocked a reward**, I want to be told right away, so that I
  know I have something new to redeem.
- As a **customer who has marketing pushes on**, I want to hear about new deals as they
  become available, so that I don't miss something I'd want to order.
- As a **branch/marketing admin**, I want to send a one-off promotional push to
  customers of a specific branch, so that I can run a branch-level promotion.
- As **any customer**, I want to control how often I'm messaged, so that marketing pushes
  never feel like spam — even if several trigger conditions happen to be true on the same
  day.
- As **any customer who opted out of marketing pushes**, I want zero marketing
  notifications of any kind, so that opting out actually means something.
- As the **on-call engineer**, I want the server to never send the same reminder twice,
  even after a restart, so that a deploy or crash doesn't cause duplicate/spam pushes.

## What The User Wants (Behavioral Outcomes)

- **Coupon expiring soon:** a customer with an offer coupon nearing its expiry gets
  exactly one reminder push in a lead window before it expires. If they use it, or it
  fully expires, they never get (another) reminder about that coupon.
- **One more order to unlock:** a customer whose lifetime star count is exactly one order
  away from their next reward tier gets a nudge. They do not get this nudge at any other
  star count, and not repeatedly for the same near-miss.
- **Reward unlocked:** the moment a customer crosses a reward threshold, they get a push
  right away — exactly once per unlock, even if the system retries the underlying
  operation.
- **New deal available:** when a new deal becomes orderable, opted-in customers hear
  about it once.
- **Branch promo:** an admin can trigger a one-off promotional push to a chosen branch's
  recent customers, with a message they write.
- **Opt-out means opt-out:** a customer with marketing pushes off receives literally zero
  of the above five push types, ever — this is verified per type, not just in aggregate.
  (Order-status pushes — accepted/preparing/ready/cancelled — are unaffected; those stay
  transactional and always deliver.)
- **No flooding:** a customer never receives more marketing pushes than a sane cap allows
  in a day/month, and never receives one in the middle of the night — see Constraints.
- **Survives a restart:** if the server restarts mid-day, no customer gets a duplicate
  "coupon expiring" or "one more order" reminder they already received before the
  restart.

## Flow / State Diagram

```
                     [ Server boot ]
                          |
                          v
              scheduler.start() is called
           (currently: NEVER happens in prod)
                          |
                          v
        five triggers register on the scheduler /
        hook into existing event code paths
                          |
        +-----------------+-----------------+--------------------+----------------+
        |                 |                 |                    |                |
   [poll: every        [poll: every     [event hook:         [event hook:     [admin action]
    tick, scan          tick, scan       order completes /    admin creates
    coupons.expires_at] user_stars]      star crediting]      new deal]        branch promo
        |                 |                 |                    |                |
        v                 v                 v                    v                v
  "N hours to      lifetime_stars      lifetime_stars       new deal row      admin submits
   expiry" AND    == required_stars    crosses a reward     becomes           branch + message
   not yet          - 1?                threshold?          eligible for       via admin UI/API
   notified?          |                    |                 a branch            |
        |             v                    v                    |                v
        |        not yet notified    (STAR-003 already      not yet         dispatch fires once
        |        for this tier?      mints coupon here —    notified for      to that branch's
        |             |              this hooks the push     this deal?       recent-order
        |             |              onto that existing         |             audience
        |             |              event, no new poll)        |                |
        +------+------+------+------+------+------+------+------+------+---------+
                                            |
                                            v
                              dispatchMarketingNotification(
                                userId, type, payload)
                                            |
                              +-------------+--------------+
                              |                             |
                     marketing_opt_in === true      marketing_opt_in !== true
                              |                             |
                              v                             v
                    frequency cap OK?              DROP — zero row written,
                    quiet hours OK?                zero push sent
                    not a duplicate (dedup)?
                              |
                    +---------+---------+
                    |                   |
                   yes                  no (capped / quiet-hours / dup)
                    |                   |
                    v                   v
        write `notifications` row   skip send, mark
        + send push via provider    "would-have-fired"
        + mark trigger as fired     for observability
        (persisted, restart-safe)   (no duplicate later)
```

## Acceptance Criteria (Testable Outcomes)

**AC0 — Scheduler actually runs in production.**
The scheduler is started once at server boot (not just constructible in tests); poll
triggers genuinely evaluate on a real interval in a running server.
`proven by:` `packages/api` integration/unit test asserting `scheduler.start()` is
invoked during app bootstrap (or equivalent boot-time registration test).
`strategy:` Fully-Automated.

**AC1 — Coupon expiring soon fires once, in-window, per coupon.**
A customer with an offer coupon whose `expires_at` falls inside the configured lead
window (and which has a non-null `expires_at`) receives exactly one "coupon expiring"
push referencing that coupon.
`proven by:` `packages/api` integration test seeding a coupon at various `expires_at`
offsets and asserting fire/no-fire + single-fire-on-repeat-poll.
`strategy:` Fully-Automated.

**AC2 — Coupon expiring does not re-fire after used or fully expired.**
Once a coupon is redeemed, or once its `expires_at` has fully passed, no further "coupon
expiring" push is sent for it.
`proven by:` same integration suite as AC1 — post-redemption and post-expiry poll
assertions.
`strategy:` Fully-Automated.

**AC3 — One-more-order nudge fires at exactly lifetime_stars = required_stars − 1.**
A customer whose `lifetime_stars` is exactly one short of an active reward's
`required_stars` receives the nudge; a customer at any other count (including exactly at
threshold, or two away) does not.
`proven by:` `packages/api` integration test sweeping star counts around several reward
tiers.
`strategy:` Fully-Automated.

**AC4 — One-more-order nudge is one-shot per near-miss tier.**
The same customer does not receive a repeat nudge for the same tier on every poll tick
while still one order away.
`proven by:` same suite as AC3 — repeated-tick assertion.
`strategy:` Fully-Automated.

**AC5 — Reward unlocked fires exactly once per unlock event, no duplicate on retry.**
The push is dispatched from the same code path STAR-003 already uses to mint the unlock
coupon (event-driven, not polled); a retried/duplicate-invoked unlock operation does not
send a second push for the same unlock.
`proven by:` `packages/api` integration test around `unlockRewardsForLifetime` /
`notifyRewardUnlocked`, including a simulated duplicate-call scenario.
`strategy:` Fully-Automated.

**AC6 — New deal available fires once per (deal, opted-in customer).**
When a new deal becomes active/eligible for a branch, opted-in customers eligible for
that branch are notified once for that deal; a poll or re-check does not re-notify.
`proven by:` `packages/api` integration test around deal-creation hook + repeat-poll
assertion.
`strategy:` Fully-Automated.

**AC7 — Branch promo is admin-triggered, not automatic, and fires once per submission.**
An admin-authored branch promo dispatches exactly once to the targeted audience when
submitted; it is not re-sent on scheduler ticks (it has no window/poll — it's a one-shot
command).
`proven by:` `packages/api` integration test on the admin promo-dispatch endpoint.
`strategy:` Fully-Automated.

**AC8 — Opt-out blocks all five marketing types, verified per type.**
A user with `marketing_opt_in` false/unset receives zero notifications for each of the 5
types individually when their trigger condition is otherwise true.
`proven by:` `packages/api` integration test, one assertion per type, opt-in off.
`strategy:` Fully-Automated.

**AC9 — Every fired trigger writes a correctly-shaped notifications row.**
Each of the 5 types writes a `notifications` row with the correct `type` and the correct
`target_screen`/`target_params` for that type (coupon → coupon wallet, reward → rewards,
deal/promo → deal details or equivalent).
`proven by:` `packages/api` integration test, one assertion per type, checking the
written row shape.
`strategy:` Fully-Automated.

**AC10 — Per-user marketing frequency cap is enforced.**
A customer does not receive more than the configured cap of marketing pushes in the
configured time window, even when multiple trigger conditions are true simultaneously;
the customer's transactional (order-status) pushes are never counted against or blocked
by this cap.
`proven by:` `packages/api` integration test firing multiple trigger types back-to-back
for one user and asserting the cap is respected while order-status pushes still deliver.
`strategy:` Fully-Automated.

**AC11 — Quiet hours suppress marketing sends outside the allowed window; transactional
pushes are exempt.**
A marketing trigger that would fire during quiet hours does not send during that window
(deferred or dropped per the locked design — see Assumptions); an order-status push fires
immediately regardless of time.
`proven by:` `packages/api` integration test with an injectable clock set inside/outside
the quiet-hours window.
`strategy:` Fully-Automated.

**AC12 — Restart-safe dedup: no duplicate poll-trigger sends across a process restart.**
Simulating a scheduler restart (fresh in-memory `fired` set) does not cause a duplicate
"coupon expiring" or "one more order" push for an already-notified coupon/tier — the
already-fired state is derived from persisted data (e.g. existing `notifications` rows or
an equivalent persisted marker), not only in-memory scheduler state.
`proven by:` `packages/api` integration test that reconstructs a scheduler instance
mid-test and re-runs `tick()`, asserting no duplicate row is written.
`strategy:` Fully-Automated.

## Out Of Scope

- **Foreground push-handler UI gap** (`Notifications.setNotificationHandler` never
  configured in `apps/mobile`) — real, confirmed bug, but unrelated to server-side
  trigger firing. Tracked as a separate, smaller follow-up (issue #82 comment 1); not
  built as part of this SPEC.
- **`rejected` order-status push** — a distinct, already-backlogged transactional-push
  gap (`process/features/rewards-notifications/backlog/rejected-order-push-notification_NOTE_15-07-26.md`).
  Noted here as an adjacent opportunity, not in scope.
- **Branch-affinity audience targeting** for "new deal"/"branch promo" (deriving a
  customer's "home branch" from order history for precise per-branch targeting) —
  deferred; v1 audience is broadcast-to-all-opted-in (see Assumptions).
- **Reward-coupon expiry** — reward-unlock coupons remain non-expiring (`expires_at`
  stays NULL); "coupon expiring" only covers admin-issued offer coupons that have an
  expiry set. Changing reward coupons to expire is out of scope.
- **Scheduler substrate itself** (interval mechanism, injectable clock, register/tick
  API) — already delivered by PUSH-004 (#75); this SPEC only adds real trigger
  definitions and wires them in, plus starts the scheduler at boot (AC0).
- **Push permission / opt-in toggle UI** — already delivered by PUSH-001/002 (#78) and
  PUSH-003 UI pass (#38).
- **New device-token/provider mechanics** — unchanged from PUSH-004; this SPEC is a
  consumer of `dispatchMarketingNotification`/`sendAndPrune`, not a change to them.
- **A configurable admin UI for the frequency cap / quiet-hours window** — the cap and
  window are fixed, code-level configuration for this SPEC, not admin-tunable settings.

## Constraints

- Every marketing send MUST pass through the existing `marketing_opt_in` gate — no
  exceptions, including "reward unlocked" (see Assumptions).
- Per-user marketing frequency cap: roughly 1–4 marketing pushes per month, and no more
  than 3 in any 24-hour period (industry-standard range) — exact numbers are an
  implementation-tier decision in the next phase (INNOVATE/PLAN), not fixed here as a
  literal constant; the *behavior* (a cap exists and is enforced) is the requirement.
- Quiet hours: no marketing send between roughly 9pm and 8am local time; transactional
  order-status pushes are exempt and always send immediately.
- Poll-based triggers (coupon expiring, one-more-order, new-deal poll variant) must be
  restart-safe — "already notified" state must be derivable from persisted data, not
  only the scheduler's in-memory `fired` set.
- Each of the 5 triggers must fire at most once per (user, event/window) pair — explicit
  one-shot semantics, not "fires again on every poll while the condition remains true."
- Must reuse the existing `dispatchMarketingNotification` / `sendAndPrune` /
  `notifications` pipeline from PUSH-004 — no parallel send path.
- "Reward unlocked" and "new deal" are event-driven (hook into existing
  order-completion/star-crediting/deal-creation code), not scheduler-polled; "coupon
  expiring" and "one-more-order" are poll-shaped and use `createScheduler()`; "branch
  promo" is admin-command-triggered, one-shot, not polled or event-driven.
- No new per-customer schema (e.g. a "home branch" column) is introduced by this SPEC —
  v1 audience for new-deal/branch-promo is broadcast to all opted-in users (or, for
  branch promo, an admin-chosen recent-order audience for that specific branch).

## Open Questions

None — all product-facing ambiguity from RESEARCH was resolved with a documented,
lowest-risk decision below (see Background/Assumptions). Any of these decisions may be
revisited by the user on read; none of them block INNOVATE/PLAN from starting.

## Background / Research Findings

**Substrate is real but empty.** `createScheduler()` (`packages/api/src/lib/scheduler.ts`)
works, is unit-tested, and is unused in production — `packages/api/src/index.ts` never
calls `.start()` and no triggers are ever `.register()`-ed. This is why AC0 exists as its
own acceptance criterion: without it, none of the poll-shaped triggers can ever fire
regardless of how correctly they're implemented.

**Types already exist.** All 5 `MarketingNotificationType` values (`new_deal`,
`coupon_expiring`, `one_more_order`, `reward_unlocked`, `branch_promo`) are already
defined in `packages/types/src/notifications.ts`, along with `NotificationTargetScreen`
(`order_tracking | deal_details | coupon_wallet | rewards`). No new type work is needed —
just real trigger logic that produces these values correctly.

**Dispatch pipeline already exists.** `dispatchMarketingNotification(userId, type,
payload)` in `notification-dispatch.ts` already gates on `users.marketingOptIn`, writes
one `notifications` row, and sends via `sendAndPrune()`. This SPEC's job is calling it
correctly and only when it should be called — not building it.

**STAR-003 is fully delivered** (issue #82's own "Dependencies" section is stale/wrong
about this) — `unlockRewardsForLifetime` mints coupons idempotently and
`notifyRewardUnlocked` already writes the in-app notification row; only the actual push
send call is missing at an existing `TODO(PUSH-002/003)` marker in
`reward-unlock-notify.ts`. This substantially de-risks AC5 — it's wiring a send call into
an already-idempotent, already-tested code path, not building idempotency from scratch.

**Documented decisions (each is a DECIDE call from RESEARCH, carried forward as a locked
assumption for SPEC purposes — reversible later without blocking now):**

1. **Coupon-expiring scope:** reward-unlock coupons never get `expires_at` set (always
   NULL) and are intentionally excluded from this trigger; only offer coupons with an
   explicit `expires_at` are covered. *Rationale:* avoids touching STAR-003/star-earning
   behavior or schema to invent an expiry policy for reward coupons — smaller, safer
   footprint.
2. **One-more-order basis:** use `lifetime_stars` (monotonic), not `current_stars`
   (resets on redemption). *Rationale:* `lifetime_stars` is the actual value the real
   unlock logic keys off, so the nudge and the real unlock threshold can never disagree —
   using `current_stars` would let the nudge fire a lie after a redemption resets it.
3. **New-deal / branch-promo audience:** v1 = broadcast to all opted-in users (no
   per-branch targeting derived from order history). *Rationale:* there is no
   "customer's home branch" column today; deriving one is a data-model decision this
   issue shouldn't need to make. Documented as a deferred future enhancement, not a gap.
4. **Branch promo shape:** treated as an admin-authored, manually-triggered one-shot
   campaign (admin picks a branch + writes a message + submits), not a fully-automatic
   DB-state-poll trigger like the other four. *Rationale:* nothing in the data
   automatically determines when a "branch promo" should exist — a human decides that;
   inventing a fake automatic condition for it would be worse than naming it as
   admin-triggered.
5. **Reward-unlocked opt-in gating:** kept opt-in-gated by `marketing_opt_in`, matching
   the issue's literal "every send goes through the marketing_opt_in gate — no
   exceptions" requirement and the type's placement in `MarketingNotificationType`.
   *Rationale/caveat for user review:* this is arguably a borderline call since an
   "unlocked reward" is an earned/positive event rather than pure promotion — flagged
   here explicitly so the user can override to "always send" later if desired; not
   blocking for this SPEC.
6. **Rejected-order push** and **foreground notification handler gap** are real,
   adjacent findings but are explicitly out of scope (see Out Of Scope) — each already
   has, or should get, its own tracked follow-up rather than expanding this issue's
   blast radius.

**Non-functional gaps found via best-practice research, folded into scope as AC10–AC12:**
industry guidance caps marketing push frequency (~1–4/month, ≤3/24h) and observes quiet
hours (~8am–9pm local) to avoid opt-outs from over-messaging; the scheduler's in-memory
`fired` set does not survive a process restart, so poll-based triggers need a persisted
"already notified" marker (mirroring `dispatchOrderNotification`'s existing
row-existence-check pattern) to stay restart-safe.
