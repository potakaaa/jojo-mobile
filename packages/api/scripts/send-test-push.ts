import 'dotenv/config';
import { desc } from 'drizzle-orm';
import { db } from '../src/db/client';
import { deviceTokens } from '../src/db/schema/device_tokens';
import { sendPush } from '../src/lib/push-provider';

/**
 * Dev-only diagnostic (not app/production code).
 *
 * Sends ONE real test push to the most-recently-active registered device so a
 * developer can confirm the whole pipeline works after rebuilding the dev client
 * with the new Firebase/FCM wiring: server -> Expo -> FCM -> physical device.
 *
 * Run: `pnpm --filter @jojopotato/api push:test`
 *
 * Reuses the already-tested `sendPush` provider verbatim — no push logic is
 * reimplemented here. Always targets the single newest `device_tokens` row
 * (ordered by `last_seen_at` desc); no CLI args, which is enough for a solo
 * manual test.
 */
async function main(): Promise<void> {
  if (!process.env.EXPO_ACCESS_TOKEN) {
    console.warn(
      '\n' +
        '============================================================\n' +
        'WARNING: EXPO_ACCESS_TOKEN is NOT set.\n' +
        'This run will only hit sendPush\'s log-fallback path (a fake\n' +
        '"would send" log) and will NOT deliver anything to a phone.\n' +
        'Set EXPO_ACCESS_TOKEN in packages/api/.env first for a real send.\n' +
        '============================================================\n',
    );
  }

  const [row] = await db
    .select()
    .from(deviceTokens)
    .orderBy(desc(deviceTokens.last_seen_at))
    .limit(1);

  if (!row) {
    console.error(
      'No rows in device_tokens. To register a device: open the rebuilt app on\n' +
        'your physical device, sign in, and grant notification permission (this\n' +
        'populates device_tokens via POST /notifications/device-tokens). Then\n' +
        're-run this script.',
    );
    process.exit(1);
  }

  const tokenPreview = `${row.push_token.slice(0, 12)}...`;
  console.log('Sending test push to most-recently-active device:', {
    device_id: row.device_id,
    platform: row.platform,
    push_token: tokenPreview,
  });

  const results = await sendPush([row.push_token], {
    title: 'Jojo Potato test push',
    body: 'This confirms real push delivery is working end to end.',
  });

  console.log('sendPush result:', results);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error while sending test push:', err);
  process.exit(1);
});
