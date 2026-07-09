import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    slug: varchar('slug').unique().notNull(),
    address: varchar('address').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
    longitude: numeric('longitude', { precision: 9, scale: 6 }).notNull(),
    phone: varchar('phone').notNull(),
    opening_hours: text('opening_hours').notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    is_accepting_pickup: boolean('is_accepting_pickup').default(true).notNull(),
    estimated_prep_minutes: integer('estimated_prep_minutes')
      .default(15)
      .notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('branches_lat_lng_idx').on(t.latitude, t.longitude)],
);
