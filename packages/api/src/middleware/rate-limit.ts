import type { NextFunction, Request, Response } from 'express';

/**
 * Small hand-rolled fixed-window rate limiter (ADM-011, #141). No npm dependency —
 * `express-rate-limit` was considered and rejected as unnecessary weight for a
 * single call site (`POST /staff-invite/start`).
 *
 * IP SOURCE: `req.ip` — Express's own `remoteAddress`-derived resolution. This
 * codebase sets NO `app.set('trust proxy', ...)` anywhere (zero existing rate-limit
 * precedent), so `req.ip` reflects the direct TCP peer, NOT any `X-Forwarded-For`
 * header — correct and safe for the CURRENT single-instance, no-reverse-proxy
 * deployment (see `admin-api-same-origin-reverse-proxy_NOTE_20-07-26.md`). CAUTION:
 * if a reverse proxy is EVER placed in front of this API, `trust proxy` must be
 * configured AND this limiter's IP source revisited — otherwise every request will
 * appear to share the proxy's IP (over-limiting everyone, or under-limiting a real
 * attacker behind it). Do NOT assume `X-Forwarded-For` is trustworthy without that.
 *
 * STATE: the window map is per-process and in-memory — it resets on restart/redeploy
 * and is NOT shared across instances if this API ever runs multi-instance. Acceptable
 * for the current single-instance deployment. Upgrade path when that changes: swap to
 * a shared store (Redis) or `express-rate-limit` with a shared store — named here, not
 * built now (YAGNI).
 */
interface WindowEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, WindowEntry>();

/**
 * Test-only: clear the shared in-memory window map. vitest does NOT reset module
 * state between test cases in the same file, so a rate-limit-hammering test would
 * otherwise poison the limiter for any later `/start` call in the same file within
 * the same window. Integration tests call this around the hammering case.
 */
export function __resetRateLimitStoreForTests(): void {
  store.clear();
}

export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = store.get(key);

    // No live window, or the window has fully elapsed → start a fresh one.
    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (entry.count >= max) {
      // Generic body — deliberately does NOT distinguish a 429 from any other error
      // shape, so it cannot be used to fingerprint request timing.
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    entry.count += 1;
    next();
  };
}
