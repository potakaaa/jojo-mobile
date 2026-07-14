# Deals API Integration — Phase Blast-Radius Registry

One registry per program (FLAT in the program task folder). Append-only: each phase agent appends its
`## Phase N` claim; never overwrite a prior claim. Conflicts are recorded, not silently resolved.

Program: deals-api-integration
Folder: process/features/rewards-notifications/active/deals-api-integration_13-07-26/
Created: 13-07-26 (scaffold — Phase 0)

Status vocabulary (writable): `BLOCKED-skipped` | `DONE` | `SUPERSEDED` | `(no field)`.
(`BLOCKED` is a read-compatibility alias only — never write it in new entries.)

---

## Phase 1 — Deals list (DEAL-001 / #22)

status: DONE

Claimed areas:
- `packages/api/src/routes/deals.ts` (CREATE)
- `packages/api/src/routes/lib/serializers.ts` (ADD `serializeDeal` — additive, no existing export changed)
- `packages/api/src/index.ts` (ADD `app.use('/deals', dealsRouter)` mount line)
- `packages/api/src/routes/__tests__/deals.test.ts` (CREATE)
- `apps/mobile/src/lib/api-client.ts` (ADD `getDeals`)
- `apps/mobile/src/features/deals/hooks/*` (CREATE list hook)
- `apps/mobile/src/app/(tabs)/deals/index.tsx` (EDIT — swap MOCK_DEALS → API)

Overlap notes: `deals.ts` and `deals.test.ts` are SHARED with Phase 2 (Phase 2 extends them). No
time overlap — sequential join (Phase 2 starts only after Phase 1 exit). `serializers.ts` add is
additive; `index.ts` edit is a single mount line. No overlap with Phase 3.

---

## Phase 2 — Deal Details + eligibility (DEAL-002 / #23)

status: DONE

Claimed areas:
- `packages/api/src/routes/deals.ts` (EDIT — add `GET /:id`; SHARED with Phase 1, sequential)
- `packages/api/src/routes/__tests__/deals.test.ts` (EDIT — extend; SHARED with Phase 1, sequential)
- `apps/mobile/src/features/deals/hooks/*` (ADD single-deal hook; SHARED folder with Phase 1, additive)
- `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` (EDIT — wire off API)
- `apps/mobile/src/features/deals/lib/eligibility.ts` (READ — feed real data; no write expected)

Overlap notes: shares `deals.ts` / `deals.test.ts` / `features/deals/hooks/` with Phase 1, resolved
by the sequential join (Phase 1 completes and commits before Phase 2 edits). No overlap with Phase 3's
write surface (`orders.ts`, `use-cart.ts`, `cart.tsx`, migration). NOTE: `deal/[dealId].tsx` is
re-edited by Phase 3 (its deferred Apply CTA is wired for real) — sequential join, Phase 2 DONE/committed.

---

## Phase 3 — Cart apply + placement (DEAL-003 / #24) — HIGH RISK

status: DONE

Claimed areas (refined at PLAN-SUPPLEMENT vs the scaffold stub — real file set):
- `packages/api/src/db/schema/orders.ts` (EDIT — add nullable `deal_id` FK→deals, NO ACTION)
- `packages/api/drizzle/0004_*.sql` (CREATE — generated; corrected path — NOT `src/db/migrations/`)
- `packages/api/src/routes/orders.ts` (EDIT — rewrite placement: FOR UPDATE deal lock, complex-type reject, 6-step server eligibility, real discount %/fixed, `deal_id` persist)
- `packages/api/src/routes/lib/serializers.ts` (EDIT — `ApiOrder.dealId` + `serializeOrder` map) [ADDED]
- `packages/api/src/routes/__tests__/orders.test.ts` (EDIT — extend with dealId cases)
- `packages/types/src/order.ts` (EDIT — `Order.dealId`) [narrowed from `packages/types/src/*`]
- `apps/mobile/src/features/orders/lib/api-client.ts` (EDIT — `CreateOrderInput.dealId`) [ADDED]
- `apps/mobile/src/features/deals/lib/apply-deal.ts` (EDIT — `applyDealById` real `getDeal`; DELETE `resolveAndApplyDeal`) [ADDED]
- `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` (EDIT — wire real Apply CTA → cart) [ADDED; Phase 2 file, sequential join]
- `apps/mobile/src/app/(tabs)/order/cart.tsx` (EDIT — DELETE code-input UI; PRESERVE `useReorderConflicts()`)
- `apps/mobile/src/app/(tabs)/order/checkout.tsx` (EDIT — pass `dealId`; fix Total display) [ADDED]

Dropped from the stub's claim: `apps/mobile/src/features/cart/hooks/use-cart.ts` — its `applyDiscount`/`clearDiscount` public seam is unchanged (no edit needed; `refId` already carries the dealId).

Overlap notes: DISJOINT from Phase 1/2's DEALS read surface (`deals.ts`, `deals.test.ts`, `features/deals/hooks/`). Shared concept only: the `Deal` shape/`serializeDeal` (read/reused, not edited). `serializers.ts` is SHARED with Phase 1 (Phase 1 added `serializeDeal`; Phase 3 adds `ApiOrder.dealId`) — additive, sequential join (Phase 1 DONE/committed). `deal/[dealId].tsx` is a Phase 2 file re-edited here — sequential join (Phase 2 DONE/committed). `cart.tsx` co-owns a file with the order-history batch's `useReorderConflicts()` — Phase 3 edits a DISJOINT region (deletes the coupon/deal code-input slot) and preserves the conflict-notice import + render path untouched (hard safety constraint).

---

## Potential Blast Radius Conflicts

None. Phases are sequentially gated (1 → 2 → 3) and the read surface (Phases 1/2: `deals.ts`,
`features/deals/*`) is disjoint from the write surface (Phase 3: `orders.ts`, migration, `cart`/`checkout`
write region). Shared files across phases (`deals.ts`, `deals.test.ts`, `features/deals/hooks/`,
`serializers.ts`, `deal/[dealId].tsx`) are edited under the sequential join, so no concurrent edits occur.
The one preservation constraint — `useReorderConflicts()` in `cart.tsx` — is a disjoint region within a
shared file, tracked as a hard safety constraint in the umbrella charter.
