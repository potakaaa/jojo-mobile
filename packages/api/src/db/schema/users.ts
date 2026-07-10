import { boolean, date, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { branches } from './branches';

export const userRoleEnum = pgEnum('user_role', ['customer', 'staff', 'admin', 'super_admin']);

/**
 * App users table — doubles as better-auth's `user` model (see `src/lib/auth.ts`).
 *
 * JS property keys are camelCase to match better-auth's field names exactly
 * (`emailVerified`, `phoneNumber`, `createdAt`, ...), so the Drizzle adapter
 * resolves each better-auth field to a column by JS key without any `fields`
 * mapping. DB column names stay snake_case via the column-builder string arg.
 *
 * `id` is a DB-generated uuid; better-auth is configured with
 * `advanced.database.generateId: false` so Postgres's `defaultRandom()` fills
 * it (all FK references across the schema already point at this uuid).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  email: varchar('email').unique().notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  phoneNumber: varchar('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified').default(false).notNull(),
  image: varchar('image'),
  birthday: date('birthday'),
  favoriteBranchId: uuid('favorite_branch_id').references(() => branches.id),
  role: userRoleEnum('role').default('customer').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
