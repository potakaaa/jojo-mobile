# Dev Auto-Login

Skip the login screen entirely during local development. `pnpm dev:bypass` starts the API with
auto-login on; the app signs itself in as a single fixed account at boot. No email, no browser
round-trip, no tapping a link.

## What it does

`pnpm dev:bypass` starts the API server with `DEV_AUTO_LOGIN=true`. The app, under `__DEV__`, POSTs
`/dev/session` once at boot when there is no session, gets a magic-link token for the
server-configured account, and verifies it **through `authClient`** — the SAME real verification
path the emailed link uses. The result is a REAL session, stored in SecureStore, identical to
production. The login screen is skipped. **No session is forged** — the production sign-in code path
is what actually runs; only the "type your email and wait for the link" step is removed.

A plain `fetch` cannot establish the session (the cookie would land on the wrong client), which is
why `/dev/session` returns a token rather than a `Set-Cookie` and the app completes verification
itself.

## Two modes

| Command | Auth | Tunnel |
|---|---|---|
| `pnpm dev` | Real (magic link, Google OAuth) | ngrok (needed for OAuth) |
| `pnpm dev:bypass` | Auto-login as `DEV_LOGIN_EMAIL` | none — localhost/LAN only |

These are mutually exclusive **by construction**: `dev:bypass` starts no tunnel (there is
deliberately no `dev:ngrok` in it), so the `/dev/session` backdoor is never publicly reachable. This
is structural, not a habit you have to remember.

## Usage

Just run:

```bash
pnpm dev:bypass
```

`pnpm dev:bypass` auto-detects your machine's LAN IP and injects it as `EXPO_PUBLIC_API_URL`, so a
physical device can reach the API without editing `.env`. This is necessary because `localhost` on the
phone resolves to the phone itself, not your dev machine. If `EXPO_PUBLIC_API_URL` is already exported
it is used verbatim (detection is skipped), and `API_PORT` (default `3000`) sets the port in the
detected URL.

No `.env` edit is needed — the setting lives in the process, passed by the script. Optionally set a
different account in `packages/api/.env`:

```
DEV_LOGIN_EMAIL=you@example.com
```

`DEV_LOGIN_EMAIL` defaults to `dev@jojopotato.local` and is auto-created on first use by
better-auth's magicLink plugin.

## Blast radius

`/dev/session` takes **no parameters** — no query, no body, no secret. It reads the account to sign
in from the server's OWN environment (`DEV_LOGIN_EMAIL`). It can therefore only ever sign in that one
configured account, and cannot be pointed at a real user's email by a caller. This is the key
difference from the old `/dev/magic-link?email=<any>` bypass, which handed out a valid token for any
address it was asked about.

## Safety gates

Auto-login fails CLOSED. The gate is evaluated once at module load, and the server **refuses to
start** rather than degrade if a gate fails.

| Condition | Result |
|---|---|
| `DEV_AUTO_LOGIN` unset or not `true` | Route never registered; `POST /dev/session` returns 404 |
| `DEV_AUTO_LOGIN=true` and `NODE_ENV=production` | **Server refuses to start** |
| `DEV_LOGIN_EMAIL` set without `@` | **Server refuses to start** |

When the route is not registered, the app's boot POST simply gets a 404 and falls through to the
normal login screen.

## The trade-off

Be honest with yourself: with auto-login on you stop exercising three real flows —
session-restore-on-cold-start, the `Stack.Protected` gate, and sliding session expiry — because the
app is signed in before any of them matter. The 21 API integration tests still cover the server side.
Run plain `pnpm dev` before a release to exercise the real client flows end to end.

## Turning it off

Just run `pnpm dev` instead of `pnpm dev:bypass`. The setting lives in the process, not in a file, so
it cannot outlive the session.

## Where the code lives

- `packages/api/src/lib/dev-auto-login.ts` — gate + token store
- `packages/api/src/index.ts` — the `POST /dev/session` route
- `apps/mobile/src/features/auth/lib/dev-auto-login.ts` — client boot attempt
- `packages/api/src/lib/__tests__/dev-auto-login.test.ts` — unit coverage
