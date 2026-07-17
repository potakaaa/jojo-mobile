## Summary

Right now a customer can redeem exactly two kinds of discount codes: a small hand-coded list of
promo codes baked into the app's source code (`WELCOME20`, `BGC50`, etc. — nobody can add or
change these without a code deploy), and reward coupons earned automatically through Jojo Stars.
There is no way for staff to run a real promotion — e.g. "Grand Opening Week: generate 200 unique
20%-off codes and hand them out at the counter." ADM-008 gives admins a screen to define a
**Promotion** (the marketing event), attach an **Offer** (what the coupon actually grants — % off,
₱ off, etc.), and generate real, database-backed, collision-free coupon codes for it — either in
bulk or one at a time for a specific customer. It also finishes wiring the redemption path so those
admin-issued codes actually work at checkout exactly like today's reward coupons do (validate,
apply, and get marked "used" — never reusable, never double-counted).

## User Stories / Jobs To Be Done

- As an **admin**, I want to create a Promotion (name, description, date window) so I have a
  container to report on and generate coupons under.
- As an **admin**, I want to create an Offer (the actual discount mechanic — percentage off, fixed
  ₱ off, free item, free upgrade, or bundle — with an optional minimum order amount, usage caps,
  and an active window) so I can define what a coupon is worth, independent of which promotion (if
  any) it's tied to.
- As an **admin**, I want to generate a batch of N unique coupon codes for an Offer/Promotion (e.g.
  "print 500 codes for our anniversary sale") so I can distribute them at events, in receipts, or
  through marketing without any risk of duplicate or colliding codes.
- As an **admin**, I want to issue a single coupon code to one specific customer (e.g. a customer
  service make-good, or a VIP invite) without having to generate a whole batch.
- As a **customer**, I want to type an admin-issued coupon code at checkout and have it apply the
  right discount, the same way today's app-generated reward coupons and hardcoded promo codes work.
- As a **customer**, I want a promo/offer coupon to be rejected if it's expired, already used, or
  the order doesn't meet the minimum — with a clear reason, not a silent failure.
