import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { coupons } from './coupons';
import { offers } from './offers';
import { users } from './users';

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'accepted',
  'preparing',
  'flavoring',
  'ready',
  'completed',
  'cancelled',
  'rejected',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['pay_at_branch', 'online_payment']);

export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid', 'failed', 'refunded']);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    branch_id: uuid('branch_id')
      .references(() => branches.id)
      .notNull(),
    // Nullable FK to the applied deal (NO ACTION on delete — matches user_id/branch_id
    // precedent). NULL when no deal was applied. Usage counts derive from this column.
    deal_id: uuid('deal_id').references(() => offers.id),
    // Nullable FK to the applied coupon (NO ACTION on delete — mirrors deal_id).
    // NULL when no coupon was applied. Set atomically with the coupon CAS-mark-used
    // inside the placement transaction (Phase 2 — coupon auto-apply at checkout).
    coupon_id: uuid('coupon_id').references(() => coupons.id),
    order_number: varchar('order_number').unique().notNull(),
    status: orderStatusEnum('status').default('pending').notNull(),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    discount_total: numeric('discount_total', { precision: 10, scale: 2 }).default('0').notNull(),
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    payment_method: paymentMethodEnum('payment_method').notNull(),
    payment_status: paymentStatusEnum('payment_status').default('unpaid').notNull(),
    estimated_ready_at: timestamp('estimated_ready_at'),
    placed_at: timestamp('placed_at').notNull(),
    accepted_at: timestamp('accepted_at'),
    ready_at: timestamp('ready_at'),
    completed_at: timestamp('completed_at'),
    cancelled_at: timestamp('cancelled_at'),
    // ─── Terminal-transition reason (B2 staff reject / B3 customer cancel) ────
    // `reason_code` is one of the app-layer lookup codes in
    // `@jojopotato/types`'s `STAFF_REJECT_REASONS` / `CUSTOMER_CANCEL_REASONS`;
    // `reason_actor` ∈ {'staff','customer'} — both enforced app-layer, not by a
    // DB CHECK (matches this repo's convention for narrow lookup columns).
    //
    // NULL `reason_actor` means: this order reached a terminal cancelled/rejected
    // state BEFORE this migration landed. It is a historical marker, never a live
    // ambiguity — after this migration every code path that can write
    // cancelled/rejected stamps 'staff' or 'customer'.
    reason_code: varchar('reason_code', { length: 32 }),
    reason_note: text('reason_note'),
    reason_actor: varchar('reason_actor', { length: 8 }),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('orders_branch_status_idx').on(t.branch_id, t.status),
    index('orders_user_idx').on(t.user_id),
    index('orders_order_number_idx').on(t.order_number),
  ],
);
