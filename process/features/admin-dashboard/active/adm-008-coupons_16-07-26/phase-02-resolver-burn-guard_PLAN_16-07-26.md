---
name: plan:adm-008-coupons-phase-02-resolver-burn-guard
description: "ADM-008 Coupons — Phase 02: resolver Branch-1 fix + offer-coupon branch + burn claim + is_deal guard"
date: 16-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: phase-02
---

# Phase 02 — Resolver + Burn + orders.ts Guard

**Program:** adm-008-coupons
**Umbrella plan:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/adm-008-coupons_UMBRELLA_PLAN_16-07-26.md
**Phase status:** ⏳ PLANNED — validate-contract SEEDED (CONDITIONAL) from source plan's outer-pvl VALIDATE pass; needs inner PVL confirmation before EXECUTE
**Report destination:** process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-02-resolver-burn-guard_REPORT_{dd-mm-yy}.md (flat in the program task folder)

---

## Purpose

Redemption-path correctness phase — the single hardest-correctness phase in the program. Extends
`resolveCouponDiscount()` with a real offer-coupon resolution branch (retiring the static
`deals-catalog.ts`), fixes a real code-verified logic bug in the existing reward-coupon Branch 1
that would otherwise wrongly reject targeted offer-coupons, folds claim-on-redeem into the existing
atomic burn UPDATE, and extends `orders.ts`'s existing guard to reject `couponCode` + `is_deal`
cart combinations. Depends on Phase 1 (needs the renamed `offers`/`coupons.offer_id` schema).

---

## Entry Gate

- Phase 1 exit gate passed (migration applied, `pnpm --filter @jojopotato/api typecheck` clean).

---

## Blast Radius

- `packages/api/src/routes/lib/coupon-apply.ts` (resolver Branch-1 fix + new offer-coupon branch)
- `packages/utils/src/deals-catalog.ts` (delete, contingent on import-scan)
- `packages/api/src/routes/orders.ts` (burn UPDATE extension + is_deal guard extension + dormant
  comment rename)
- `packages/api/src/routes/coupons.ts` (`GET /coupons` handler field-source rename)
- `packages/api/src/routes/lib/serializers.ts` (`serializeCoupon()`/`serializeCouponWithLabel()`
  field-source rename)
- `packages/api/src/routes/__tests__/orders.test.ts` (extended concurrency race test case)
- `coupons.integration.test.ts` (extended offer-coupon apply/order/re-apply cases)

---

## ⚠️ Caution (post-merge recon finding — read before touching `orders.ts`)

