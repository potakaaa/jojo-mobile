-- Terminal-transition reason columns (B2 staff reject / B3 customer cancel).
-- Additive only: all three columns are nullable, no backfill, no data migration.
--
-- reason_actor ∈ {'staff','customer'} enforced app-layer (not a DB CHECK — matches this
-- repo's existing convention of app-layer enum enforcement for narrow lookup columns).
-- NULL reason_actor means: this order reached a terminal cancelled/rejected state BEFORE
-- this migration landed (a historical marker, never a live ambiguity — every code path that
-- can write cancelled/rejected AFTER this migration stamps 'staff' or 'customer'; see
-- order-reasons-cart-edit_PLAN_22-07-26.md Decision Summary).
-- NOTE: B3's customer-cancel window is pending-only (see SPEC Out of Scope). If this window is
-- ever widened to permit cancelling an 'accepted' order, re-verify reason_actor is still stamped
-- on every code path that can reach 'cancelled' from a wider source status.
ALTER TABLE "orders" ADD COLUMN "reason_code" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason_actor" varchar(8);