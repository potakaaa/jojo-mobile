---
slug: admin-phase-01-auth-rbac
date: 2026-07-14
verdict: VIABLE
originating-phase: pvl
---

# Phase 1 (ADM-001) — Feasibility Probe: Browser Cookie Session (Step 0)

## Hypothesis

Does better-auth's default cookie session work end-to-end for a plain browser fetch client (no
Expo plugin) against the existing `betterAuth()` instance in `packages/api/src/lib/auth.ts`,
without additional plugins?

## Mechanism Under Test

better-auth's default session-cookie issuance (`Set-Cookie` on sign-in) and recognition
(`getSession`/`get-session` route) when the caller is a plain HTTP client with no
`@better-auth/expo` plugin, no bearer-token headers, and no cookie-cache/`nextCookies` plugin
configured — i.e. exactly what a browser `fetch()` client in `apps/admin` would do.

## Probe Family

2 — Unit/integration test harness (vitest + supertest against the exported `app`, mirroring the
existing hermetic self-seeding pattern in `require-staff.integration.test.ts`).

## Probe Cost Class

`cheap-local` — confirmed. Ran entirely against a local Postgres instance and the repo's own
exported Express `app` (`packages/api/src/index.ts`). No live third-party provider, no shared
prod resource, no container exec. Safety gate: none required — proceeded freely.

**Environment note:** the repo's own `docker-compose.yml` maps Postgres to host port 5432, but
that port was already bound by an unrelated native `postgresql.service` on this machine (a
shared dev box). Rather than fight the port conflict, the probe created a `jojo`/`jojopotato`
role+database directly on that already-running local Postgres (`ALTER ROLE jojo CREATEDB;` was
also needed — the pre-existing `jojo` role lacked `CREATEDB`, which vitest's `global-setup.ts`
needs to create its ephemeral `<db>_test` database) and ran
`pnpm --filter @jojopotato/api db:migrate` against it. This is still local-only infra, not a
shared/prod resource — cost class is unaffected.

## Probe Method

Wrote a throwaway `packages/api/src/lib/__tests__/browser-cookie-session.probe.test.ts` (deleted
immediately after evidence capture — confirmed gone, see Evidence below), run via:

```
DATABASE_URL="postgres://jojo:jojo@localhost:5432/jojopotato" \
  pnpm --filter @jojopotato/api exec vitest run src/lib/__tests__/browser-cookie-session.probe.test.ts
```

The probe:
1. `POST /api/auth/sign-up/email` — plain email/password sign-up, no Expo headers.
2. `POST /api/auth/sign-in/email` — captured the raw `Set-Cookie` response header verbatim.
3. `GET /api/auth/get-session` (better-auth's own plugin-free session-introspection route) with
   ONLY the captured `name=value` cookie pair attached (no other auth mechanism) — asserted the
   response recognizes the session and returns the matching user.

## Evidence Captured

Raw `Set-Cookie` header from `POST /api/auth/sign-in/email` (verbatim):

```
better-auth.session_token=ytlTkdTBdr0bRpRn9ZEBXsCFE4oKBzA4.tgW%2Bq1w9ZQYG3Fwl%2FH%2BOC68ikR16pGaYxdA%2F%2FVQmlbg%3D; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
```

Attributes, parsed:
- **Name:** `better-auth.session_token`
- **HttpOnly:** yes
- **SameSite:** `Lax`
- **Secure:** absent (expected — `BETTER_AUTH_URL=http://localhost:3000`, non-HTTPS dev)
- **Path:** `/`
- **Max-Age:** `2592000` (30 days — matches `auth.ts`'s `session.expiresIn`)
- **Domain:** absent (host-only cookie — no cross-subdomain config)

Follow-up request result:
- `GET /api/auth/get-session` with only that cookie attached → **200**
- Response body: `session.userId` and `user.id` both equal the signed-up user's id; `user.email`
  matches the probe's email exactly.
- Confirmed: session recognized with **zero added plugins** — no `nextCookies`, no cookie-cache
  tweak, no `@better-auth/expo` plugin involved in this path at all (that plugin is Expo-only and
  irrelevant to a browser client).

Full console capture (trimmed to the load-bearing lines):
```
POST /api/auth/sign-up/email -> 200 (250ms)
POST /api/auth/sign-in/email -> 200 (171ms)
GET /api/auth/get-session -> 200 (17ms)
--- SESSION RECOGNIZED: user.email matches, session.user.id present: true ---
```

Test file deletion confirmed:
```
$ test -f .../browser-cookie-session.probe.test.ts && echo "STILL EXISTS" || echo "DELETED CONFIRMED"
DELETED CONFIRMED
```

## Verdict

**VIABLE**

## Resulting Design Constraint

**What this licenses:** The Phase 1 design MAY rely on the existing `betterAuth()` instance
issuing a working `better-auth.session_token` cookie for a plain browser client with **no new
plugin, no cookie-cache config, and no `nextCookies` wiring** — `apps/admin`'s `auth-client.ts`
can be a plain `createAuthClient({ baseURL })` browser client hitting the same
`/api/auth/*` mount the Expo app already uses, exactly as the plan's Public Contracts section
assumes. `HttpOnly`+`SameSite=Lax`+30-day `Max-Age` are real, current values Phase 1 can design
CORS/`trustedOrigins`/`credentials: true` fetch config against.

**What this forbids:** The design must NOT assume this proves cross-origin (browser at the
`apps/admin` dev port → API at its own port) behavior — this probe called the Express `app`
directly via supertest, which is not a real browser and does not enforce CORS or apply
`SameSite=Lax`'s actual cross-site blocking semantics. Do not skip Step 3's CORS/`credentials`
work on the assumption that "cookies already work" — this probe only proves the **same-origin
issuance-and-recognition mechanism** works; it says nothing about whether the browser will
actually attach the cookie on a genuinely cross-origin `fetch()` call. Also do not assume
`Secure` will be absent in production — this ran under a `http://` `BETTER_AUTH_URL`; a real
deploy behind HTTPS may add `Secure`, which is fine but should be verified again once the admin
deploy target is chosen (out of scope here — Phase 1 dev-only concern).

**What remains uncertain (known-gap):** Real cross-origin browser behavior with
`SameSite=Lax` — whether the admin SPA's dev-port origin, once added to `trustedOrigins` and
paired with CORS `credentials: true`, will actually see the cookie set and sent by a real
browser (not supertest) — is untested by this probe. This is exactly AC6's remaining scope
("a hybrid test exercising the same round-trip with the real admin web origin") and should be
verified once `apps/admin`'s dev port + the CORS middleware from Step 3 exist. Production
`Secure`-cookie / HTTPS behavior is also untested (dev-only `BETTER_AUTH_URL` here).
