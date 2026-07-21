---
name: plan:auth-003-google-oauth-verification-deploy-blocked
description: "Google sign-in end-to-end device verification (original AUTH-003 ACs 5-11) is parked — no deployed packages/api target or real Google OAuth credentials exist yet"
date: 21-07-26
feature: auth-accounts
---

# Parked: Google Sign-In Verification (from AUTH-003 / GitHub #105)

**Status:** Open — blocked on infra, not a code gap. Deliberately descoped from AUTH-003 by
user decision (21-07-26): "Split it — Terms only, for now." Tracked as its own ticket:
**AUTH-004, GitHub #135** — https://github.com/potakaaa/jojo-mobile/issues/135

## What this covers

GitHub issue #105 (AUTH-003) originally bundled two threads: real Terms & Conditions content,
and end-to-end verification of Google sign-in on real devices against a deployed backend. The
Terms thread proceeds on its own (see the SPEC below). This note tracks the parked
Google-verification thread only.

Original acceptance criteria this covers (device round-trip, session persistence, first-time vs
returning routing, cancel-flow, sign-out) are documented in full, with `proven by`/`strategy`
annotations, in the SPEC's Out Of Scope section — not duplicated here.

## The blocker

No deployed `packages/api` target exists anywhere in this repo, and no real Google OAuth
credentials have been provisioned for one. `eas.json` only configures mobile app build/submit —
there is no hosting config, CI deploy job, or live API URL. Google's server-side config
(`packages/api/src/lib/auth.ts`) and client dispatch (`apps/mobile/src/features/auth/hooks/use-
auth.ts`, `auth-client.ts`) already exist in code from the wire-better-auth work — this is a
verification gap, not an implementation gap. See also the existing
`wire-better-auth-manual-prereqs_NOTE_09-07-26.md` backlog note, which already tracks the
Google credential provisioning checklist as an open ops task.

Google's Expo OAuth flow does not share magic-link's known cold-start deep-link bug
structurally, but real-world reliability is unproven — upstream better-auth has open unresolved
issues describing exactly this failure mode for Google+Expo specifically
(`better-auth#3711`, `better-auth#1612`).

## Revisit when

A deployed backend target exists with real Google OAuth credentials provisioned (redirect URI
registered, env vars set). At that point this becomes a normal PLAN/EXECUTE task: run the
on-device Agent-Probe walkthroughs (Android + iOS separately, cannot assume one transfers to the
other) plus the two Hybrid-strategy automated tests identified in the SPEC (onboarding-gate
default for a Google-created user; sign-out clearing regardless of originating provider).

## Full context

Full research findings, acceptance criteria, and proven-by/strategy annotations for this parked
thread: see
`process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_SPEC_21-07-26.md`
(Out Of Scope section) and its task folder for any later plan/report artifacts.
