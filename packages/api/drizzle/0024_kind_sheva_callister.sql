-- Terminal-transition reason columns (B2 staff reject / B3 customer cancel).
-- Additive only: all three columns are nullable, no backfill, no data migration.
--
-- Renumbered 0022 -> 0023 -> 0024 across two successive development merges (dev's
-- 0022_nostalgic_lightspeed = staff_invites.revoked_at, then 0023_good_talisman =
-- reviews table). No semantic overlap — those touch staff_invites / reviews, this
-- touches orders — purely numbering. Regenerated against the merged schema each
-- time rather than hand-renamed, so the snapshot prevId chain stays correct.
--
-- reason_actor in {'staff','customer'} enforced app-layer (not a DB CHECK — matches
-- this repo's existing convention of app-layer enum enforcement for narrow lookup
-- columns). NULL reason_actor means: this order reached a terminal cancelled/rejected
-- state BEFORE this migration landed (a historical marker, never a live ambiguity —
-- every code path that can write cancelled/rejected AFTER this migration stamps
-- 'staff' or 'customer'; see order-reasons-cart-edit_PLAN_22-07-26.md Decision Summary).
-- NOTE: B3's customer-cancel window is pending-only (see SPEC Out of Scope). If this
-- window is ever widened to permit cancelling an 'accepted' order, re-verify
-- reason_actor is still stamped on every code path that can reach 'cancelled'.
ALTER TABLE "orders" ADD COLUMN "reason_code" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason_actor" varchar(8);
