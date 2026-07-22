---
name: report:order-reasons-cart-edit-pvl-iteration-003
description: "PVL cycle 3 — Gate PASS; 4 new gaps found and fixed in-plan same-pass, incl. a vacuous HARD race test"
date: 22-07-26
feature: ordering-cart
metadata:
  node_type: report
  type: pvl-iteration
  cycle: 3
  domain: plan
---

# PVL Iteration 003 — order-reasons-cart-edit

**TL;DR:** `Gate: PASS`. All 3 cycle-2 CONCERNs (Gaps 7-9) re-verified correctly closed. 4 NEW
findings this cycle (Gaps 10-13) were diagnosed AND fixed directly in the plan text in the same
pass, with every underlying fact independently confirmed against live source before writing the
fix. The most significant: B3.4's proposed race test would NOT actually have exercised the
compare-and-swap it claimed to prove — a real, Known-Gap-banned HARD criterion at risk of shipping
with a vacuous test.

## Cycle-1 and cycle-2 fixes — all re-verified against live source (third confirmation)

| Claim | Verification | Result |
|---|---|---|
| `Order` (`order.ts:30`) vs `ApiOrder` (`serializers.ts:275`) two-file split | Read both | ✅ |
| `notifyCustomer` module-private; `dispatchOrderNotification` exported, not yet imported in `orders.ts` | Grepped imports in both files | ✅ |
| `handleAdd`/`isSwitchingBranch`/`clearCart()` at `product/index.tsx:123/138/162` | Read full function | ✅ exact |
| `use-reject-order.ts` (step 14) mirrors `useUpdateOrderStatus`'s 3-key invalidation | Read `use-update-order-status.ts` directly | ✅ pattern confirmed replicable |
| `['staff','order',orderId]` singular is a harmless no-op | Read `use-staff-order-detail.ts` — actual key is `['staff','orders',orderId]` plural; confirmed react-query v5 default `invalidateQueries` is prefix-match, so `['staff','orders']` covers it | ✅ |
| `order-state-machine.ts` gained the cross-reference comment (step 2b) | Grepped file header | ✅ |
| `serializeStaffOrderSummary`/`Detail` (788/818) feed `AdminOrderSummary`/`Detail` (1139/1149) via `extends` + runtime spread (1171/1195) | Read all 4 declarations | ✅ zero admin-side edit needed, confirmed both type-safe and runtime-safe |
| `ApiOrder` (275) / `serializeOrder` (451) confirmed exact | Read both | ✅ |
| `canTransition` table: `pending → {accepted, rejected, cancelled}` | Read `order-state-machine.ts` | ✅ |
| No 4th write path for `status='cancelled'`/`'rejected'` besides the generic staff PATCH + the 2 new routes | Repo-wide grep across `packages/api/src/routes` | ✅ new confirmation this cycle — `admin/orders.ts` is GET-only |
| `cart_items` has no DB unique constraint on product+options | Read schema file | ✅ |
| `optionKey()`/`requireOwnedLine`/`POST /items`/existing `PATCH /items/:lineId` line ranges | Read `cart.ts` lines 1-280 | ✅ close match, no design defect |
| Migration head `0021_...`; `varchar(32)`/`varchar(8)` headroom for reason values | Listed `drizzle/*.sql`, checked longest reason strings | ✅ no truncation risk |

## New gaps found this cycle

| ID | Severity | Gap | Fix |
|---|---|---|---|
| 10 | CONCERN (real EXECUTE-breaker) | Step 20 told EXECUTE to add `editCartLine` "wrapping `PATCH /cart/items/:lineId`" but named no client function accepting `selectedOptions` (the only existing one, `updateCartItemQuantity`, takes `{quantity}` only) and never mentioned that `use-cart.ts`'s own `useCartMutation<V>(cartKey, mutationFn, optimistic)` factory — used by every other mutation in the file — requires `optimistic` as a non-optional third argument. | New `cart-api.ts` Touchpoints row + step 20 rewritten naming both missing pieces, with an explicit note that the optimistic function's imprecision on a collision-merge self-corrects via the shared `onSettled` invalidation. |
| 11 | CONCERN (real test-design gap, explicitly requested by orchestrator) | B4.2/B4.3's proving-test descriptions never required asserting that OTHER, unrelated cart lines survive an edit/collision untouched — a narrowly-seeded test (only the line(s) under test) would pass even if the implementation scoped its write too broadly. Same failure class as cycle-1's client-side `clearCart()` finding, one layer deeper. | Both Verification Evidence rows amended to require a 3rd/4th unrelated line in the seed, asserted byte-identical before/after; Non-vacuousness note extended. |
| 12 | CONCERN (vacuousness defect on a HARD/Known-Gap-BANNED criterion) | B3.4's proving technique ("pre-committed status flip... before the cancel CAS runs") does not exercise the transactional CAS at all — the route's own pre-transaction `order.status !== 'pending'` explicit check catches a pre-flipped status and returns 409 before ever reaching the `WHERE status='pending'` clause. Deleting that CAS clause entirely would NOT turn this test red. Also functionally redundant with B3.3's parameterized sweep (which already covers `accepted` as a source status). | B3.4 rewritten to require a genuine `Promise.all([staffAccept, customerCancel])` concurrent race, mirroring the existing `orders.test.ts` AC6 pattern; Non-vacuousness note extended with the explicit rationale. |
| 13 | CONCERN (stale documentation) | The Cross-Plan Coordination Note cited the sibling `closed-branch-order-gate_22-07-26` plan as "Gate: BLOCKED" — direct read shows it has since reached Gate: PASS, "Ready for EXECUTE." Zero actual file overlap still holds (confirmed by direct read of live `orders.ts` — sibling's edits have not landed), but the collision risk is no longer hypothetical. | Coordination Note's status paragraph rewritten with current state and an explicit "risk elevated to active" statement. |

## Why this cycle went straight to PASS instead of a cycle-4 confirmation pass

All 4 findings were diagnosed AND fixed in this same pass, with every fact (exact line numbers,
function signatures, control-flow order, the `orders.test.ts` AC6 precedent) independently verified
by direct `Read`/`Grep` before being written — not deferred to a future confirmation cycle the way
cycle 1's findings were (which required a separate plan-agent supplement spawn). Three of the four
concerned REQUIRED SPEC criteria or Known-Gap-banned HARD rows and were therefore fixed, not
accepted as known-gaps. Spinning a cycle 4 to re-read what this cycle already verified first-hand
would be exactly the diminishing-returns loop the orchestrator's instruction warned against.

## Cycle outcome

`Gate: PASS`. EXECUTE is authorized. `PHASE_COMPLETE: VALIDATE` — validate-contract written (after
3 validate-fix cycles: 6 gaps cycle 1, 3 gaps cycle 2, 4 gaps cycle 3, all closed).
