import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    title: varchar('title').notNull(),
    body: text('body').notNull(),
    type: varchar('type').notNull(),
    target_screen: varchar('target_screen'),
    read_at: timestamp('read_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('notifications_user_read_idx').on(t.user_id, t.read_at)],
);
