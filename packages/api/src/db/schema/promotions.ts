import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// ADM-008 Coupons — a Promotion groups one or more Offers under a named,
// time-windowed campaign (Promotion 1 — 0..N Offer, via offers.promotion_id).
// Additive foundation table introduced by migration 0011 alongside the
// deals→offers rename; nothing reads it until the Phase 3 admin CRUD.
export const promotions = pgTable('promotions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  description: text('description'),
  start_at: timestamp('start_at').notNull(),
  end_at: timestamp('end_at').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
