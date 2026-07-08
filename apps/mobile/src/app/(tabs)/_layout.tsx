/**
 * Base (non-platform-suffixed) fallback layout for the `(tabs)` route group.
 *
 * Expo Router's static web export requires a base `_layout` sibling to exist
 * alongside the platform-specific `_layout.ios.tsx` / `_layout.android.tsx` /
 * `_layout.web.tsx` files. At runtime this file is never selected on iOS,
 * Android, or web — Metro's platform-extension resolution always prefers the
 * matching platform sibling. It re-exports the web layout's default so that any
 * environment falling through to the base (e.g. the static export tooling)
 * still gets a valid, renderable tab layout.
 */
export { default } from './_layout.web';
