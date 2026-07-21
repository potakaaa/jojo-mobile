import { db } from '../db/client';
import { notifications } from '../db/schema/index';
import { dispatchMarketingNotificationIfAllowed } from '../routes/lib/notification-dispatch';

/**
 * The Expo Router route for the Rewards tab — where a reward-unlock notification
 * deep-links to. Confirmed against the app's route convention (see
 * `apps/mobile/src/app/(tabs)/index.tsx` → `router.push('/(tabs)/rewards')`).
 */
const REWARDS_SCREEN = '/(tabs)/rewards';

const REWARD_UNLOCK_TITLE = 'Reward unlocked!';
const REWARD_UNLOCK_BODY = 'You unlocked a new Jojo Stars reward. Tap to view your rewards.';

/**
 * Best-effort, post-commit reward-unlock notification (STAR-003, LD4 + PUSH-005).
 *
 * Two independent effects, both AFTER the star-credit transaction commits, both
 * inside one try/catch (a notification failure must NEVER roll back or fail a real
 * coupon):
 *   1. The UNCONDITIONAL in-app row(s): one `notifications` row per newly-unlocked
 *      reward (`type='reward_unlocked'`, Rewards screen). This is NOT opt-in-gated
 *      — a reward the customer earned always shows in-app. Unchanged from STAR-003.
 *   2. The opt-in-gated PUSH (PUSH-005, AC5): exactly ONE guarded push-only
 *      dispatch for the whole unlock event — N unlocked tiers ⇒ N in-app rows but
 *      just 1 push (E5). `writeRow: false` means the guard does NOT insert a second
 *      row (the in-app rows above already exist); it only runs the opt-in /
 *      quiet-hours / cap gates + the push send. An opted-out user still gets the
 *      in-app row(s) and receives no push.
 */
export async function notifyRewardUnlocked(userId: string, rewardIds: string[]): Promise<void> {
  if (rewardIds.length === 0) return;
  try {
    await db.insert(notifications).values(
      rewardIds.map(() => ({
        user_id: userId,
        title: REWARD_UNLOCK_TITLE,
        body: REWARD_UNLOCK_BODY,
        type: 'reward_unlocked',
        target_screen: REWARDS_SCREEN,
      })),
    );

    // Exactly ONE opt-in-gated push for the whole unlock event (writeRow:false —
    // the in-app row(s) above are the persisted record; the guard only sends).
    await dispatchMarketingNotificationIfAllowed(
      userId,
      'reward_unlocked',
      { title: REWARD_UNLOCK_TITLE, body: REWARD_UNLOCK_BODY, targetScreen: 'rewards' },
      { writeRow: false },
    );
  } catch (err) {
    // Swallow: a notification failure must never roll back or fail a coupon.
    console.error('[reward-unlock-notify] failed to notify reward unlock', err);
  }
}
