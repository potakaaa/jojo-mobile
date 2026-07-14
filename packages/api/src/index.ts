// Load .env FIRST — must run before any import that reads process.env at
// module-load time (e.g. ./lib/auth reads BETTER_AUTH_URL / GOOGLE_CLIENT_* on
// evaluation). A side-effect import is hoisted, so this stays the first statement.
import 'dotenv/config';

import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import { and, asc, eq, gte, lte, notExists, sql } from 'drizzle-orm';
import express, { type Express } from 'express';

import { db } from './db/client';
import { branches, dealBranches, deals } from './db/schema/index';
import { auth } from './lib/auth';
import { DEV_AUTO_LOGIN_ENABLED, DEV_LOGIN_EMAIL, takeDevLoginToken } from './lib/dev-auto-login';
import { requireAdmin } from './lib/require-admin';
import { requireStaff } from './lib/require-staff';
import adminRouter from './routes/admin/index';
import { branchesRouter } from './routes/branches';
import { dealsRouter } from './routes/deals';
import { ordersRouter } from './routes/orders';
import staffRouter from './routes/staff';

// Browser origin of the admin web app (apps/admin, dev port 3100). Read from an
// env var so prod can override; NEVER a wildcard (credentialed CORS forbids it).
const ADMIN_WEB_ORIGIN = process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:3100';

// ONE credentialed CORS middleware, mounted at TWO places (the /api/auth handler
// below and the /api/admin router further down). Single definition so the origin
// and credentials policy can never drift between the two surfaces. Only requests
// carrying an `Origin` header (browsers) get the ACAO/credentials headers; the
// Expo mobile app sends no Origin and passes through untouched (no ACAO added,
// never blocked). cors() only sets headers / short-circuits OPTIONS — it does NOT
// consume the request body, so it is safe to run before the raw-body better-auth
// handler.
const adminCors = cors({ origin: [ADMIN_WEB_ORIGIN], credentials: true });

// Exported so supertest can attach to the Express app without binding a port.
export const app: Express = express();
const port = Number(process.env.PORT ?? 3000);

// Request logger — runs for EVERY request (incl. /api/auth/*). Does NOT parse or
// consume the body, so it's safe to register before the better-auth mount which
// needs the raw body. Logs method, path, status, and timing on response finish.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// CORS for the auth routes MUST run before the better-auth handler so it (a)
// answers the browser preflight OPTIONS (better-auth 404s OPTIONS) and (b) adds
// the ACAO header to the actual sign-in/get-session/sign-out responses. The
// admin browser client calls /api/auth/* cross-origin (admin dev port → API
// port); without this the browser blocks those responses. Same `adminCors` used
// by /api/admin — one origin policy, two mounts.
app.use('/api/auth', adminCors);

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

