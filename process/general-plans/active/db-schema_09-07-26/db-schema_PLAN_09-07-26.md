---
name: plan:db-schema
description: "FND-004 — Create packages/api with Drizzle ORM + PostgreSQL schema for all 16 MVP tables"
date: 09-07-26
feature: none
---

# FND-004 — Backend Database Schema (All MVP Tables)

**Date** 09-07-26
**Complexity** Simple
**Status** ✅ CODE DONE — all 8 sections complete; all 6 test gates green (09-07-26). See `db-schema_REPORT_09-07-26.md`.

## Overview

Create a new `packages/api` workspace package with:
- Drizzle ORM + `pg` driver against PostgreSQL 16 (local Docker)
- 16 schema files covering every MVP table defined in the PRD
- Vitest smoke test (import-level, no live DB)
- Docker Compose for local dev Postgres
- Minimal Express health-check entry point

Decisions locked upstream (do not re-open):
- ORM: Drizzle ORM (`drizzle-orm` + `drizzle-kit`)
- Driver: `pg` + `@types/pg`
- Dev runner: `tsx watch`
- Test runner: Vitest (scoped to `packages/api`)
- Docker: `docker-compose.yml` at repo root

## Goals

1. All 16 tables created with PRD-specified fields and timestamps
2. Enum types enforced at the DB level via `pgEnum` + migration SQL
3. FK constraints present in generated migration SQL
4. Vitest smoke test passes (import-level, no DB connection)
5. `pnpm db:generate` + `pnpm db:migrate` succeed on a fresh Docker Postgres instance

## Scope

- New: `docker-compose.yml` (repo root)
- New: `packages/api/` (entire package from scratch)
- Modified: `turbo.json` — add `test` task

Out of scope: seed data (FND-005), API route handlers, auth middleware, real insert/query tests (deferred to FND-005).

---

## Touchpoints

| File / Package | Action |
|---|---|
| `docker-compose.yml` | CREATE — PostgreSQL 16 service |
| `turbo.json` | MODIFY — add `test` task |
| `packages/api/package.json` | CREATE |
| `packages/api/tsconfig.json` | CREATE |
| `packages/api/eslint.config.js` | CREATE |
| `packages/api/drizzle.config.ts` | CREATE |
| `packages/api/.env.example` | CREATE |
| `packages/api/vitest.config.ts` | CREATE |
| `packages/api/src/index.ts` | CREATE |
| `packages/api/src/db/client.ts` | CREATE |
| `packages/api/src/db/schema/index.ts` | CREATE |
| `packages/api/src/db/schema/users.ts` | CREATE |
| `packages/api/src/db/schema/branches.ts` | CREATE |
| `packages/api/src/db/schema/categories.ts` | CREATE |
| `packages/api/src/db/schema/products.ts` | CREATE |
| `packages/api/src/db/schema/product_options.ts` | CREATE |
| `packages/api/src/db/schema/branch_product_availability.ts` | CREATE |
| `packages/api/src/db/schema/deals.ts` | CREATE |
| `packages/api/src/db/schema/deal_products.ts` | CREATE |
| `packages/api/src/db/schema/deal_branches.ts` | CREATE |
| `packages/api/src/db/schema/coupons.ts` | CREATE |
| `packages/api/src/db/schema/orders.ts` | CREATE |
| `packages/api/src/db/schema/order_items.ts` | CREATE |
| `packages/api/src/db/schema/rewards.ts` | CREATE |
| `packages/api/src/db/schema/user_stars.ts` | CREATE |
| `packages/api/src/db/schema/star_transactions.ts` | CREATE |
| `packages/api/src/db/schema/notifications.ts` | CREATE |
| `packages/api/src/db/schema/__tests__/smoke.test.ts` | CREATE |

## Public Contracts

- `@jojopotato/api` workspace package — consumed by `apps/mobile` and future packages for typed DB client and schema types
- `src/db/schema/index.ts` re-exports — all Drizzle table objects and enum types are the public schema surface; changes here are breaking for downstream consumers
- `docker-compose.yml` — defines `jojopotato-db` service on port 5432; other contributors depend on this being stable

## Blast Radius

