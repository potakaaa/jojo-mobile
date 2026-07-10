import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, phoneNumber } from 'better-auth/plugins';
import { Resend } from 'resend';

import { db } from '../db/client';
import * as schema from '../db/schema/index';
import { storeDevLoginToken } from './dev-auto-login';

const isDev = process.env.NODE_ENV !== 'production';

// Real magic-link delivery via Resend when configured; otherwise fall back to a
// server-side log so local dev / tests work without a Resend account (the link
// still round-trips, it just isn't emailed). RESEND_API_KEY is server-only.
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const magicLinkFrom = process.env.RESEND_FROM ?? 'Jojo Potato <onboarding@resend.dev>';

/**
 * better-auth server instance wired into the existing Drizzle/Postgres backend.
 *
 * - Drizzle adapter maps better-auth models onto the app schema; the app
 *   `users` table IS better-auth's `user` model.
 * - `advanced.database.generateId: false` defers id generation to Postgres
 *   (`defaultRandom()` uuid) — every id/foreign key in the schema is a uuid.
 * - Sliding session: a session used at least once a day silently refreshes and
 *   only fully expires after 30 idle days.
 * - `role` is exposed read-only (`input: false`) so no client can self-assign a
 *   privileged role; the DB column default (`customer`) is the source of truth.
 * - Phone OTP delivery is stubbed (logged) per the resolved provider decision;
 *   magic-link delivery uses Resend.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  advanced: {
    database: {
      generateId: false,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // slide the expiry forward once per day of use
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        input: false, // never settable by a client — DB default 'customer' wins
      },
    },
  },
  trustedOrigins: ['jojopotato://', ...(isDev ? ['exp://'] : [])],
  plugins: [
    expo(),
    phoneNumber({
      // STUB: no SMS vendor wired yet (resolved decision). Log the code so the
      // full OTP flow is exercisable end-to-end in dev/tests without an SMS bill.
      sendOTP: async ({ phoneNumber: to, code }) => {
        console.log(`[auth] phone OTP for ${to}: ${code}`);
      },
      // Verifying an OTP for a new phone number provisions the user + session.
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone}@phone.jojopotato.local`,
        getTempName: (phone) => phone,
      },
    }),
    magicLink({
      // Deliver the raw `token` INTO the app rather than the default server-side
      // `/api/auth/magic-link/verify` URL. That default link verifies in whatever
      // browser opens the email — the WRONG context: the session cookie is set on
      // the browser, not on the expo client, so the app stays logged out
      // (@better-auth/expo issue #6936). Instead we email an https link to the
      // `/magic-link/native` redirect route, which bounces the token into the app
      // via the `jojopotato://` scheme WITHOUT verifying it. The app then completes
      // verification through its own authClient, so the expo client stores the
      // session cookie in SecureStore itself.
      sendMagicLink: async ({ email, token }) => {
        // Remember the token for the dev auto-login endpoint. No-op unless
        // auto-login is enabled, so the normal delivery path below is never
        // suppressed.
        storeDevLoginToken(email, token);

        const appUrl = `${process.env.BETTER_AUTH_URL}/magic-link/native?token=${encodeURIComponent(token)}`;
        if (!resend) {
          console.log(`[auth] magic link for ${email} (RESEND_API_KEY unset): ${appUrl}`);
          return;
        }
        await resend.emails.send({
          from: magicLinkFrom,
          to: email,
          subject: 'Your Jojo Potato sign-in link',
          text: `Tap to sign in to Jojo Potato: ${appUrl}`,
        });
      },
    }),
  ],
});
