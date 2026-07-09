import {
  date,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';

export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'staff',
  'admin',
  'super_admin',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  full_name: varchar('full_name').notNull(),
  email: varchar('email').unique().notNull(),
  phone: varchar('phone').unique(),
  birthday: date('birthday'),
  favorite_branch_id: uuid('favorite_branch_id').references(() => branches.id),
  role: userRoleEnum('role').default('customer').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