- **Packages added:** `packages/api` (new — no existing consumers yet)
- **Files modified:** `turbo.json` (1 file, low risk — additive task only)
- **Files created:** 27 new files total
- **Risk class:** schema/migration surface (high-risk — FK constraints, enum definitions, migration SQL generated from schema)
- **No existing package is broken:** `pnpm-workspace.yaml` already picks up `packages/*`

---

## Implementation Checklist

### Section 0 — Docker Compose

- [ ] 0.1 Create `docker-compose.yml` at repo root:
  - service name: `jojopotato-db`
  - image: `postgres:16-alpine`
  - ports: `5432:5432`
  - environment: `POSTGRES_USER=jojo`, `POSTGRES_PASSWORD=jojo`, `POSTGRES_DB=jojopotato`
  - volume: `jojopotato-db-data:/var/lib/postgresql/data`
  - named volume declared under `volumes:` key

### Section 1 — Package scaffold

- [ ] 1.1 Create `packages/api/package.json`:
  - `name`: `@jojopotato/api`
  - `version`: `0.0.1`
  - `private`: `true`
  - `main`: `./src/index.ts`
  - scripts: `dev` (`tsx watch src/index.ts`), `build` (`tsc`), `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`)
  - dependencies: `drizzle-orm`, `pg`, `express`
  - devDependencies: `drizzle-kit`, `@types/pg`, `@types/express`, `tsx`, `typescript`, `vitest`, `@jojopotato/config`

- [ ] 1.2 Create `packages/api/tsconfig.json`:
  - extends `@jojopotato/config/typescript/tsconfig.base.json`
  - override `compilerOptions.moduleResolution` to `"node"` (bundler mode fails for Node.js)
  - include `src/**/*`, `drizzle.config.ts`

- [ ] 1.3 Create `packages/api/eslint.config.js`:
  - `export { default } from "@jojopotato/config/eslint-base"`

- [ ] 1.4 Create `packages/api/.env.example`:
  ```
  DATABASE_URL=postgres://jojo:jojo@localhost:5432/jojopotato
  PORT=3000
  ```

- [ ] 1.5 Create `packages/api/vitest.config.ts`:
  - import `defineConfig` from `vitest/config`
  - test include: `src/**/__tests__/**/*.test.ts`
  - environment: `node`

- [ ] 1.6 Create `packages/api/drizzle.config.ts`:
  - schema: `./src/db/schema/index.ts`
  - out: `./drizzle`
  - dialect: `postgresql`
  - dbCredentials: read `DATABASE_URL` from `process.env`

### Section 2 — Entry point and DB client

- [ ] 2.1 Create `packages/api/src/index.ts`:
  - minimal Express app
  - `GET /` returns `{ status: 'ok', service: 'jojopotato-api' }`
  - listen on `process.env.PORT ?? 3000`

- [ ] 2.2 Create `packages/api/src/db/client.ts`:
  - import `drizzle` from `drizzle-orm/node-postgres`
  - import `Pool` from `pg`
  - import `* as schema` from `./schema/index`
  - create pool with `DATABASE_URL` from env
  - export `db = drizzle(pool, { schema })`

### Section 3 — Enum declarations (define before table files import them)

All enum declarations go inside the relevant schema file but must be declared before any FK reference. The index file re-exports everything in dependency order.

Enums to define (each inside the schema file where they are first used):
- `userRoleEnum` = `pgEnum('user_role', ['customer', 'staff', 'admin', 'super_admin'])` — in `users.ts`
- `optionTypeEnum` = `pgEnum('option_type', ['size', 'flavor', 'add_on'])` — in `product_options.ts`
- `dealTypeEnum` = `pgEnum('deal_type', ['percentage_discount', 'fixed_discount', 'buy_one_take_one', 'free_item', 'free_upgrade', 'bundle'])` — in `deals.ts`
- `couponStatusEnum` = `pgEnum('coupon_status', ['available', 'used', 'expired'])` — in `coupons.ts`
- `orderStatusEnum` = `pgEnum('order_status', ['pending', 'accepted', 'preparing', 'flavoring', 'ready', 'completed', 'cancelled'])` — in `orders.ts`
- `paymentMethodEnum` = `pgEnum('payment_method', ['pay_at_branch', 'online_payment'])` — in `orders.ts`
- `paymentStatusEnum` = `pgEnum('payment_status', ['unpaid', 'paid', 'failed', 'refunded'])` — in `orders.ts`
- `starTxTypeEnum` = `pgEnum('star_tx_type', ['earned', 'redeemed', 'adjusted', 'expired'])` — in `star_transactions.ts`

