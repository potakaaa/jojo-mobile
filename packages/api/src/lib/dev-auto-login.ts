/**
 * DEV-ONLY auto-login primitive.
 *
 * This module exists for exactly one reason: to skip the login screen during
 * LOCAL development. It hands out a real, verifiable magic-link token for
 * exactly ONE server-configured account (`DEV_LOGIN_EMAIL`) — never for an
 * arbitrary, caller-supplied address. Because the email comes from the server's
 * OWN environment and the `/dev/session` endpoint takes no parameters, the only
 * account this can ever create or access is that single configured one; it
 * cannot be pointed at a real user's email by a caller.
 *
 * The gate is evaluated ONCE at module load and THROWS rather than silently
 * degrading:
 *   1. never runs under NODE_ENV=production (refuses to start),
 *   2. a configured DEV_LOGIN_EMAIL that isn't an email address is rejected.
 * If auto-login is requested but any gate fails, importing this module crashes
 * the process — fail closed and loud.
 */

const requested = process.env.DEV_AUTO_LOGIN === 'true';

function evaluateGate(): boolean {
  if (!requested) return false;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEV_AUTO_LOGIN=true is set while NODE_ENV=production. The dev auto-login mints a ' +
        'real session for a fixed account and must never run in production. Refusing to start.',
    );
  }

  const configuredEmail = process.env.DEV_LOGIN_EMAIL;
  if (configuredEmail !== undefined && !configuredEmail.includes('@')) {
    throw new Error(
      `DEV_AUTO_LOGIN=true but DEV_LOGIN_EMAIL='${configuredEmail}' is not an email address ` +
        '(missing "@"). Fix the value or unset it to use the default. Refusing to start.',
    );
  }

  return true;
}

/** True only when auto-login was requested AND every load-time gate passed. */
export const DEV_AUTO_LOGIN_ENABLED: boolean = evaluateGate();

/**
 * The ONE account `/dev/session` can ever sign in. Read from the server's own
 * env; defaults to a local placeholder that better-auth's magicLink plugin
 * auto-creates on first use.
 */
export const DEV_LOGIN_EMAIL: string = process.env.DEV_LOGIN_EMAIL ?? 'dev@jojopotato.local';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredToken {
  token: string;
  expiresAt: number;
}

const tokenStore = new Map<string, StoredToken>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pruneExpired(now: number): void {
  for (const [key, entry] of tokenStore) {
    if (entry.expiresAt <= now) tokenStore.delete(key);
  }
}

/**
 * Remember the most recent magic-link token issued for `email` so the dev
 * endpoint can hand it back. No-op when auto-login is disabled.
 */
export function storeDevLoginToken(email: string, token: string): void {
  if (!DEV_AUTO_LOGIN_ENABLED) return;
  tokenStore.set(normalizeEmail(email), {
    token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
}

/**
 * Return the pending token for `email` and DELETE it (single use). Returns null
 * when auto-login is disabled, no token exists, or the token has expired.
 * Expired entries are pruned on access.
 */
export function takeDevLoginToken(email: string): string | null {
  if (!DEV_AUTO_LOGIN_ENABLED) return null;

  const now = Date.now();
  pruneExpired(now);

  const key = normalizeEmail(email);
  const entry = tokenStore.get(key);
  if (!entry) return null;

  tokenStore.delete(key); // single use — always consume
  if (entry.expiresAt <= now) return null;

  return entry.token;
}
