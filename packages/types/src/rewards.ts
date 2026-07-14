/**
 * Jojo Stars shared domain types (STAR-001).
 *
 * Mirrors the DB `star_tx_type` enum and the `user_stars` counter table. Visible
 * to all `@jojopotato/*` consumers. Replaces the earlier points/tier placeholder
 * (no consumer relied on it — grep-confirmed safe overwrite).
 */

/** Mirrors the DB `star_tx_type` pgEnum verbatim. */
export type StarTransactionType = 'earned' | 'redeemed' | 'adjusted' | 'expired';

/** A user's star counters: redeemable balance + monotonic cumulative history. */
export interface UserStars {
  currentStars: number;
  lifetimeStars: number;
}

/** A single star-ledger row. `orderId` is null for non-order-linked transactions. */
export interface StarTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  type: StarTransactionType;
  stars: number;
  description: string | null;
  createdAt: string;
}
