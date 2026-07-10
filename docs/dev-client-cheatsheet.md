# Dev Client Cheatsheet

Everything needed to run Jojo Potato locally on an Expo **development build** (dev-client).
Expo Go will NOT work for auth — it cannot open the `jojopotato://` scheme, so Google OAuth and
magic link both fail there. Use a dev build.

## The 4 things that must be running

| # | What | Command | Check it's up |
|---|---|---|---|
| 1 | Postgres | `docker compose up -d` | `docker compose ps` → port `0.0.0.0:5432->5432/tcp` |
| 2 | API server | `pnpm --filter @jojopotato/api dev` | `curl localhost:3000/health` |
| 3 | Tunnel (only for OAuth/magic link) | `ngrok http 3000` | copy the `https://…ngrok-free.dev` URL |
| 4 | Metro bundler | `pnpm --filter @jojopotato/mobile dev` | QR / `Press a` for Android |

## 1. Database

```bash
docker compose up -d              # start Postgres 16 (jojo/jojo@localhost:5432/jojopotato)
docker compose ps                 # verify the port mapping is published
docker compose down               # stop
docker compose down && docker compose up -d   # fix a container that's Up but has NO published port
```

**Gotcha:** `docker start` does *not* re-apply port mappings. If a container was created while
another project held `5432`, it comes back with no published port and `db:migrate` fails with
`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Always `down` then `up -d`.

**Gotcha:** `password authentication failed for user jojo` usually means *a different project's*
Postgres is squatting on `5432`. Find it: `docker ps --format '{{.Names}}\t{{.Ports}}'`.

### Migrations

```bash
pnpm --filter @jojopotato/api db:generate   # after editing src/db/schema/* — inspect the SQL first
pnpm --filter @jojopotato/api db:migrate    # apply
```

## 2. API server

```bash
cp packages/api/.env.example packages/api/.env    # first time only, then fill in the blanks
pnpm --filter @jojopotato/api dev                 # tsx watch, port 3000
```

`packages/api/.env` needs at minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`
(`openssl rand -base64 32`), `BETTER_AUTH_URL`. Google OAuth additionally needs
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; magic-link email needs `RESEND_API_KEY`
(without it, the link is logged to the server console instead of emailed — fine for dev).

**Never** prefix any of these with `EXPO_PUBLIC_`. They would ship to every device.

**Gotcha:** `502 Bad Gateway` on every `/api/auth/*` through ngrok = the API server is down.
The DB being up tells you nothing. Check `curl -s -o /dev/null -w '%{http_code}' localhost:3000/health`.

## 3. Tunnel (needed for Google OAuth + magic link)

Google rejects raw private-IP and plain-`http://` redirect URIs. You need public HTTPS:

```bash
ngrok http 3000
```

Then, every time the ngrok URL changes:

1. Set `BETTER_AUTH_URL=https://<sub>.ngrok-free.dev` in `packages/api/.env` and **restart the API**.
2. Set `EXPO_PUBLIC_API_URL=https://<sub>.ngrok-free.dev` in `apps/mobile/.env` and **restart Metro
   with `--clear`** (`EXPO_PUBLIC_*` vars are inlined at bundle time).
3. Register `https://<sub>.ngrok-free.dev/api/auth/callback/google` under **Authorized redirect
   URIs** (not JavaScript origins) on the Google Cloud OAuth client.

A paid/reserved ngrok domain saves you from repeating this on every restart.

**Gotcha:** `redirect_uri_mismatch` = the exact URI above isn't registered on *that specific*
OAuth client. `invalid_request` = you're using a private IP or `http://`.

## 4. Mobile dev build

```bash
pnpm --filter @jojopotato/mobile dev            # Metro for an already-installed dev build
pnpm --filter @jojopotato/mobile dev -- --clear # after changing any EXPO_PUBLIC_* var
```

### Building the dev client (once per native-dependency change)

Run **from `apps/mobile/`** — running `eas` from the repo root creates stray root `app.json` /
`eas.json` files and fails with "EAS project is not configured".

```bash
cd apps/mobile
eas build --profile development --platform android
```

Install the resulting `.apk` on the device, then start Metro and open the dev client.

**Local `expo run:android` requires:** Android SDK (`ANDROID_HOME`, `adb`, `emulator`), **JDK 17**
(not 25), and a connected device/emulator. If you don't have those, use the EAS cloud build above.

## Auth flows — what works where

| Flow | Expo Go | Dev build |
|---|---|---|
| Email + password | ✅ | ✅ |
| Phone OTP | ✅ (code is logged server-side, not texted) | ✅ |
| Google OAuth | ❌ (can't open `jojopotato://`) | ✅ (needs tunnel) |
| Magic link | ❌ | ✅ (needs tunnel) |

**Phone OTP is a stub.** The server logs `[auth] phone OTP for <number>: <code>` — read it from the
API console. No SMS vendor is wired yet.

**Magic link takes a detour.** The email links to `{BETTER_AUTH_URL}/magic-link/native?token=…`,
which 302s into `jojopotato:///magic-link?token=…`; the app then calls `authClient.magicLink.verify`
so the *client* stores the session cookie. See
`process/features/auth-accounts/backlog/wire-better-auth-magic-link-expo-caveat_NOTE_09-07-26.md`
for why the default better-auth flow doesn't work on Expo.

## Verification commands

```bash
pnpm typecheck                              # all packages
pnpm lint
pnpm --filter @jojopotato/api test          # 21 tests, needs Postgres up
```

Note: `apps/mobile/src/components/floating-tab-bar.tsx:151` has a known pre-existing lint error
(backlog-tracked) — it is not caused by your change.

## Clean-slate reset

```bash
docker compose down -v                                   # wipes the DB volume
docker compose up -d && pnpm --filter @jojopotato/api db:migrate
pnpm --filter @jojopotato/mobile dev -- --clear
```
