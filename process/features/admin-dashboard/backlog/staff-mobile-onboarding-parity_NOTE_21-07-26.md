---
name: note:staff-mobile-onboarding-parity
description: "Deferred — mobile-side staff first-run profile/password onboarding parity, lowered priority after ADM-012 moved staff setup to the web accept page (issue #142)"
date: 21-07-26
feature: admin-dashboard
metadata:
  node_type: backlog-note
  type: note
  status: OPEN
---

# Staff mobile onboarding parity (deferred)

**Filed:** 21-07-26, during ADM-012 (#142) EXECUTE.
**Status:** OPEN — deferred, lower priority. Not blocking any current work.

## Context

ADM-012 made staff account setup **web-first**: the invite email now links to the
`apps/admin` accept page (`/staff-invite-accept`), where the invitee completes profile
(full name / birthday / address) **and** password setup in the browser, then:

- admin / super_admin → routed into the admin dashboard;
- staff → shown a terminal "sign in on the Jojo Potato app" confirmation.

As part of this, the mobile `(auth)/invite-accept.tsx` route was **de-registered** from
`apps/mobile/src/app/(auth)/_layout.tsx` (the `<Stack.Screen name="invite-accept" />`
line was removed). **The screen file itself was deliberately PRESERVED, byte-unmodified**
— it is unreachable via navigation but kept intact specifically for potential reuse here.

## The gap

There is no mobile-native first-run onboarding for a staff member who accepts an invite.
The full profile is already collected on the web, so a signed-in staff user reaching the
mobile app has `onboardedAt` stamped and a password set — the mobile app has no reason to
re-collect any of it. That is why this is **lower priority** than it was before ADM-012:
the web flow already closes the "staff account has no profile / no password" hole that the
mobile onboarding would otherwise have needed to fill.

## What a future phase might do

- Decide whether staff ever need a mobile-native onboarding at all (they may not — web
  setup is complete), or only a lightweight "welcome" first-run screen.
- If mobile onboarding IS wanted, the preserved `invite-accept.tsx` is the natural starting
  point to re-register and adapt (it already contains the start → verify → consume wiring).
- Confirm the customer-onboarding parity story (`(onboarding)/index.tsx`) vs. a staff one —
  staff currently skip the customer `(onboarding)` group entirely via the root gate's
  `isStaff` check.

## Out of scope for ADM-012

ADM-012 delivered only the web accept flow + the mobile route de-registration. Any mobile
onboarding work is explicitly deferred to this note.
