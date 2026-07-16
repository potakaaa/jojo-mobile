---
name: docs:dev-db-reconciliation-deals-unification
description: "Runbook — fix a dev DB whose drizzle migration cursor silently skipped migrations during the deals_unification merge"
date: 16-07-26
---

# Dev DB Reconciliation — `feat/deals_unification` merge

**TL;DR:** if your local Postgres was migrated by `development` or `feat/adm-008-coupons`
*before* you checked out `feat/deals_unification` (or `main` after it merges), your migration
cursor may have silently skipped 5 migrations (`0007`–`0011`: push-notification tables, the
order coupon FK, 2 unique indexes). Run the **Step 2 detection script** below first — it tells
you exactly what's missing. Then either hand-apply the missing files (Step 3) or nuke your DB
and start clean (Step 4). Deal-products created before commit `d17d296` also need an
availability backfill (Step 5) or they're invisible on mobile at every branch.

---

## 1. Who needs this

- **Affected:** anyone whose dev DB ran `pnpm --filter @jojopotato/api db:migrate` against
  `development` or `feat/adm-008-coupons` (or any pre-merge branch) **before** checking out
  `feat/deals_unification` / post-merge `main`.
- **Not affected:** a fresh DB migrated `0000`→`0013` from scratch. Run Step 2 anyway to confirm
  — it's read-only and takes a few seconds.

**Why this happened:** drizzle-kit's `migrate` command tracks progress with a single cursor —
`MAX(created_at)` in the `drizzle.__drizzle_migrations` table — not a per-migration "was this
hash applied?" check for migrations older than that cursor. During the `feat/deals_unification`
merge (`fdb2daf`), migrations generated on two parallel branches got interleaved and the ADM-008
rename migration was renumbered to `0013_rename_deals_to_offers` (journal idx 0–13, contiguous).
Because migration file *timestamps* (`when` in `drizzle/meta/_journal.json`) weren't renumbered
to match their new file-name order, a dev DB whose cursor had already advanced past those
timestamps (from applying a differently-numbered migration earlier) will treat `0007`–`0011` as
"already applied" and skip them — even though their SQL never ran.

---

## 2. Detection

Requires `jq`, `sha256sum`, and `psql` on PATH, and `DATABASE_URL` set (default local value is
`postgres://jojo:jojo@localhost:5432/jojopotato` per `.env.example` — some local native Postgres
setups use a different password; check `packages/api/.env`).

```bash
cd packages/api
export DATABASE_URL="${DATABASE_URL:-postgres://jojo:jojo@localhost:5432/jojopotato}"

echo "== Journal vs applied migrations (drizzle.__drizzle_migrations) =="
jq -r '.entries[] | "\(.idx)\t\(.tag)\t\(.when)"' drizzle/meta/_journal.json | \
while IFS=$'\t' read -r idx tag when; do
  file="drizzle/${tag}.sql"
  hash=$(sha256sum "$file" | awk '{print $1}')
  applied=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${hash}'")
  st="MISSING"; [ "$applied" = "1" ] && st="applied"   # NOTE: don't name this var `status` — zsh treats it as read-only
  printf "%2s  %-32s when=%s  %s\n" "$idx" "$tag" "$when" "$st"
done
```

Verified live against this repo's own dev DB — it correctly reproduces the exact known-inconsistent
state described in `process/context/all-context.md`: `0007`–`0011` show `MISSING` (schema effects
exist but were never recorded, from the original hand-applied fix), `0012`/`0013` show `applied`.

A `MISSING` row means that migration's SQL was never recorded as applied on this DB — it may
still have been hand-applied without a matching bookkeeping row (see the schema probe below to
tell the difference).

