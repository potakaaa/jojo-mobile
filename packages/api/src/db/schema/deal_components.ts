import { integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { products } from './products';

/**
 * `deal_components` (ADM-004 deals-as-products) — the "what's inside" junction
 * for a deal-product.
 *
 * FIRST SELF-REFERENTIAL FK INTO `products` in the schema: BOTH `deal_product_id`
 * and `component_product_id` reference `products.id` (the deal-product is itself a
 * `products` row with `is_deal = true`; each component is another `products` row).
 * `NO ACTION` on both FKs mirrors the `deal_products`/`deal_branches` precedent —
 * deletes are soft (`is_active` toggle), never a hard row delete, so a dangling
 * component can never be created by a legitimate flow.
 *
 * Metadata for display AND branch-availability gating — never read for pricing or
 * discount math; order-placement reads it solely to reject a cart containing an
 * unavailable deal before payment, never to influence `unit_price`/`total_price`
 * (MENU-003). The deal's price is still its own `products.base_price`. The composite
 * unique index makes re-attaching the same (deal, component) pair a clean 409
 * (via the shared `isUniqueViolation` catch), never a silent duplicate.
 *
 * The self-reference / deal-of-deals guard (a deal cannot contain itself, and a
 * component cannot itself be `is_deal = true`) is enforced APP-LAYER in the route
 * (Decision 3) — a Postgres CHECK cannot reference another row's `is_deal`.
 */
export const dealComponents = pgTable(
  'deal_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deal_product_id: uuid('deal_product_id')
      .references(() => products.id)
      .notNull(),
    component_product_id: uuid('component_product_id')
      .references(() => products.id)
      .notNull(),
    quantity: integer('quantity').default(1).notNull(),
  },
  (t) => [
    uniqueIndex('deal_components_deal_component_idx').on(t.deal_product_id, t.component_product_id),
  ],
);
