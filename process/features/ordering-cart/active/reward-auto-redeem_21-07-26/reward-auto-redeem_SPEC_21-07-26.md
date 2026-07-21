---
name: spec:reward-auto-redeem
description: "Auto-add the reward-eligible item to cart when customer taps Redeem on the rewards screen"
date: 21-07-26
feature: ordering-cart
---

# Reward Auto-Redeem — Product Requirements SPEC

**Date:** 21-07-26
**Feature:** ordering-cart
**Status:** DRAFT — awaiting user review

---

## Summary

Today, a customer who wants to redeem a reward tier on the Jojo Potato rewards screen must
manually navigate to the menu, find the eligible item, add it to their cart, and then return
to rewards to tap Redeem — or they see an error if the item isn't already there. This is
confusing and breaks the flow.

This change makes Redeem work in one tap. When a customer taps Redeem, the app:
finds the eligible item for that reward tier, adds it silently to their cart (if it isn't
there already), and applies the reward discount — then navigates them to the cart. If the
item is not available at their selected branch, it tells them why and stops. If they have not
yet picked a branch, it sends them to the branch selector first.

The prerequisite is that the backend and shared types must begin surfacing `eligibleProductId`
to the customer-facing rewards endpoint — it is currently stored in the database and used by
the admin API, but stripped before reaching the mobile app.

---

## User Stories / Jobs To Be Done

**US-1 — No branch selected**
As a customer on the rewards screen who has not yet selected a branch,
when I tap Redeem on a reward tier,
so that I am not confused by a silent failure,
I want to see a clear prompt that tells me to pick a branch first, and be taken there.

**US-2 — Eligible item not yet in cart**
As a customer on the rewards screen who has a branch selected,
when I tap Redeem on a reward tier whose eligible item is available at my branch,
so that I don't have to manually hunt for the item myself,
I want the app to add the item to my cart automatically and apply the reward discount,
then take me to the cart so I can see what was added.

**US-3 — Eligible item already in cart**
As a customer whose cart already contains the reward-eligible item,
when I tap Redeem on a reward tier,
so that I don't end up with a duplicate item I didn't ask for,
I want the app to skip adding the item again and just apply the reward discount,
then take me to the cart.

**US-4 — Eligible item not available at the selected branch**
As a customer on the rewards screen with a branch selected,
when I tap Redeem on a reward tier whose eligible item is not on that branch's menu,
so that I understand why it didn't work,
I want to see a clear error message explaining the item is not available at my branch,
and remain on the rewards screen.

---

## What The User Wants (Behavioral Outcomes)

**Branch guard first.** Before anything else happens, the app checks whether a branch is
selected. If not, the customer sees a toast message ("Pick a branch to use your rewards")
and is navigated to the branch selection screen. No cart changes occur.

**Silent auto-add.** When a branch is selected and the eligible item is available, the app
adds the item to the cart without asking for confirmation. The customer sees the item in their
cart when they arrive there. This is modelled on how McDonald's and similar apps handle reward
redemption — the item appears in cart, no extra dialog.

**Idempotent on duplicate.** If the item is already in cart, nothing is added. The reward
discount is still applied. The customer is still navigated to the cart.

**Unavailability is a hard stop with a message.** If the eligible item is not in the selected
branch's menu (not available, inactive, or a deal with unavailable components), the app shows
a toast error and does nothing else. The customer stays on the rewards screen and can choose a
different branch or a different reward.

**Navigation after success.** After a successful auto-add + apply, the customer is navigated
to the cart screen. They can see the reward line item and the added product before proceeding
to checkout.

---

## Flow / State Diagram

```
Customer taps Redeem on a reward tier
               |
               v
  Is a branch selected?
       /           \
     NO             YES
      |               |
      v               v
  Toast: "Pick a    Is eligibleProductId
  branch first"     in this branch's menu?
  Navigate to           /          \
  /(tabs)/branches    NO             YES
                       |               |
                       v               v
                 Toast: "Not       Is item already
                 available at      in the cart?
                 this branch"         /       \
                 Stay on          YES           NO
                 rewards             |            |
                 screen              v            v
                             Apply reward    addItem(menuItem, [], 1)
                             discount        on success → apply reward
                             directly        discount
                                    \           /
                                     \         /
                                      v       v
                                   Navigate to cart screen
                                   (user sees item + reward)
```

State transitions for the Redeem button:

