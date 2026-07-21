import 'dotenv/config';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  branches,
  coupons,
  notifications,
  offers,
  rewards,
  userStars,
  users,
} from '../src/db/schema/index';
import {
  scanExpiringCoupons,
  scanOneMoreOrder,
  notifyNewDeal,
} from '../src/lib/marketing-triggers';
import { notifyRewardUnlocked } from '../src/lib/reward-unlock-notify';
import { dispatchMarketingNotificationIfAllowed } from '../src/routes/lib/notification-dispatch';

/**
 * Dev-only diagnostic (not app/production code).
 *
 * Fires all 5 PUSH-005 marketing notification triggers for a single target
 * account, then prints the resulting `notifications` rows so a developer can
 * confirm the whole trigger surface works end to end without manually driving
 * five separate flows (a coupon that will expire, a near-miss reward tier, an
 * admin deal-create, a reward unlock, and a branch promo).
 *
 * Run: `pnpm --filter @jojopotato/api trigger-marketing`
 *
 * Reuses the already-tested trigger functions verbatim (`scanExpiringCoupons`,
 * `scanOneMoreOrder`, `notifyNewDeal`, `notifyRewardUnlocked`,
 * `dispatchMarketingNotificationIfAllowed`) — no trigger logic is reimplemented
 * here. The script only SEEDS the minimal DB rows each poll scan needs to find,
 * forces opt-in, clears prior marketing rows so re-runs aren't dedup/cap-blocked,
 * and pins `now` to a non-quiet-hours instant so nothing is silently dropped.
 *
 * Idempotent + safe to re-run repeatedly against a local dev DB.
 *
 * Target account resolves from `DEV_LOGIN_EMAIL` (the same dev-auto-login
 * convention as `pnpm dev:bypass`; see docs/dev-auto-login.md), defaulting to
 * an empty string if unset — which then fails user resolution below and exits
 * with a clear error, rather than silently targeting the wrong account.
 */

const MARKETING_TYPES = [
  'coupon_expiring',
  'one_more_order',
  'reward_unlocked',
  'new_deal',
  'branch_promo',
] as const;

