import { db } from '../db/client';
import { notifications } from '../db/schema/index';

/**
 * The Expo Router route for the Rewards tab — where a reward-unlock notification
 * deep-links to. Confirmed against the app's route convention (see
 * `apps/mobile/src/app/(tabs)/index.tsx` → `router.push('/(tabs)/rewards')`).
 */
const REWARDS_SCREEN = '/(tabs)/rewards';

/**
 * Best-effort, post-commit reward-unlock notification (STAR-003, LD4).
 *
 * Writes one `notifications` row per newly-unlocked reward with
 * `type='reward_unlocked'` targeting the Rewards screen. MUST be called AFTER
 * the star-credit transaction commits — a notification failure must NEVER roll
 * back or fail a real coupon, so the entire body is try/catch-wrapped and any
 * error is swallowed (logged only). `notifications.type` is a free-form varchar,
 * so `'reward_unlocked'` needs no enum migration.
 *
 * TODO(PUSH-002/003): dispatch a push notification for the reward unlock in
 * addition to persisting the in-app notification row.
 */
export async function notifyRewardUnlocked(userId: string, rewardIds: string[]): Promise<void> {
  if (rewardIds.length === 0) return;
  try {
    await db.insert(notifications).values(
      rewardIds.map(() => ({
        user_id: userId,
        title: 'Reward unlocked!',
        body: 'You unlocked a new Jojo Stars reward. Tap to view your rewards.',
        type: 'reward_unlocked',
        target_screen: REWARDS_SCREEN,
      })),
    );
  } catch (err) {
    // Swallow: a notification failure must never roll back or fail a coupon.
    console.error('[reward-unlock-notify] failed to write notification rows', err);
  }
}
