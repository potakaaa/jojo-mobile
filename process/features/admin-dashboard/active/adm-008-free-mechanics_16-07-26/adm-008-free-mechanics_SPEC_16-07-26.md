---
name: spec:adm-008-free-mechanics
description: "Product-discovery SPEC for POST-MERGE FIX 6 — real redemption semantics for free_item / free_upgrade offer coupons (money path; Fully-Automated money ACs, Known-Gap banned)"
date: 16-07-26
feature: admin-dashboard
metadata:
  node_type: spec
  type: spec
  feature: admin-dashboard
  parent_program: adm-008-coupons
---

# SPEC — Free-Item / Free-Upgrade Offer Coupons: Real Redemption Semantics (POST-MERGE FIX 6)

## Summary

Today an admin can create an offer with the "Free item" or "Free upgrade" mechanic and issue coupon codes against it — but the system has no real rule for what those coupons are worth. Because no admin screen ever records *which* product the free benefit applies to, a customer redeeming one of these codes today gets **the cheapest item in their entire cart free** — whatever it is — and the coupon burns. That is a live, unscoped mis-discount, not a harmless no-op. This fix gives both mechanics real, precise meaning: the admin names the benefit product when creating the offer, the customer gets exactly that benefit (one designated item free, or one designated item's size-upgrade charge waived), the amount shown at coupon preview always equals the amount charged at order placement, and any old, unconfigured free-mechanic coupon is safely rejected instead of mis-discounting. Because this is a money path, every money-correctness outcome below must be proven by fully automated tests — no manual-only verification is acceptable.

## User Stories / Jobs To Be Done

- **US1 — Admin authors a free-item offer.** As an admin, I want to pick the specific product that will be free when I create a "Free item" offer, so that coupons issued against it discount exactly that product and nothing else.
- **US2 — Admin authors a free-upgrade offer.** As an admin, I want to pick the specific product whose size-upgrade charge is waived when I create a "Free upgrade" offer (e.g. "First app order: free lemonade upgrade"), so that the coupon covers the upgrade cost, not the whole item.
- **US3 — Admin cannot mis-issue.** As an admin, I want the system to stop me from creating a free-mechanic offer without a benefit product, and from generating coupons against an old unconfigured one, so that no code that produces a wrong discount can ever reach a customer.
- **US4 — Customer redeems a free-item coupon.** As a customer, when I apply a free-item coupon and the designated product is in my cart, I want one unit of it free — shown at preview and honored identically at checkout — so I can trust the number I see.
- **US5 — Customer redeems a free-upgrade coupon.** As a customer, when I apply a free-upgrade coupon and my cart contains the designated product with a paid size upgrade, I want that upgrade charge removed for one unit, so the promised benefit is exactly what I get.
- **US6 — Customer is protected from bad codes.** As a customer, if my cart doesn't qualify (designated product missing, or no upgrade to waive) or the code belongs to an unconfigured offer, I want a clear rejection **without my coupon being burned**, so I never lose a code for nothing.

## What The User Wants (Behavioral Outcomes)

- Creating an offer with mechanic "Free item" or "Free upgrade" **requires choosing one benefit product** from the catalog. The other four mechanics are unaffected.
- A **free-item coupon** takes the price of **one unit** of the designated product off the order total, when that product is in the cart. If it isn't, the coupon is rejected with a clear reason and stays usable.
- A **free-upgrade coupon** removes the **size-upgrade charge for one unit** of the designated product, when that product is in the cart with a paid size upgrade selected. If the product is missing, or present with no paid size upgrade, the coupon is rejected with a clear reason and stays usable.
- The discount amount shown when the customer **previews** the coupon in the cart is always exactly the amount applied when the **order is placed**. The coupon burns only on successful placement.
- A discount can never exceed the order subtotal and can never be negative.
- Coupons issued against a free-mechanic offer that has **no benefit product configured** (all such offers created before this fix) are **rejected at both preview and placement** — the current cheapest-line-free mis-discount stops immediately.
- The coupon-generation screen refuses to issue new codes against an unconfigured free-mechanic offer and tells the admin why.
- Nothing changes for percentage/fixed-discount coupons, reward coupons, bundle deal-products, or any public API response shape.

## Key Requirement Decisions (recommended — please confirm or adjust)

The 9 open design questions from RESEARCH, each resolved to a recommended requirement. These recommendations are what the rest of this SPEC assumes.

| # | Question | Recommended decision | Why |
|---|---|---|---|
| D1 | What does **free_item** mean? | **Designated-product-free** (reward-coupon style): one unit of the admin-chosen benefit product is free. | Exact precedent already exists and is battle-tested (`rewards.eligible_product_id` + its discount math + `not_in_cart` handling). Cheapest-eligible-line is the current bug, not a semantic; server-injected free lines have no cart-model precedent. |
| D2 | What does **free_upgrade** mean? | **Waive the size-option upgrade charge for one unit of the designated product.** | Matches the PRD's only hint ("free lemonade upgrade" — pay small-size price, get the upgrade); the cart already carries per-line size-option price deltas, so it's computable today with no cart-model change. |
| D3 | Where is the benefit target stored? | **New nullable `offers.benefit_product_id` column** (this batch's first migration). | Mirrors the rewards precedent; keeps `offer_products` meaning what it already means (eligibility: "cart must contain one of these"). Overloading it would silently change existing offers' behavior. |
| D4 | Ship an interim guard? | **Yes — Phase 1 of this same fix**: reject any free-mechanic offer coupon whose offer has no benefit product, at preview AND placement. | Stops the live cheapest-line mis-discount immediately, before the full semantics land, and remains the permanent safety net for legacy unconfigured offers. |
| D5 | Preview/placement symmetry | **Enforce everything inside the single shared resolver** (`resolveCouponDiscount`), which both paths already call. Leave the mobile-client legacy-deal guard untouched. | Symmetry by construction — one code path can't disagree with itself. |
| D6 | Silent usage-limit gap | **Out of scope — split to its own backlog note.** | It affects all coupon mechanics equally, not just free ones; bundling it here widens a money-path change unnecessarily. |
| D7 | Multi-quantity behavior | **One free unit (or one waived upgrade) per redemption**, regardless of line quantity. The minimum-order-amount check stays against the undiscounted cart subtotal (current behavior, unchanged). | Simplest defensible rule; matches how the reward-coupon precedent prices one unit. |
| D8 | Admin UI placement | **Benefit-product picker in the offer create form** (shown and required only for the two free mechanics) and editable on the offer detail screen; the Generate-Coupons panel **blocks** generation for unconfigured free-mechanic offers with an explanatory message. | Prevents bad offers at the source; the panel block covers pre-existing offers. |
| D9 | Mobile wallet display copy | **Out of scope — flagged follow-up only.** | apps/mobile changes are outside the ADM-008 charter; wire shapes are frozen, so the wallet keeps working as-is. |

## Flow / State Diagram

Customer redemption (same resolver runs at preview and placement):

```
Customer enters coupon code (cart preview)  --or--  places order with code
                      |
                      v
        +-----------------------------+
        | resolveCouponDiscount()     |
        | (single shared resolver)    |
        +-----------------------------+
                      |
        offer mechanic = free_item / free_upgrade?
                      |
        +------no-----+------yes------------------------+
        |                                               |
   existing %/fixed                        benefit product configured?
   behavior (unchanged)                                 |
                                        +------no-------+------yes-------+
                                        |                                |
                                REJECT: offer not          designated product in cart?
                                configured                               |
                                (coupon NOT burned)       +-----no------+------yes------+
                                                          |                             |
                                                   REJECT: not in cart      free_item:  discount =
                                                   (coupon NOT burned)      one unit's price
                                                                                         |
                                                                             free_upgrade: paid size
                                                                             upgrade on that line?
                                                                              |            |
                                                                             no           yes
                                                                              |            |
                                                                        REJECT: no    discount = one
                                                                        upgrade to    unit's size-
                                                                        waive (NOT    upgrade charge
                                                                        burned)            |
                                                                                           v
                                                                        clamp: 0 <= discount <= subtotal
                                                                                           |
                                                              preview: show amount   placement: apply same
                                                              (no burn)              amount + burn coupon
                                                                                     atomically
```

Admin authoring:

```
Create offer -> mechanic = free_item/free_upgrade? --yes--> benefit product REQUIRED
                                                            (form + server both enforce)
             -> other mechanic ---------------------------> unchanged

Generate coupons -> offer is free-mechanic AND unconfigured? --yes--> BLOCKED with message
                                                              --no---> issue codes (unchanged)
```

## Acceptance Criteria (Testable Outcomes)

Money-correctness criteria (AC1–AC8) are **Fully-Automated, Known-Gap banned**, per the ADM-008 program charter. All exact-amount assertions are in cents. Test scenarios are grounded in the existing landscape: `packages/api` integration suites (`coupons.integration.test.ts`, `orders.test.ts`, `admin-offers.integration.test.ts` patterns), a new pure-unit suite for `packages/utils` discount math (runner already configured, zero tests today), and `apps/admin` jsdom component tests.

**AC1 — Unconfigured free-mechanic coupons are rejected everywhere (interim guard).**
Applying or placing an order with a coupon whose offer mechanic is free_item/free_upgrade and has no benefit product returns a clear rejection; no discount is applied, the coupon is not burned, and the cheapest-line mis-discount can no longer occur.
proven by: API integration — apply-path reject + placement-path reject + coupon-still-unused assertions (coupons/orders suites). strategy: Fully-Automated.

**AC2 — free_item exact amount at preview.**
With the designated product in the cart, previewing the coupon returns a discount exactly equal to one unit's price of that product (exact-cents assertion), regardless of other cart contents.
proven by: API integration — apply-path exact-amount scenario. strategy: Fully-Automated.

**AC3 — free_item exact amount + burn at placement.**
Placing the order applies the identical exact-cents discount to the stored order total and burns the coupon atomically; re-use of the burned code is rejected.
proven by: API integration — placement exact-amount + burn + re-use-reject scenario (orders suite). strategy: Fully-Automated.

**AC4 — free_item designated product not in cart.**
Preview and placement both reject with a not-in-cart reason; no discount, coupon not burned.
proven by: API integration — not-in-cart reject scenario on both paths. strategy: Fully-Automated.

**AC5 — free_upgrade exact amount.**
With the designated product in the cart carrying a paid size upgrade, preview and placement both apply a discount exactly equal to one unit's size-upgrade charge (exact-cents, both paths asserted).
proven by: API integration — upgrade exact-amount scenario on apply + placement. strategy: Fully-Automated.

**AC6 — free_upgrade with nothing to waive.**
If the designated product is absent, or present with no paid size upgrade selected, preview and placement both reject with a clear reason; no ₱0 discount is silently applied and the coupon is not burned.
proven by: API integration — no-upgrade reject scenarios (product absent / product present without paid size upgrade). strategy: Fully-Automated.

**AC7 — Clamp invariant.**
No free-mechanic redemption ever produces a discount below zero or above the order subtotal (including a designated product priced above the rest of the cart).
proven by: pure-unit suite for the discount math in packages/utils (new vitest cases) + one API integration clamp scenario. strategy: Fully-Automated.

**AC8 — Preview/placement symmetry.**
For any given code + cart, the discount amount returned at preview equals the amount applied at placement — enforced by both computations running through the one shared resolver, and asserted end-to-end.
proven by: API integration — same-fixture apply-then-place equality assertion. strategy: Fully-Automated.

**AC9 — Wire freeze holds.**
`POST /coupons/apply`, `GET /coupons`, `GET /deals`, and `POST /orders` response shapes are unchanged; the `AppliedDiscount {source, refId, label, amountCents}` cross-app contract is untouched.
proven by: existing wire-freeze shape assertions (AC10b pattern from ADM-008 P4) extended to the new scenarios. strategy: Fully-Automated.

**AC10 — Admin create/update validation.**
Creating or updating an offer with a free mechanic and no benefit product is rejected by the server; supplying a benefit product succeeds and reads back correctly; non-free mechanics are unaffected.
proven by: admin-offers API integration scenarios. strategy: Fully-Automated.

**AC11 — Admin UI: benefit picker + generation block.**
The offer create form shows a required benefit-product picker only for the two free mechanics; the Generate-Coupons panel refuses to issue codes for an unconfigured free-mechanic offer and explains why. Component behavior is automated; the visual walkthrough is user-run.
proven by: apps/admin jsdom component tests (form + generate-coupons-panel) for logic; user walkthrough checklist for the visual pass. strategy: Hybrid.

**AC12 — No regressions on existing coupon behavior.**
Percentage/fixed-discount coupons, reward coupons, and the `is_deal`×couponCode guard all behave exactly as before.
proven by: full existing API suite green (354 tests at baseline) plus the existing coupons/orders scenarios re-run. strategy: Fully-Automated.

**AC13 — Stale backlog note corrected.**
`backlog/adm-008-free-item-free-upgrade-redemption_NOTE_16-07-26.md` (which wrongly claims the mechanics "silently return ₱0") is amended at UPDATE PROCESS to record the true pre-fix behavior (live cheapest-line mis-discount) and this fix's resolution; the descoped usage-limit gap (D6) gets its own new backlog note.
proven by: UPDATE PROCESS closeout checklist review. strategy: Agent-Probe (process artifact, no runtime behavior).

## Out Of Scope

> **CORRECTION (added 17-07-26, UPDATE PROCESS, SPEC frozen — annotation only, no line below is edited):** the
> "remain non-discounting... exactly as today" claim below was factually WRONG at the time this SPEC was
> written. `computeDealDiscountCents()` routed `buy_one_take_one`/`bundle` (along with `free_item`/
> `free_upgrade`) through the same cheapest-eligible-line branch — a b1t1/bundle offer coupon DID
> mis-discount the cheapest cart line and DID burn, pre-fix. This was found by a post-P1 adversarial
> review (finding 1) and closed by Phase P1b (commit `66cbb0e`), which added a PERMANENT resolver
> deny for both mechanics on the coupon path — they now correctly never discount via coupons, making
> the SPEC's *intent* true, just not for the reason originally stated ("exactly as today" implied no
> live bug existed; one did). See the PLAN file's §Post-P1 Review Findings & Dispositions and
> §Execution Deviations for the full record.

- **Mobile app changes of any kind** (ADM-008 charter): no wallet display copy for free benefits, no cart UI changes, no update to the mobile eligibility-engine twin. Display implications are flagged as a follow-up only (D9).
- **buy_one_take_one / bundle mechanics** — remain non-discounting and outside the offer-coupon path, exactly as today.
- **Usage-limit enforcement on the coupon path** (`usage_limit_per_user` / `total_usage_limit` silently unenforced) — real adjacent gap, deliberately split to its own backlog note (D6).
- **The dormant legacy `dealId` order path** and its historical 400-guard — untouched.
- **Multi-benefit offers** (more than one free product, tiered upgrades) — one benefit product per offer in this fix.
- **Extending the coupon-preview payload with richer cart-line context** — unchanged from the ADM-008 charter's exclusion.

## Constraints

- **Money-path proof standard:** every money-correctness AC (AC1–AC8) must be proven by real, passing Fully-Automated tests. Known-Gap classification is banned for these, per the ADM-008 program charter. Vacuous-green is banned.
- **Wire freeze (ADM-008 LD7B):** no response-shape change on `GET /deals`, `GET /coupons`, `POST /coupons/apply`, `POST /orders`; `AppliedDiscount` is the frozen cross-app contract.
- **Single-resolver enforcement:** all new semantics and guards live where both preview and placement already converge; no path-specific duplication.
- **Money is cents everywhere** (repo-wide convention).
- **Schema change is additive:** one new nullable column (D3), the first migration of this batch — next slot after `0013`. Note the known drizzle gap: the `0013` snapshot is missing, so the next `drizzle-kit generate` may show a spurious diff that must not be folded into this migration.
- **Legacy safety:** offers created before this fix (benefit product null) must be handled by rejection (AC1), never by guessing a benefit.
- **Eligibility-engine twin:** the server's 6-step eligibility engine has a verbatim mobile copy; this fix must not change shared eligibility steps in a way that silently diverges the twin (benefit computation is server-side only and is the intended place for the new logic).
- **Admin mechanic dropdown:** the two free mechanics stay selectable (they become real); the `ab53caf` restriction to coupon-capable mechanics stands otherwise.

## Open Questions

None — all 9 design questions are resolved as recommended decisions in §Key Requirement Decisions for your review at the phase gate. Rejecting any recommendation there (especially D1/D2 semantics or D3 storage) re-opens this SPEC before INNOVATE.

## Background / Research Findings

Key code-verified facts from the RESEARCH pass (16-07-26) that shaped these requirements:

- **The real current bug (correction to the stale backlog note):** `computeDealDiscountCents()` routes free_item/free_upgrade to a "cheapest eligible line free" computation, and because no admin route ever writes `offer_products` rows, "eligible" degrades to **the whole cart** — so a free-mechanic coupon today makes the cheapest line in the entire cart free at both preview and placement, and burns. The backlog note's claim of a silent ₱0 no-op is wrong; AC13 mandates its correction.
- **Symmetry affordance:** preview (`POST /coupons/apply`) and placement (`POST /orders`) both call the single resolver `resolveCouponDiscount()` — enforcement placed there is symmetric by construction (basis of D5, AC8).
- **Reward-coupon precedent:** "one designated product free" already exists end-to-end for reward coupons (`rewards.eligible_product_id`, cheapest-matching-line unit price, `not_in_cart` / `no_eligible_product` failure reasons, enforced on both paths) — the direct template for D1/D3.
- **Upgrade data is available:** the resolver's cart lines carry `selectedOptions` with `optionType` (`size`/`flavor`/`add_on`) and `priceDeltaCents` — free_upgrade (D2) is computable from existing cart data.
- **No benefit-target storage exists:** `offers` has no benefit column and `offer_products` is semantically occupied by eligibility — hence the new column (D3) and this batch's first migration.
- **Guard landscape:** the only historical rejects for these mechanics live on the dormant legacy `dealId` path and a mobile-client-only check; the live offer-coupon path has none. Commit `ab53caf` narrowed the new-offer dropdown but free_item/free_upgrade remain selectable, and admin Zod accepts all 6 mechanics with no per-mechanic cross-validation.
- **PRD intent hints:** "Free upgrade" is a named MVP deal type with the example "First app order: Free lemonade upgrade"; "free item" copy elsewhere is rewards-flavored (one designated product free). No authoritative definition exists — hence D1/D2 are presented as decisions, not restatements.
- **Adjacent gap found (descoped):** offer `usage_limit_per_user`/`total_usage_limit` are silently unenforced on the coupon path (resolver passes empty usage) — split out per D6.
- **Test landscape:** `packages/utils` has a vitest runner with zero tests for the discount math (pure-unit suite slots there); mature API integration patterns exist in the coupons (13), orders (34), and admin-offers (13) suites; apps/admin has jsdom tests for the offer form and generate-coupons panel. All AC `proven by:` scenarios above are placed into these existing surfaces.
- **User intent captured:** the user was offered a pre-SPEC hotfix for the live mis-discount and chose to proceed to SPEC instead — the interim guard is therefore folded in as Phase 1 of this fix (D4), not shipped separately.
