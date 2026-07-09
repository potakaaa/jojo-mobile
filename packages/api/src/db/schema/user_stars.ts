import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userStars = pgTable('user_stars', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .references(() => users.id)
    .unique()
    .notNull(),
  current_stars: integer('current_stars').default(0).notNull(),
  lifetime_stars: integer('lifetime_stars').default(0).notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
