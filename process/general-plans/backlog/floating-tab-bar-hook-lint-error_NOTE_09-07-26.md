---
name: plan:floating-tab-bar-hook-lint-error
description: "Pre-existing lint error in floating-tab-bar.tsx (hook-return-value mutation) — out of scope for wire-better-auth, quick-fix candidate"
date: 09-07-26
feature: general
---

# Backlog: Fix `floating-tab-bar.tsx` Lint Error

## What

`apps/mobile/src/components/floating-tab-bar.tsx:151` has a pre-existing ESLint error:
`"Modifying a value returned from a hook is not allowed"`. Confirmed present at HEAD, untouched by
and outside the blast radius of the `wire-better-auth` plan
(`process/features/auth-accounts/completed/wire-better-auth_09-07-26/`).

## Why this matters

`pnpm lint` for `apps/mobile` is not fully clean because of this pre-existing error. It does not
block typecheck or runtime behavior, but it means "lint green" claims for `apps/mobile` need this
caveat until fixed.

## Fix sketch

Read the hook's return value into a local variable before mutating, or restructure to avoid
mutating the hook's returned object/array directly. Single-file, low-risk — good QUICK FIX lane
candidate.

## Status

Open — not introduced by `wire-better-auth`, but surfaced during that session's EVL gate run.
Quick-fix candidate whenever picked up.
