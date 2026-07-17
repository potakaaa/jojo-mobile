---
name: plan:adm-008-free-mechanics
description: "COMPLEX plan — real redemption semantics for free_item/free_upgrade offer coupons (POST-MERGE FIX 6, money path, HIGH risk). Approach C: reward-precedent extension via new offers.benefit_product_id + pure functions in packages/utils. Phases: P1 (done, 35981fa) → P1b (widened deny-guard, inserted post-review) → P2 → P3."
date: 16-07-26
feature: admin-dashboard
metadata:
  node_type: plan
  type: plan
  feature: admin-dashboard
  parent_program: adm-008-coupons
  complexity: COMPLEX
  risk_class: HIGH — billing/credits analog (money path)
---

# PLAN — Free-Item / Free-Upgrade Offer Coupons: Real Redemption Semantics (POST-MERGE FIX 6)

**Date**: 16-07-26 (supplemented 16-07-26 post-P1 adversarial review; CLOSED 17-07-26)
**Status**: ✅ CODE-COMPLETE + USER-VERIFIED. All four phases delivered and committed: P1 `35981fa`, P1b `66cbb0e`, P3 `ad3e937`, P2 `cceb66b` (P3 landed before P2 chronologically — UI shipped ahead of the real math it now drives; harmless, both gated by their own EVL). Final gates: API 411/411 (frozen-tree, confirmed twice), `packages/utils` 35/35, `apps/admin` 49/49, all typechecks clean, byte-identity verified (`computeDealDiscountCents`/`checkDealEligibility`/`apps/mobile` eligibility twin/drizzle-history-beyond-0014 all untouched). AC11 manual walkthrough user-verified 17-07-26. HIGH-risk 5-artifact evidence pack generated at `harness/` and USER-REVIEWED 17-07-26 — `mustStopBeforeFinalize` gate satisfied.
**Complexity**: COMPLEX
**Risk class:** HIGH — money path (billing/credits analog); risk-evidence-pack required at EXECUTE closure

