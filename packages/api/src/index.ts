// Load .env FIRST — must run before any import that reads process.env at
// module-load time (e.g. ./lib/auth reads BETTER_AUTH_URL / GOOGLE_CLIENT_* on
// evaluation). A side-effect import is hoisted, so this stays the first statement.
import 'dotenv/config';

import { toNodeHandler } from 'better-auth/node';
import express from 'express';

import { auth } from './lib/auth';
import { branchesRouter } from './routes/branches';
import { menuRouter } from './routes/menu';

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Mount the better-auth handler BEFORE any body-parsing middleware — better-auth
// reads the raw request body itself, so `express.json()` must not consume it
// first. Express 5 requires a NAMED wildcard (`*splat`); a bare `*` throws at
// route registration.
app.all('/api/auth/*splat', toNodeHandler(auth));

// JSON body parsing for the app's own (non-auth) routes, mounted after auth.
app.use(express.json());

// App data routes — mounted strictly AFTER express.json() and after the
// better-auth handler above; the auth mount order must not change.
app.use('/api/branches', branchesRouter);
app.use('/api/menu', menuRouter);

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

app.listen(port, () => {
  console.log(`jojopotato-api listening on port ${port}`);
});
