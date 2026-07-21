---
name: backlog:admin-api-same-origin-reverse-proxy
description: "Deferred infra option — serve apps/admin + packages/api same-origin so the (dashboard) route guard could validate server-side instead of client-only"
date: 20-07-26
metadata:
  node_type: memory
  type: backlog
  feature: admin-dashboard
  priority: P3
---

# Backlog: Same-Origin Reverse Proxy for `apps/admin` + `packages/api` (Deferred Infra Option)

**Priority:** P3 — infrastructure/deploy decision, not a code fix
**Discovered:** 20-07-26, while planning the `(dashboard)` route SSR-guard fix
**Plan:** `process/features/admin-dashboard/active/adm-route-guard-ssr_20-07-26/`

## Problem this would solve

The `(dashboard)` layout's `beforeLoad` guard currently checks auth client-side only (a `fetch` to
`GET /api/admin/me` with `credentials: 'include'`, redirecting to `/login` on non-OK). It cannot
validate server-side during SSR because the better-auth session cookie is set by the API's own
origin — `apps/admin`'s SSR page request is a different origin (different host/port in this repo's
topology) and the browser never attaches that cookie to it. `requireAdmin` on the API remains the
real security boundary; the client guard is UX/correctness only (closing a shell-render-before-
redirect flash on hard refresh — see the linked plan for the current fix, which sets `ssr: false`
so the client guard genuinely re-runs on every load instead of a server-side check).

## Options (not yet decided, deferred)

1. **Reverse proxy, single origin.** Serve both apps under one origin: `example.com/` → `apps/admin`,
   `example.com/api/*` → `packages/api`. Dev: Vite `server.proxy` in `apps/admin/vite.config.ts`.
   Prod: nginx/Caddy/Traefik in front of both processes. Once same-origin, the session cookie is
   first-party to the SSR page request itself, and `beforeLoad` could `redirect()` server-side
   before any HTML ships — closing the gap at its root instead of via `ssr: false`.
2. **Shared parent-domain cookie.** better-auth's `advanced.crossSubDomainCookies.domain` config
   scopes the session cookie to a shared registrable parent domain (e.g. `admin.example.com` +
   `api.example.com` both under `example.com`). Requires a real shared domain in deploy — does NOT
   help in local dev, where the two apps differ only by port, not by subdomain.

## Payoff if implemented

- `(dashboard)`'s `beforeLoad` could do a real server-side session check and `redirect()` before
  any HTML is sent — no more relying on `ssr: false` + client re-check.
- `adminCors` and the `ADMIN_WEB_ORIGIN` `trustedOrigins` entry (`packages/api/src/lib/auth.ts`,
  `packages/api/src/index.ts`) could potentially be retired or simplified once cross-origin CORS is
  no longer needed for the admin app's calls.

## Status

**Deferred.** This is a deploy/infrastructure topology decision (reverse proxy or subdomain
strategy + hosting), not a source-code fix. The `ssr: false` route-guard fix in
`adm-route-guard-ssr_20-07-26/` supersedes the immediate need — it closes the actual bug (shell
renders before redirect on hard refresh) without requiring an infra change. Revisit this note only
if/when a deploy topology decision is made for `apps/admin` (EAS/deploy story for `apps/admin` is
itself still an open item — see `process/context/all-context.md` §Technology Stack).
