-- ADM-008 reconciliation: migration 0013 renamed the deals→offers tables and the
-- deal_id→offer_id columns, but Postgres does NOT rename foreign-key constraints on
-- a table/column rename. The physical constraint names therefore stayed
-- `deal_*_deals_id_fk`, while 0013_snapshot.json (regenerated from the schema)
-- declares the new `offer_*` names. `drizzle-kit generate` compares schema↔snapshot
-- (both already the new names) so it stays a no-op and nothing breaks today — but a
-- future FK change on any of these tables would make generate emit a
-- `DROP CONSTRAINT "<new name>"` that fails on every DB (old physical name). This
-- migration aligns the physical names with the snapshot. Guarded (idempotent) so it
-- is safe whether a DB carries the old names, was already reconciled, or is fresh.
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_products_deal_id_deals_id_fk') THEN
		ALTER TABLE "offer_products" RENAME CONSTRAINT "deal_products_deal_id_deals_id_fk" TO "offer_products_offer_id_offers_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_products_product_id_products_id_fk') THEN
		ALTER TABLE "offer_products" RENAME CONSTRAINT "deal_products_product_id_products_id_fk" TO "offer_products_product_id_products_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_branches_deal_id_deals_id_fk') THEN
		ALTER TABLE "offer_branches" RENAME CONSTRAINT "deal_branches_deal_id_deals_id_fk" TO "offer_branches_offer_id_offers_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_branches_branch_id_branches_id_fk') THEN
		ALTER TABLE "offer_branches" RENAME CONSTRAINT "deal_branches_branch_id_branches_id_fk" TO "offer_branches_branch_id_branches_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_deal_id_deals_id_fk') THEN
		ALTER TABLE "coupons" RENAME CONSTRAINT "coupons_deal_id_deals_id_fk" TO "coupons_offer_id_offers_id_fk";
	END IF;
	IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_deal_id_deals_id_fk') THEN
		ALTER TABLE "orders" RENAME CONSTRAINT "orders_deal_id_deals_id_fk" TO "orders_deal_id_offers_id_fk";
	END IF;
END $$;