async function main(): Promise<void> {
  if (!process.env.EXPO_ACCESS_TOKEN) {
    console.warn(
      '\n' +
        '============================================================\n' +
        'WARNING: EXPO_ACCESS_TOKEN is NOT set.\n' +
        "This run will only hit sendPush's log-fallback path (a fake\n" +
        '"would send" log) and will NOT deliver anything to a phone.\n' +
        'Set EXPO_ACCESS_TOKEN in packages/api/.env first for a real send.\n' +
        'Trigger LOGIC + notifications rows still work fine without it.\n' +
        '============================================================\n',
    );
  }

  const email = process.env.DEV_LOGIN_EMAIL || '';

  // ── Resolve target user ────────────────────────────────────────────────────
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(
      `No user found for ${email} — sign in once via \`pnpm dev:bypass\` first,\n` +
        'or set DEV_LOGIN_EMAIL to an existing account.',
    );
    process.exit(1);
  }
  const userId = user.id;
  console.log(`Target user: ${email} (${userId})\n`);

  // ── Setup (idempotent) ─────────────────────────────────────────────────────
  // 1. Force opt-in — every trigger is opt-in-gated for its push.
  await db.update(users).set({ marketingOptIn: true }).where(eq(users.id, userId));
  console.log('Forced marketingOptIn = true.');

  // 2. Clear prior marketing rows so re-runs aren't dedup/frequency-cap blocked.
  //    Scoped to the 5 marketing types only — order_* transactional rows are a
  //    different, always-on family and are left untouched.
  await db
    .delete(notifications)
    .where(
      and(eq(notifications.user_id, userId), inArray(notifications.type, [...MARKETING_TYPES])),
    );
  console.log('Cleared prior marketing notifications for this user.');

  // 3. Pin `now` to a guaranteed-non-quiet-hours instant (04:00 UTC = 12:00
  //    Manila) so the quiet-hours gate never silently drops a send.
  const now = new Date();
  now.setUTCHours(4, 0, 0, 0);
  console.log(`Pinned now = ${now.toISOString()} (12:00 Manila, non-quiet).\n`);

  // ── Trigger 1: reward_unlocked ─────────────────────────────────────────────
  // The reward id string is never persisted/validated — a placeholder is safe.
  console.log('[1/5] reward_unlocked — notifyRewardUnlocked(...)');
  await notifyRewardUnlocked(userId, ['dev-script-test-reward']);

  // ── Trigger 2: new_deal ────────────────────────────────────────────────────
  console.log(
    '[2/5] new_deal — NOTE: broadcasts to ALL opted-in users in this DB, not\n' +
      `        just ${email} — fine for a local dev DB.`,
  );
  await notifyNewDeal('dev-script-test-deal', now);

  // ── Trigger 3: coupon_expiring (poll scan — needs a matching coupon row) ────
  console.log('[3/5] coupon_expiring — seeding an expiring coupon, then scanExpiringCoupons(now)');
  let [offer] = await db.select({ id: offers.id }).from(offers).limit(1);
  if (!offer) {
    [offer] = await db
      .insert(offers)
      .values({
        title: 'Dev script throwaway offer',
        deal_type: 'fixed_discount',
        start_at: now,
        end_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: offers.id });
    console.log('        (no offer existed — inserted a throwaway one)');
  }
  // Idempotent reset: delete any prior script-seeded coupon before inserting a
  // fresh one, so at most ONE `DEV-TEST-COUPON` row ever exists. A timestamp-based
  // code left old rows behind that kept matching scanExpiringCoupons's 72h-lead
  // window on every re-run, firing multiple `coupon_expiring` notifications per
  // run and silently eating frequency-cap slots. A fixed code + pre-delete makes
  // cap consumption deterministic across repeated runs.
  await db.delete(coupons).where(eq(coupons.code, 'DEV-TEST-COUPON'));
  await db.insert(coupons).values({
    user_id: userId,
    offer_id: offer.id,
    status: 'available',
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h out — inside 72h lead
    code: 'DEV-TEST-COUPON',
  });
  await scanExpiringCoupons(now);

  // ── Trigger 4: one_more_order (poll scan — needs a near-miss user_stars row) ─
  console.log('[4/5] one_more_order — seeding a near-miss star total, then scanOneMoreOrder(now)');
  const [tier] = await db
    .select({ requiredStars: rewards.required_stars })
    .from(rewards)
    .where(eq(rewards.is_active, true))
    .limit(1);
  if (!tier) {
    console.log('        no active reward tier found — skipping one_more_order seed');
  } else {
    const nearMiss = tier.requiredStars - 1;
    const [existingStars] = await db
      .select({ id: userStars.id })
      .from(userStars)
      .where(eq(userStars.user_id, userId))
      .limit(1);
    if (existingStars) {
      await db
        .update(userStars)
        .set({ current_stars: nearMiss, lifetime_stars: nearMiss })
        .where(eq(userStars.user_id, userId));
    } else {
      await db
        .insert(userStars)
        .values({ user_id: userId, current_stars: nearMiss, lifetime_stars: nearMiss });
    }
  }
  await scanOneMoreOrder(now);

  // ── Trigger 5: branch_promo (call the guard directly for the target user) ───
  console.log(
    '[5/5] branch_promo — dispatchMarketingNotificationIfAllowed(...) directly.\n' +
      '        This exercises the dispatch/guard logic for one user, NOT the real\n' +
      "        admin HTTP endpoint's audience-selection query. To test that path,\n" +
      '        POST /api/admin/notifications/branch-promo separately.',
  );
  const [branch] = await db.select({ id: branches.id }).from(branches).limit(1);
  if (!branch) {
    console.log('        no branch found — skipping branch_promo');
  } else {
    await dispatchMarketingNotificationIfAllowed(
      userId,
      'branch_promo',
      {
        title: 'Weekend special (dev script)',
        body: 'Test branch promo dispatched by trigger-all-marketing-notifications.ts',
        targetScreen: 'deal_details',
        targetParams: { branchId: branch.id },
      },
      { now: () => now },
    );
  }

  // ── Output: recent notifications for the target user ───────────────────────
  console.log('\n──────────────── Recent notifications (newest first) ────────────────');
  const rows = await db
    .select({
      type: notifications.type,
      title: notifications.title,
      target_params: notifications.target_params,
      created_at: notifications.created_at,
    })
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(10);

  for (const row of rows) {
    console.log(
      `${row.created_at.toISOString()}  ${row.type.padEnd(16)}  ${row.title}` +
        (row.target_params ? `  params=${JSON.stringify(row.target_params)}` : ''),
    );
  }

  // ── Summary checklist: which of the 5 types produced a row ─────────────────
  console.log('\n──────────────── Trigger result checklist ────────────────');
  const seenTypes = new Set(rows.map((r) => r.type));
  for (const type of MARKETING_TYPES) {
    console.log(`  ${seenTypes.has(type) ? '[x]' : '[ ]'} ${type}`);
  }
  console.log(
    "\nA missing [ ] means that trigger got gated (opt-in didn't stick, still in\n" +
      'quiet hours, frequency cap hit, or the poll scan found no matching seed row).',
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error while triggering marketing notifications:', err);
  process.exit(1);
});
