import { env } from '@/config/env';

/**
 * Resolve a product/deal image reference to a fully-qualified URL the RN `Image`
 * component can load.
 *
 * The backend stores RELATIVE paths (e.g. `/images/fries-large.webp`) so the
 * absolute origin is never baked into the DB — this resolves them against the
 * app's current API origin (`env.apiUrl`) at call time, which is tunnel-proof
 * (works through a dynamic ngrok URL). Already-absolute `http(s)` URLs pass
 * through unchanged, so the function is idempotent and safe to double-apply.
 * A missing/empty value returns `undefined` so callers fall back to a placeholder.
 */
export function resolveImageUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  return `${env.apiUrl}${pathOrUrl}`;
}
