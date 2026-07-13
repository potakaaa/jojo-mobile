// Augment Express's `Request` with the better-auth session/user attached by the
// `require-session` middleware. Types are derived from `auth.api.getSession`'s
// own return shape so they never drift from the better-auth instance config.
import type { auth } from '../lib/auth';

type SessionResult = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare global {
  namespace Express {
    interface Request {
      user?: SessionResult['user'];
      session?: SessionResult['session'];
    }
  }
}

export {};
