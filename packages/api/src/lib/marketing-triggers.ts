/**
 * Marketing/retention trigger hub (PUSH-005 / #82).
 *
 * Fills the empty PUSH-004 scheduler substrate with real, data-driven triggers.
 * Two are POLL-shaped (scanned on an interval): coupon-expiring + one-more-order.
 * One is an EVENT hook fired from admin deal-create: new-deal. (reward-unlocked is
 * wired in `reward-unlock-notify.ts`; branch-promo is an admin command in
 * `routes/admin/notifications.ts`.)
 *
 * EVERY send routes through `dispatchMarketingNotificationIfAllowed` — the single
 * guarded entry point that enforces opt-in + quiet-hours + frequency-cap. This
 * module owns only:
 *   - WHICH rows to consider (the DB scans), and
 *   - one-shot ENTITY dedup (D2): before dispatching, it checks whether a
 *     `notifications` row already exists for this (user, type, entity) — reusing
 *     `dispatchOrderNotification`'s persisted-row-inspection pattern. Because
 *     dedup reads PERSISTED rows (not scheduler in-memory state), it is
 *     restart-safe (AC12): a fresh process re-derives "already notified" from the
 *     DB. A gated/dropped send writes no row, so a poll trigger re-attempts on the
 *     next non-quiet tick.
 *
 * ── Self-rearming poll pattern (D3) ─────────────────────────────────────────
 * `scheduler.ts` fires each trigger id AT MOST ONCE EVER (in-memory `fired` Set,
 * purged-not-refired once its window passes). So a poll trigger CANNOT be a single
 * static registration — it would fire once and stop. Instead each poll is a
 * SELF-REARMING meta-trigger: its `onFire` runs the scan, then (in a `finally`)
 * re-registers a fresh successor id for the next window. This is INTENTIONAL, not
 * a bug: correctness of "fire once per (user, entity)" comes from the PERSISTED
 * dedup above, never from scheduler per-id dedup, so re-arming can never
 * double-send.
 */

import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';

import { db } from '../db/client';
import { coupons, notifications, rewards, userStars, users } from '../db/schema/index';
import {
  dispatchMarketingNotificationIfAllowed,
  type MarketingPayload,
} from '../routes/lib/notification-dispatch';
import { createScheduler, type Scheduler } from './scheduler';

/** Lead window before a coupon's `expires_at` in which the reminder fires (72h). */
const COUPON_EXPIRY_LEAD_MS = 72 * 60 * 60 * 1000;

/** Poll interval for the marketing scheduler's `setInterval` (15 min). Tunable. */
export const MARKETING_SCAN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Monotonic sequence for self-rearming successor ids. Guarantees each re-arm gets
 * a UNIQUE trigger id independent of the (possibly unchanged) injected clock — a
 * timestamp-only id could collide with its predecessor when the clock has not
 * advanced, and a colliding id is already in the scheduler's `fired` Set, which
 * would silently kill the chain.
 */
let pollSeq = 0;

/**
 * True when a `notifications` row already exists for this (user, type) whose
 * `target_params[entityKey]` equals `entityValue` — the persisted one-shot dedup
 * (D2), mirroring `dispatchOrderNotification`'s SELECT-existing-rows pattern.
 */
async function alreadyNotified(
  userId: string,
  type: 'coupon_expiring' | 'one_more_order' | 'new_deal',
  entityKey: string,
  entityValue: string,
): Promise<boolean> {
  const rows = await db
    .select({ target_params: notifications.target_params })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.type, type)));
  return rows.some(
    (row) => (row.target_params as Record<string, string> | null)?.[entityKey] === entityValue,
  );
}

/**
 * Poll scan (AC1/AC2): offer coupons whose `expires_at` falls inside
 * `[now, now + 72h]`, still `available`, targeted to a real user. Reward coupons
 * (`expires_at` NULL) are excluded by construction (the `isNotNull` filter). One
 * reminder per coupon (persisted dedup); no re-fire after used/expired (a `used`
 * or past-window coupon no longer matches the query).
 */
export async function scanExpiringCoupons(now: Date): Promise<void> {
  const leadEnd = new Date(now.getTime() + COUPON_EXPIRY_LEAD_MS);
  const expiring = await db
    .select({ id: coupons.id, userId: coupons.user_id })
    .from(coupons)
    .where(
      and(
        isNotNull(coupons.offer_id),
        isNotNull(coupons.user_id),
        isNotNull(coupons.expires_at),
        eq(coupons.status, 'available'),
        gte(coupons.expires_at, now),
        lte(coupons.expires_at, leadEnd),
      ),
    );

  for (const coupon of expiring) {
    const userId = coupon.userId;
    if (!userId) continue;
    if (await alreadyNotified(userId, 'coupon_expiring', 'couponId', coupon.id)) continue;
    const payload: MarketingPayload = {
      title: 'Your coupon expires soon',
      body: 'A coupon in your wallet is about to expire — tap to use it before it does.',
      targetScreen: 'coupon_wallet',
      targetParams: { couponId: coupon.id },
    };
    await dispatchMarketingNotificationIfAllowed(userId, 'coupon_expiring', payload, {
      now: () => now,
    });
  }
}