`routes/orders.ts` has evolved further than the source SPEC's originally-quoted snippet — `orders`
gained a `coupon_id` column (migration 0009) and commit `490d271` ("persist consumed coupon, drop
non-UUID dealId at checkout, catch wrapped code collisions") already reworked the checkout coupon
logic. **EXECUTE MUST read the REAL current `routes/orders.ts` on this branch before extending the
burn UPDATE and `is_deal` guard — do not extend against any stale quoted snippet.** This caution is
even more important now given Phase 1 will have just landed a schema rename immediately before this
phase starts — re-read the file fresh at RESEARCH time.

---

## Locked Decisions Referenced (do not re-litigate)

- **Locked Decision 1 (VALIDATE-locked fix, REQUIRED, not optional):** the existing reward-coupon
  Branch 1 in `resolveCouponDiscount()` queries `coupons` scoped ONLY to `(code, user_id)` — it does
  NOT filter `reward_id IS NOT NULL`. A TARGETED offer-coupon (whose `user_id` is set at issuance)
  would incorrectly MATCH this branch first, then hit `checkRewardEligibility(..., reward=null,
  ...)` → `no_eligible_product` (400) — a wrong rejection, not a crash (verified via reading
  `packages/utils/src/discount.ts`'s null-reward handling). **Fix: Branch 1's condition must
  additionally require `coupon.reward_id !== null`** before treating a matched row as the
  reward-coupon path; a matched row with `reward_id === null` (an offer-coupon) must fall through to
  the new offer-coupon branch instead. The bulk (`user_id IS NULL`) case already falls through
  correctly today, so only the targeted case needs this explicit guard. AC5 fails without this fix.
- **Locked Decision 2:** claim-on-redeem folded into the existing atomic burn UPDATE:
  ```sql
  UPDATE coupons
  SET status = 'used', user_id = COALESCE(user_id, $requester)
  WHERE id = $couponId AND status = 'available'
    AND (user_id IS NULL OR user_id = $requester)
  ```
- **Locked Decision 6:** `is_deal` mutual exclusion (AC6) enforced INSIDE the `POST /orders`
  placement transaction ONLY, extending the EXISTING `dealId`-XOR-`couponCode` 400 guard.
- **Locked Decision 7B:** `GET /coupons`'s `dealId` field name is PRESERVED — source it from the
  renamed `coupon.offer_id` column internally (`dealId: coupon.offer_id`), never rename the wire
  field itself.

---

## Implementation Checklist

### Step A — Resolver fix + new branch

- [ ] A1. In `resolveCouponDiscount()` (`routes/lib/coupon-apply.ts`): narrow the existing Branch 1
      query/condition to `reward_id IS NOT NULL` (Locked Decision 1's required fix).
- [ ] A2. After Branch 1, add a new branch matching `code` against `coupons` rows where
      `offer_id IS NOT NULL`, joining `offers` for the discount mechanic. Apply the same reason-code
      contract (`expired`/`already_used`/`not_in_window`) the reward-coupon branch already uses.
      Return the matched coupon's `id` as `rewardCouponId` (reused field name — the burn path in
      `orders.ts` is generic over any coupon-row source) so the existing atomic burn UPDATE
      consumes it unchanged.
- [ ] A3. Remove the static `DEAL_CATALOG` branch. Before deleting `packages/utils/src/deals-catalog.ts`,
      search-scan the repo for any other importer; delete only if zero other importers found, else
      leave dead + write a backlog note (per source-plan Locked Open Question).

### Step B — Serializer/route field-source renames (VALIDATE-added)

- [ ] B1. `packages/api/src/routes/coupons.ts`'s `GET /coupons` handler: `dealId: coupon.deal_id` →
      `dealId: coupon.offer_id` (field name preserved, Locked Decision 7B).
- [ ] B2. `packages/api/src/routes/lib/serializers.ts`: `serializeCoupon()`/
      `serializeCouponWithLabel()` — same field-preserved, column-renamed pattern; update
      `coupon.deal_id !== null` → `coupon.offer_id !== null`; update `deal: DealRow | null` param
      to the renamed type.

### Step C — orders.ts burn + guard extension

- [ ] C1. Read the REAL current `routes/orders.ts` on this branch (see Caution above) before any edit.
- [ ] C2. Extend the coupon burn `UPDATE` to
      `SET status='used', user_id=COALESCE(user_id,$requester) WHERE id=... AND status='available'
      AND (user_id IS NULL OR user_id=$requester)`.
- [ ] C3. Extend the existing `dealId`-XOR-`couponCode` 400 guard — before any write, if
      `couponCode` is present AND any cart line's `productId` resolves to a `products` row with
      `is_deal=true`, throw the existing 400 error class with a clear reason ("Coupon codes cannot
      be combined with Deal products" or similar).
- [ ] C4. Rename dormant `deal_id`-guard code comments to `offer_id` terminology in the same pass
      (mechanism unchanged, naming only).

### Step D — Test gates

- [ ] D1. Extend `coupons.integration.test.ts` with an Offer-coupon apply+order+re-apply-after-use
      case (AC5) — including a TARGETED (user_id-set) offer-coupon case that exercises the Locked
      Decision 1 Branch-1 fix directly (the concrete regression test for the bug VALIDATE found).
- [ ] D2. Add the `is_deal`-cart+couponCode 400 case (AC6).
- [ ] D3. Re-run full `coupons.integration.test.ts` suite for reward-coupon regression (AC8).
- [ ] D4. **(VALIDATE correction)** Extend `routes/__tests__/orders.test.ts` (the real location of
      commit `43e9c13`'s concurrency race test, NOT `coupons.integration.test.ts`) with a NEW
      two-racer case: two simultaneous requests racing to claim+burn the SAME bulk
      (`user_id IS NULL`) code, asserting exactly one succeeds (200) and one gets the existing
      `already_used` rejection — use the same `Promise.all([...])` pattern against two concurrent
      supertest requests, alongside (not replacing) the existing `43e9c13` race test.
- [ ] D5. Run `pnpm --filter @jojopotato/api typecheck`.
- [ ] D6. Run full `pnpm --filter @jojopotato/api test` — confirm zero regressions.

---

## Exit Gate

```bash
pnpm --filter @jojopotato/api typecheck
# Expected: 0 errors

pnpm --filter @jojopotato/api test
# Expected: full suite green, extended coupons.integration.test.ts + orders.test.ts cases pass,
#           zero regressions (AC8)
```

- All checklist items (A–D) checked.
- AC5, AC6, AC7, AC8 all proven by real passing Fully-Automated tests (no Known-Gap).
- Phase report written to report destination above.

---

## Blockers That Would Justify BLOCKED Status

- Phase 1 exit gate not yet passed (hard dependency).
- The real current `orders.ts` has diverged further than this plan anticipates in a way that
  invalidates the burn-UPDATE extension approach — investigate before proceeding, do not
  force-fit.

---

## Phase Loop Progress

- [ ] 1. RESEARCH — research-agent: re-read the REAL current `orders.ts` (per Caution above),
      `coupon-apply.ts`, `coupons.ts`, `serializers.ts` post-Phase-1-rename; confirm Phase 1
      landed cleanly; check for any further drift since source plan's VALIDATE pass.
- [ ] 2. INNOVATE — innovate-agent: expected n/a (Locked Decisions 1, 2, 6, 7B already resolve the
      design).
- [ ] 3. PLAN-SUPPLEMENT — plan-agent: update this phase plan with research findings, or mark
      "n/a — research clean".
- [x] 4. PVL — SEEDED below from source plan's outer-pvl VALIDATE pass. Orchestrator MUST still
      spawn vc-validate-agent for inner PVL re-confirmation before EXECUTE.
- [ ] 5. EXECUTE — all checklist items (A–D) done; test gates green.
- [ ] 6. EVL — all EVL gates green; follow-up stubs registered; EVL HANDOFF SUMMARY written.
- [ ] 7. UPDATE PROCESS — phase report written, umbrella state updated, **commit checkpoint**
      (staging commands + commit summary handed to user — no auto-commit).

**Validate-contract required before execute.**

---

## Touchpoints

- `packages/api/src/routes/lib/coupon-apply.ts`
- `packages/utils/src/deals-catalog.ts` (delete, contingent)
- `packages/api/src/routes/orders.ts`
- `packages/api/src/routes/coupons.ts`
- `packages/api/src/routes/lib/serializers.ts`
- `packages/api/src/routes/__tests__/orders.test.ts`
- `coupons.integration.test.ts` (path per real branch — confirm at RESEARCH)

---

## Public Contracts

- `POST /coupons/apply` request/response shape UNCHANGED — resolver gains an internal branch only.
- `POST /orders` request/response shape UNCHANGED except a new 400 rejection path (is_deal cart +
  couponCode present).
- `GET /coupons`'s `dealId` field name UNCHANGED (Locked Decision 7B).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `coupons.integration.test.ts` extended — Offer-coupon apply preview + order placement + re-apply-after-use rejection | Fully-Automated | AC5 |
| `coupons.integration.test.ts` — TARGETED (user_id-set) offer-coupon redemption case (proves Locked Decision 1's Branch-1 fix) | Fully-Automated | AC5 (Branch-1 collision regression) |
| `orders.integration.test.ts`-equivalent — `is_deal` cart line + `couponCode` set → 400 | Fully-Automated | AC6 |
| `coupons.integration.test.ts` reason-code assertions extended to Offer-coupons | Fully-Automated | AC7 |
| Full `coupons.integration.test.ts` suite re-run, zero diffs | Fully-Automated | AC8 (regression) |
| `orders.test.ts` — extended bulk-code two-racer concurrency case | Fully-Automated | Claim-on-redeem atomicity (protects AC5/AC8 under concurrency) |
| `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | Renamed-symbol/field-source regression guard |
| `pnpm --filter @jojopotato/api test` (full suite) | Fully-Automated | AC8 regression bar |

```bash
pnpm --filter @jojopotato/api typecheck
pnpm --filter @jojopotato/api test
```

---

## Test Infra Improvement Notes

(none identified yet)

---

## Resume and Execution Handoff

- Selected plan file path: `process/features/admin-dashboard/active/adm-008-coupons_16-07-26/phase-02-resolver-burn-guard_PLAN_16-07-26.md`
- Last completed step: none — phase not yet started; depends on Phase 1.
- Validate-contract status: SEEDED (CONDITIONAL) — pending inner PVL re-confirmation.
- Next step: after Phase 1 exit gate passes, spawn vc-research-agent (or vc-validate-agent directly
  for PVL re-confirmation) for Phase 2.

---

## Validate Contract

Status: CONDITIONAL (SEEDED from source plan's outer-pvl VALIDATE pass, 16-07-26 — re-confirm via
inner PVL before EXECUTE)
Date: 16-07-26
date: 2026-07-16
generated-by: outer-pvl

Test gates (subset of source plan's C3 table relevant to this phase):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC5 | Customer redeems valid admin-issued coupon; discount applies; code marked used once | Fully-Automated | `coupons.integration.test.ts` — Offer-coupon apply+order+re-apply-after-use, PLUS a new TARGETED-coupon case proving the Locked Decision 1 Branch-1 fix | B (fix specified this VALIDATE pass; test added by this phase's checklist step D1) |
| AC6 | Cart with `is_deal` product rejects coupon (400) | Fully-Automated | `orders.integration.test.ts`-equivalent — `is_deal` cart line + `couponCode` → 400 | A |
| AC7 | Expired/used/out-of-window coupon rejected with correct reason | Fully-Automated | `coupons.integration.test.ts` reason-code assertions extended | A |
| AC8 | Reward-backed coupons keep working unmodified (regression) | Fully-Automated | full `coupons.integration.test.ts` suite re-run | A |
| — | Resolver/burn/orders.ts guard regression | Fully-Automated | `pnpm --filter @jojopotato/api test` (extended `coupons.integration.test.ts` + `orders.test.ts`) | A |

gap-resolution legend: A — proven now. B — fixed in this plan (gate added/corrected by VALIDATE, to
be exercised by EXECUTE).

Dimension findings (from source plan's VALIDATE pass, Phase 2 row):
- CONCERN (resolved via plan update) — real, code-verified logic bug: the existing reward-coupon
  Branch 1 in `resolveCouponDiscount()` isn't scoped to `reward_id IS NOT NULL`, so a targeted
  offer-coupon would incorrectly match it first and be rejected with the wrong reason
  (`no_eligible_product`, verified via `checkRewardEligibility`'s null-reward handling — not a
  crash, but a wrong 400). Fixed via a locked amendment to Locked Decision 1 plus a new required
  regression test (targeted-coupon case), now Step A1 + D1 above. Also found `routes/orders.ts`'s
  dormant ~100-line deal-apply block (lines ~221-322 on the real branch at VALIDATE time) was
  drastically under-scoped by the original "rename dormant comments" wording — now precisely
  specified via Locked Decision 7A/Step C4 above.
- Security-persona flag (INNOVATE): concurrency race test must EXTEND (not duplicate) commit
  `43e9c13`'s existing race test — now Step D4 above.

Open gaps: none carried as Known-Gap — all findings resolved by direct plan-text edits, inherited
into this phase plan's checklist.

What this coverage does NOT prove:
- VALIDATE itself did not run any test — the Branch-1 resolver fix is read-verified against real
  source (`packages/utils/src/discount.ts`'s null-reward handling), not yet proven by a green test
  run. EXECUTE's Step D1 test is the first actual proof.

Gate: CONDITIONAL (0 unresolved FAILs; all CONCERNs resolved via direct plan-text updates; residual
risk is normal pre-EXECUTE unproven-until-tested risk).
Accepted by: session (autonomous, inherited from source plan's single-shot VALIDATE pass).
