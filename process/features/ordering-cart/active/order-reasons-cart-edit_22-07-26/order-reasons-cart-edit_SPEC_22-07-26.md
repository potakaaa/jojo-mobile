---
name: spec:order-reasons-cart-edit
description: "Staff reject reasons, customer order cancellation, and cart-line option editing — requirements lock"
date: 22-07-26
feature: ordering-cart
---

# SPEC — Order Reasons + Customer Cancel + Cart Line Edit

**TL;DR:** Three related, independently-shippable capabilities: (B2) staff must give a reason when
rejecting an order; (B3) a customer can cancel their own order, but only before staff accepts it,
with an optional reason; (B4) a customer can edit a cart line's flavor/add-ons by reopening Product
Details for that line and saving over it. All three are new server-side mutations on the `orders`/
`cart_items` trust boundary and must be provably safe by automated test, not just by code review.
All four prior Open Questions are now locked — see Constraints and Out of Scope.

## Summary

Today, when staff reject an order, the customer never learns why — the app just shows "rejected."

> **AS-BUILT NOTE (CodeRabbit, PR #156).** This promise was initially only half-kept. The reason was
> captured, stored, serialized and rendered on the STAFF order-detail screen, but the customer's own
> tracking screen never read `reasonCode` — so at first merge the customer still just saw "rejected"
> and the gap this paragraph opens by describing was still open. Closed on PR #156: the tracking
> screen now renders an `OrderReasonBlock` for terminal orders carrying a reason, phrased in the
> customer's voice ("Why this order wasn't accepted") rather than reusing the staff copy, and
> resolving the label through `resolveReasonLabel(code, reasonActor)` so a customer's own
> cancellation reason maps against `CUSTOMER_CANCEL_REASONS` rather than the staff table. Locked by
> `tracking/__tests__/reason-block.test.tsx`, whose actor test is non-vacuous by construction —
> hardcoding the actor turns exactly that assertion red.
Today, a customer who wants to back out of an order has no way to cancel it themselves — they have
to call the branch. And today, once a food or drink item is in the cart with a chosen flavor and
add-ons, the only way to change that choice is to delete the whole line and re-add it from scratch,
losing the "I already picked this" context. This work closes all three gaps: staff pick from a short
list of reasons when rejecting (required, with room for a note — and if they pick "Other" they must
say why), customers can back out of an order themselves while it's still waiting for the branch to
accept it (with an optional reason), and customers can tap a cart line to reopen it pre-filled and
change the flavor/add-ons without starting over.

## User Stories / Jobs To Be Done

- **B2.** As a staff member rejecting an order, I want to record why I'm rejecting it, so that the
  customer understands what happened and we have a record for later.
- **B3.** As a customer who placed an order I no longer want, I want to cancel it myself while it's
  still pending, so that I don't have to call the branch or wait for staff to notice.
- **B3b.** As a customer cancelling an order, I want to optionally say why, so that the business can
  learn from cancellation patterns, but I don't want to be forced to explain myself.
- **B4.** As a customer who already added an item to my cart, I want to change its flavor or
  add-ons without removing and re-adding it, so that editing my order feels natural instead of
  starting over.

## What The User Wants (Behavioral Outcomes)

**B2 — Staff reject reason**
- When staff taps "Reject" on a pending order, before the rejection is sent, staff choose a reason
  from a short preset list and may optionally add a free-text note.
- A reason is required — staff cannot submit a rejection with no reason selected.
- If staff pick "Other," a note is required too — an "Other" pick with no note is rejected the same
  way a missing reason is. A contentless "Other" would give the appearance of accountability without
  the substance, which is worse than not asking at all.
- The recorded reason (and note, if any) is visible on the order afterward, to staff (and, by
  composition, to the admin dashboard's order view — see Constraints).
- Everything else about the reject action (which orders can be rejected, who can reject) is
  unchanged from today.

**B3 — Customer cancel order**
- A customer sees a "Cancel order" action on their own order while — and only while — the order is
  still waiting for the branch (`pending`).
- The moment staff accept the order, the customer's ability to cancel disappears — from that point
  the customer must contact the branch, matching how the business already expects an accepted order
  to be handled.
- Tapping "Cancel order" asks for confirmation before anything is sent, and gives the customer the
  option to pick a reason from a short preset list, or type their own — but nothing is required;
  the customer may skip the reason entirely.
- Once cancelled, the order shows as cancelled to the customer and to staff, and cannot be
  un-cancelled or re-cancelled.
- A customer can never cancel someone else's order.
- If staff accept the order at the exact moment the customer tries to cancel, the person who acted
  second is told the action can't go through and sees the order's true current state — never a
  silent conflicting write.

**B4 — Edit a cart line's flavor/add-ons**
- Tapping an item already in the cart reopens that product's detail/customize screen, pre-filled
  with the flavor/add-ons/quantity the customer picked for that line.
- The customer can change the selection and save.
- Saving replaces that cart line with the new selection — it does not add a second, separate line
  for the same product sitting alongside the old one.
- If the customer's new selection happens to match another line already in the cart (same product,
  same flavor, same add-ons), the two merge into one line with the combined quantity — matching how
  adding an item to the cart already behaves today when it matches an existing line.
- Backing out of the edit screen without saving leaves the cart line unchanged.

## Flow / State Diagram

**B2 — Staff reject flow**
```
Staff order-detail (status: pending)
        |
   tap "Reject"
        v
Reason picker (preset list, one required + optional note;
                "Other" selected -> note becomes required)
        |
   reason missing, OR "Other" chosen with no note -> submit blocked
        v
   [Confirm]  ---sends reason code (+ note)---> PATCH .../reject
        |
        v
  order.status = rejected, reason code + note stored
        |
        v
  Customer sees "Rejected" + the reason
```

**B3 — Customer cancel flow**
```
Customer order-tracking (status: pending)
        |
   "Cancel order" visible
        |
   tap it
        v
Confirm dialog (optional preset-or-freetext reason field — may be left blank)
        |
   [Confirm]  ---optional reason---> PATCH .../cancel
        |
        +--- order still pending -----> 200, status = cancelled, reason stored (or null)
        |
        +--- order no longer pending -> 409, screen refreshes to true state
        |
        +--- order not owned by caller -> 403, order unchanged

Once status advances to accepted (or beyond): "Cancel order" no longer shown.
```

**B4 — Cart line edit flow**
```
Cart screen: line "Iced Tea — Wintermelon, +Pearl (Qty 2)"
        |
   tap the line
        v
Product Details screen opens, pre-filled:
  flavor = Wintermelon, add-ons = [Pearl], quantity = 2
        |
   customer changes flavor -> Taro, keeps Pearl
        |
   tap Save
        v
   Does an existing cart line already have
   product=Iced Tea, flavor=Taro, add-on=Pearl?
        |
   +-- No  --> old line replaced with the new selection
        |
   +-- Yes --> old line removed, matching line's quantity increased by the edited line's quantity
        v
Cart screen reflects the updated line(s)

Back button without Save -> cart line unchanged
```

## Acceptance Criteria (Testable Outcomes)

### B2 — Staff reject reason

| ID | Criterion | Tier |
|---|---|---|
| B2.1 | Staff can reject a `pending` order only after selecting a reason from the preset list; submitting with no reason selected is rejected client-side and never reaches the server. | Fully-Automated — `proven by: apps/mobile jest reason-required-gate` |
| B2.2 | A reject request that omits a reason is rejected by the server (never silently accepted as reasonless), independent of the client gate. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — reject requires reason` |
| B2.3 | A reject request with a valid preset reason (with or without an optional free-text note) transitions the order to `rejected` and persists both the reason code and the note. | Fully-Automated — `proven by: packages/api vitest — reject stores reason+note` |
| B2.4 | Rejecting an order not in the staff member's assigned branch is rejected (403), matching the existing staff order-mutation ownership rule; order unchanged. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — reject branch isolation` |
| B2.5 | Rejecting an order that is not currently `pending` fails (409); order and any prior reason are unchanged. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — reject illegal-transition` |
| B2.6 | The stored reason and note are visible on the order to staff (order detail) and — by existing composition — surface automatically in the admin order view without additional admin-side work. | Fully-Automated — `proven by: packages/api vitest — staff + admin serializer field-presence` |
| B2.7 | On-device: staff open a pending order, tap Reject, see the reason picker, cannot submit without a reason, submit with a reason, and see the order become Rejected. | Agent-Probe — `proven by: manual walkthrough` |
| B2.8 | A reject request whose reason code is `other` and whose note is empty/missing is rejected — client-side (button stays disabled / validation error) AND server-side (independent of the client gate, same as B2.2). Only a non-`other` reason code, or an `other` code paired with a non-empty note, may succeed. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — reject "other" requires note` + `apps/mobile jest — other-requires-note gate` |

### B3 — Customer cancel order

| ID | Criterion | Tier |
|---|---|---|
| B3.1 | A customer can cancel their own order only while it is `pending`; the order becomes `cancelled` and the cancellation timestamp is set. | Fully-Automated — `proven by: packages/api vitest — cancel happy path` |
| B3.2 | A customer cannot cancel an order they do not own — 403, order unchanged. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — cancel ownership` |
| B3.3 | Cancelling from any status other than `pending` (`accepted`, `preparing`, `flavoring`, `ready`, `completed`, `cancelled`, `rejected`) fails with 409; order unchanged. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — cancel non-pending source status, parameterised over all 7 remaining statuses` |
| B3.4 | If a staff accept-transition commits first, a customer's concurrent cancel attempt on the same order receives 409 (compare-and-swap), never a silent overwrite of the accepted order. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — cancel/accept race` |
| B3.5 | The reason is optional — a cancel request with no reason succeeds and stores a null/empty reason; a cancel request with a preset or free-text reason stores it verbatim. No "requires note" gate applies to B3 — unlike B2, there is no reason value (preset or otherwise) that blocks submission. | Fully-Automated — `proven by: packages/api vitest — cancel with/without reason` |
| B3.6 | Non-existent / malformed order id → 404. | Fully-Automated — `proven by: packages/api vitest — cancel unknown/malformed id` |
| B3.7 | The "Cancel order" action is visible on the tracking screen only while `order.status === 'pending'`, and disappears the moment the order advances. | Fully-Automated — `proven by: apps/mobile jest — cancel button visibility gate` |
| B3.8 | Tapping "Cancel order" shows a confirm step with an optional reason field before anything is sent; dismissing sends nothing. | Fully-Automated — `proven by: apps/mobile jest — cancel confirm-dialog gate` |
| B3.9 | On-device: a customer cancels a pending order (with and without a reason), the tracking screen reflects `cancelled` and stops polling, and staff see the order as cancelled with the reason (if any) visible. | Agent-Probe — `proven by: manual walkthrough` |

### B4 — Edit cart line flavor/add-ons

| ID | Criterion | Tier |
|---|---|---|
| B4.1 | Tapping a cart line opens Product Details for that product, pre-filled with that line's current flavor, add-ons, and quantity. | Fully-Automated — `proven by: apps/mobile jest — prefill from cart line` |
| B4.2 | Saving a changed selection, when no other cart line already has the identical product+option set, replaces the original line's selection in place (same cart, one line, new options). | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — edit replaces line, no collision` |
| B4.3 | Saving a changed selection that matches an already-existing different line (same product, same full option set) merges into that line — the old line is gone, the matching line's quantity increases by the edited line's quantity, and no duplicate line for that same product+option combination exists afterward. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — edit collides with existing line, merges quantity` |
| B4.4 | A customer can never edit a cart line belonging to another user's cart — the existing per-line ownership check applies unchanged. | Fully-Automated **(HARD — Known-Gap BANNED)** — `proven by: packages/api vitest — edit ownership (reuses existing line-ownership gate)` |
| B4.5 | Leaving the pre-filled Product Details screen without saving leaves the original cart line completely unchanged (quantity, options, both). | Fully-Automated — `proven by: apps/mobile jest — cancel-edit no-op` |
| B4.6 | On-device: tap a cart line, see it pre-filled correctly, change the flavor, save, and see the cart reflect exactly one line with the new selection (and correct merged quantity in the collision case). | Agent-Probe — `proven by: manual walkthrough` |

**Tier rule (locked, non-negotiable per orchestrator instruction):** every ownership check, every
illegal-transition rejection, every collision/merge outcome, and every "required-field" gate
(B2.2, B2.8) stays Fully-Automated with Known-Gap explicitly banned — `packages/api` has a real
supertest runner against live Postgres, so there is no infrastructure excuse for leaving an
authorization or state-transition rule unproven. Only genuine on-device walkthroughs (B2.7, B3.9,
B4.6) may be Agent-Probe.

## Out Of Scope

- Any change to Track A client UI items (not part of this SPEC's research scope).
- The closed-branch server gate (specced/covered separately).
- Any change to the existing staff `PATCH /api/staff/orders/:orderId` transition mechanics, the
  state machine's transition table (`order-state-machine.ts`), or the staff "Mark Picked Up" /
  customer self-pickup-complete route (`PATCH /orders/:orderId/complete`, already shipped).
- Cancelling an order once staff have accepted it — B3 is deliberately `pending`-only; a customer
  who wants to back out of an accepted order must still contact the branch, unchanged from today.
- Editing a cart line's **quantity** — that already works today via `PATCH /cart/items/:lineId`;
  B4 covers **flavor/add-on option changes only**.
- Refund handling, payment reversal, or any accounting consequence of a cancellation or rejection.
- Push notifications for the new `rejected`-with-reason or customer-`cancelled` events beyond
  whatever the existing notification dispatch already sends for `rejected`/`cancelled` status
  changes (no new notification copy or event type is in scope here).
- **A new staff in-app alert/notification path for customer-initiated cancellation — deliberate,
  locked decision, not an oversight.** The existing `cancelled` notification-dispatch event already
  covers the customer-facing side, and B3's cancellation window is `pending`-only by construction —
  meaning a branch has not yet begun preparing the order and there is nothing in-progress to
  interrupt anyone about. Building a dedicated staff alert here would be scope the user did not ask
  for. **This decision is coupled to the `pending`-only constraint above: if the cancellation window
  is ever widened past `pending` (e.g. to also allow cancelling an `accepted` order), this decision
  must be revisited** — at that point a branch could genuinely be mid-prep when cancelled, and
  silence would no longer be safe.
- Star ledger changes — cancellation/rejection never credits or reverses a star; this SPEC does not
  touch `star-earning.ts`.
- A generic customer-writable status field. Both new customer/staff mutations remain narrow,
  single-purpose routes (matching the `PATCH /orders/:orderId/complete` precedent) — a request body
  can never express an arbitrary target status.
- Editing a cart line's product itself (swapping to a different menu item) — only the same
  product's own options/quantity are in scope.

## Constraints

- **B2 reason is REQUIRED; B3 reason is OPTIONAL.** This is an inherited, already-locked user
  decision from a prior clarification round (preset list + optional free text on BOTH sides, staff
  required / customer optional) — not a SPEC proposal. Do not unify the two into one shared
  "reason required" rule, and do not re-open this asymmetry as a question.
- **Locked preset reason lists.** These are the confirmed starting sets; the exact wording is
  business copy the user may revise at any time without touching structure. **Reason CODES (stable
  identifiers) must be decoupled from display STRINGS**, so a future copy change is never a
  migration:

  | Code (stable) | Staff reject display string (required, pick one) |
  |---|---|
  | `out_of_stock` | Item(s) out of stock |
  | `branch_busy` | Branch too busy / at capacity |
  | `outside_hours` | Outside service hours / closing soon |
  | `payment_issue` | Payment issue |
  | `customer_requested` | Customer requested |
  | `other` | Other — **note REQUIRED when chosen (B2.8)** |

  | Code (stable) | Customer cancel display string (optional, may skip entirely) |
  |---|---|
  | `ordered_by_mistake` | Ordered by mistake |
  | `changed_my_mind` | Changed my mind |
  | `wrong_item_options` | Wrong item or options |
  | `wrong_branch` | Wrong branch |
  | `taking_too_long` | Taking too long |
  | `other` | Other |

  Note the customer side has no "other requires a note" rule — the entire B3 reason field, preset or
  free text, is optional throughout (B3.5).
- **B3 cancellation window is `pending`-only** — this is narrower than what the existing state
  machine already permits (`accepted → cancelled` is legal today for staff). B3 must NOT widen the
  customer's cancel window to `accepted`; it is a locked, deliberate restriction distinct from the
  staff cancel path, which is unaffected by this SPEC. (See the linked Out of Scope note: widening
  this window later would also require revisiting the no-staff-notification decision.)
- **No caller-supplied target status.** Both B2 (reject) and B3 (cancel) must follow the
  `PATCH /orders/:orderId/complete` precedent: dedicated, narrow routes whose request bodies cannot
  express any status other than the one route's own fixed target. A generic `{ status, reason }`
  body mirroring the staff PATCH is explicitly rejected as a shape, for the same reason the
  mark-picked-up SPEC rejected it (see that plan's Decision Summary).
  Precedent: `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/`.
- **Ownership check precedes status check**, exactly matching the `GET /:orderId` /
  `PATCH /:orderId/complete` ordering (avoids leaking order existence via a 403-vs-409/404 split).
- **Compare-and-swap on the current status**, matching the existing staff PATCH and the
  mark-picked-up route, so a losing concurrent transition gets 409, never a silent overwrite.
- **No migration currently exists for a reason column** — `orders` (`packages/api/src/db/schema/orders.ts`)
  has no reason/note field today (confirmed by direct schema read); persisting B2/B3's reason is new
  schema surface. Per this repo's standing convention, any new migration must be additive-only
  (current migration head: `0021_add_notifications_user_created_idx.sql`).
  **Storage shape (one shared column vs. two, code vs. free text alongside a preset id) is
  correctly a PLAN decision, not a SPEC decision — this SPEC does not mandate one column vs. two.**
  Whatever shape PLAN picks MUST satisfy this requirement: **it must be possible to answer "who
  cancelled/rejected this order — staff or customer — and why?" by reading the order row alone,
  without inferring the actor from status-history side channels.** This is a hard requirement PLAN
  must design against, not a suggestion.
- **`StaffOrderDetail`/`StaffOrderSummary` composition**: `AdminOrderDetail`/`AdminOrderSummary`
  (`packages/api/src/routes/lib/serializers.ts`) spread the staff serializers' output. Any reason
  field added to the staff shape surfaces in the admin dashboard automatically — this SPEC treats
  that admin visibility as INTENDED for B2 (staff reject reason), consistent with every other
  staff-order field. No separate admin-only reason concealment is requested.
- **B4 must reuse the existing merge-by-identical-option-set behavior** already implemented in
  `POST /cart/items` (`packages/api/src/routes/cart.ts`) — a matching product+option-set line
  already causes quantity-bump-not-duplicate on ordinary add-to-cart; the edit flow's collision
  behavior (B4.3) must be consistent with that existing rule, not a new, different merge policy.
- **Existing per-line ownership check (`requireOwnedLine`) must gate the edit path unchanged** —
  B4 introduces no new ownership-bypass surface.
- **Risk class: HIGH — order-state trust boundary (B2, B3) and cart-mutation trust boundary (B4).**
  Every ownership check, every illegal-transition rejection, every collision/merge rule, and every
  required-field gate marked HARD above must be proven by a real passing automated test — Known-Gap
  is explicitly banned for those criteria. The 5-artifact high-risk evidence pack
  (`vc-risk-evidence-pack`) is RECOMMENDED before finalize for B2/B3 (new customer/staff-facing
  order-state mutation routes), following the `customer-mark-picked-up` and STAFF-003 precedents;
  final call on invoking it belongs to INNOVATE/VALIDATE, not this SPEC.
- Existing route/behavior freeze: `POST /orders`, `GET /orders`, `GET /orders/:orderId`,
  `PATCH /orders/:orderId/complete`, every other `/api/staff/*` route, `POST /cart/items`,
  `DELETE /cart/items/:lineId`, `PATCH /cart/items/:lineId` (quantity-only), the `OrderStatus`
  union, and the state-machine transition table are all UNCHANGED by this SPEC.

## Open Questions

None. All four items raised during drafting have been resolved and folded into Constraints / Out
of Scope above:
1. Reason input shape (preset + optional free text, staff required / customer optional) — inherited
   locked user decision, see Constraints.
2. Preset reason lists — locked, see the two tables in Constraints.
3. Reason storage shape — correctly deferred to PLAN, but constrained by the "who + why, from the
   order row alone" requirement in Constraints.
4. Staff in-app notification on customer cancel — decided out of scope, with rationale and a
   revisit trigger, see Out of Scope.

## Background / Research Findings

- **Direct precedent read in full:** `process/features/ordering-cart/active/customer-mark-picked-up_21-07-26/`
  (PLAN + SPEC). Its plan's Status line ("PLANNED — not executed") is STALE — the route it designed,
  `PATCH /orders/:orderId/complete`, is LIVE at `packages/api/src/routes/orders.ts:635`, registered
  before the broader `GET /:orderId` handler. Its shape (narrow single-purpose PATCH, no
  caller-supplied target status, ownership-then-status check ordering, compare-and-swap,
  post-commit side effect) is the direct template B3 (and, loosely, B2) must follow.
- **`PATCH /api/staff/orders/:orderId`** (`packages/api/src/routes/staff.ts:279-395`) is the
  existing generic staff transition route: `z.object({ status, etaMinutes })`, no reason field.
  `canTransition` (state machine) already permits `pending → rejected` and `pending|accepted →
  cancelled`. Per-transition timestamp columns exist (`accepted_at`, `ready_at`, `completed_at`,
  `cancelled_at`) but there is no `rejected_at` and no reason/note column anywhere on `orders`.
- **Staff reject UI today:** `apps/mobile/src/app/(staff)/order-detail/[orderId].tsx` — Reject
  button opens a themed `ConfirmDialog` (yes/no only) and calls the same generic PATCH with
  `{status:'rejected'}` — no text input exists.
- **Customer cancel today: does not exist.** `packages/api/src/routes/orders.ts` has no cancel
  route. The tracking screen only currently offers the mark-picked-up action.
- **`orders` schema** (`packages/api/src/db/schema/orders.ts`) confirmed to have no reason/note
  column of any kind. Any persisted reason is new, additive migration surface (current head:
  `0021_add_notifications_user_created_idx.sql`).
- **`OrderNotificationEvent`** (`packages/api/src/routes/lib/notification-dispatch.ts:21`) is
  `'accepted' | 'preparing' | 'ready' | 'cancelled'` — no `rejected` or `completed` member. A
  customer-cancel already has a dispatchable event type (`cancelled`); reject does not and this
  SPEC does not ask for one to be added.
- **`packages/api/src/routes/lib/serializers.ts`**: `serializeAdminOrderSummary`/
  `serializeAdminOrderDetail` (lines ~1161-1200) spread `serializeStaffOrderSummary`/
  `serializeStaffOrderDetail`'s output verbatim then add admin-only fields — confirmed by direct
  read. A new staff-visible field automatically reaches the admin dashboard with zero admin-side
  code change, matching this SPEC's Constraints section.
- **Cart line editing today (B4):** options are immutable on an existing line.
  `PATCH /cart/items/:lineId` (`packages/api/src/routes/cart.ts:240-276`) only accepts
  `{ quantity }` — no options field. Line identity is partly defined by the selected options: a
  sorted-option-id `optionKey()` (cart.ts:92) plus `product_id` determine whether `POST
  /cart/items` bumps an existing line's quantity or creates a new one (cart.ts:198-210) — this
  exact merge-by-identical-option-set logic is what B4.3's collision behavior must match, not
  reinvent. `requireOwnedLine` (cart.ts:115) is the existing per-line ownership gate reused by
  `PATCH`/`DELETE /cart/items/:lineId` today; B4 must reuse it, not bypass it.
  `apps/mobile/src/app/(tabs)/product/index.tsx` (Product Details) currently has no
  prefill-from-existing-cart-line path — it always starts from an empty selection.
  `apps/mobile/src/app/(tabs)/cart/index.tsx` renders `<CartItem>` rows with no tap-to-edit
  handler today (only quantity stepper + remove).
- **Test infra:** `packages/api` has a real vitest+supertest integration runner against live
  Postgres — every HARD server-side criterion above (ownership, illegal-transition, collision/merge,
  required-field gates, race) is genuinely Fully-Automated, not aspirational. `apps/mobile` has
  jest/jest-expo for component-level RN tests (button visibility gates, confirm-dialog gates,
  prefill assertions) — no project-wide RN navigation/E2E runner exists, so only full on-device
  walkthroughs (B2.7, B3.9, B4.6) are Agent-Probe, per `process/context/tests/all-tests.md` §Known
  Gaps.
- **Orchestrator decisions folded in this pass (22-07-26):** all four items previously listed under
  Open Questions were resolved by explicit orchestrator instruction, not independently guessed by
  this SPEC pass — see the numbered list under Open Questions above for the resolution summary and
  the corresponding Constraints/Out of Scope sections for the locked detail.
