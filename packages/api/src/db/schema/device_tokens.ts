import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Per-device Expo push token registry (PUSH-004 / #75).
 *
 * Keyed by `(user_id, device_id)` — one row per physical device per user. A
 * rotated `push_token` on the SAME device UPDATES the existing row (upsert on
 * the unique constraint) rather than inserting a duplicate, so a user's device
 * is never registered twice. `device_id` is a generic string identifier supplied
 * by the client (Expo `identifierForVendor` / Android SSAID) — the column accepts
 * any stable string, independent of which platform API produced it.
 */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    device_id: varchar('device_id').notNull(),
    push_token: varchar('push_token').notNull(),
    platform: varchar('platform').notNull(),
    last_seen_at: timestamp('last_seen_at').defaultNow().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    unique('device_tokens_user_device_unique').on(t.user_id, t.device_id),
    index('device_tokens_user_idx').on(t.user_id),
  ],
);