### Section 4 — Schema files (16 tables)

Create each file under `packages/api/src/db/schema/`. All files import Drizzle helpers from `drizzle-orm/pg-core`. Timestamps use `timestamp('created_at').defaultNow().notNull()` pattern; `updated_at` adds `.notNull()` (set via app or trigger). UUIDs use `uuid('id').primaryKey().defaultRandom()`.

- [ ] 4.1 `users.ts` — fields: `id`, `full_name` (varchar), `email` (varchar unique), `phone` (varchar unique nullable), `birthday` (date nullable), `favorite_branch_id` (uuid fk→branches nullable), `role` (userRoleEnum default 'customer'), `created_at`, `updated_at`

- [ ] 4.2 `branches.ts` — fields: `id`, `name`, `slug` (varchar unique), `address`, `latitude` (numeric(9,6)), `longitude` (numeric(9,6)), `phone`, `opening_hours` (text), `is_active` (bool default true), `is_accepting_pickup` (bool default true), `estimated_prep_minutes` (int default 15), `created_at`, `updated_at`. Index: `(latitude, longitude)`.

- [ ] 4.3 `categories.ts` — fields: `id`, `name`, `slug` (varchar unique), `sort_order` (int default 0), `is_active` (bool default true), `created_at`, `updated_at`

- [ ] 4.4 `products.ts` — fields: `id`, `category_id` (fk→categories), `name`, `slug` (varchar unique), `description` (text nullable), `image_url` (text nullable), `base_price` (numeric(10,2)), `is_active` (bool default true), `is_reward_eligible` (bool default false), `created_at`, `updated_at`

- [ ] 4.5 `product_options.ts` — fields: `id`, `product_id` (fk→products), `option_type` (optionTypeEnum), `name`, `price_delta` (numeric(10,2) default 0), `is_active` (bool default true), `sort_order` (int default 0), `created_at`, `updated_at`

- [ ] 4.6 `branch_product_availability.ts` — fields: `id`, `branch_id` (fk→branches), `product_id` (fk→products), `is_available` (bool default true), `updated_at`. Unique constraint: `(branch_id, product_id)`.

- [ ] 4.7 `deals.ts` — fields: `id`, `title`, `description` (text nullable), `image_url` (text nullable), `deal_type` (dealTypeEnum), `discount_value` (numeric(10,2) nullable), `minimum_order_amount` (numeric(10,2) default 0), `start_at` (timestamp), `end_at` (timestamp), `usage_limit_per_user` (int nullable), `total_usage_limit` (int nullable), `is_active` (bool default true), `created_at`, `updated_at`

- [ ] 4.8 `deal_products.ts` — fields: `id`, `deal_id` (fk→deals), `product_id` (fk→products). Unique: `(deal_id, product_id)`.

- [ ] 4.9 `deal_branches.ts` — fields: `id`, `deal_id` (fk→deals), `branch_id` (fk→branches). Unique: `(deal_id, branch_id)`.

- [ ] 4.10 `coupons.ts` — fields: `id`, `user_id` (fk→users), `deal_id` (fk→deals nullable), `reward_id` (fk→rewards nullable — forward ref, declare as text uuid then alter via FK in drizzle), `code` (varchar unique), `status` (couponStatusEnum default 'available'), `expires_at` (timestamp nullable), `used_at` (timestamp nullable), `created_at`. Index: `(user_id, status)`.
  > Note: `reward_id` references `rewards` which is defined later. Use Drizzle's `() => rewards.id` lazy reference syntax to break the circular dependency.

- [ ] 4.11 `orders.ts` — fields: `id`, `user_id` (fk→users), `branch_id` (fk→branches), `order_number` (varchar unique), `status` (orderStatusEnum default 'pending'), `subtotal` (numeric(10,2)), `discount_total` (numeric(10,2) default 0), `total` (numeric(10,2)), `payment_method` (paymentMethodEnum), `payment_status` (paymentStatusEnum default 'unpaid'), `estimated_ready_at` (timestamp nullable), `placed_at` (timestamp), `accepted_at` (timestamp nullable), `ready_at` (timestamp nullable), `completed_at` (timestamp nullable), `cancelled_at` (timestamp nullable), `created_at`, `updated_at`. Indexes: `(branch_id, status)`, `(user_id)`, `(order_number)`.

