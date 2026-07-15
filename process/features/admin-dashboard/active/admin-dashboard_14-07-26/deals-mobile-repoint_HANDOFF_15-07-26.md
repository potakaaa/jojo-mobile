---
name: plan:deals-mobile-repoint-handoff
description: "Standalone handoff spec for a mobile teammate: repoint the mobile Deals tab from the old discount-object API to the new deals-as-products API (Phase 4a)"
date: 15-07-26
metadata:
  node_type: memory
  type: plan
  feature: admin-dashboard
  phase: 4b
---

# Mobile Deals Repoint — Handoff Doc (Phase 4b)

**This is a handoff spec for a different teammate, not an execution plan we're running
ourselves.** It's plain-language and self-contained — you don't need to read our internal process
docs, migration files, or Drizzle schema to use it. Everything you need to know is below.

---

## 1. What changed and why (one paragraph)

We rebuilt how "Deals" work on the admin/backend side. Before, a Deal was its own standalone object
(a discount rule with a percentage/fixed amount, tied to a start/end date). Now, a Deal is simply **a
regular product** that's been flagged `is_deal = true` — priced at its own fixed price, with an
optional list of "what's inside" (its component products, e.g. "Fries + Lemonade Combo" contains 1
Fries + 1 Lemonade). This means a deal now goes through the exact same add-to-cart → checkout →
order flow as any other menu item — no special discount math anywhere. Your job is to point the
mobile Deals tab at the new data source and drop the now-dead discount-specific client code.

---

## 2. Database schema changes (Phase 4a) — read this before touching any code

You don't need to open the migration or schema files — here's everything in plain language.

**Migration file:** `packages/api/drizzle/0007_*.sql`. In plain terms it does two things: (1) adds
one new column to the existing `products` table, and (2) creates one brand-new small table. Nothing
existing is deleted, renamed, or backfilled — it's a purely additive change.

### 2a. `products.is_deal` (new column on the existing `products` table)

| Property | Value |
|---|---|
| Type | `boolean` |
| Nullable | `NOT NULL` |
| Default | `false` |
| Meaning | `true` = this product IS a deal/bundle, sold as a single line item at its own price. `false` = an ordinary menu item (the default for every product that existed before this migration). |

There is nothing else special about a deal-product's row — it lives in the SAME `products` table,
has the SAME `base_price`, `name`, `image_url`, `is_active`, etc. as any other product.

### 2b. `deal_components` (new table)

| Column | Type | Nullable | Meaning |
|---|---|---|---|
| `id` | `uuid` | PRIMARY KEY, default random | row id |
| `deal_product_id` | `uuid` | `NOT NULL`, FK → `products.id` (`NO ACTION`) | the deal product this row belongs to |
| `component_product_id` | `uuid` | `NOT NULL`, FK → `products.id` (`NO ACTION`) | the "ingredient" product included in the deal |
| `quantity` | `integer` | `NOT NULL`, default `1` | how many of the component product are included |

Plus a **unique index** on `(deal_product_id, component_product_id)` — so the same component can't
be attached to the same deal twice (attaching it again is rejected by the API, not silently merged).

**In plain words:** one row in `deal_components` means *"deal product X contains N of product Y."*
A deal with 2 items inside it (e.g. Fries + Lemonade) has exactly 2 rows in this table, both pointing
back at the same `deal_product_id`.