// Public branch locator endpoint. Returns only active branches, ordered by
// priority ascending (server-side fallback ordering; the mobile client re-sorts
// by distance when location is granted). No auth required — same style as `GET /`.
// `latitude`/`longitude` come back as strings (pg numeric); the mobile mapping
// layer converts them to numbers.
app.get('/api/branches', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(branches)
      .where(eq(branches.is_active, true))
      .orderBy(asc(branches.priority));
    res.json({ branches: rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Server-computed human-readable discount label from a deal's type + value.
// `discountValue` is a pg numeric string (or null). Percentage/fixed deals fall
// back to "Deal" when the value is null or "0"; trailing ".00" is stripped.
function computeDiscountLabel(dealType: string, discountValue: string | null): string {
  const parsed = discountValue !== null ? Number.parseFloat(discountValue) : NaN;
  const hasValue = Number.isFinite(parsed) && parsed !== 0;
  // Strip trailing .00 → integer string when whole, else keep the decimal.
  const num = hasValue ? Number(parsed).toString() : '';

  switch (dealType) {
    case 'percentage_discount':
      return hasValue ? `${num}% off` : 'Deal';
    case 'fixed_discount':
      return hasValue ? `₱${num} off` : 'Deal';
    case 'buy_one_take_one':
      return 'Buy 1 Get 1';
    case 'free_item':
      return 'Free Item';
    case 'free_upgrade':
      return 'Free Upgrade';
    case 'bundle':
      return hasValue ? `Bundle ₱${num}` : 'Bundle';
    default:
      return 'Deal';
  }
}

// RFC-4122 UUID matcher — branch ids are uuid columns; anything else is rejected
// as a 400 before it can reach (and throw in) the query layer.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Branch detail endpoint. Returns the single active branch plus the deals that
// apply to it: deals explicitly mapped to this branch (Query A) UNION deals with
// no `deal_branches` rows at all — i.e. global deals (Query B). Both filtered to
// active + within the [start_at, end_at] window. Results are merged and
// deduplicated by id, then each gets a server-computed `discountLabel`. Public,
// same security posture as GET /api/branches.
app.get('/api/branches/:id', async (req, res) => {
  const { id } = req.params;
  // Reject malformed ids before querying: branches.id is a uuid column, so a
  // non-uuid value would throw at the DB layer and surface as a 500. A bad id is
  // a client error → 400.
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'Invalid branch id' });
    return;
  }
  try {
    // Filter is_active so inactive branches follow the same 404 path as unknown
    // ids (mirrors the GET /api/branches list, which returns active branches only).
    const branchRows = await db
      .select()
      .from(branches)
      .where(and(eq(branches.id, id), eq(branches.is_active, true)));
    const branchRow = branchRows[0];
    if (!branchRow) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    const now = new Date();

    // Query A — deals explicitly mapped to this branch.
    const explicitPromise = db
      .select({ deal: deals })
      .from(deals)
      .innerJoin(dealBranches, eq(dealBranches.deal_id, deals.id))
      .where(
        and(
          eq(dealBranches.branch_id, id),
          eq(deals.is_active, true),
          lte(deals.start_at, now),
          gte(deals.end_at, now),
        ),
      );

    // Query B — global deals: no deal_branches rows exist for this deal at all.
    const globalPromise = db
      .select()
      .from(deals)
      .where(
        and(
          notExists(
            db
              .select({ one: sql`1` })
              .from(dealBranches)
              .where(eq(dealBranches.deal_id, deals.id)),
          ),
          eq(deals.is_active, true),
          lte(deals.start_at, now),
          gte(deals.end_at, now),
        ),
      );

    const [explicitRows, globalRows] = await Promise.all([explicitPromise, globalPromise]);

    // Merge (explicit rows are wrapped under `deal`) + dedupe by id.
    const byId = new Map<string, (typeof globalRows)[number]>();
    for (const r of explicitRows) byId.set(r.deal.id, r.deal);
    for (const r of globalRows) byId.set(r.id, r);

    const mappedDeals = [...byId.values()].map((d) => ({
      ...d,
      discountLabel: computeDiscountLabel(d.deal_type, d.discount_value),
    }));

    res.json({ branch: branchRow, deals: mappedDeals });
  } catch {
    res.status(500).json({ error: 'Failed to fetch branch' });
  }
});

// App order-flow routes (public branch reads + session-gated orders), mounted
// after express.json() so they get parsed JSON bodies.
app.use('/branches', branchesRouter);
app.use('/deals', dealsRouter);
app.use('/orders', ordersRouter);

// Staff routes — guarded ONCE at mount by requireStaff; future STAFF-002/003/004
// routes only add handlers to staffRouter and inherit the guard.
app.use('/api/staff', requireStaff(auth), staffRouter);

// Admin routes (ADM-001) — the FIRST browser-cookie-session surface. Guarded
// ONCE at mount: CORS (scoped here, credentialed, admin web origin only — never
// a wildcard) → requireAdmin (admits admin/super_admin only) → adminRouter.
// Later admin phases add sub-routers to adminRouter and inherit both guards.
app.use('/api/admin', adminCors, requireAdmin(auth), adminRouter);

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

// Do NOT bind a port under test — supertest attaches to `app` directly and the
// `role`-guard tests import this module for its exported `app`. Binding here
// would occupy port 3000 and keep the vitest process alive.
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  app.listen(port, () => {
    console.log(`jojopotato-api listening on port ${port}`);
    if (DEV_AUTO_LOGIN_ENABLED) {
      console.warn(
        `⚠  DEV AUTO-LOGIN ENABLED — POST /dev/session signs in ${DEV_LOGIN_EMAIL}. Never expose this server publicly.`,
      );
    }
  });
}