```
IDLE ──tap──> LOADING (disable button, show spinner)
LOADING ──no branch──> IDLE (toast, navigate to branches)
LOADING ──item unavailable──> IDLE (error toast, stay on screen)
LOADING ──add succeeded──> IDLE (navigate to cart)
LOADING ──add failed (network/unknown)──> IDLE (error toast, stay on screen)
```

---

## Acceptance Criteria (Testable Outcomes)

**AC1 — No branch: toast and navigate**
When a customer taps Redeem and no branch is selected (`cart.branchId` is null/undefined),
a toast message containing "pick a branch" (case-insensitive) is shown, and the customer is
navigated to `/(tabs)/branches`. The cart is unchanged.

`proven by:` rewards-screen jest component test — render with empty cart, tap Redeem,
assert toast called + navigation to branches + cart unchanged.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC2 — Eligible product ID threads through to the mobile screen**
`Reward.eligibleProductId` (type `string | null`) is present in:
(a) `packages/types/src/rewards.ts` `Reward` interface,
(b) the response body of `GET /rewards` (customer-facing route), and
(c) the `RewardTier` derived shape in `derive-reward-tiers.ts`.
A reward with a real `eligibleProductId` UUID in the DB arrives at the screen with that UUID
intact.

`proven by:` `packages/api` vitest integration test — GET /rewards response shape assertion
confirms `eligibleProductId` field present with correct UUID (non-null for a seeded reward with
`eligibleProductId` set, null for one without).
`strategy:` Fully-Automated (vitest in `packages/api`).

**AC3 — Item available: auto-add and navigate to cart**
When a customer taps Redeem, has a branch selected, and the eligible item is in the branch's
menu (returned by `useMenu()`), and the item is not already in cart:
the item is added to the cart once, the reward discount is applied,
and the customer is navigated to the cart screen.

`proven by:` rewards-screen jest component test — mock `useMenu` to include the eligible
product, mock `useCart` with empty cart, tap Redeem, assert `addItem` called with correct
`menuItem`, assert navigation to cart.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC4 — Item already in cart: skip add, apply discount, navigate**
When a customer taps Redeem and the eligible item's `menuItemId` already matches an item in
`cart.items`, no additional `addItem` call is made, the reward discount is applied,
and the customer is navigated to the cart screen.

`proven by:` rewards-screen jest component test — mock cart with the eligible item already
present, tap Redeem, assert `addItem` NOT called, assert discount applied, assert navigation
to cart.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC5 — Item unavailable: error toast, stay on screen**
When a customer taps Redeem, has a branch selected, but the eligible item is NOT in the
branch's menu (absent from `useMenu()` result), a toast error is shown, and the customer
remains on the rewards screen. Cart is unchanged.

`proven by:` rewards-screen jest component test — mock `useMenu` to exclude the eligible
product, tap Redeem, assert error toast shown, assert no navigation, assert cart unchanged.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC6 — Reward with null eligibleProductId: degrade gracefully**
When a reward tier has `eligibleProductId: null`, tapping Redeem does NOT auto-add anything.
The existing `resolveAndApplyDeal` path applies the discount as before (behaviour unchanged
for rewards without an eligible product ID). No crash.

`proven by:` rewards-screen jest component test — mock a reward with `eligibleProductId: null`,
tap Redeem, assert no crash and existing apply path called.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC7 — Redeem button disabled while in-flight**
From the moment Redeem is tapped until the operation completes (success or error), the Redeem
button for that tier is disabled and shows a loading indicator. It is re-enabled on
completion.

`proven by:` rewards-screen jest component test — fire tap, assert button disabled in pending
state; after async resolution, assert button re-enabled.
`strategy:` Fully-Automated (jest `*.test.tsx` in `apps/mobile`).

**AC8 — derive-reward-tiers passes eligibleProductId through unchanged**
The `deriveRewardTiers()` function propagates `eligibleProductId` from the input `Reward[]`
to the output `RewardTier[]` without transformation.

`proven by:` existing `derive-reward-tiers.test.ts` — update assertions to include
`eligibleProductId` on each tier and confirm round-trip fidelity.
`strategy:` Fully-Automated (vitest in `apps/mobile`).

**AC9 — On-screen visual after cart navigation (Agent-Probe)**
After a successful redeem, the cart screen shows the auto-added item and the reward discount
line. The item count badge on the cart tab reflects the addition.

