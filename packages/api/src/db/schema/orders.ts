import { index, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { branches } from './branches';
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
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('orders_branch_status_idx').on(t.branch_id, t.status),
    index('orders_user_idx').on(t.user_id),
    index('orders_order_number_idx').on(t.order_number),
  ],
);