**TL;DR:** Give `free_item`/`free_upgrade` offer coupons exact, admin-configured meaning via a new nullable `offers.benefit_product_id` column and two pure discount functions. P1 (done) shipped the migration + partial guard; a post-commit adversarial review found the guard covers only 2 of the 4 cheapest-line-vulnerable mechanics and leaves a configured-offer window hole — **P1b (inserted)** widens the resolver deny-guard to reject ALL FOUR mechanics (`buy_one_take_one`/`bundle` permanently; `free_item`/`free_upgrade` unconditionally until P2's real math replaces that branch), with regression-lock tests. P2 lands real semantics + admin validation; P3 the admin UI. Wire-frozen public API; `computeDealDiscountCents`/`checkDealEligibility`/mobile twin BYTE-IDENTICAL. Money ACs (AC1–AC8, P1b-1..P1b-4) are Fully-Automated; Known-Gap banned.

## Overview

Locked SPEC: `adm-008-free-mechanics_SPEC_16-07-26.md` (same folder; D1–D9 decisions, AC1–AC13). **See §Post-P1 Review Findings for a recorded SPEC correction** (the SPEC's out-of-scope claim about b1t1/bundle was factually wrong — SPEC file itself gets annotated at UPDATE PROCESS, not now).
Locked INNOVATE decision: **Approach C — reward-precedent extension.** The resolver reads `offer.benefit_product_id` off the already-fetched offer row; free-mechanic dispatch goes to NEW pure functions in `packages/utils/src/discount.ts`. Offer coupons are admin-authored promo codes (Promotion→Offer→Coupon) — fully separate from reward coupons earned via points; Approach C reuses only the reward system's pure MATH function (`computeRewardDiscountCents`), not the points system.

**Risk class: HIGH (billing/credits analog — money path).** The `vc-risk-evidence-pack` rule applies at EXECUTE closure: a 5-artifact risk evidence pack is required before this work is treated as finalize-ready. `mustStopBeforeFinalize: true`.

## Post-P1 Review Findings & Dispositions (supplement, 16-07-26)

P1 was committed as-validated (`35981fa`, explicit user decision). An adversarial Fable/xhigh review of the P1 diff afterward produced these code-verified findings. Dispositions are user-approved.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | CRITICAL | `computeDealDiscountCents` (`packages/utils/src/discount.ts:179-183`) routes FOUR deal types to `cheapestEligibleUnitPrice`: `buy_one_take_one`, `bundle`, `free_item`, `free_upgrade`. The P1 guard (`coupon-apply.ts` ~256-266) checks only free_item/free_upgrade. A coupon against a b1t1 or bundle offer STILL produces the cheapest-cart-line mis-discount and burns. Fully reachable server-side: `POST /api/admin/offers` Zod `offerTypeEnum` accepts all 6 mechanics (only the UI dropdown was filtered, `ab53caf`; `admin-offers.integration.test.ts:182-194` proves the API creates b1t1/bundle offers); `POST /api/admin/coupons/generate` has no deal_type check. | **P1b**: unconditional PERMANENT resolver deny for b1t1/bundle offer-coupons (they have no coupon semantics in this plan — aligned with SPEC intent that they never discount via coupons). |
| 2 | MAJOR | P1→P2 window hole on CONFIGURED offers: the P1 guard admits any non-null `benefit_product_id`, but P1 shipped no real math — a free-mechanic offer configured out-of-band (direct SQL; this dev workflow uses psql routinely) passes the guard and falls into the unchanged cheapest-line math: nonzero discount, benefit product not required in cart, coupon burns. No test locks the configured path. | **P1b**: free_item/free_upgrade reject regardless of configured state (temporary tightening; P2's dispatch replaces this branch with real math — guard structured as a clean branch-swap for P2, not a revert). Regression-lock test on the configured path. |
| 3 | Minor | No DB CHECK enforces `reward_id`/`offer_id` mutual exclusivity on `coupons`; a dual-FK row would match the reward branch first (`coupon-apply.ts:152-160`) and skip the offer guard entirely. No current write path creates such a row — defense-in-depth only. | **DESCOPED** to backlog: `process/features/admin-dashboard/backlog/coupons-reward-offer-mutual-exclusivity-check_NOTE_16-07-26.md` (to be filed at UPDATE PROCESS). Rationale: no live write path, separate migration concern, pure defense-in-depth. |
| 4 | Minor | `fixed_discount` offer-coupon has ZERO exact-cents coverage anywhere on the resolver path (all offer fixtures are percentage_discount; fixed_discount is tested only on the legacy dealId path). A too-broad guard mutation could break fixed_discount offer coupons with the whole suite green. | **P1b**: ONE fixed_discount offer-coupon exact-cents test at the resolver path (additive, guard-adjacent regression insurance). |
| 5 | Minor | P1 reject tests use single-line carts; a two-line fixture asserting NO cheapest-line discount is the truer regression-lock shape. | **P1b**: new reject tests use two-line-cart fixtures. |

**SPEC correction (recorded, not yet applied to the SPEC file):** the SPEC's Out-of-Scope claim "b1t1/bundle remain non-discounting, exactly as today" was factually WRONG — today they DO mis-discount via the cheapest-line path when a coupon targets them. P1b makes the SPEC's intent (never discount via coupons) actually true by unconditional deny. The SPEC file is annotated at UPDATE PROCESS.

## Goals

1. **Stop the live mis-discount** — DONE for unconfigured free mechanics (P1, `35981fa`). **P1b extends this**: ALL FOUR cheapest-line-vulnerable mechanics rejected at preview AND placement, coupon not burned, including the configured-free-mechanic window hole (findings 1–2).
2. **Real semantics** — free_item: one unit of the designated product free (reward math verbatim); free_upgrade: one unit's paid size-upgrade charge waived (D1/D2). Exact-cents, preview/placement symmetric by single-resolver construction (AC2–AC8). P2 replaces P1b's free-mechanic unconditional reject with the configured-path dispatch; the b1t1/bundle deny stays permanent.
3. **Admin cannot mis-issue** — server Zod cross-validation (create + merged-state PATCH), generate-route block, UI picker + panel block (AC10, AC11).
4. **Zero regression** — wire freeze holds; %/fixed/reward coupons and `is_deal` guard unchanged (AC9, AC12); P1b adds the first fixed_discount offer-coupon exact-cents lock (finding 4).

## Scope

- IN: `packages/api` (schema migration, resolver, admin offers/coupons routes, serializer additive field, integration tests), `packages/utils` (new pure functions + first discount unit tests), `apps/admin` (offer-form picker, generate-coupons-panel block, jsdom tests).
- OUT (SPEC §Out Of Scope): all `apps/mobile` changes (incl. eligibility-engine twin), usage-limit enforcement (D6 → own backlog note at UPDATE PROCESS), legacy `dealId` order path, multi-benefit offers, richer preview payload, coupons `reward_id`/`offer_id` mutual-exclusivity DB CHECK (finding 3 → backlog note at UPDATE PROCESS).
- **CHANGED by supplement:** buy_one_take_one/bundle are no longer fully out of scope — P1b adds a permanent resolver DENY for coupons targeting them (no semantics implemented; they simply cannot discount via coupons).

## Touchpoints

### Phase P1 — migration + resolver null-guard — ✅ EXECUTED + COMMITTED (`35981fa`)

| File | Change |
|---|---|
| `packages/api/src/db/schema/offers.ts` | ADD `benefit_product_id: uuid('benefit_product_id').references(() => products.id)` (nullable, NO ACTION) + import `products` — DONE |
| `packages/api/drizzle/0014_*.sql` + `meta/` journal/snapshot | NEW migration, slot after 0013 — DONE |
| `packages/api/src/routes/lib/coupon-apply.ts` | Offer-coupon branch null-guard for free_item/free_upgrade with `benefit_product_id === null` → 400 `no_eligible_product` — DONE (superseded in shape by P1b, see below) |
| `packages/api/src/routes/__tests__/coupons.integration.test.ts` + `orders.test.ts` | Unconfigured free-mechanic reject + no-burn cases — DONE |

### Phase P1b — widened deny-guard (inserted post-review; small, independently committable)

| File | Change |
|---|---|
| `packages/api/src/routes/lib/coupon-apply.ts` | Restructure the P1 guard in the offer-coupon branch (same position: after pre-checks + `checkDealEligibility`, before discount computation) into an explicit mechanic dispatch: (a) `deal_type ∈ {buy_one_take_one, bundle}` → UNCONDITIONAL reject (`no_eligible_product`-family 400, coupon NOT burned) — PERMANENT; (b) `deal_type ∈ {free_item, free_upgrade}` → UNCONDITIONAL reject in P1b regardless of `benefit_product_id` (temporary tightening) — structured as a single branch P2 swaps for the configured-path dispatch (clean branch-swap, not a revert); (c) all other mechanics fall through to the existing `computeDealDiscountCents` path UNCHANGED |
| `packages/api/src/routes/__tests__/coupons.integration.test.ts` | NEW apply-path cases: all FOUR mechanics rejected (b1t1, bundle, free_item unconfigured, free_item CONFIGURED — non-null `benefit_product_id` regression-lock, free_upgrade both states), coupon status stays `available`; TWO-LINE-CART fixtures asserting no cheapest-line discount (finding 5); ONE fixed_discount offer-coupon exact-cents test at the resolver path (finding 4) |
| `packages/api/src/routes/__tests__/orders.test.ts` | NEW placement-path cases mirroring the above: all four mechanics rejected at `POST /orders`, no burn, two-line-cart fixtures |

### Phase P2 — pure functions + resolver dispatch + admin server validation (full money semantics)

| File | Change |
|---|---|
| `packages/utils/src/discount.ts` | ADD (append-only): `computeFreeUpgradeDiscountCents(benefitProductId, cart)` — qualifying line: `menuItemId === benefitProductId` with size-type option(s) `priceDeltaCents > 0`; waived per line = sum of that line's positive size deltas; multiple qualifying lines → `Math.min` across them; one unit per redemption. ADD pure `checkFreeBenefit(dealType, benefitProductId, cart)` returning `EligibilityResult` with NEW union member `'no_upgrade_to_waive'` added to `EligibilityFailReason` (new VALUE in an existing string field — not a wire-shape change). free_item reuses `computeRewardDiscountCents` VERBATIM (no change to it) |
| `packages/utils/src/index.ts` | Export the two new functions (if not barrel-auto) |
| `packages/api/src/routes/lib/coupon-apply.ts` | **REPLACES the P1b free-mechanic unconditional-reject branch** with the configured-path dispatch: free mechanics (benefit configured) → `checkFreeBenefit` → reject on failure (`no_eligible_product` / `not_in_cart` / `no_upgrade_to_waive`, coupon NOT burned); on pass compute discount via `computeRewardDiscountCents` (free_item) / `computeFreeUpgradeDiscountCents` (free_upgrade), dual-clamped `Math.max(0, Math.min(d, subtotal))`. Unconfigured free mechanics still reject (P1/D4 permanent safety net). **The P1b b1t1/bundle unconditional deny STAYS — do not touch it.** Non-free, non-denied mechanics keep the existing `computeDealDiscountCents` path UNCHANGED. Order: pre-checks → `checkDealEligibility` → mechanic dispatch (deterministic reason precedence, echo of P2 Branch-1 ordering bug) |
| `packages/api/src/routes/admin/offers.ts` | `createOfferSchema` gains optional `benefitProductId` (uuid) + `superRefine`: free mechanics REQUIRE it; non-free mechanics REJECT it if supplied. `PATCH` handler MUST load the existing row and validate the MERGED mechanic⇄benefit state (partial-update bypass trap — HIGH-priority vc-predict constraint). Insert/update writes `benefit_product_id`; FK-violation → existing 400/409 handling via `handleAdminError`. **See VALIDATE Execute-Agent Instruction E1 (Zod restructure) — do NOT apply `.superRefine()` directly onto the schema that `.partial()` derives from.** |
| `packages/api/src/routes/lib/serializers.ts` | `AdminOffer` + `serializeAdminOffer` gain additive `benefitProductId: string \| null` (admin API not under public freeze) |
| `packages/api/src/routes/admin/coupons.ts` | `POST /generate`: after loading the offer row, reject (400) when `deal_type ∈ free mechanics` and `benefit_product_id IS NULL`, with explanatory message. **See VALIDATE Execute-Agent Instruction E2 — the current `/generate` select fetches only `{id: offers.id}`; widen it to include `deal_type` + `benefit_product_id`.** |
| `packages/utils/src/__tests__/discount.test.ts` | NEW FILE — first tests for discount.ts (runner already configured). Cover ONLY the two free-mechanic fns + `checkFreeBenefit`: exact amounts, min-across-lines, one-unit rule, no-size-delta reject, negative/zero-delta exclusion, clamp behavior, product-absent. Do NOT backfill full legacy coverage |
| `packages/api/src/routes/__tests__/coupons.integration.test.ts` | AC2/AC4/AC5/AC6/AC7/AC8 apply-path scenarios (exact-cents) + AC9 wire-freeze shape assertion on new scenarios. The P1b configured-free-mechanic reject tests get UPDATED here to assert the new configured-path semantics (the P1b unconditional-reject assertion for CONFIGURED offers is replaced; unconfigured-reject and b1t1/bundle-deny assertions remain) |
| `packages/api/src/routes/__tests__/orders.test.ts` | AC3 (placement exact amount + atomic burn + re-use reject), AC4/AC5/AC6 placement side, AC7 clamp (benefit priced above rest of cart), AC8 same-fixture apply-then-place equality; same P1b configured-path test update as above |
| `packages/api/src/routes/admin/__tests__/admin-offers.integration.test.ts` | AC10: create free-mechanic without benefit → 422/400; with benefit → 201 + read-back `benefitProductId`; non-free with benefit → reject; PATCH mechanic-flip merged-state cases (free→non-free with lingering benefit; non-free→free without benefit); generate-route block case (or in `admin-coupon-issuance.integration.test.ts` — CONFIRMED to exist) |

### Phase P3 — admin UI picker + panel block

| File | Change |
|---|---|
| `apps/admin/src/features/offers/components/offer-form.tsx` | Benefit-product picker (select fed by existing admin products list API), shown + required ONLY for `free_item`/`free_upgrade`; hidden/cleared for other mechanics; wired on create AND detail edit |
| `apps/admin/src/features/offers/lib/admin-offers-api.ts` + `hooks/use-admin-offers.ts` | Carry `benefitProductId` through create/update payloads and offer read type |
| `apps/admin/src/features/offers/components/generate-coupons-panel.tsx` | Block generation for unconfigured free-mechanic offers with explanatory message (button disabled + reason text) |
| `apps/admin/src/features/offers/components/offer-form.test.tsx` | jsdom: picker appears only for free mechanics; required-validation; payload includes `benefitProductId` |
| `apps/admin/src/features/offers/components/generate-coupons-panel.test.tsx` | jsdom: block + message for unconfigured free offer; unaffected for configured/non-free |

## Public Contracts

- **FROZEN (no shape change):** `POST /coupons/apply`, `GET /coupons`, `GET /deals`, `GET /deals/:id`, `POST /orders` responses; `AppliedDiscount {source, refId, label, amountCents}` cross-app contract (AC9).
- **Changed (allowed):** admin API only — `AdminOffer` serializer gains additive `benefitProductId`; admin offer create/update Zod accepts/requires it per mechanic; `POST /api/admin/coupons/generate` gains a new 400 rejection case.
- **New reject reason values** in the existing `reason` string field: `no_upgrade_to_waive` (new, P2), plus reuse of `no_eligible_product`/`not_in_cart` — value additions, not shape changes. P1b's b1t1/bundle/free-mechanic denies reuse existing reason values (no new value needed in P1b).
- **Behavioral change (P1b, intended):** offer coupons targeting `buy_one_take_one`/`bundle` mechanics now reject instead of mis-discounting — this closes a live money leak; it is a bug fix, not a contract break (the mis-discount was never specified behavior).
- **DB:** additive nullable `offers.benefit_product_id` FK → `products.id` (NO ACTION), migration 0014 — LANDED (`35981fa`).

## DO-NOT-TOUCH (byte-identical constraint)

- `computeDealDiscountCents()` and `checkDealEligibility()` in `packages/utils/src/discount.ts` — BYTE-IDENTICAL (all additions are append-only new functions; `EligibilityFailReason` union may gain the new member since the two functions never emit it and the mobile twin has its own local copy). P1b touches ONLY `coupon-apply.ts` + tests — zero `packages/utils` changes in P1b.
- `apps/mobile/src/features/deals/lib/eligibility.ts` (verbatim mobile twin) — ZERO changes.
- `computeRewardDiscountCents` / `checkRewardEligibility` — reused verbatim, not modified.
- The dormant legacy `dealId` order path, `is_deal` guard, and the ADM-004 deals CRUD.
- All `apps/mobile` files.

## Blast Radius

- Packages: `packages/api` (schema + 1 migration + resolver + 2 admin routes + serializer + 3 test suites), `packages/utils` (1 source file append-only + 1 new test file), `apps/admin` (2 components + api lib + hook + 2 test files). ~14 files. P1b's own blast radius: 3 files (`coupon-apply.ts` + 2 test suites), `packages/api` only.
- **Risk class: HIGH — money path (billing/credits analog), schema migration, trust-boundary discount computation.** Minimum tier for all money surfaces: Fully-Automated (charter bans Known-Gap for AC1–AC8 and P1b-1..P1b-4). `vc-risk-evidence-pack` required at EXECUTE closure; human review before production deploy.
- Regression surfaces overlapping: ADM-008 coupons suites, orders placement suite, admin-offers suite, wire-freeze assertions (AC10b pattern).

## Implementation Checklist

### Phase P1 — interim guard (commit checkpoint 1) — ✅ DONE, COMMITTED `35981fa`

1. ~~Pre-step: db:generate inspection / hand-author 0014~~ — DONE (0014 landed).
2. ~~Add `benefit_product_id` column~~ — DONE.
3. ~~Apply migration locally~~ — DONE.
4. ~~Resolver null-guard in `coupon-apply.ts`~~ — DONE (shape superseded by P1b dispatch below).
5. ~~Tests: unconfigured rejects + no-burn~~ — DONE.
6. ~~Gates (P1)~~ — GREEN (EVL-confirmed; new API baseline 368).
7. ~~User commit~~ — DONE (`35981fa`, committed-as-validated per explicit user decision).

### Phase P1b — widened deny-guard (inserted; commit checkpoint 1b) — PENDING PVL RE-RUN

P1b-i. Restructure the P1 guard in `coupon-apply.ts` (offer-coupon branch, same insertion point) into a mechanic dispatch: `buy_one_take_one`/`bundle` → unconditional PERMANENT reject; `free_item`/`free_upgrade` → unconditional reject regardless of `benefit_product_id` (temporary — single clean branch P2 swaps for real dispatch); all other mechanics unchanged. Coupon never burned on any reject.
P1b-ii. Apply-path tests (`coupons.integration.test.ts`): b1t1 reject, bundle reject, free_item unconfigured reject, free_item CONFIGURED (non-null `benefit_product_id`, set via fixture insert) reject — the finding-2 regression lock, free_upgrade both states; every reject asserts coupon status stays `available`; fixtures use TWO-LINE carts and assert NO discount is returned (no cheapest-line leak).
P1b-iii. Placement-path tests (`orders.test.ts`): same four-mechanic rejects at `POST /orders`, no burn, two-line-cart fixtures.
P1b-iv. Fixed_discount regression insurance: ONE exact-cents fixed_discount OFFER-coupon test at the resolver path (apply-path; asserts exact discount cents) — closes finding 4.
P1b-v. Gates (P1b): `pnpm --filter @jojopotato/api typecheck` clean; `pnpm --filter @jojopotato/api test` full green (baseline 368 + new cases, 0 regressions); `pnpm --filter @jojopotato/utils test` (17, untouched) green; `pnpm format:check` on touched files. Admin suite (29) untouched — no re-run owed unless CI runs it anyway.
P1b-vi. Hand user staging commands + conventional-commit message (e.g. `fix(api): widen offer-coupon deny-guard to all cheapest-line mechanics (ADM-008 P1b)`); user commits. NEVER auto-commit.

### Phase P2 — real semantics + server validation (commit checkpoint 2) — ✅ DONE, COMMITTED `cceb66b`

8. ~~Write failing unit stubs first (TDD)~~ — DONE, `packages/utils/src/__tests__/discount.test.ts` (first-ever discount.ts unit suite, 35 tests).
9. ~~Implement `computeFreeUpgradeDiscountCents` + `checkFreeBenefit`~~ — DONE, append-only; byte-identity confirmed (`computeDealDiscountCents`/`checkDealEligibility` zero diff across the full range).
10. ~~Run `pnpm --filter @jojopotato/utils test`~~ — DONE, green (35/35).
11. ~~Resolver dispatch in `coupon-apply.ts`~~ — DONE, with a deviation from the original plan (see §Execution Deviations below): the fall-through was restructured as an explicit ALLOWLIST with a `<=0` reject, not a bare branch-swap — this also closed a second money leak (legacy value-less-discount configured as a `percentage_discount`/`fixed_discount` offer with a zero/negative value could still discount ₱0 and burn) found by this cycle's own adversarial review. The P1b b1t1/bundle deny is untouched/permanent, as planned.
12. ~~Admin offers route: `benefitProductId` in schemas + `superRefine`~~ — DONE, with a deviation (F2 below): `benefitProductId` on the base/update schema is NULLABLE (not just optional) so PATCH can explicitly CLEAR a previously-set benefit when flipping a mechanic away from free_item/free_upgrade — the original plan only covered "reject if supplied for non-free"; clearing was a gap found during execution.
13. ~~Serializer: additive `benefitProductId` on `AdminOffer`~~ — DONE.
14. ~~Generate route block in `admin/coupons.ts`~~ — DONE (E2, widened select); ALSO widened per F5 below to reuse the same block for the value-less-discount leak (finding from item 11).
15. ~~API integration tests: AC2–AC10, AC12 scenarios~~ — DONE (`coupons.integration.test.ts` +273 lines, `orders.test.ts` +436 lines, `admin-offers.integration.test.ts` +256 lines, `admin-coupon-issuance.integration.test.ts` +121 lines).
16. ~~Gates (P2)~~ — GREEN: api typecheck clean; `pnpm --filter @jojopotato/api test` 411/411; `pnpm --filter @jojopotato/utils test` 35/35; `pnpm --filter @jojopotato/utils typecheck` clean; `pnpm format:check` clean on touched files. Byte-identity confirmed via `git diff` — zero modified lines in `computeDealDiscountCents`/`checkDealEligibility`/the mobile eligibility twin.
17. ~~Hand user commit message~~ — DONE, user committed `cceb66b` (`feat(api): real free_item/free_upgrade redemption semantics + money-path hardening (ADM-008 fix 6 P2)`).
18. Accepted window note: not applicable as originally worried — P3 (UI) actually landed BEFORE P2 chronologically (`ad3e937` at 05:58 vs `cceb66b` at 08:37 same day), so there was no live P2→P3 gap in practice. The P1→P2 configured-offer window hole (finding 2) was closed by P1b, as planned.

### Phase P3 — admin UI (commit checkpoint 3) — ✅ DONE, COMMITTED `ad3e937`

19. ~~`admin-offers-api.ts` + `use-admin-offers.ts`: carry `benefitProductId`~~ — DONE.
20. ~~`offer-form.tsx`: conditional required picker~~ — DONE, with a deviation (F1 below): the picker was extracted into its own `benefit-product-field.tsx` component (not inlined in `offer-form.tsx`) so both the offer-form AND any future consumer can reuse the active/non-deal product-integrity filtering logic; clears value when mechanic switches to non-free.
21. ~~`generate-coupons-panel.tsx`: unconfigured-free block + message~~ — DONE, widened (per item 14 above) to also block the value-less-discount case.
22. ~~jsdom tests: offer-form + panel~~ — DONE: `offer-form.test.tsx` (+281 lines), `generate-coupons-panel.test.tsx` (+50 lines), NEW `benefit-product-field.test.tsx` (114 lines), `offer-list.test.tsx` (+1 line, unrelated minor touch-up).
23. ~~Gates (P3)~~ — GREEN: `pnpm --filter @jojopotato/admin typecheck` clean; `pnpm --filter @jojopotato/admin test` 49/49 (baseline 29 + 20 new); `pnpm --filter @jojopotato/admin build` clean; `pnpm format:check` clean on touched files.
24. ~~AC11 visual pass~~ — DONE, user-verified 17-07-26 (create free offer → picker required; non-free → hidden; unconfigured legacy offer → generate blocked with message; clearable benefit on mechanic flip).
25. ~~Hand user commit message~~ — DONE, user committed `ad3e937` (`feat(admin): benefit-product picker + clear/block hardening for free mechanics (ADM-008 fix 6 P3)`).
26. UPDATE PROCESS (this pass, 17-07-26): AC13 backlog-note correction DONE (`adm-008-free-item-free-upgrade-redemption_NOTE_16-07-26.md` — true pre-fix behavior was cheapest-line mis-discount, not silent ₱0) + NEW backlog note for the descoped usage-limit gap (D6) DONE (`offer-usage-limits-unenforced-coupon-path_NOTE_17-07-26.md`) + NEW backlog note for finding 3 DONE, but UPGRADED from a plain backlog idea to a **user-approved follow-up** (`coupons-reward-offer-mutual-exclusivity-check_NOTE_17-07-26.md` — execute next) + SPEC out-of-scope-claim annotation DONE + risk-evidence-pack review DONE (user-reviewed 17-07-26, gate satisfied) + a third NEW backlog note for a live concurrency gap found this session (`api-test-db-concurrency-guard_NOTE_17-07-26.md`, not part of the original AC13 list — found during this closeout pass).

## Execution Deviations (recorded 17-07-26, UPDATE PROCESS)

Honest record of where P2/P3 execution diverged from the original Touchpoints/Checklist text above (all user-approved in-flight, all gate-green, none weaken a money AC):

- **F1 (P3):** the benefit-product picker was extracted into a standalone `apps/admin/src/features/offers/components/benefit-product-field.tsx` (+ its own test file) rather than inlined directly in `offer-form.tsx`, so the active/non-deal product-integrity filter is reusable.
- **F2 (P2):** `benefitProductId` on the admin offers Zod schema was made explicitly NULLABLE (not merely optional) so a PATCH can clear a previously-set benefit when an admin flips an offer's mechanic away from `free_item`/`free_upgrade` — the original plan text only specified reject-if-supplied-for-non-free; clear-on-flip was a real gap an admin would otherwise hit (mechanic flipped, stale benefit left dangling, next PATCH's merged-state validation would then wrongly reject).
- **F3 (P2):** benefit-product integrity checks were added — the chosen benefit product must be active and non-deal (`is_deal = false`) — closing a configuration hole where an admin could point a free-mechanic offer at an inactive or deal-type product, which would then behave unpredictably at redemption.
- **F4 (P2):** the resolver's non-denied-mechanic fall-through was restructured from an implicit "everything else goes to `computeDealDiscountCents`" branch into an explicit ALLOWLIST (`percentage_discount`/`fixed_discount` only) with a `<=0`-computed-discount REJECT. This was necessary to close a second money leak found by this cycle's own adversarial review: a `percentage_discount`/`fixed_discount` offer configured with a zero or negative `discount_value` previously still "succeeded" with a ₱0 discount and burned the coupon — a value-less-discount-and-burn defect structurally identical in spirit to the free-mechanic leak this whole fix batch exists to close.
- **F5 (P2):** the `POST /api/admin/coupons/generate` block (E2) was widened beyond the free-mechanic-unconfigured case to also reject generation against the F4 value-less-discount case, for the same reason — don't let admins mint codes that can only ever produce a rejected or worthless redemption.
- **F6 (P2):** the placement-side clamp was made an explicit zero-floor clamp (`Math.max(0, ...)`) at the point of writing the stored order total, closing a theoretical negative-total path the original plan's dual-clamp wording implied but did not literally re-state at the placement call site.
- **F7 (P2, test-level):** one of the P1b negative-clamp assertions had to be converted from a "discount == 0" assertion into a "request rejected" assertion once F4 landed, since the ≤0 case is now a hard reject rather than a silent ₱0 success — a test-shape fix that tracks the F4 behavior change, not a new gap.

These deviations were all discovered and fixed inside the same P2 execution/EVL cycle (adversarial review run against the in-progress diff, not a separate future phase) — no money AC was ever left Known-Gap, and the final gate counts above (API 411/411, utils 35/35, admin 49/49) already include all F1–F7 fixes and their regression tests.

## Acceptance Criteria

Carried verbatim from the locked SPEC (AC1–AC13) with `proven by:`/`strategy:` links — see SPEC §Acceptance Criteria and the Verification Evidence table below (bidirectional criterion ↔ gate mapping). **Supplement adds P1b criteria:**

- **P1b-1** — b1t1/bundle offer-coupons reject at preview AND placement, no burn, no cheapest-line discount (two-line cart). proven by: P1b apply/placement deny tests; strategy: Fully-Automated.
- **P1b-2** — CONFIGURED free-mechanic offer-coupon (non-null `benefit_product_id`) rejects in P1b (window-hole lock). proven by: configured-path reject tests; strategy: Fully-Automated.
- **P1b-3** — unconfigured free-mechanic reject unchanged (P1 behavior preserved). proven by: existing + new P1b tests; strategy: Fully-Automated.
- **P1b-4** — fixed_discount offer-coupon exact-cents unchanged by the guard restructure. proven by: new fixed_discount resolver-path test; strategy: Fully-Automated.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| coupons.integration.test.ts — unconfigured free-mechanic apply reject + coupon status unchanged (`pnpm --filter @jojopotato/api test`) | Fully-Automated | AC1 (preview side) / P1b-3 |
| orders.test.ts — unconfigured free-mechanic placement reject + no burn | Fully-Automated | AC1 (placement side) / P1b-3 |
| coupons + orders — b1t1 + bundle offer-coupon reject both paths, no burn, two-line cart asserts no cheapest-line discount | Fully-Automated | P1b-1 |
| coupons + orders — CONFIGURED free-mechanic (non-null benefit_product_id via fixture) reject both paths in P1b, no burn, two-line cart | Fully-Automated | P1b-2 |
| coupons.integration.test.ts — fixed_discount offer-coupon exact-cents at resolver path | Fully-Automated | P1b-4 |
| coupons.integration.test.ts — free_item exact one-unit-price discount at apply (exact cents) | Fully-Automated | AC2 |
| orders.test.ts — free_item exact discount on stored total + atomic burn + re-use → reject | Fully-Automated | AC3 |
| coupons + orders — designated product absent → `not_in_cart` reject, both paths, no burn | Fully-Automated | AC4 |
| coupons + orders — free_upgrade exact size-delta discount, both paths (exact cents) | Fully-Automated | AC5 |
| coupons + orders — free_upgrade absent / present-without-paid-size-upgrade → `no_upgrade_to_waive` reject, no ₱0-and-burn | Fully-Automated | AC6 |
| discount.test.ts pure-unit clamp/edge cases (`pnpm --filter @jojopotato/utils test`) + one API clamp scenario (benefit priced above rest of cart) | Fully-Automated | AC7 |
| orders.test.ts — same-fixture apply-then-place discount equality assertion | Fully-Automated | AC8 |
| Existing wire-freeze shape assertions (AC10b pattern) extended to new scenarios; `git diff` byte-identity check on `computeDealDiscountCents`/`checkDealEligibility`/mobile twin | Fully-Automated | AC9 |
| admin-offers.integration.test.ts — superRefine create/PATCH merged-state + read-back + generate block | Fully-Automated | AC10 |
| apps/admin jsdom tests (offer-form + generate-coupons-panel) (`pnpm --filter @jojopotato/admin test`) + user-run visual walkthrough checklist | Hybrid | AC11 |
| Full API suite green (baseline 368, 0 regressions) + `pnpm --filter @jojopotato/api typecheck` | Fully-Automated | AC12 |
| UPDATE PROCESS closeout checklist — backlog notes filed (AC13 correction, D6, finding-3 exclusivity) + SPEC annotation | Agent-Probe | AC13 |
| `pnpm --filter @jojopotato/admin typecheck` + `build`; `pnpm format:check` on touched files (per phase) | Fully-Automated | cross-cutting quality gates |

No developed behavior is Known-Gap. AC13 is a process artifact (Agent-Probe legitimate). AC11's visual half is user-run per repo convention; its logic half is automated.

## Test Infra Improvement Notes

- `packages/utils` gains its FIRST tests for `discount.ts` (`__tests__/discount.test.ts`, P2) — vitest runner already configured, sibling test files exist (VALIDATE confirmed: 3 sibling suites, 17 tests, no discount.test.ts today). Legacy functions (`computeDealDiscountCents` etc.) remain uncovered by unit tests — deliberate scope choice, not owed by this plan.
- Review finding 4 exposed a fixture-diversity gap: all offer-coupon fixtures were percentage_discount; P1b adds the first fixed_discount resolver-path test. Consider broadening offer-mechanic fixture coverage when the coupons suites are next touched.
- Review finding 5: prefer two-line-cart fixtures for reject tests on discount paths — single-line carts cannot distinguish "rejected" from "cheapest-line accidentally zero".

## Dependencies

- Branch `feat/deals_unification` with migrations through 0014 applied (P1 landed 0014; dev-box uses native Postgres :5432 — see all-tests.md gotcha).
- Baselines: **API suite 368 (post-P1)**, utils 17, admin suite 29 (re-confirm at EXECUTE entry).
- P1b depends on P1 (`35981fa`) — landed. P2 depends on P1b. P3 depends on P2. Do not renumber P2/P3.
- **PVL re-run (V1) REQUIRED on this supplement before P1b executes** — the existing `Gate: PASS` below predates the P1b insertion and does not cover it.

## Risks

| Risk | Mitigation |
|---|---|
| Guard restructure (P1b) accidentally alters %/fixed/reward paths | Explicit fall-through design (only the four denied mechanics diverted); fixed_discount exact-cents test (P1b-iv) + full-suite 368 baseline + AC12 |
| P2 branch-swap of the P1b free-mechanic branch reintroduces the window hole or reverts the b1t1/bundle deny | P1b guard structured as separate branches (b1t1/bundle permanent vs free-mechanic temporary); checklist 11 names the swap explicitly; configured-path + deny tests carry into P2 updated, not deleted |
| PATCH partial-update bypass (mechanic flipped without benefit, or benefit lingering after flip to non-free) | Mandatory merged-state validation in PATCH handler + dedicated integration tests (checklist 12, AC10) — HIGH-priority vc-predict constraint. VALIDATE confirmed the current PATCH handler does NOT load the existing row — this fix is required, not optional |
| Reason-code precedence regression (echo of P2 Branch-1 bug) | Fixed ordering locked in checklist 11 + reject-reason assertions in integration tests |
| Silent divergence of the mobile eligibility twin | DO-NOT-TOUCH list + `git diff` byte-identity gate (AC9 row) |
| Free-offer creation blocked P2→P3 window | Accepted (safe-by-rejection); phases committed back-to-back |
| Codes generated against unconfigured offers before P2 | Rejected at redemption by the P1b guard (harmless, accepted) |
| Dual-FK coupon row (reward_id + offer_id) bypasses the offer guard via the reward branch | No live write path creates such a row; DESCOPED to backlog note (finding 3) — defense-in-depth DB CHECK deferred |
| Zod `superRefine` + `.partial()` incompatibility (E1) | Restructure schemas so the base `z.object(...)` stays available for `.partial()`; apply `.superRefine()` to a derived create-only schema; PATCH cross-validation lives in the handler (merged-state). typecheck gate backstops |

## Rollback

Each phase is an independent commit. P1b rollback: revert commit (guard returns to P1 shape — still safe for unconfigured free mechanics). P1/P2 rollback: revert commit; the migration is additive-nullable — column can remain (harmless) or be dropped by a hand-authored down migration. No data backfill, no destructive DDL anywhere.

## Phase Loop Progress

- [x] Step 1 — RESEARCH (16-07-26, findings folded into SPEC §Background)
- [x] Step 2 — INNOVATE (Decision Summary locked: Approach C)
- [x] Step 3 — PLAN (this file; SUPPLEMENTED 16-07-26 post-P1 review — P1b inserted)
- [x] Step 4 — PVL **(RE-RUN COMPLETE 17-07-26 — Gate: PASS; P1b now covered by the validate-contract. EXECUTE P1b is legal.)**
- [x] Step 5 — EXECUTE (P1 ✅ `35981fa`; P1b ✅ `66cbb0e`; P3 ✅ `ad3e937`; P2 ✅ `cceb66b` — all four phases CODE DONE, gates green)
- [x] Step 6 — EVL per phase, independent vc-tester gate re-runs, all green (final: API 411/411 frozen-tree twice, utils 35/35, admin 49/49) + risk-evidence-pack (HIGH risk) — 5-artifact pack generated at `harness/` and USER-REVIEWED 17-07-26, `mustStopBeforeFinalize` satisfied
- [x] Step 7 — UPDATE PROCESS (this pass, 17-07-26): AC13 backlog-note correction, D6 backlog note, finding-3 exclusivity note (upgraded to user-approved follow-up), 1 new concurrency-gap backlog note, SPEC annotation, context delta, umbrella state update — DONE. Task folder stays in `active/` (parent ADM-008 program is OPEN by standing decision, not archived until the user closes it).

## Current Execution State

- Last updated: 17-07-26 (UPDATE PROCESS closeout — Fix 6 of the ADM-008 post-merge fix batch)
- Phases: P1 ✅ `35981fa` → P1b ✅ `66cbb0e` → P3 ✅ `ad3e937` → P2 ✅ `cceb66b` (P3 landed before P2 chronologically — harmless, see §Execution Deviations item 18). All four phases CODE-COMPLETE, EVL-green, USER-VERIFIED (AC11 manual walkthrough + risk-evidence-pack review, both 17-07-26).
- Validate-contract status: PASS (17-07-26 PVL re-run covering P1b; P2/P3 executed under the same contract's accepted execute-agent instructions E1/E2, both confirmed correct in the shipped code)
- Status: **CODE-COMPLETE + USER-VERIFIED.** No further action required on this plan. One follow-up item was upgraded by the user during evidence-pack review to an APPROVED next fix — see `process/features/admin-dashboard/backlog/coupons-reward-offer-mutual-exclusivity-check_NOTE_17-07-26.md` (DB CHECK for `coupons.reward_id`/`offer_id` mutual exclusivity, migration 0015). This task folder stays in `active/` per the parent ADM-008 program's standing OPEN decision — not archived to `completed/` yet.

## Phase Completion Rules

- A phase (P1/P1b/P2/P3) is **CODE DONE** only when every checklist item in it is complete AND its listed gates are green in a fresh run.
- A phase is **VERIFIED** only after the independent EVL confirmation run (spawned vc-tester) re-runs the validate-contract gates green — execute-agent self-report never suffices.
- Money ACs (AC1–AC8, P1b-1..P1b-4): a phase touching them cannot be marked CODE DONE with any Known-Gap classification — banned by the ADM-008 charter.
- Each phase ends at a user commit checkpoint: hand staging commands + conventional-commit message; NEVER auto-commit. Do not start the next phase before the user commits.
- P3's AC11 visual walkthrough is user-run; P3 is CODE DONE on green jsdom tests + build, VERIFIED only after the user walkthrough passes.
- The whole plan is finalize-ready only after the HIGH-risk evidence pack (vc-risk-evidence-pack) is produced and reviewed at EXECUTE closure.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/admin-dashboard/active/adm-008-free-mechanics_16-07-26/adm-008-free-mechanics_PLAN_16-07-26.md`
2. **Last completed phase/step:** P1 EXECUTED, EVL-green, COMMITTED (`35981fa`). Plan SUPPLEMENTED post-P1 (P1b inserted from adversarial review findings).
3. **Validate-contract status:** WRITTEN (Gate: PASS) but PRE-SUPPLEMENT — **PVL re-run (V1) required before P1b executes.** Do not treat the existing PASS as covering P1b.
4. **Supporting context loaded:** SPEC (same folder — note recorded out-of-scope correction in §Post-P1 Review Findings), `process/context/all-context.md` (ADM-008 entry), `process/context/tests/all-tests.md`, source ground truth: `packages/utils/src/discount.ts` (:179-183 four-mechanic routing), `packages/api/src/routes/lib/coupon-apply.ts` (:152-160 reward-branch precedence; ~256-266 P1 guard), `packages/api/src/routes/admin/{offers,coupons}.ts`, `packages/api/src/db/schema/offers.ts`, `apps/admin/src/features/offers/**`.
5. **Next step for a fresh agent:** run PVL (vc-validate-agent, V1) on this supplemented plan. After gate PASS/accepted: EXECUTE Phase P1b only (items P1b-i..vi), stop at commit checkpoint 1b. Branch: `feat/deals_unification`. Baselines: API 368 / utils 17 / admin 29 (re-confirm live). Risk-evidence-pack owed at EXECUTE closure.

## Inner Loop Refresh Note

- Date: 2026-07-16
- Trigger: post-P1-commit adversarial review (Fable/xhigh) of the P1 diff; user approved planning the fix.
- Sections changed: frontmatter description, Status/TL;DR, Overview, NEW §Post-P1 Review Findings & Dispositions, Goals, Scope, Touchpoints (P1 marked done; P1b inserted; P2 branch-swap notes), Public Contracts (P1b behavioral note), Blast Radius, Implementation Checklist (P1 struck done; P1b items P1b-i..vi inserted; items 11/18/26 updated), Acceptance Criteria (P1b-1..4 added), Verification Evidence (3 new rows; baseline 364→368), Test Infra Improvement Notes, Dependencies, Risks, Rollback, Phase Loop Progress, NEW §Current Execution State, Phase Completion Rules, Resume and Execution Handoff, Validate Contract addendum, Autonomous Goal Block.
- Consequence: the existing validate-contract (`Gate: PASS`, dated 16-07-26 pre-supplement) is STALE with respect to P1b — orchestrator must re-run PVL from V1 before EXECUTE resumes.

## Validate Contract

Status: PASS
Date: 17-07-26
date: 2026-07-17
generated-by: outer-pvl
supersedes: 16-07-26 (outer-pvl) — PVL re-run covers the P1b supplement (widened deny-guard); prior PASS predated P1b

> **PVL RE-RUN (17-07-26) — P1b NOW COVERED.** The prior PASS (16-07-26) predated the P1b insertion; this re-run validates P1b (criteria P1b-1..P1b-4, checklist P1b-i..vi) against committed ground truth (HEAD `35981fa`). Verified this pass: (a) `computeDealDiscountCents` (discount.ts:179-183) routes exactly 4 mechanics — buy_one_take_one / free_item / free_upgrade / bundle — to `cheapestEligibleUnitPrice`; percentage/fixed have their own exact branches; `default` returns 0. (b) The P1 guard (coupon-apply.ts:256-266) covered only free_item/free_upgrade-UNCONFIGURED, leaving b1t1/bundle (any state) and CONFIGURED free mechanics to mis-discount + burn — findings 1/2 REPRODUCED in source. (c) P1b's two-branch dispatch sits at the confirmed unique insertion point (after `checkDealEligibility` at 242-245, before the `computeDealDiscountCents` return at 267) and composes cleanly: the 4 cheapest-line mechanics divert to an early 400; percentage/fixed fall through UNCHANGED. (d) The single shared resolver (`resolveCouponDiscount`, used by BOTH preview and placement per its docstring) means one guard closes both paths by construction. (e) No test collision: the only existing offer-coupon placement test uses percentage_discount (orders.test.ts:875) and no existing test asserts a discount for a b1t1/bundle/free offer-coupon, so P1b's deny introduces zero regression. Baselines re-confirmed live this pass: API 368/368 (32 files), utils 17/17. P1b gate commands: `pnpm --filter @jojopotato/api typecheck`; `pnpm --filter @jojopotato/api test` (368 baseline + P1b cases, 0 regressions); `pnpm --filter @jojopotato/utils test` (17, untouched); admin suite (29) untouched; `pnpm format:check` on touched files.

Parallel strategy: sequential
Rationale: 7-signal score 4/7 (S1 multi-package, S2 schema/API surface, S6 high-risk money class, S7 5+ files) → HIGH tier by count, but the phases are strictly dependency-chained with a user commit checkpoint between each (P1 → P1b → P2 → P3). Strategy-by-fit overrides the raw count: sequential is correct when phases depend on the previous and are gated by human commits. One vc-execute-agent per phase, spawned one at a time. Model: opus (real code-execution leg). Cost guard: not triggered.

Test gates (C3 5-column table — ADDITIVE; the legacy line form below is retained for existing consumers):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | unconfigured free-mechanic coupon rejected at preview + placement, not burned, no cheapest-line mis-discount | Fully-Automated | `pnpm --filter @jojopotato/api test` — coupons.integration.test.ts (apply reject + status-unchanged) + orders.test.ts (placement reject + no-burn) | A (proven — P1 landed, EVL-green) |
| P1b-1 | b1t1/bundle offer-coupons reject both paths, no burn, two-line cart shows no cheapest-line discount | Fully-Automated | `pnpm --filter @jojopotato/api test` — new P1b deny cases (coupons + orders suites) | B (P1b) — validated 17-07-26 re-run |
| P1b-2 | configured free-mechanic (non-null benefit_product_id) rejects in P1b — window-hole lock | Fully-Automated | `pnpm --filter @jojopotato/api test` — new configured-path reject cases | B (P1b) — validated 17-07-26 re-run |
| P1b-3 | unconfigured free-mechanic reject preserved through guard restructure | Fully-Automated | `pnpm --filter @jojopotato/api test` — existing P1 cases stay green | B (P1b) — validated 17-07-26 re-run |
| P1b-4 | fixed_discount offer-coupon exact-cents unaffected by guard restructure | Fully-Automated | `pnpm --filter @jojopotato/api test` — new fixed_discount resolver-path exact-cents case | B (P1b) — validated 17-07-26 re-run |
| AC2 | free_item = exact one-unit price of designated product at preview | Fully-Automated | `pnpm --filter @jojopotato/api test` — coupons.integration.test.ts exact-cents apply scenario | B (P2) |
| AC3 | free_item exact discount on stored total + atomic burn + re-use reject | Fully-Automated | `pnpm --filter @jojopotato/api test` — orders.test.ts placement exact + burn + re-use-reject | B (P2) |
| AC4 | designated product not in cart → not_in_cart reject both paths, no burn | Fully-Automated | `pnpm --filter @jojopotato/api test` — coupons + orders not-in-cart scenarios | B (P2) |
| AC5 | free_upgrade = exact one-unit size-delta waived, both paths | Fully-Automated | `pnpm --filter @jojopotato/api test` — coupons + orders upgrade exact-cents scenarios | B (P2) |
| AC6 | free_upgrade with nothing to waive → no_upgrade_to_waive reject, no ₱0-and-burn | Fully-Automated | `pnpm --filter @jojopotato/api test` — absent + present-without-paid-upgrade scenarios | B (P2) |
| AC7 | clamp invariant: 0 ≤ discount ≤ subtotal (incl. benefit priced above rest of cart) | Fully-Automated | `pnpm --filter @jojopotato/utils test` — discount.test.ts clamp/edge cases + one API clamp scenario | B (P2) |
| AC8 | preview amount == placement amount (single-resolver symmetry) | Fully-Automated | `pnpm --filter @jojopotato/api test` — orders.test.ts same-fixture apply-then-place equality | B (P2) |
| AC9 | wire freeze holds; AppliedDiscount + public response shapes unchanged | Fully-Automated | `pnpm --filter @jojopotato/api test` wire-freeze shape assertions extended + `git diff feat/deals_unification -- packages/utils/src/discount.ts` shows only appended lines + byte-identity on mobile twin | A (freeze proven now) + B (extended) |
| AC10 | admin create/PATCH cross-validation (require/reject benefit per mechanic; merged-state PATCH; read-back; generate block) | Fully-Automated | `pnpm --filter @jojopotato/api test` — admin-offers.integration.test.ts + admin-coupon-issuance.integration.test.ts | B (P2) |
| AC11 | admin UI: required picker for free mechanics only; generate-panel block for unconfigured free offer | Hybrid | `pnpm --filter @jojopotato/admin test` (jsdom offer-form + generate-coupons-panel) — logic; user-run visual walkthrough checklist — visual (precondition: user available) | B (P3, logic) + C (visual → user-run) |
| AC12 | no regression on %/fixed/reward coupons + is_deal guard | Fully-Automated | `pnpm --filter @jojopotato/api test` full suite green (baseline 368 post-P1, 0 regressions) + `pnpm --filter @jojopotato/api typecheck` | A (proven now) |
| AC13 | stale backlog note corrected + D6 usage-limit note filed + finding-3 exclusivity note filed + SPEC annotation | Agent-Probe | UPDATE PROCESS closeout checklist review (process artifact, no runtime behavior) | C (deferred to UPDATE PROCESS) |

gap-resolution legend: A — proven now; B — fixed in this plan (gate added by this plan's checklist); C — deferred to a named later step; D — backlog test-building stub. C-4: `strategy` carries only the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe); Known-Gap is never a strategy here and no money AC uses it.

Legacy line form (retained so existing validate-contract consumers still parse):
- P1 guard (AC1): Fully-automated: `pnpm --filter @jojopotato/api test` (coupons + orders unconfigured-reject cases + no-burn assertion) — PROVEN (P1 landed)
- P1b widened deny (P1b-1..4): Fully-automated: `pnpm --filter @jojopotato/api test` (four-mechanic deny + configured-path lock + fixed_discount exact-cents) — VALIDATED 17-07-26 re-run
- free_item/free_upgrade money math (AC2–AC8): Fully-automated: `pnpm --filter @jojopotato/api test` + `pnpm --filter @jojopotato/utils test` (exact-cents both paths, clamp, symmetry)
- wire freeze + byte-identity (AC9): Fully-automated: `pnpm --filter @jojopotato/api test` + `git diff feat/deals_unification -- packages/utils/src/discount.ts`
- admin server validation (AC10): Fully-automated: `pnpm --filter @jojopotato/api test` (admin-offers + admin-coupon-issuance suites)
- admin UI (AC11): hybrid: `pnpm --filter @jojopotato/admin test` + precondition: user-run visual walkthrough
- regression (AC12): Fully-automated: `pnpm --filter @jojopotato/api test` full green (368 baseline) + `pnpm --filter @jojopotato/api typecheck`
- AC13 backlog corrections: agent-probe: UPDATE PROCESS closeout checklist

Dimension findings:
- Infra fit: PASS — migration slot 0014 correct (journal head idx 13); `0013_snapshot.json` now on disk (commit `ea71c1b`) so `db:generate` expected clean; nullable FK `benefit_product_id → products.id` mirrors the existing `promotion_id → promotions.id` pattern in the same file (lazy callback, no circular-init risk); working tree clean (Fix 3/4/5 all committed) so the anticipated "uncommitted state at EXECUTE entry" concern is MOOT; API 364 / utils 17 baselines re-confirmed green this session. [RE-RUN 17-07-26: journal head 0014 (idx 14) confirmed; API 368/368 + utils 17/17 re-confirmed live this pass.]
- Test coverage: PASS — every money AC (AC1–AC8) mapped to Fully-Automated with exact-cents at BOTH preview and placement; burn/no-burn asserted on every reject path; clamp + multi-line Math.min + one-unit + benefit-unavailable-at-branch (line dropped by buildCartFromItems → not_in_cart, verified by construction) all covered; `packages/utils` gets its first discount unit tests (runner confirmed configured); AC11 correctly Hybrid, AC13 correctly Agent-Probe. Vacuous-green ban does NOT trigger — no developed behavior rests on Known-Gap. [RE-RUN 17-07-26: P1b coverage (P1b-1..4) VALIDATED — four-mechanic deny both paths, configured-state window-hole lock (non-null benefit_product_id fixture), two-line-cart no-leak assertion, fixed_discount exact-cents insurance; every reject asserts coupon status stays 'available' (DB-verified no-burn, established P1 pattern). Known-Gap ban holds.]
- Breaking changes: PASS — public wire shapes frozen (AC9) with a `git diff` byte-identity gate; `EligibilityFailReason` gains `no_upgrade_to_waive` but the two DO-NOT-TOUCH functions never emit it and the mobile twin (`apps/mobile/src/features/deals/lib/eligibility.ts`, confirmed present & separate) has its own local copy; admin API changes are additive-only. [RE-RUN 17-07-26: P1b's b1t1/bundle deny confirmed a money-leak bug-fix, not a wire-shape change; P1b reuses existing reason values (no_eligible_product family), zero packages/utils change. VALIDATED.]
- Security surface: PASS — money-path discount computed server-side from DB-stored `benefit_product_id`, never client-sent; dual-clamp preserved; atomic burn `WHERE status='available'` (double-spend defense) untouched; targeted-coupon ownership check unchanged; the P1 guard CLOSES a live money-leak. HIGH-risk class → risk-evidence-pack required at EXECUTE closure (`mustStopBeforeFinalize: true`). [RE-RUN 17-07-26: P1b closes both residual leaks (b1t1/bundle any-state; CONFIGURED free mechanics) at the server-side resolver; coupon never burned on deny; atomic burn WHERE status='available' untouched. VALIDATED — HIGH-risk pack still owed at EXECUTE closure.]
- P1 feasibility (migration + resolver null-guard): PASS — landed (`35981fa`).
- P1b feasibility (widened two-branch deny-guard): PASS — insertion point confirmed unique in coupon-apply.ts (after checkDealEligibility 242-245 / before the computeDealDiscountCents return 267); two-branch dispatch (b1t1+bundle PERMANENT deny; free_item+free_upgrade UNCONDITIONAL temporary deny, structured for a clean P2 branch-swap per E4) composes without touching the %/fixed fall-through; single-resolver design closes preview AND placement together; deny completeness verified against the full 6-value deal_type enum (4 cheapest-line mechanics denied, %/fixed exact, no other reachable path to a non-zero non-%/fixed discount); no existing-test collision (only pre-existing offer-coupon test is percentage_discount); P2 branch-swap safety pinned — b1t1/bundle deny tests are RETAINED (not deleted) into P2 per Touchpoints/checklist-11, so an accidental P2 removal of the permanent deny fails a live test. Blast radius 3 files (coupon-apply.ts + 2 test suites), packages/api only.
- P2 feasibility (pure fns + dispatch + admin validation): CONCERN — mechanically sound (reward-math reuse verbatim confirmed; free_upgrade computable from cart `optionType`/`priceDeltaCents`, verified present in buildCartFromItems lines 86-88; PATCH merged-state validation correctly mandated since the current handler does NOT load the existing row). Two execute-time notes captured as E1/E2 below (Zod restructure + generate-select widening); both are typecheck-backstopped, neither is a plan defect.
- P3 feasibility (admin UI): PASS — all target files confirmed present (offer-form + generate-coupons-panel + tests + api-lib + hook); P2→P3 accept-window documented as intentional safe-by-rejection (checklist 18); AC11 visual user-run per repo convention.

Execute-Agent Instructions:
- E1 (P2, checklist 12): Do NOT apply `.superRefine()` directly onto `createOfferSchema` if `updateOfferSchema` continues to derive from it via `.partial()` — `.partial()` is a `ZodObject` method and `.superRefine()` returns a `ZodEffects` that lacks it, causing a TS compile break. Restructure: keep a base `z.object({...})` (with the new optional `benefitProductId`), derive `updateOfferSchema = base.partial().refine(...)` from the BASE, and apply the free-mechanic `.superRefine()` cross-validation to a create-only schema (`const createOfferSchema = base.superRefine(...)`). PATCH cross-validation stays in the handler (load existing row → validate merged mechanic⇄benefit state). The P2 `pnpm --filter @jojopotato/api typecheck` gate backstops this.
- E2 (P2, checklist 14): The `POST /api/admin/coupons/generate` handler currently selects only `{ id: offers.id }` (admin/coupons.ts line 58). Widen that select to include `deal_type` and `benefit_product_id` so the new block (`deal_type ∈ free mechanics && benefit_product_id IS NULL → 400`) can read them. Place the AC10 generate-block test in `admin-coupon-issuance.integration.test.ts` (CONFIRMED to exist).
- E3 (EXECUTE closure, HIGH-risk): Produce the 5-artifact `vc-risk-evidence-pack` under `{task-folder}/harness/` (risk-gate.json / context-snippets.json / verification.json / review-decision.json / adversarial-validation.json — money-path is attack-sensitive → adversarial-validation.json required) before treating the work as finalize-ready. `mustStopBeforeFinalize: true`.
- E4 (P1b, supplement): Structure the widened guard as TWO distinct branches — (permanent) b1t1/bundle deny; (temporary) free-mechanic unconditional deny — so P2's checklist 11 replaces ONLY the temporary branch. Add a code comment marking the temporary branch as "P1b interim — replaced by P2 configured-path dispatch".

Open gaps:
- D6 usage-limit enforcement on the coupon path (`usage_limit_per_user` / `total_usage_limit` silently unenforced) — known-gap: documented as NEW PLAN REQUIRED — file backlog note at UPDATE PROCESS (per SPEC §Out Of Scope + AC13). Explicitly out of scope for this fix; does NOT gate this contract (affects all mechanics equally, not just free ones).
- Finding 3 (coupons `reward_id`/`offer_id` mutual-exclusivity DB CHECK) — DESCOPED: backlog note `coupons-reward-offer-mutual-exclusivity-check_NOTE_16-07-26.md` to be filed at UPDATE PROCESS (defense-in-depth, no live write path).
- AC13 stale-backlog-note correction + SPEC out-of-scope annotation — deferred to UPDATE PROCESS (Agent-Probe, process artifact).

What this coverage does NOT prove:
- AC1–AC8 Fully-Automated API/unit gates prove exact-cents money correctness at preview and placement, burn/no-burn, clamp, and symmetry — they do NOT prove the mobile wallet's DISPLAY copy for free benefits (out of scope D9, wire-frozen so unaffected), nor real on-device redemption UX.
- AC9 wire-freeze + byte-identity gate proves response shapes and the two DO-NOT-TOUCH functions are unchanged — it does NOT prove the dormant legacy `dealId` path still behaves (untouched by design, no live caller).
- AC11 jsdom logic gate proves the picker's conditional visibility/required-validation and payload — it does NOT prove pixel-level visual correctness (user-run walkthrough covers that).
- AC12 full-suite-green proves no regression on the EXISTING coupon behaviors exercised by the current suite — it does NOT prove untested legacy surfaces with no coverage today.
- The Fully-Automated gates do NOT prove usage-limit enforcement (D6, descoped), do NOT prove the dual-FK coupon-row path (finding 3, descoped to backlog), and do NOT prove behavior under concurrent redemption of the same code beyond the existing atomic-burn `WHERE status='available'` guard (unchanged this plan).

Gate: PASS (P1b now covered by this 17-07-26 PVL re-run; P1 committed `35981fa` under the prior gate; P2/P3 covered as before via accepted execute-agent instructions E1/E2)
Accepted by: session (VALIDATE PVL re-run, autonomous) — P1b (P1b-1..4) validated against committed source; E1 Zod-restructure and E2 generate-select-widening carried forward as accepted execute-agent instructions (P2, typecheck-backstopped, not plan defects); D6 usage-limit and AC13 note-correction accepted as documented out-of-scope residuals; finding 3 (dual-FK CHECK) descoped to backlog. No money AC (AC1–AC8, P1b-1..4) uses Known-Gap — charter ban holds.

## Autonomous Goal Block

```
SESSION GOAL: Real redemption semantics for free_item / free_upgrade offer coupons (ADM-008 POST-MERGE FIX 6) — P1 landed (35981fa); PVL re-run PASS 17-07-26 (P1b now covered). NEXT: EXECUTE P1b (widened deny-guard: b1t1/bundle permanent deny + free-mechanic unconditional deny + regression locks).
Charter + umbrella plan: N/A — standalone COMPLEX plan (parent_program: adm-008-coupons; self-governing).
Autonomy: money path / HIGH risk (billing-credits analog) — mustStopBeforeFinalize: true. Autopilot may drive P1b→P2→P3 code + tests, but HARD STOP before finalize-ready until the vc-risk-evidence-pack (5 artifacts incl. adversarial-validation.json) is produced and reviewed. Each phase ends at a USER commit checkpoint — never auto-commit; do not start the next phase before the user commits.
Hard stop conditions / safety constraints:
- Never auto-commit — hand staging commands + conventional-commit message per phase; user commits.
- Money ACs (AC1–AC8, P1b-1..4) must be proven by real passing Fully-Automated tests — Known-Gap BANNED.
- Wire freeze: zero shape change to POST /coupons/apply, GET /coupons, GET /deals, GET /deals/:id, POST /orders, AppliedDiscount. computeDealDiscountCents / checkDealEligibility / apps/mobile eligibility twin BYTE-IDENTICAL (git-diff gate).
- Do not touch apps/mobile or the legacy dealId path / is_deal guard. b1t1/bundle get a resolver DENY only — no semantics.
- P1b's free-mechanic deny is TEMPORARY (P2 branch-swap); b1t1/bundle deny is PERMANENT.
- HIGH-risk: produce + review vc-risk-evidence-pack before finalize (mustStopBeforeFinalize).
Next phase: EXECUTE Phase P1b (items P1b-i..vi), stop at commit checkpoint 1b. Branch: feat/deals_unification. Model: opus (execute leg). PVL re-run complete 17-07-26 (Gate: PASS).
Validate contract: inline in this plan (## Validate Contract — Gate: PASS; PVL re-run 17-07-26 covers P1b; supersedes 16-07-26 pre-supplement PASS).
Execute start:
- P1b gates: pnpm --filter @jojopotato/api typecheck && pnpm --filter @jojopotato/api test (368 baseline + new, 0 regressions) && pnpm --filter @jojopotato/utils test (17) && pnpm format:check
- P2 gates: + pnpm --filter @jojopotato/utils typecheck && byte-identity git diff on packages/utils/src/discount.ts
- P3 gates: pnpm --filter @jojopotato/admin typecheck && pnpm --filter @jojopotato/admin test (29 baseline + new) && pnpm --filter @jojopotato/admin build
- Execute-agent instructions E1 (Zod restructure), E2 (widen generate select), E3 (risk-evidence-pack at closure), E4 (P1b two-branch guard structure).
- high-risk pack: yes (required at EXECUTE closure)
```
