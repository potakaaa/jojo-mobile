# @jojopotato/api

Express backend for the Jojo Potato mobile app. Handles database access via Drizzle ORM on PostgreSQL.

---

## Prerequisites

- Node >= 20
- pnpm 10.33.0
- Docker (for local PostgreSQL)

---

## Setup

### 1. Start the database

```bash
# from repo root
docker compose up -d
```

This starts a PostgreSQL 16 container on port **5432** with:

- user: `jojo`
- password: `jojo`
- database: `jojopotato`

### 2. Configure environment

```bash
cp packages/api/.env.example packages/api/.env
```

The defaults match the Docker container — no changes needed for local dev. `.env` is gitignored and never committed; `.env.example` is the committed template.

`DATABASE_URL` format: `postgres://<user>:<password>@<host>:<port>/<database>`

### 3. Install dependencies

```bash
# from repo root
pnpm install
```

### 4. Run migrations

```bash
pnpm --filter @jojopotato/api db:migrate
```

This applies all SQL migrations in `packages/api/drizzle/` to the database. Safe to re-run — only unapplied migrations are executed.

---

## Inspecting the database

### psql (terminal)

```bash
docker exec -it jojo-mobile-jojopotato-db-1 psql -U jojo -d jojopotato
```

Useful commands inside psql:

```
\dt              list all tables
\d users         describe a table (columns, types, constraints)
\d+ orders       describe with indexes included
\dT+             list all enum types and their values
\q               quit
```

### GUI client (TablePlus, DBeaver, pgAdmin, etc.)

```
host:     localhost
port:     5432
user:     jojo
password: jojo
database: jojopotato
```

---

## Running the server

```bash
pnpm --filter @jojopotato/api dev
```

Starts Express on **port 3000** with hot reload via `tsx watch`. Check it's up:

```bash
curl http://localhost:3000
# {"status":"ok","service":"jojopotato-api"}
```

Or from a specific port:

```bash
PORT=4000 pnpm --filter @jojopotato/api dev
```

---

## Database commands

| Command                                     | What it does                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm --filter @jojopotato/api db:generate` | Diff schema against last migration and generate a new SQL file in `drizzle/` |
| `pnpm --filter @jojopotato/api db:migrate`  | Apply pending migrations to the database                                     |

### Making a schema change

1. Edit the relevant file in `packages/api/src/db/schema/`
2. Run `db:generate` — inspect the generated SQL in `drizzle/`
3. Run `db:migrate` to apply it

---

## Schema overview

16 tables across the full MVP data model (PRD §9):

| Table                         | Purpose                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `users`                       | Customer accounts (roles: customer / staff / admin / super_admin) |
| `branches`                    | Store locations with geo coords and pickup settings               |
| `categories`                  | Menu categories                                                   |
| `products`                    | Menu items with pricing and availability flags                    |
| `product_options`             | Size / flavor / add-on variants per product                       |
| `branch_product_availability` | Per-branch product availability overrides                         |
| `deals`                       | App-exclusive promotions (6 deal types)                           |
| `deal_products`               | Which products a deal applies to                                  |
| `deal_branches`               | Which branches a deal is active at                                |
| `coupons`                     | User-specific coupon codes (available / used / expired)           |
| `orders`                      | Pickup orders with full status lifecycle                          |
| `order_items`                 | Line items inside each order (with option snapshot)               |
| `rewards`                     | Redeemable reward configurations                                  |
| `user_stars`                  | Per-user star balance and lifetime total                          |
| `star_transactions`           | Star earning / redemption history                                 |
| `notifications`               | In-app notification records                                       |

Schema files live in `src/db/schema/`. Each table is its own file; `src/db/schema/index.ts` re-exports all in FK dependency order.

---

## Development commands

```bash
# type check
pnpm --filter @jojopotato/api typecheck

# lint
pnpm --filter @jojopotato/api lint

# run tests (no DB required)
pnpm --filter @jojopotato/api test
```

The smoke test suite (`src/db/schema/__tests__/smoke.test.ts`) verifies all 16 schema exports are importable without a live database.

---

## Project structure

```
packages/api/
  src/
    index.ts              Express entry point (health check, future routes)
    db/
      client.ts           Drizzle client (pool + schema binding)
      schema/
        index.ts          Re-exports all tables
        users.ts
        branches.ts
        ... (16 files total)
        __tests__/
          smoke.test.ts
  drizzle/
    0000_puzzling_lightspeed.sql   Initial migration (all 16 tables)
    meta/                          Drizzle migration metadata
  drizzle.config.ts
  .env.example
  package.json
  tsconfig.json
  vitest.config.ts
```
