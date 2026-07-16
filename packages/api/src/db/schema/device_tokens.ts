import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Per-device Expo push token registry (PUSH-004 / #75).
 *
 * Keyed GLOBALLY by `device_id` — one row per physical device, period, not per
 * (user, device). `device_id` (Expo `identifierForVendor` / Android SSAID) is
 * stable per physical install regardless of which account is signed in, so a
 * device can only ever belong to ONE user's push routing at a time. Re-registering
 * the SAME `device_id` under a different `user_id` (e.g. logout then login as a
 * different account on a shared device) REASSIGNS the row to the new user rather
 * than inserting a second row — otherwise both accounts' pushes would keep
 * landing on that one physical device indefinitely.
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
    unique('device_tokens_device_unique').on(t.device_id),
    index('device_tokens_user_idx').on(t.user_id),
  ],
);
