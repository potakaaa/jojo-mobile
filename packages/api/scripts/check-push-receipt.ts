import 'dotenv/config';
import { desc } from 'drizzle-orm';
import { Expo, type ExpoPushTicket } from 'expo-server-sdk';
import { db } from '../src/db/client';
import { deviceTokens } from '../src/db/schema/device_tokens';

/**
 * Dev-only diagnostic (not app/production code).
 *
 * Checks the actual DELIVERY RECEIPT for a push — the second-stage Expo API that
 * reveals real errors (`DeviceNotRegistered`, `MismatchSenderId`, bad FCM
 * credentials, etc.). This exists because production `sendPush`
 * (`packages/api/src/lib/push-provider.ts`) deliberately discards Expo's ticket
 * `id`, so there is otherwise NO way to look a receipt up. A ticket
 * `status: 'ok'` only means Expo's relay ACCEPTED the request — NOT that FCM/APNs
 * actually delivered it. This script bypasses `push-provider.ts` entirely and
 * talks to `expo-server-sdk` directly.
 *
 * Run:  `pnpm --filter @jojopotato/api push:receipt`
 * Re-check an existing ticket without resending:
 *       `pnpm --filter @jojopotato/api push:receipt -- --receipt=<ticketId>`
 *
 * Requires EXPO_ACCESS_TOKEN — a receipt check is meaningless without real
 * credentials (there is no sensible log-fallback for a receipt-lookup tool).
 */

const RECEIPT_RETRY_ATTEMPTS = 5;
const RECEIPT_RETRY_DELAY_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseReceiptArg(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--receipt='));
  if (!arg) return undefined;
  const value = arg.slice('--receipt='.length).trim();
  return value.length > 0 ? value : undefined;
}

async function checkReceipt(expo: Expo, ticketId: string): Promise<void> {
  console.log(`\nChecking delivery receipt for ticket id: ${ticketId}`);
  console.log(
    'Note: Expo receipts can take time to become available (up to ~15 minutes in\n' +
      'some cases). This makes a short best-effort retry loop only.\n',
  );

  for (let attempt = 1; attempt <= RECEIPT_RETRY_ATTEMPTS; attempt++) {
    const receipts = await expo.getPushNotificationReceiptsAsync([ticketId]);
    const receipt = receipts[ticketId];

    if (receipt) {
      console.log(`Receipt (attempt ${attempt}/${RECEIPT_RETRY_ATTEMPTS}):`, receipt);
      if (receipt.status === 'error') {
        console.log(
          '\n>>> DELIVERY FAILED per Expo. This is the actual root cause: <<<\n' +
            `    message: ${receipt.message}\n` +
            `    details: ${JSON.stringify(receipt.details ?? {})}`,
        );
      } else {
        console.log("\n>>> Delivered successfully per Expo's records (status: ok). <<<");
      }
      return;
    }

    if (attempt < RECEIPT_RETRY_ATTEMPTS) {
      console.log(
        `Receipt not ready yet (attempt ${attempt}/${RECEIPT_RETRY_ATTEMPTS}) — retrying in ` +
          `${RECEIPT_RETRY_DELAY_MS / 1000}s...`,
      );
      await sleep(RECEIPT_RETRY_DELAY_MS);
    }
  }

  console.log(
    '\nNo receipt available yet after ' +
      `${RECEIPT_RETRY_ATTEMPTS} attempts. This is normal — receipts can lag.\n` +
      `Re-run in a few minutes to check again WITHOUT resending a new push:\n` +
      `    pnpm --filter @jojopotato/api push:receipt -- --receipt=${ticketId}`,
  );
}

async function main(): Promise<void> {
  if (!process.env.EXPO_ACCESS_TOKEN) {
    console.warn(
      '\n' +
        '============================================================\n' +
        'WARNING: EXPO_ACCESS_TOKEN is NOT set.\n' +
        "This run will only hit sendPush's log-fallback path (a fake\n" +
        '"would send" log) and will NOT deliver anything to a phone.\n' +
        'Set EXPO_ACCESS_TOKEN in packages/api/.env first for a real send.\n' +
        '============================================================\n',
    );
    process.exit(1);
  }

  const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  // Re-check path: an existing ticket id was passed — skip straight to the
  // receipt fetch, do NOT resend a new push.
  const existingTicketId = parseReceiptArg();
  if (existingTicketId) {
    await checkReceipt(expo, existingTicketId);
    process.exit(0);
  }

  // Send path: look up the most-recently-active registered device.
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
  console.log('Sending receipt-check push to most-recently-active device:', {
    device_id: row.device_id,
    platform: row.platform,
    push_token: tokenPreview,
  });

  const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync([
    {
      to: row.push_token,
      sound: 'default',
      title: 'Jojo Potato receipt-check push',
      body: 'Diagnostic push from check-push-receipt.ts — checking real delivery receipt.',
      priority: 'high',
      _contentAvailable: true,
    },
  ]);

  console.log('\nRaw ticket(s) returned (including the id, which push-provider.ts discards):');
  console.log(tickets);

  const ticket = tickets[0];
  if (!ticket) {
    console.error('\nNo ticket returned from Expo — cannot check a receipt.');
    process.exit(0);
  }

  if (ticket.status === 'error') {
    console.error(
      '\n>>> Ticket itself FAILED — no point checking a receipt. <<<\n' +
        `    message: ${ticket.message}\n` +
        `    details: ${JSON.stringify(ticket.details ?? {})}`,
    );
    process.exit(0);
  }

  // status === 'ok' — Expo accepted the request. Now check the real receipt.
  await checkReceipt(expo, ticket.id);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error while checking push receipt:', err);
  process.exit(1);
});
