---
name: plan:wire-better-auth-sms-vendor
description: "Replace the phone-OTP SMS stub (server-side console.log) with a real SMS vendor integration"
date: 09-07-26
feature: auth-accounts
---

# Backlog: Real SMS Vendor for Phone OTP

## What

`wire-better-auth` (`process/features/auth-accounts/completed/wire-better-auth_09-07-26/`)
implements phone-OTP sign-in via better-auth's `phoneNumber` plugin, but `sendOTP` in
`packages/api/src/lib/auth.ts` is an explicit, user-approved **stub**: it logs the generated code
server-side instead of sending a real SMS. This was a locked decision for this plan, not an
oversight.

## Why this matters

No real user can receive a phone-OTP code today — the flow only works by reading server logs. This
blocks phone-OTP from being usable outside development.

## Fix sketch

Wire a real SMS vendor (e.g. Twilio, MessageBird, or Vonage) into the `sendOTP` callback in
`packages/api/src/lib/auth.ts`, replacing the `console.log` stub. Needs a vendor account, API
credentials (new env vars, server-only), and a small adapter function. Low complexity once a
vendor is chosen — mostly a provisioning + one-function-body change.

## Status

Open — deferred by explicit user decision during `wire-better-auth` planning. Pick up when phone-OTP
needs to work for real (non-development) users.
