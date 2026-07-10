// Load .env FIRST — must run before any import that reads process.env at
// module-load time (e.g. ./lib/auth reads BETTER_AUTH_URL / GOOGLE_CLIENT_* on
// evaluation). A side-effect import is hoisted, so this stays the first statement.
import 'dotenv/config';

import { toNodeHandler } from 'better-auth/node';
import express from 'express';

import { auth } from './lib/auth';
import { DEV_AUTO_LOGIN_ENABLED, DEV_LOGIN_EMAIL, takeDevLoginToken } from './lib/dev-auto-login';

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Mount the better-auth handler BEFORE any body-parsing middleware — better-auth
// reads the raw request body itself, so `express.json()` must not consume it
// first. Express 5 requires a NAMED wildcard (`*splat`); a bare `*` throws at
// route registration.
app.all('/api/auth/*splat', toNodeHandler(auth));

// JSON body parsing for the app's own (non-auth) routes, mounted after auth.
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'jojopotato-api' });
});

// Magic-link → app bridge. Intentionally NOT under `/api/auth/*` (so it does not
// hit the better-auth handler) and does NOT verify the token server-side. An
// https link is reliably tappable from any email client; this 302 bounces the
// raw token into the dev build via the app scheme, where the expo authClient
// completes verification and stores the session cookie itself
// (@better-auth/expo issue #6936 workaround).
app.get('/magic-link/native', (req, res) => {
  const token = String(req.query.token ?? '');
  const scheme = process.env.APP_SCHEME ?? 'jojopotato';
  res.redirect(`${scheme}:///magic-link?token=${encodeURIComponent(token)}`);
});

// DEV-ONLY auto-login. Registered ONLY when auto-login is enabled, so the route
// is absent (404 by non-existence) otherwise — the app then falls through to the
// normal login screen. It takes NO parameters: it mints a real magic-link token
// for the single server-configured `DEV_LOGIN_EMAIL` and returns it, so a caller
// can never point it at another account. The token is verified by the app
// THROUGH authClient (a plain fetch can't establish the session), which is why
// we return a token rather than a Set-Cookie.
if (DEV_AUTO_LOGIN_ENABLED) {
  app.post('/dev/session', async (_req, res) => {
    try {
      // Ask better-auth to issue a magic link for the fixed dev account. This
      // triggers sendMagicLink, which stores the token in the dev token map.
      await auth.api.signInMagicLink({
        body: { email: DEV_LOGIN_EMAIL, callbackURL: 'jojopotato://' },
        // signInMagicLink is declared `requireHeaders: true`; the token is
        // captured via the sendMagicLink side-effect, so an empty header set is
        // all this server-to-server call needs.
        headers: {},
      });

      const token = takeDevLoginToken(DEV_LOGIN_EMAIL);
      if (!token) {
        res.status(500).json({ error: 'dev auto-login failed to mint a token' });
        return;
      }

      res.status(200).json({ token });
    } catch {
      // Never leak a stack trace in the response body.
      res.status(500).json({ error: 'dev auto-login failed to mint a token' });
    }
  });
}

app.listen(port, () => {
  console.log(`jojopotato-api listening on port ${port}`);
  if (DEV_AUTO_LOGIN_ENABLED) {
    console.warn(
      `⚠  DEV AUTO-LOGIN ENABLED — POST /dev/session signs in ${DEV_LOGIN_EMAIL}. Never expose this server publicly.`,
    );
  }
});
