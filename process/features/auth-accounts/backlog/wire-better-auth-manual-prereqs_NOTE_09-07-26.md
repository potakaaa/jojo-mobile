---
name: plan:wire-better-auth-manual-prereqs
description: "Manual, non-code prerequisites that must be provisioned before better-auth's Google OAuth and magic-link flows actually work end to end"
date: 09-07-26
feature: auth-accounts
---

# Backlog: Manual Prerequisites for better-auth (Google OAuth + Magic Link)

## What

The `wire-better-auth` plan (`process/features/auth-accounts/completed/wire-better-auth_09-07-26/`)
wired Google OAuth and Resend-backed magic-link support into `packages/api`'s better-auth config,
but the code path only works once these are provisioned:

1. **Google Cloud OAuth 2.0 client** — create a client, set the authorized redirect URI to
   `{BETTER_AUTH_URL}/api/auth/callback/google`, and set `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` in `packages/api`'s real (git-ignored) `.env`.
2. **Resend account + API key** — create a Resend account, set `RESEND_API_KEY` (and optionally a
   verified `RESEND_FROM` sender address) in `packages/api`'s `.env`. Until set, magic-link sends
   fail (or use Resend's sandbox `onboarding@resend.dev` default sender, which cannot deliver to
   arbitrary real inboxes).
3. **`BETTER_AUTH_SECRET`** — generate with `openssl rand -base64 32` and set in `.env`.
4. **`BETTER_AUTH_URL`** — set to the reachable base URL of the `packages/api` dev/deployed server
   (used to construct the Google OAuth callback URL and magic-link URLs).

## Why this matters

Until all four are set, Google sign-in will not complete (no valid client) and magic-link emails
will not actually reach a user's inbox (either no API key, or restricted to the Resend sandbox
sender). Email/password and phone-OTP-stub sign-in do NOT need any of these and already work
end-to-end today.

## Status

Open — deployment/ops task, not a code gap. Pick up when the app is ready for real manual/simulator
verification of the OAuth and magic-link flows, or before any release that depends on them.
