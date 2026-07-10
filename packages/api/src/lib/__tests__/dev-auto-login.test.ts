import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the DEV-ONLY auto-login gate + token store.
 *
 * The gate is evaluated ONCE at module load, so each case uses
 * `vi.resetModules()` + a fresh `import()` to re-run the load-time gate under
 * different env. We test the module directly — never boot the Express app
 * (index.ts calls app.listen).
 */

type DevAutoLoginModule = typeof import('../dev-auto-login');

const ENV_KEYS = ['DEV_AUTO_LOGIN', 'DEV_LOGIN_EMAIL', 'NODE_ENV'] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function loadModule(): Promise<DevAutoLoginModule> {
  return import('../dev-auto-login');
}

describe('dev-auto-login gate', () => {
  it('is disabled by default (no env) and the token store is inert', async () => {
    const mod = await loadModule();

    expect(mod.DEV_AUTO_LOGIN_ENABLED).toBe(false);

    mod.storeDevLoginToken('user@example.com', 'tok-123');
    expect(mod.takeDevLoginToken('user@example.com')).toBeNull();
  });

  it('THROWS at load when auto-login is on under NODE_ENV=production', async () => {
    process.env.DEV_AUTO_LOGIN = 'true';
    process.env.NODE_ENV = 'production';

    await expect(loadModule()).rejects.toThrow(/production/i);
  });

  it('THROWS at load when DEV_LOGIN_EMAIL is not an email address', async () => {
    process.env.DEV_AUTO_LOGIN = 'true';
    process.env.DEV_LOGIN_EMAIL = 'notanemail';

    await expect(loadModule()).rejects.toThrow(/email/i);
  });

  it('enables with the default email when DEV_LOGIN_EMAIL is unset', async () => {
    process.env.DEV_AUTO_LOGIN = 'true';

    const mod = await loadModule();

    expect(mod.DEV_AUTO_LOGIN_ENABLED).toBe(true);
    expect(mod.DEV_LOGIN_EMAIL).toBe('dev@jojopotato.local');
  });
});

describe('dev-auto-login enabled', () => {
  beforeEach(() => {
    process.env.DEV_AUTO_LOGIN = 'true';
  });

  it('round-trips a token once (single use) and only for the stored email', async () => {
    const mod = await loadModule();
    expect(mod.DEV_AUTO_LOGIN_ENABLED).toBe(true);

    mod.storeDevLoginToken('Dev@Jojopotato.local', 'tok-abc');
    // Keyed by normalized (lowercased/trimmed) email.
    expect(mod.takeDevLoginToken('  dev@jojopotato.local ')).toBe('tok-abc');
    // Second take returns null — the token is consumed (single use).
    expect(mod.takeDevLoginToken('dev@jojopotato.local')).toBeNull();

    // A different email never sees another account's token.
    mod.storeDevLoginToken('dev@jojopotato.local', 'tok-def');
    expect(mod.takeDevLoginToken('someone-else@example.com')).toBeNull();
  });
});