- As the **business**, I want it to be structurally impossible to redeem a coupon on a cart that
  contains one of the new bundle-style "Deal" products (ADM-004's `is_deal` products) — the two
  discount mechanisms must never stack or conflict.

## What The User Wants (Behavioral Outcomes)

- Admin sees a new "Promotions" area and a new "Offers" area in the dashboard (renamed from what
  used to be a single "Deals" concept internally) — separate from the existing "Deals" product
  catalog area (bundle-style products), which is untouched and keeps its own name.
- Creating a Promotion is just naming an event with a date range and description — no discount
  logic lives here.
- Creating an Offer is defining the discount mechanic (type, value, minimum order, usage limits,
  active window) and, optionally, linking it to a Promotion for reporting/grouping.
- From an Offer (or a Promotion), the admin can trigger "Generate Coupons" — pick a quantity,
  optionally an expiry date, optionally a specific customer (for a single targeted code) — and get
  back real, ready-to-redeem codes. Bulk-generated codes are visible in a list (exportable /
  copyable), each with its own status (available/used/expired).
- A customer entering one of these codes at checkout sees it validate and apply exactly like coupon
  redemption works today (same preview-then-consume behavior, same error messages for
  expired/used/ineligible) — the customer-facing mechanics do not change, only the source of the
  codes does (admin-authored + DB-backed, instead of hardcoded in app source).
- A cart containing a bundle-style Deal product (`is_deal = true`) cannot also redeem a coupon —
  the customer sees a clear rejection, not a stacked or silently-ignored discount.
- Reward coupons (earned via Jojo Stars) keep working exactly as they do today — nothing about that
  path changes.

## Flow / State Diagram

**Admin authoring flow:**

```
Admin Dashboard
   |
   v
[Promotions list] --create--> [New Promotion: name, description, window]
   |                                          |
   |                                          v
   |                                   [Promotion detail]
   |                                          |
   v                                          | attach
[Offers list] --create--> [New Offer: type, value, min order, usage caps, window]
   |                                          |
   +------------------------<-----------------+  (optional link)
   |
   v
[Offer detail] --"Generate Coupons"--> [Bulk N codes]  or  [Single code -> one user]
   |
   v
[Coupon list for this Offer: code, status, user (if targeted), expires_at]
```

**Customer redemption flow (existing mechanism — reconciled, not rebuilt):**

```
Customer enters code at checkout
   |
   v
POST /coupons/apply (preview only, no write)
   |
   +--code matches a reward-coupon row (user's own)?--> validate --> discount preview
   |
   +--code matches an admin-issued Offer-coupon row?--> validate --> discount preview   [NEW resolution branch]
   |
   +--no match--> "Coupon code not found"
   |
   v
Customer places order (POST /orders)
   |
   +--cart contains an is_deal product?--> 400 reject, coupon not applied              [NEW guard]
   |
   +--else: re-validate server-side inside the placement transaction
            --> compute discount --> mark coupon row status='used' (atomic with order write)
```

**Offer/Promotion/Coupon relationship (schema shape, described — not implementation):**

```
Promotion (event)  1 --- 0..N  Offer (benefit)
Offer (benefit)    1 --- 0..N  Coupon (issued code)
Reward (stars)     1 --- 0..N  Coupon (issued code)   [existing, unchanged]

A Coupon points at EITHER an Offer OR a Reward, never both, never neither.
```

## Acceptance Criteria (Testable Outcomes)

1. **Admin can create a Promotion** with a name, description, and start/end window.
   `proven by:` new admin-promotions integration test — create + list + get.
   `strategy:` Fully-Automated. **NEW-in-ADM-008.**

2. **Admin can create an Offer** with a discount mechanic (percentage/fixed/BOGO/free-item/
   free-upgrade/bundle), value, minimum order amount, optional usage caps, active window, and an
   optional link to a Promotion.
   `proven by:` new admin-offers integration test — create with and without a promotion link.
   `strategy:` Fully-Automated. **NEW-in-ADM-008 (this is the renamed/split legacy `deals` table).**

3. **Admin can bulk-generate N coupon codes for an Offer, and all N codes are distinct** (zero
   collisions even under a forced first-attempt collision, mirroring the existing reward-coupon
   generator's retry guarantee).
   `proven by:` new admin-coupon-issuance integration test — generate N=50, assert 50 unique rows;
   a forced-collision unit test on the code generator retry path.
   `strategy:` Fully-Automated. **NEW-in-ADM-008.**

4. **Admin can issue a single targeted coupon code to one named customer** (not a bulk batch).
   `proven by:` new admin-coupon-issuance integration test — targeted single-issue, `user_id` set
   on the resulting row.
   `strategy:` Fully-Automated. **NEW-in-ADM-008.**

5. **A customer redeeming a valid admin-issued coupon code gets the Offer's discount applied at
   checkout, and the code is marked used exactly once** (same abandon-doesn't-burn preview
   guarantee as today's reward-coupon path — `POST /coupons/apply` performs zero writes; the burn
   happens only inside `POST /orders`'s placement transaction).
   `proven by:` existing `coupons.integration.test.ts` pattern extended with an Offer-coupon case
   (apply preview + order placement + re-apply-after-use rejection).
   `strategy:` Fully-Automated. **NEW resolution branch in ADM-008; the apply/consume MECHANISM
   (preview-then-burn, atomic transaction) is EXISTING-on-development, reused as-is.**

6. **A cart containing an `is_deal` product rejects coupon application** (400, clear reason) —
   the two discount mechanisms never stack.
   `proven by:` new integration test on `POST /orders` — cart with an `is_deal` line item +
   `couponCode` set → 400.
   `strategy:` Fully-Automated. **NEW-in-ADM-008 — explicitly POST-MERGE dependent; see Open
   Questions / Constraints — `products.is_deal` does not exist on `development` until the ADM-004
   PR merges.**

7. **An expired, already-used, or out-of-window coupon code is rejected with the correct reason**
   (`expired` / `already_used` / `not_in_window`, not a generic error).
   `proven by:` existing `coupons.integration.test.ts` reason-code assertions, extended to cover
   Offer-coupons alongside reward-coupons.
   `strategy:` Fully-Automated. **EXISTING-on-development (reason-code contract already built for
   reward coupons); NEW-in-ADM-008 only in that Offer-coupons must hit the same reason-code paths.**

8. **A reward-backed coupon (earned via Jojo Stars) continues to redeem through the exact same
   endpoint and continues to pass its existing test suite unmodified** — no regression.
   `proven by:` existing `coupons.integration.test.ts` full suite re-run as a regression gate.
   `strategy:` Fully-Automated. **EXISTING-on-development, regression-only for ADM-008.**

9. **All Promotion/Offer/coupon-issuance admin actions require admin auth** — an unauthenticated or
   non-admin request gets 403, mirroring every other `/api/admin/*` route in this program.
   `proven by:` new admin-promotions/admin-offers/admin-coupon-issuance integration tests — no-auth
   and wrong-role cases, following the established `makeUser(role)` fixture pattern.
   `strategy:` Fully-Automated. **NEW-in-ADM-008 (pattern reused from every prior admin-CRUD
   phase).**

10. **Renaming `deals` → `offers` (+ new `promotions` table) does not break the legacy public
    `GET /deals` / `GET /deals/:id` mobile-facing read routes** during the interim period before the
    mobile Deals tab is repointed — either those routes are updated to read from the renamed table,
    or the SPEC's Open Questions/Constraints explicitly flag the sequencing risk for INNOVATE/PLAN
    to resolve.
    `proven by:` existing `deals.test.ts`-equivalent regression suite, re-run after the rename.
    `strategy:` Fully-Automated. **NEW-in-ADM-008 (the rename is new); the coupling risk itself is
    called out under Open Questions, not silently absorbed.**

11. **A malformed or empty coupon-generation request (e.g. quantity ≤ 0, no offer_id) is rejected
    with a 400/422 before any DB write** — no partial batch, no zero-quantity no-op treated as
    success.
    `proven by:` new admin-coupon-issuance integration test — invalid payload cases.
    `strategy:` Fully-Automated. **NEW-in-ADM-008.**

## Out Of Scope

- **Rebuilding redemption, code-generation collision-safety, or the mobile Coupon Wallet UI** —
  these already exist and work on `development` (STAR-003/STAR-004). ADM-008 only adds the
  admin-authoring surface and reconciles the schema rename; it does not touch
  `apps/mobile/src/app/(tabs)/rewards/coupons.tsx`, `use-my-coupons.ts`, or `coupon-api.ts`.
- **Live payment processing** or anything about how a discounted order is paid for — unchanged.
- **Mobile Deals tab repoint** to the new `products.is_deal` catalog — tracked separately by
  `deals-mobile-repoint_HANDOFF_15-07-26.md`; ADM-008 does not depend on that handoff completing,
  but does depend on the underlying rename not breaking the routes that handoff still reads from
  in the interim (see AC10).
- **A new admin "Analytics/reporting" view of promotion performance** — Promotions exist as a
  grouping/reporting anchor per the issue, but a dedicated analytics screen is Phase 7 (ADM-007)
  territory, not this spec.
- **Changing the reward-coupon (Jojo Stars) generation or redemption mechanism** — untouched,
  regression-tested only.
- **Star/points accrual changes, notification delivery of new codes (SMS/email/push)** — out of
  scope; codes are generated and viewable in the admin dashboard only, distribution is manual
  (staff hands out the codes) for this phase.
- **A public/customer-facing "browse promotions" screen** beyond entering a code at checkout —
  no promotions marketing page is being built here.
- **`deal_components` / `products.is_deal` product-bundle "Deals" feature** — that is a separate,
  already-shipped feature (ADM-004) and keeps its existing name and behavior unchanged; ADM-008
  only guards against the two systems stacking (AC6), it does not modify the bundle-Deals CRUD.

## Constraints

- **Execute-after-merge (hard sequencing constraint):** ADM-008 implementation does not start until
  the `feat/adm-004-deals` PR merges into `development`. The build branch (`feat/adm-008-coupons`)
  branches off the MERGED `development`, which will then carry BOTH `development`'s existing
  coupon backend (STAR-003/STAR-004: `coupons` table, `routes/coupons.ts`, `coupon-apply.ts`,
  static `DEAL_CATALOG`) AND ADM-004's `products.is_deal` + `deal_components`. This SPEC is
  design-only for that reason — no code is written in this phase.
- **AC6 (is_deal mutual exclusion) is un-buildable until post-merge** — the `is_deal` column is
  introduced by ADM-004's migration `0007_fearless_crystal.sql`, which does not exist on
  `development` today. Flag this explicitly as a post-merge dependency, not a gap in this spec.
- **Money is integer cents at every API boundary.** Percentage discount values follow the existing
  VALUE-UNIT NOTE convention in `packages/types/src/deals.ts` (a percentage is stored/serialized as
  a plain 0–100 number, NOT multiplied by 100) — this convention carries over unchanged to the
  renamed `offers` table.
- **Reward-backed coupon parity is mandatory, not best-effort.** The rename and any redemption
  changes must not alter `coupons.reward_id`-based resolution, the `coupons_user_reward_unique`
  partial index behavior, or any existing STAR-003/STAR-004 test outcome. This is a hard
  regression bar (AC8), not a nice-to-have.
- **The rename targets the LEGACY discount `deals` table only.** `products.is_deal` +
  `deal_components` (the bundle-style "Deals" product feature, shipped in ADM-004) keeps its name
  and is explicitly untouched by this rename — this is a naming collision risk that INNOVATE/PLAN
  must design around (e.g. avoid a second admin nav item literally labeled "Deals").
  `packages/api/src/routes/admin/deals.ts` (the bundle-Deal CRUD) is not renamed or touched.
- **Follow the established admin-CRUD pattern** (append-only `routes/admin/index.ts` aggregator;
  shared `handleAdminError`/`isUniqueViolation`; `centsToNumeric` serializer; `apps/admin` shared
  composites — data-table/form-dialog/confirm-dialog/query-states/page-header; a new
  `nav-config.ts` entry) — stated here as a constraint on the eventual build, not as an
  implementation choice being made by this SPEC.
- **All admin actions require `requireAdmin`** (`admin`/`super_admin` roles only), consistent with
  every other `/api/admin/*` surface in this program.

## Open Questions

- **Rename sequencing vs. the dormant public `GET /deals` routes and the mobile handoff coupling**
  (owner: INNOVATE). The legacy `deals` table backs both the admin discount-CRUD (now being
  renamed/split) AND the still-live public `GET /deals`/`GET /deals/:id` routes that the mobile
  Deals tab keeps reading from in the interim (per `deals-mobile-repoint_HANDOFF_15-07-26.md` and
  the all-context "Deferred Hardening" note). INNOVATE must decide: repoint those read routes to
  the new `offers` table at rename time, or leave a compatibility view/alias until the mobile
  handoff lands. This SPEC does not choose — it only requires AC10 to prove whichever choice is
  made doesn't break the mobile-facing reads.
- **Malformed coupon-generation payload status code (400 vs 422)** (owner: PLAN). The existing
  codebase convention leans 400 (per the ADM-004 UPDATE PROCESS note on the same open question for
  `components[]`); ADM-008 should follow the same convention for consistency but PLAN should
  confirm rather than silently pick.
- **Whether "Generate Coupons" needs an expiry-date field on the batch, or inherits the Offer's
  own active-window `end_at`** (owner: INNOVATE). The issue text doesn't specify; a sane default
  (inherit the Offer's window unless overridden) is proposed but not locked.

_All three questions above are non-blocking for SPEC sign-off — they are architecture/design
decisions properly owned by INNOVATE/PLAN, not gaps in the requirements themselves. No item is
being deferred to backlog; they are handed downstream as intended._

## Background / Research Findings

**What already exists and works, verified by reading `origin/development` directly (not assumed):**

- `packages/api/src/routes/coupons.ts` — `POST /coupons/apply` (validate + compute, zero DB
  writes — the "abandon doesn't burn" guarantee) and `GET /coupons` (session-scoped wallet list).
  Session-gated once at mount.
- `packages/api/src/routes/lib/coupon-apply.ts` — `resolveCouponDiscount()` is the SINGLE shared
  resolution path used by both the preview endpoint and the real `POST /orders` placement
  recompute (defense in depth: the discount is never trusted from the client's preview). It tries,
  in order: (1) a `coupons` row owned by the requesting user (reward-coupons — real DB rows,
  `reward_id` set), then (2) a code match against a **hardcoded static list**,
  `packages/utils/src/deals-catalog.ts`'s `DEAL_CATALOG` (5–6 fixed promo codes like `WELCOME20`,
  `BGC50`, compiled into app source, not database rows).
- **Load-bearing finding — the "redemption engine" is NOT fully DB-backed today.** The
  `deals-catalog.ts` file's own doc comment states outright: *"Deals are NOT DB-backed this round
  (the `deals`/`deal_products`/`deal_branches` tables exist but are intentionally NOT wired)."*
  Reward coupons ARE real, burnable DB rows (`coupons.status` flips `available → used` inside the
  `POST /orders` transaction). Deal/promo codes today are NOT real rows — they can never be marked
  used, tracked per-user, or authored by an admin. **This is the actual gap ADM-008 closes**:
  admin-issued Offer coupons must become real `coupons` table rows (parallel to how reward coupons
  already work), not a third hardcoded list. The issue's framing ("reuse the dormant `orders.ts`
  deal-apply as starting point") is consistent with this — the mechanism to reuse is the
  reward-coupon DB-row pattern, not the static catalog.
- `packages/api/src/lib/reward-coupon-code.ts` — collision-safe code generator (`JP-RWD-XXXX`,
  Crockford-32 alphabet, `crypto.randomInt`, unique-constraint + bounded retry loop). Directly
  reusable/extendable pattern for admin-issued bulk codes (issue explicitly calls for "unique
  collision-safe codes... DB unique index" — this generator already proves the pattern).
  `rewardCouponCodeGenerator.generate` is an injected seam already built for testing the retry
  path under forced collisions — the same seam shape should carry over.
- `packages/types/src/coupons.ts` — `DbCoupon` / `CouponWithReward` are the real, current types
  (NOT the stub types present on our branch). `dealId` will need to become `offerId` (or an
  equivalent rename) as part of AC2's schema split.
- `packages/api/src/db/schema/coupons.ts` (development) — `coupons_user_reward_unique` partial
  unique index (`user_id, reward_id` where `reward_id IS NOT NULL`) enforces "at most one coupon
  per (user, reward)" for reward coupons only — deal/offer coupons are explicitly NOT covered by
  this constraint (NULLs are distinct in Postgres), so nothing here blocks issuing many coupons
  for the same offer.
- `packages/api/src/routes/orders.ts` (development) — inside the placement transaction: resolves
  `couponCode` via `resolveCouponDiscount`, computes `couponDiscountCents`, clamps
  `discountTotalCents = min(dealDiscount + couponDiscount, subtotal)`, writes `coupon_id` on the
  order, and — AFTER the order row exists — does
  `UPDATE coupons SET status='used' WHERE id=... AND status='available'` (atomic burn, guards a
  race). A `dealId` and a `couponCode` cannot both be present on one order request (400 if both
  set) — this "only one discount source" rule is the existing model AC6's new `is_deal` guard must
  extend, not replace.
- **Our current branch (`feat/adm-004-deals`) already anticipates this work.** Its own
  `orders.ts` comment reads: *"...`deals`/`orders.deal_id` mechanism, which is now DORMANT...
  Left in place UNTOUCHED for ADM-008 (coupon...)"* — confirming the dormant discount-`deals` path
  was deliberately preserved, not deleted, specifically for this phase to repurpose.
- **Schema drift note:** our branch already carries a `coupons.ts` schema (from an earlier partial
  merge) but it is missing the `coupons_user_reward_unique` partial index and has no
  `routes/coupons.ts` at all — confirming STAR-004's route layer has not landed on our branch yet.
  Post-ADM-004-merge, `development`'s full STAR-003/STAR-004 coupon backend becomes the real base
  ADM-008 builds on.
- **PRD alignment:** issue #86 cites PRD §6.9 Coupon Wallet and §6.10 Jojo Stars — both already
  have real, shipped mobile UI (`coupons.tsx`, `use-my-coupons.ts`) on `development`; ADM-008 is
  purely the admin-authoring + schema-correctness half of an already-partially-built feature, not a
  greenfield build.
- **Established admin-CRUD conventions** (from ADM-001 through ADM-004a, all delivered and
  EVL-verified on this branch): append-only `/api/admin` aggregator; `requireAdmin` inherited at
  router-mount; `handleAdminError`/`isUniqueViolation` shared error helpers; `centsToNumeric`
  boundary serializer; `apps/admin` shared composites (`data-table`, `form-dialog`,
  `confirm-dialog`, `query-states`, `page-header`); `makeUser(role)` self-seeding integration-test
  fixture pattern used across every admin CRUD suite so far (branches, products/categories, deals).