- [ ] 4.12 `order_items.ts` — fields: `id`, `order_id` (fk→orders), `product_id` (fk→products), `product_name_snapshot` (varchar), `quantity` (int), `unit_price` (numeric(10,2)), `total_price` (numeric(10,2)), `selected_options` (jsonb default '[]'), `created_at`

- [ ] 4.13 `rewards.ts` — fields: `id`, `name`, `required_stars` (int), `reward_type` (varchar), `reward_value` (numeric(10,2) nullable), `eligible_product_id` (fk→products nullable), `is_active` (bool default true), `created_at`, `updated_at`

- [ ] 4.14 `user_stars.ts` — fields: `id`, `user_id` (uuid fk→users unique), `current_stars` (int default 0), `lifetime_stars` (int default 0), `updated_at`

- [ ] 4.15 `star_transactions.ts` — fields: `id`, `user_id` (fk→users), `order_id` (fk→orders nullable), `type` (starTxTypeEnum), `stars` (int), `description` (text nullable), `created_at`. Index: `(user_id)`.

- [ ] 4.16 `notifications.ts` — fields: `id`, `user_id` (fk→users), `title` (varchar), `body` (text), `type` (varchar), `target_screen` (varchar nullable), `read_at` (timestamp nullable), `created_at`. Index: `(user_id, read_at)`.

### Section 5 — Schema index

- [ ] 5.1 Create `packages/api/src/db/schema/index.ts`:
  - Re-export all 16 table files plus all enums in FK dependency order:
    1. `branches` (no FK deps)
    2. `categories`
    3. `users` (FK→branches)
    4. `products` (FK→categories)
    5. `rewards` (FK→products)
    6. `product_options` (FK→products)
    7. `branch_product_availability` (FK→branches, products)
    8. `deals`
    9. `deal_products` (FK→deals, products)
    10. `deal_branches` (FK→deals, branches)
    11. `coupons` (FK→users, deals, rewards via lazy ref)
    12. `orders` (FK→users, branches)
    13. `order_items` (FK→orders, products)
    14. `user_stars` (FK→users)
    15. `star_transactions` (FK→users, orders)
    16. `notifications` (FK→users)

### Section 6 — Smoke test

- [ ] 6.1 Create `packages/api/src/db/schema/__tests__/smoke.test.ts`:
  - `import { describe, it, expect } from 'vitest'`
  - Import all 16 named table exports from `../../index`
  - For each table: `it('users table object exists', () => { expect(users).toBeDefined() })`
  - 16 assertions total — no DB connection, no `DATABASE_URL` needed

### Section 7 — turbo.json update

- [ ] 7.1 Modify `turbo.json` — add `test` task to the `tasks` object:
  ```json
  "test": {
    "cache": false,
    "dependsOn": ["^build"]
  }
  ```

### Section 8 — Install and verify

- [ ] 8.1 Run `pnpm install` from repo root (picks up new `packages/api` workspace package)
- [ ] 8.2 Run `pnpm --filter @jojopotato/api typecheck` — must exit 0
- [ ] 8.3 Run `pnpm --filter @jojopotato/api lint` — must exit 0
- [ ] 8.4 Run `pnpm --filter @jojopotato/api test` — 16 vitest assertions must pass
- [ ] 8.5 Start Docker: `docker compose up -d`
- [ ] 8.6 Copy `.env.example` to `.env` in `packages/api/` and verify `DATABASE_URL` is set
- [ ] 8.7 Run `pnpm --filter @jojopotato/api db:generate` — must produce SQL in `packages/api/drizzle/`
- [ ] 8.8 Run `pnpm --filter @jojopotato/api db:migrate` — must succeed on the fresh Postgres instance
- [ ] 8.9 Inspect generated migration SQL: confirm FK constraints and enum type definitions are present

---

## Acceptance Criteria