**This is the first "self-referential" table in the schema** — both FK columns point back at the
SAME table (`products`), just in two different roles (the deal itself, and what's inside it). That's
a slightly unusual shape, worth knowing about if you're debugging a join.

**Critical: `deal_components` is DISPLAY/COMPOSITION metadata ONLY.** It is never read by pricing,
cart, or checkout logic. A deal's price is just its own `base_price` — exactly like any product. The
component rows exist purely so the deal detail screen can show "what's inside this deal" to the
customer. Do not build any pricing logic that sums up component prices — that is explicitly not how
this works.

### 2c. Tiny ER sketch

```
products (is_deal = true)  ──<  deal_components  >──  products (the component/ingredient items)
   "Fries + Lemonade Combo"        (deal_product_id,        "Fries", "Lemonade"
                                     component_product_id,
                                     quantity)
```

### 2d. Concrete example

Say an admin creates a deal called "Fries + Lemonade Combo" priced at ₱99 (base_price on its own
`products` row, `is_deal = true`). They then attach 2 components:

**`products` table (relevant rows):**

| id | name | base_price | is_deal |
|---|---|---|---|
| `deal-abc` | Fries + Lemonade Combo | 9900 (cents) | `true` |
| `prod-fries` | Fries | 5000 | `false` |
| `prod-lemonade` | Lemonade | 4000 | `false` |

**`deal_components` table:**

| id | deal_product_id | component_product_id | quantity |
|---|---|---|---|
| `dc-1` | `deal-abc` | `prod-fries` | `1` |
| `dc-2` | `deal-abc` | `prod-lemonade` | `1` |

Note: the customer pays ₱99 total for the combo (the deal's own `base_price`), NOT ₱50 + ₱40 = ₱90.
The component prices (₱50, ₱40) are irrelevant to checkout — they're only shown as "what's inside."

### 2e. What did NOT change (still there, but dormant/unused by this new flow)

- The OLD `deals` table, `deal_products` table, `deal_branches` table, and `coupons.deal_id` /
  `orders.deal_id` foreign keys are all **untouched and still exist** in the database. They're just
  not used by the new flow. A future project (not this one) may resurrect them for a coupon-code
  system — don't worry about them, don't delete them, just ignore them.
- `order_items` snapshotting is **unchanged**. When a deal-product is ordered, its price gets
  snapshotted into `order_items.unit_price`/`total_price` at the moment of purchase — exactly like
  any other product. Editing a deal's price later never changes past orders.

### 2f. One more thing — the seeded "Deals" category

Every product (including deal-products) MUST belong to a category (`products.category_id` is a
required, non-nullable field in this schema — there's no way around it). So a "Deals" category row
was seeded specifically to hold deal-products. You don't need to do anything with this — it's just
why every deal-product you'll see has a category called "Deals" attached, even though customers
never really think of it as a "category" the way "Drinks" or "Snacks" are.

---

## 3. Exact mobile files to repoint

- `apps/mobile/src/app/(tabs)/deals/index.tsx` — the Deals list screen. Currently reads from the OLD
  `GET /deals` route. Repoint it to `GET /branches/:branchId/menu?isDeal=true` (see §3 read contract
  below).
- `apps/mobile/src/app/(tabs)/deals/deal/[dealId].tsx` — the Deal detail screen. Currently reads from
  the OLD `GET /deals/:id` route. Repoint it to a detail fetch against the new deal-product (see
  §4 below for what "what's inside" needs).

**Dead files to retire** (delete or leave orphaned once nothing imports them — your call):
- `apps/mobile/src/features/deals/lib/apply-deal.ts` — the old client-side "apply this deal to my
  cart" logic (discount math, eligibility checks). No longer needed — a deal is now just a normal
  product you add to your cart like anything else.
- `apps/mobile/src/features/deals/lib/eligibility.ts` — old client-side eligibility rules (branch/
  window/minimum-order checks specific to the discount model). No longer needed.
- `apps/mobile/src/features/deals/hooks/use-deal-usage.ts` — old per-user usage tracking hook tied
  to the discount/coupon model. No longer needed.

---

## 3. The read contract

**`GET /branches/:branchId/menu?isDeal=true`** — this is the SAME menu endpoint the regular menu
screens already use, just with a query param flip. Without the param (or `isDeal=false`), it returns
normal menu products. With `isDeal=true`, it returns ONLY deal-products (`is_deal = true`) for that
branch, in the exact same response envelope shape as the regular menu.

Example response (illustrative — confirm exact field names against the live API before wiring):

```json
{
  "products": [
    {
      "id": "deal-abc-123",
      "name": "Fries + Lemonade Combo",
      "slug": "fries-lemonade-combo",
      "description": "A crispy fries + refreshing lemonade combo",
      "imageUrl": "https://.../combo.jpg",
      "basePriceCents": 9900,
      "isDeal": true,
      "categoryId": "deals-category-uuid"
    }
  ],
  "categories": [
    { "id": "deals-category-uuid", "name": "Deals", "sortOrder": 0 }
  ]
}
```

**How to add a deal-product to cart:** exactly the same as any regular product — call the existing
`useCart().addItem()` path with this product's id/price. No special "apply deal" step needed.

---

## 4. "What's inside" display need

The deal detail screen must show the list of component products (with quantity) that make up the
deal — e.g. "This combo includes: 1x Fries, 1x Lemonade." Confirm with the API team the exact shape
of the detail response (`GET /api/admin/deals/:id` is the ADMIN-side shape — you'll likely need a
customer-facing equivalent, or the existing product-detail endpoint extended with a `components`
array). If no customer-facing detail route exists yet when you start this work, flag it back to the
API team rather than guessing the shape — see §2c above for the underlying data shape
(`deal_components`: `componentProductId`, `quantity`) so you know what to ask for.

---

## 5. What to retire (full list, repeated for clarity)

- `apply-deal.ts` (discount-apply logic)
- `eligibility.ts` (discount eligibility rules)
- `use-deal-usage.ts` (per-user coupon/discount usage tracking)

A deal is now just "add to cart like any product" — `useCart().addItem()`, nothing else.

---

## 6. Interim caveat — read this before you start

**Until this handoff doc is actually executed**, the mobile Deals tab keeps reading the OLD, still-
live `GET /deals` route (the discount-object model). This is intentional and not a bug — the old
route was never deleted, so the app keeps functioning with stale/legacy-shaped deals data in the
meantime. There is no regression risk from waiting to pick this work up.

---

## 7. Acceptance checks (a non-technical-process teammate can run these manually)

1. Open the app, go to the Deals tab. You should see deal-products fetched via the NEW menu-based
   endpoint (`?isDeal=true`), not the old discount-object list.
2. Tap into a deal — you should see its "what's inside" component list (e.g. "1x Fries, 1x
   Lemonade").
3. Add the deal to your cart. It should behave exactly like adding any regular product — no special
   "coupon applied" banner or discount math.
4. Go through checkout. The order total should exactly equal the deal's own listed price (e.g. ₱99),
   not a sum of its component prices.
5. Confirm the deal appears correctly in Order History afterward, same as any other product line.

If all 5 checks pass, the repoint is done.
