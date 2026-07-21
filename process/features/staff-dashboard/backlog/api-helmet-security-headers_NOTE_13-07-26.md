---
name: backlog:api-helmet-security-headers
description: "Add helmet() security headers to the Express API (CWE-693) — pre-existing, app-wide"
date: 13-07-26
metadata:
  node_type: memory
  type: backlog
  feature: staff-dashboard
  priority: P2
---

# Backlog: Add Helmet security headers to the Express API

**Priority:** P2 — security hardening; pre-existing gap, not staff-specific
**Discovered:** CodeRabbit review of PR #65 (STAFF-001), 2026-07-13

## Problem

Static analysis (CWE-693, Protection Mechanism Failure) flags `packages/api/src/index.ts`
as missing standard security response headers. The Express app sets none of
`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.

This is a **pre-existing, app-wide** gap — not introduced by the staff work — so it was
deliberately kept out of the STAFF-001 PR to avoid bundling an unrelated runtime
dependency into a feature branch.

## Recommended action

Add [`helmet`](https://helmetjs.github.io/) as a dependency of `@jojopotato/api` and mount it
early in `src/index.ts`:

```ts
import helmet from 'helmet';
// ...
app.use(helmet());
// mount BEFORE the app data routes; safe alongside the better-auth handler and express.json().
```

Verify it does not interfere with the better-auth handler (`app.all('/api/auth/*splat', ...)`)
or the magic-link redirect. Add a smoke test asserting the headers are present on a response.

## Why a separate ticket

- Adds a new runtime dependency (`helmet`) — belongs in a dedicated security-hardening change, not a feature PR.
- App-wide scope; touches the shared middleware chain used by every route.
- Should land with its own review + a header-assertion test.