**Schema-level sanity probe** (catches the "SQL was hand-applied but the bookkeeping row was
never inserted" case — this is exactly what happened on this repo's own reconciled dev DB):

```bash
psql "$DATABASE_URL" -c "
SELECT
  to_regclass('public.offers')            AS offers_tbl,        -- 0013
  to_regclass('public.device_tokens')     AS device_tokens_tbl, -- 0007
  to_regclass('public.promotions')        AS promotions_tbl,    -- 0013
  to_regclass('public.deal_components')   AS deal_components_tbl, -- 0012
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='orders' AND column_name='coupon_id')      AS orders_coupon_id,        -- 0009
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='users' AND column_name='marketing_opt_in') AS users_marketing_opt_in,  -- 0007/0008
  (SELECT count(*) FROM pg_indexes
     WHERE indexname='star_transactions_order_type_unique')      AS idx_star_tx,              -- 0010
  (SELECT count(*) FROM pg_indexes
     WHERE indexname='coupons_user_reward_unique')                AS idx_coupon_reward,        -- 0011
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='products' AND column_name='is_deal')       AS products_is_deal;         -- 0012
"
```

Any `NULL`/`0` value here means that piece of schema is genuinely missing (not just
under-recorded) — go apply that migration in Step 3.

---

## 3. Manual reconciliation (keep your data)

For every `MISSING` migration from Step 2, in **ascending idx order**:

1. **Apply the raw SQL** (each `drizzle/*.sql` file is a plain, self-contained Postgres script
   — no need to hand-split on the `--> statement-breakpoint` markers, `psql -f` runs the whole
   file):
   ```bash
   psql "$DATABASE_URL" -f drizzle/0007_wet_ser_duncan.sql
   psql "$DATABASE_URL" -f drizzle/0008_amusing_night_nurse.sql
   psql "$DATABASE_URL" -f drizzle/0009_round_menace.sql
   psql "$DATABASE_URL" -f drizzle/0010_nosy_genesis.sql
   psql "$DATABASE_URL" -f drizzle/0011_windy_dexter_bennett.sql
   ```
   (Only run the ones Step 2 reported `MISSING` for your DB — every statement here is
   **non-idempotent** — `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE UNIQUE INDEX`,
   none use `IF NOT EXISTS`. Re-running an already-applied file will error. Order matters: 0008
   drops a constraint 0007 creates.)

2. **Backfill the bookkeeping row** for each one you just applied, so future `db:migrate` runs
   stay consistent and don't re-attempt it:
   ```bash
   for tag in 0007_wet_ser_duncan 0008_amusing_night_nurse 0009_round_menace \
              0010_nosy_genesis 0011_windy_dexter_bennett; do
     hash=$(sha256sum "drizzle/${tag}.sql" | awk '{print $1}')
     when=$(jq -r ".entries[] | select(.tag==\"${tag}\") | .when" drizzle/meta/_journal.json)
     psql "$DATABASE_URL" -c \
       "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${when});"
   done
   ```
   (Only loop over the tags you actually applied.)

3. **Re-check the cursor and re-run the normal migrate path** for anything still pending
   (e.g. `0012`/`0013` if Step 2 flagged them too):
   ```bash
   psql "$DATABASE_URL" -c "SELECT max(created_at), to_timestamp(max(created_at)/1000) FROM drizzle.__drizzle_migrations;"
   pnpm --filter @jojopotato/api db:migrate
   ```
   `db:migrate` is safe to run here — the cursor now correctly reflects what's applied, so it
   will only pick up genuinely-pending migrations above your new max.

4. **Re-run Step 2** to confirm every row now shows `applied`.

---

## 4. Nuclear option (no local data worth keeping)

Faster when you don't care about your dev DB's existing rows:

```bash
# native Postgres — drop and recreate the DB (adjust user/db name to your DATABASE_URL)
psql "postgres://jojo:jojo@localhost:5432/postgres" -c "DROP DATABASE IF EXISTS jojopotato;"
psql "postgres://jojo:jojo@localhost:5432/postgres" -c "CREATE DATABASE jojopotato OWNER jojo;"

# OR, if you run Postgres via docker-compose instead of native:
# docker compose down -v && docker compose up -d

cd packages/api
pnpm db:migrate
pnpm db:seed
```

This applies all 14 migrations (`0000`→`0013`) cleanly in order — no cursor confusion possible
on a DB that's never been migrated before.

---

## 5. Pre-Fix-1 deal availability backfill

Deal-products created via `POST /api/admin/deals` **before** commit `d17d296`
(`fix(admin): seed branch availability rows on deal create`) have no
`branch_product_availability` row at all, so they're invisible on the mobile Deals tab at every
branch (the menu filter requires an explicit `is_available=true` row). Deals created after that
commit already get seeded automatically — this backfill only needs to run once, for pre-existing
rows:

```sql
INSERT INTO branch_product_availability (branch_id, product_id, is_available)
SELECT b.id, p.id, true
FROM branches b
CROSS JOIN products p
WHERE p.is_deal = true
  AND b.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM branch_product_availability bpa
    WHERE bpa.branch_id = b.id AND bpa.product_id = p.id
  );
```

(Uses `NOT EXISTS` rather than `ON CONFLICT ... DO UPDATE` deliberately — it only fills in
missing rows and never overwrites a branch's existing availability toggle. Matches
`branch_product_availability`'s real columns/unique index — see
`packages/api/src/db/schema/branch_product_availability.ts` — and mirrors the same
`is_active = true` branch filter the real fix in `packages/api/src/routes/admin/deals.ts` uses.
Column/table names verified against the schema file; the statement itself was not executed here
— dev-DB access for this runbook was read-only-only, per task scope.)

---

## Known residual gap

The `feat/deals_unification` branch is also missing a drizzle snapshot for `0013` (see
`process/context/all-context.md` scan metadata) — `drizzle-kit generate` may propose a spurious
extra diff until that snapshot is committed. Not fixed by this runbook; unrelated to the
migration-skip issue above.
