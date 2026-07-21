---
name: plan:wire-better-auth-magic-link-expo-caveat
description: "Why magic-link sign-in is wired through a custom /magic-link/native redirect route instead of better-auth's default flow, and what remains unverified"
date: 09-07-26
feature: auth-accounts
---

# Backlog/Reference: Magic-Link Expo Caveat (better-auth)

## Status

Implemented (workaround shipped) — documented here so future developers understand WHY the
magic-link flow is wired the unusual way it is, and what remains a known-gap. Not an open TODO in
the "needs code" sense; it's durable rationale + a forward-looking trigger to simplify once
upstream ships a fix.

## The problem

better-auth's default magic-link flow does **not** log the user in on Expo/React Native. The
emailed link points at the server verify endpoint; clicking it in an external email app verifies
the token and sets the session cookie in that **external browser**, not in the app. The
`@better-auth/expo` client only ingests a session cookie as the return value of
`openAuthSessionAsync` (the in-app browser used for OAuth) — it has no global listener for
cold-start magic-link deep links. Net effect: the app opens, but the user stays logged out.

This is a known upstream issue:
https://github.com/better-auth/better-auth/issues/6936 (better-auth `^1.6.23` /
`@better-auth/expo` `^1.6.23`, the versions this repo pins).

## Our workaround (token-relay approach)

1. `packages/api/src/lib/auth.ts` `sendMagicLink` emails an `https://` link pointed at a new plain
   Express route, `GET /magic-link/native?token=...`, added in `packages/api/src/index.ts`
   **outside** the `/api/auth` better-auth mount.
2. That route 302-redirects into the app's custom scheme —
   `jojopotato:///magic-link?token=...` — **without verifying server-side first**.
3. The app route `apps/mobile/src/app/(auth)/magic-link.tsx` reads the token from the deep link and
   calls `authClient.magicLink.verify({ query: { token } })` itself — verification happens
   **through** `authClient`, so the `@better-auth/expo` client's own SecureStore session-cookie
   persistence path is what stores the resulting session (deliberately not poked directly).
4. New server env var: `APP_SCHEME` (default `jojopotato`, server-only — used to build the
   redirect target).

This uses only public better-auth client APIs end to end; it does not reach into
`@better-auth/expo`'s internal SecureStore cookie-jar key.

## Hard requirements / caveats

- **Requires a development build (`expo-dev-client`).** Custom URL schemes (`jojopotato://`) do not
  work in Expo Go — this applies to magic-link *and* the Google OAuth deep-link return. Any
  simulator/device verification must run against a dev build, not Expo Go.
- **`BETTER_AUTH_URL` must be reachable from the device** — e.g. an ngrok/cloudflared https tunnel
  during local dev — and that same origin must be registered wherever better-auth expects it
  (trusted origins / OAuth callback config). See also
  `wire-better-auth-manual-prereqs_NOTE_09-07-26.md` for the related Google OAuth / Resend
  provisioning prerequisites (same "reachable base URL" dependency).

## Known-gap (what's still unverified)

The full on-device round trip — tap the emailed link → app opens at `/magic-link` → in-app
`authClient.magicLink.verify()` call → session lands in SecureStore → `Stack.Protected` gate flips
from `(auth)` to `(tabs)` — is only verifiable on a real device or dev build. It is **not**
verifiable headlessly or in Expo Go. Automated coverage currently stops at:

- server typecheck/lint (green)
- a server-side `curl` proving the 302 or `Location: jojopotato:///magic-link?token=...` redirect

This rolls up into the same manual/simulator known-gap already tracked in the
`wire-better-auth` closeout report and `wire-better-auth-hook-test-coverage_NOTE_09-07-26.md`.

## Follow-up trigger

Revisit if/when better-auth ships native magic-link session handling upstream (tracked in
[issue #6936](https://github.com/better-auth/better-auth/issues/6936)). If/when it does, the custom
`/magic-link/native` redirect route plus the app-side manual `authClient.magicLink.verify()` call
could likely be simplified or removed in favor of the default flow.

## Cross-references

- `process/features/auth-accounts/completed/wire-better-auth_09-07-26/wire-better-auth_REPORT_09-07-26.md`
  — the completed record this caveat's implementation landed against (see its "Magic-link Expo
  caveat" subsection, added after this note).
- `process/features/auth-accounts/backlog/wire-better-auth-manual-prereqs_NOTE_09-07-26.md` —
  Resend/Google/`BETTER_AUTH_URL` provisioning prerequisites shared with this flow.
- `process/features/auth-accounts/backlog/wire-better-auth-hook-test-coverage_NOTE_09-07-26.md` —
  the broader mobile-side automated-test gap this known-gap rolls into.
- `process/features/auth-accounts/backlog/wire-better-auth-followups_NOTE_09-07-26.md` —
  unrelated, distinct deferred-by-design follow-ups (role elevation, onboarding profile, etc.) —
  linked only for feature-folder navigation completeness.
