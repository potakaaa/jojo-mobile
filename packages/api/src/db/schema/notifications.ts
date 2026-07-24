import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
    // Route params for the target screen, e.g. `{ orderId }` | `{ dealId }`
    // (PUSH-004 / #75). Nullable/additive — closes the DB↔`AppNotification`
    // (`targetParams`) mismatch. jsonb so the object round-trips without string
    // parsing at the boundary.
    target_params: jsonb('target_params'),
    read_at: timestamp('read_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('notifications_user_read_idx').on(t.user_id, t.read_at),
    // Covers the cursor-paginated GET /notifications listing query (ORDER BY
    // created_at DESC WHERE user_id = ?) — the existing (user_id, read_at) index
    // doesn't help that scan (found by CodeRabbit review, PR #151).
    index('notifications_user_created_idx').on(t.user_id, t.created_at),
  ],
);