| # | Criterion | How verified |
|---|---|---|
| AC-1 | All 16 tables present with PRD-specified fields and timestamps | Migration SQL inspection (step 8.9) + typecheck passes |
| AC-2 | Enum values enforced at DB level | `pgEnum` generates `CREATE TYPE ... AS ENUM (...)` in migration SQL |
| AC-3 | FK constraints in migration SQL | SQL contains `REFERENCES` clauses for every FK column |
| AC-4 | Smoke test passes (no DB required) | `pnpm --filter @jojopotato/api test` exits 0, 16 assertions green |
| AC-5 | Clean migration on fresh Docker PG | `db:generate` + `db:migrate` succeed on fresh container |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/api typecheck` exits 0 | Fully-Automated | AC-1 (all fields typed correctly), AC-3 (FK types compatible) |
| `pnpm --filter @jojopotato/api lint` exits 0 | Fully-Automated | Code quality gate |
| `pnpm --filter @jojopotato/api test` — 16 vitest assertions green | Fully-Automated | AC-4 (smoke: all table objects importable) |
| `pnpm --filter @jojopotato/api db:generate` exits 0 + SQL file produced | Hybrid (requires `.env` set; no live DB needed for generate) | AC-1 (schema compiles to SQL), AC-2 (enums in SQL), AC-3 (FK constraints in SQL) |
| `pnpm --filter @jojopotato/api db:migrate` on fresh Docker Postgres | Hybrid (requires Docker running + `.env`) | AC-5 (clean migration) |
| Inspect generated SQL for `REFERENCES` and `CREATE TYPE ... AS ENUM` | Agent-Probe | AC-2, AC-3 (human inspection of SQL output) |

---

## Dependencies

- `@jojopotato/config` must already exist (it does — `packages/config/`)
- `pnpm-workspace.yaml` already covers `packages/*` — no change needed
- Docker must be installed on the dev machine (prerequisite for hybrid gates)
- Node >= 20 (already required by `.nvmrc`)

## Risks

| Risk | Mitigation |
|---|---|
| Circular FK reference (`coupons.reward_id` → `rewards`) | Use Drizzle lazy reference syntax `() => rewards.id` |
| `tsconfig.json` `moduleResolution: "node"` conflicts with base config | Override only the one field; base extends expo tsconfig which uses bundler — isolate the override |
| `turbo.json` `test` task breaks existing `typecheck`/`lint` cache | `cache: false` on `test` prevents stale results; existing tasks unaffected |
| `drizzle-kit` version incompatibility with `drizzle-orm` | Pin matching major versions during install; check drizzle-kit changelog |

---

## Test Infra Improvement Notes

This plan introduces Vitest to the repo (first test runner). Notes:
- Vitest is scoped to `packages/api` only — `turbo.json` `test` task makes it turbo-discoverable
- The smoke test is import-level only (no live DB); real insert/query tests are deferred to FND-005
- A `vitest.config.ts` file is required because Vitest must be told which files to include (no auto-discovery configured at root)
- Future packages wanting tests should add their own `vitest.config.ts` and `test` script; turbo will pick them up automatically
- Known gap: no E2E or integration tests in this plan — explicitly deferred per AC-4 wording

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/db-schema_09-07-26/db-schema_PLAN_09-07-26.md`
2. **Last completed phase/step:** PLAN (this document)
3. **Validate-contract status:** Pending — vc-validate-agent writes this section before EXECUTE
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
5. **Next step for a fresh agent picking up mid-execution:**
   - Read this plan file in full
   - Execute sections 0–7 in order; run typecheck + lint after section 1, run test after section 6, run Docker gates after section 8
   - Do not skip the `pnpm install` step (step 8.1) — the new package won't be linked without it
   - The `coupons.reward_id` lazy-ref note (step 4.10) is the trickiest Drizzle pattern — verify it compiles before moving on
   - The validate-contract gate commands are the source of truth for what "done" looks like

---

## Phase Completion Rules

This is a SIMPLE (one-session) plan — implement all checklist sections continuously without approval gates.

- PLANNED → IN PROGRESS: when Section 0 begins
- IN PROGRESS → CODE DONE: when all 8 checklist sections are complete and typecheck + lint + test pass
- CODE DONE → VERIFIED: when all Verification Evidence gates are green (including hybrid Docker gates)

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