/**
 * Poll scan (AC3/AC4): for each ACTIVE reward tier, users whose monotonic
 * `lifetime_stars` is EXACTLY `required_stars − 1` (one order away). Fires the
 * nudge once per near-miss tier (persisted dedup on `requiredStars`); never at any
 * other star count, and not repeatedly for the same tier.
 */
export async function scanOneMoreOrder(now: Date): Promise<void> {
  const activeTiers = await db
    .select({ requiredStars: rewards.required_stars })
    .from(rewards)
    .where(eq(rewards.is_active, true));

  // Distinct near-miss thresholds (several tiers may share a required_stars).
  const targets = new Set(activeTiers.map((tier) => tier.requiredStars));

  for (const requiredStars of targets) {
    const nearMiss = await db
      .select({ userId: userStars.user_id })
      .from(userStars)
      .where(eq(userStars.lifetime_stars, requiredStars - 1));

    for (const { userId } of nearMiss) {
      const requiredStr = String(requiredStars);
      if (await alreadyNotified(userId, 'one_more_order', 'requiredStars', requiredStr)) continue;
      const payload: MarketingPayload = {
        title: "You're one order away!",
        body: 'Just one more order to unlock your next Jojo Stars reward.',
        targetScreen: 'rewards',
        targetParams: { requiredStars: requiredStr },
      };
      await dispatchMarketingNotificationIfAllowed(userId, 'one_more_order', payload, {
        now: () => now,
      });
    }
  }
}

/**
 * Event hook (AC6): a new deal became available — notify every opted-in user ONCE
 * for this deal (persisted dedup on `dealId`). Broadcast audience (D5 — no
 * per-branch targeting in v1). Fired fire-and-forget, post-commit, from admin
 * deal-create.
 */
export async function notifyNewDeal(dealId: string, now: Date = new Date()): Promise<void> {
  const audience = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.marketingOptIn, true));

  for (const { id: userId } of audience) {
    if (await alreadyNotified(userId, 'new_deal', 'dealId', dealId)) continue;
    const payload: MarketingPayload = {
      title: 'New deal available',
      body: 'A new deal just dropped — tap to check it out.',
      targetScreen: 'deal_details',
      targetParams: { dealId },
    };
    await dispatchMarketingNotificationIfAllowed(userId, 'new_deal', payload, { now: () => now });
  }
}

/**
 * Register one SELF-REARMING poll trigger (D3). On fire: run `scan(now())`, then
 * — ALWAYS, in a `finally` (E1) — re-register a fresh successor id so the chain
 * survives even a throwing/transient scan (the scheduler logs an `onFire`
 * rejection but does NOT re-arm on its own). The successor window spans
 * `[now, now + 2× intervalMs]` (E2): ≥ 2× the interval so a single missed/drifted
 * `setInterval` tick still lands inside the window and fires — a window narrower
 * than one interval could be skipped entirely, killing the chain (the trigger's
 * window would pass and be purged with no replacement registered).
 *
 * Exported for direct testing of the continuation (AC0/D3) and resilience (E1)
 * behavior with a stub scan, independent of the DB-backed scans.
 */
export function registerSelfRearmingTrigger(
  scheduler: Scheduler,
  idPrefix: string,
  scan: (now: Date) => Promise<void>,
  now: () => Date,
  intervalMs: number,
): void {
  const at = now();
  pollSeq += 1;
  const id = `${idPrefix}:${pollSeq}`;
  scheduler.register({
    id,
    windowStart: at,
    windowEnd: new Date(at.getTime() + intervalMs * 2),
    onFire: async () => {
      try {
        await scan(now());
      } finally {
        // E1: re-arm in `finally` — a scan error must never break the chain.
        registerSelfRearmingTrigger(scheduler, idPrefix, scan, now, intervalMs);
      }
    },
  });
}

/** Options for {@link bootMarketingScheduler}. */
export interface BootMarketingSchedulerOptions {
  /** Injectable clock (defaults to wall-clock). */
  now?: () => Date;
  /** `setInterval` cadence (defaults to {@link MARKETING_SCAN_INTERVAL_MS}). */
  intervalMs?: number;
  /**
   * Test seam: inject a scheduler to observe `register`/`start`/`tick`. Production
   * omits it — a real `createScheduler` is built.
   */
  scheduler?: Scheduler;
}

/**
 * Boot the marketing scheduler (AC0): create the scheduler, register the two
 * self-rearming poll triggers (coupon-expiring + one-more-order), and `start()`
 * the interval. Called ONCE at server boot from `index.ts` (inside the existing
 * non-test env guard). Returns the scheduler so a caller/test can `stop()` it.
 */
export function bootMarketingScheduler(opts: BootMarketingSchedulerOptions = {}): Scheduler {
  const now = opts.now ?? (() => new Date());
  const intervalMs = opts.intervalMs ?? MARKETING_SCAN_INTERVAL_MS;
  const scheduler = opts.scheduler ?? createScheduler({ intervalMs, now });

  registerSelfRearmingTrigger(scheduler, 'coupon-scan', scanExpiringCoupons, now, intervalMs);
  registerSelfRearmingTrigger(scheduler, 'one-more-order-scan', scanOneMoreOrder, now, intervalMs);

  scheduler.start();
  return scheduler;
}