`proven by:` manual Agent-Probe walkthrough on device/simulator — tap Redeem on a reward tier
with a configured `eligibleProductId`, confirm item appears in cart with discount applied.
`strategy:` Agent-Probe (no RN E2E runner in repo; standing project-wide gap).

---

## Out Of Scope

- **Auto branch selection.** `setBranch()` wipes the entire cart. If no branch is selected, the
  app navigates to branch selection — it does NOT auto-pick a branch. Auto-selection is explicitly
  out of scope.
- **Options / customisation picker for reward items.** When a reward eligible item requires
  required options (size, flavour), those are not auto-selected. Auto-add uses `addItem(menuItem, [], 1)` — empty options array. A future enhancement can open the product options sheet; this SPEC does not cover it.
- **Resume-after-branch-pick mechanism.** After the customer picks a branch (US-1 flow), they are NOT automatically returned to the rewards screen and the Redeem tap is NOT replayed. The customer must navigate back to rewards and tap Redeem again.
- **Star balance changes.** How stars are deducted when a reward is applied is outside this SPEC. The existing reward apply path (`resolveAndApplyDeal` / `applyDiscount`) handles that.
- **New reward types.** Only `free_item` / `free_upgrade` tiers with a configured `eligibleProductId` are in scope. Bundle rewards and discount rewards with no eligible product are unchanged.
- **Admin UI changes.** No changes to `apps/admin` are in scope.
- **Multiple items in a single reward tier.** One reward tier = one eligible product. Multi-item reward tiers are not addressed here.

---

## Constraints

- `setBranch()` MUST NOT be called as part of this flow (it wipes the cart).
- `addItem(menuItem, [], 1)` is the only way to add an item to the cart. An options array of `[]` is permitted and means "default / no customisation." This matches the existing API contract of `useCart`.
- The `eligibleProductId` field must be added additively to `packages/types/src/rewards.ts` — no existing fields on `Reward` are renamed or removed.
- The customer-facing `serializeReward` in `packages/api/src/routes/rewards.ts` must emit `eligibleProductId` without changing any other field shape (additive extension only, wire-safe).
- `useMenu()` is the source of truth for product availability at the selected branch — no separate availability check endpoint is needed.
- The Redeem button must be disabled during the async operation to prevent double-tap submissions.
- No new backend routes are introduced by this feature.

---

## Open Questions

None. All design decisions are locked per the orchestrator's pre-SPEC instruction block.

---

## Background / Research Findings

**The single data gap driving this entire feature:**
`eligibleProductId` (a `products.id` UUID) is stored in the `rewards` table and is emitted by
the admin API serializer (`ApiReward`), but is explicitly stripped in the customer-facing
`serializeReward` function in `packages/api/src/routes/rewards.ts`. As a result, it is absent
from `packages/types/src/rewards.ts`'s `Reward` interface and never reaches the mobile screen.
Threading this field through is the prerequisite for everything else.

**All other plumbing already exists:**
- `useMenu()` returns the full menu for the selected branch; `Product.id` is the same UUID
  namespace as `eligibleProductId`, so a direct `find` lookup works.
- `productToMenuItem(product, isAvailable)` converts a `Product` to the `MenuItem` shape that
  `addItem()` expects.
- `useCart().addItem(menuItem, [], 1)` is awaitable and returns a boolean success flag.
- `cart.items.some(i => i.menuItemId === eligibleProductId)` is the idempotency check.
- `resolveAndApplyDeal(code, cart, branchId)` → `applyDiscount(discount)` is the existing
  reward-discount apply path — this SPEC does not change it.

**Blast radius (5 files):**
1. `packages/types/src/rewards.ts` — add `eligibleProductId: string | null`
2. `packages/api/src/routes/rewards.ts` — private `serializeReward` emits the field
3. `apps/mobile/src/features/rewards/lib/derive-reward-tiers.ts` — pass `eligibleProductId` through `RewardTier`
4. `apps/mobile/src/app/(tabs)/rewards/index.tsx` — new `handleRedeem` flow + `useMenu()` hook
5. `apps/mobile/src/features/rewards/lib/__tests__/derive-reward-tiers.test.ts` — update assertions

**Locked design decisions:**
1. No auto-branch-set — `setBranch()` wipes the cart; if no branch, navigate to branches instead.
2. Item already in cart — skip add, apply discount, navigate.
3. Item not in branch menu — show error toast, stay on rewards screen.
4. Silent auto-add — no confirmation dialog; customer sees result in cart.
