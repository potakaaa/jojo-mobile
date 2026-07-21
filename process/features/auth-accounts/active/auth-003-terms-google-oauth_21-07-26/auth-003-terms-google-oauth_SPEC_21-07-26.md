---
name: spec:auth-003-terms-google-oauth
description: "Product-discovery SPEC for GitHub issue #105 (AUTH-003), narrowed to Terms only — real Terms & Conditions content wired into signup/onboarding/Account. Google sign-in device verification is split out and parked (see backlog)."
date: 21-07-26
feature: auth-accounts
---

# AUTH-003 — Terms & Conditions Content (Split — Terms Only)

Source: GitHub issue #105 (P1). PRD §6.1, §7. Related: AUTH-001, QA-007 (#52).

**Scope decision (21-07-26, user):** Issue #105 originally bundled two unrelated threads — Terms
& Conditions content, and Google sign-in device verification. The user chose to **split it: Terms
only, for now.** Google sign-in verification is fully out of scope for this SPEC/plan and is
tracked as a parked backlog item — see
`process/features/auth-accounts/backlog/auth-003-google-oauth-verification-deploy-blocked_NOTE_21-07-26.md`.

## Summary

The Terms & Conditions screen customers see today still shows two lines of placeholder text. It
needs to show real legal copy and be reachable everywhere a customer would expect to find it:
signup, onboarding (both already link to it), and their Account settings (does not yet link to
it). This SPEC covers wiring a real-copy slot into that screen, adding the missing Account entry
point, and confirming the screen reads correctly in light and dark mode. It does not cover
drafting the legal copy itself (sourced externally) or anything related to Google sign-in.

## User Stories / Jobs To Be Done

1. **As a customer signing up**, I want to read the actual Terms & Conditions (not placeholder
   text) before I agree to them, so that I know what I'm actually agreeing to.
2. **As an existing customer**, I want to find and re-read the Terms & Conditions from my Account
   settings at any time, so that I don't have to go through signup again just to check them.

## What The User Wants (Behavioral Outcomes)

- Opening the Terms screen (from signup, from onboarding, or from Account) shows real,
  finished legal copy — no "placeholder" wording anywhere on screen.
- The screen is reachable from three places: the signup flow, the post-signup onboarding flow
  (both already link to it today), and the Account tab (does not yet link to it — new).
- The screen reads correctly and is fully scrollable to the end in both light and dark mode, on
  a small device.
- Terms and Privacy content live together on one screen (not two separate screens) — this
  matches the product's own navigation plan and resolves the issue's own open question about
  whether to split them.

## Flow / State Diagram

**Terms & Conditions reachability (happy path + the one new link):**
```
Signup screen ──"Terms"──► Terms & Conditions screen (real copy, scrollable, light/dark)
Onboarding    ──"Terms"──► Terms & Conditions screen   (already wired)
Account tab   ──"Terms"──► Terms & Conditions screen   (NEW link — does not exist today)
```

## Acceptance Criteria (Testable Outcomes)

1. The Terms screen shows finished legal copy with no placeholder wording remaining anywhere on
   screen.
   `proven by:` manual content review once real copy is supplied externally and wired in (no
   automated test can judge "is this real legal text" — this is a content-sourcing outcome, not
   a behavioral one). `strategy:` Agent-Probe.
2. The Terms screen is reachable from Account, in addition to the two existing entry points
   (signup, onboarding).
   `proven by:` a render/navigation test asserting Account renders a Terms link that routes to
   the Terms screen. `strategy:` Fully-Automated (if an apps/mobile RN test runner exists for this
   surface) — otherwise Agent-Probe per the project's standing no-RN-runner gap; see Constraints.
3. The Terms screen scrolls to the end and reads correctly in both light and dark mode on a
   small device.
   `proven by:` manual on-device walkthrough (light + dark, small device). `strategy:` Agent-Probe
   (screen-render correctness is not automatable in this repo today — standing project-wide gap).
4. Terms and Privacy content appear together on one screen, matching PRD §7's single "Terms and
   Privacy" navigation entry — not split into two separate screens.
   `proven by:` source inspection of the shipped screen structure. `strategy:` Fully-Automated
   (a structural assertion — e.g. the screen renders one heading each for Terms and Privacy
   under a single route — can be a real test).

## Out Of Scope

- **Google sign-in verification, entirely** (originally issue #105's second thread — device
  round-trip on Android and iOS, session persistence across restart, first-time-vs-returning
  onboarding-gate routing, cancel-flow cleanliness, sign-out clearing). Deferred by explicit user
  decision (21-07-26): "Split it — Terms only, for now." No deployed `packages/api` target and no
  real Google OAuth credentials exist anywhere in this repo today, and standing one up is a real
  infra decision the user chose not to fold into this issue. Tracked as a parked backlog item:
  `process/features/auth-accounts/backlog/auth-003-google-oauth-verification-deploy-blocked_NOTE_21-07-26.md`.
  Revisit once a deployed backend + real Google credentials exist.
- Drafting the real legal Terms & Conditions / Privacy Policy text itself — this SPEC only
  covers wiring a real-copy slot into the app; the copy is sourced externally, outside this
  issue's scope.
- Any other auth provider or sign-in method (phone OTP SMS delivery, magic link reliability,
  etc.) — those are tracked by separate existing backlog notes, not this issue.
- Any UI redesign of the Terms screen beyond making the copy real and adding the Account entry
  point — no new visual treatment is requested.
- Splitting Terms and Privacy into two separate screens — explicitly rejected; PRD §7 already
  specifies one combined entry.

## Constraints

- **PRD §7 already settles the Terms-vs-Privacy split** — one combined "Terms and Privacy"
  screen, not two. This SPEC does not treat that as open.
- No apps/mobile RN component/E2E test runner exists in this repo (standing, project-wide,
  already-tracked gap) — every on-device visual/navigation acceptance criterion in this SPEC is
  Agent-Probe by necessity, consistent with every other on-device-UX plan in this codebase.
- `terms.tsx` uses `useTheme()` + theme tokens directly today and looks correct on inspection,
  but was never explicitly probed by the prior mobile-dark-mode-audit session (that audit's
  `guard:theme-mode` script only tracks `@jojopotato/ui` library components, not this screen) —
  treat light/dark correctness as needing verification, not assumed clean.

## Open Questions

None. The one open question from the prior SPEC draft (whether to widen this issue to include
standing up a deployed backend, or park the Google-verification thread) is resolved: the user
chose to split — Terms only, for now. Google sign-in verification is now fully out of scope (see
above) and tracked separately in the backlog.

## Background / Research Findings

- `terms.tsx` (`apps/mobile/src/app/(auth)/terms.tsx:18-22`) is 2 lines of placeholder text
  today. No real legal draft exists anywhere in this repo.
- Already linked from `login.tsx:236-237` and `onboarding.tsx:63-64` (both in the public
  `(auth)` stack). NOT linked from Account. Account (`(tabs)/account/index.tsx`) is a fully
  real, already-built screen (profile, edit-profile, notifications, help, order history, theme
  toggle, sign-out) — not the `<ComingSoon>` placeholder a stale context doc claims (flagged for
  UPDATE PROCESS correction separately, not part of this SPEC's scope).
- PRD §7 (`docs/jojo-potato-mobile-prd.md:706`) lists exactly one combined nav entry: "Terms and
  Privacy" — settling the issue's own open question about a possible split.
- `terms.tsx` uses `useTheme()` + `theme.background/text/textSecondary` tokens directly — looks
  correct on inspection, but sits outside `guard:theme-mode`'s scope (that script only tracks
  `@jojopotato/ui` library components) and was never explicitly probed by the prior
  mobile-dark-mode-audit session. Treat as unverified, not assumed clean.
- Google OAuth research findings (server config, client dispatch, missing deployed backend,
  onboarding-gate routing being provider-agnostic by inspection, upstream better-auth open
  issues for Google+Expo specifically) were captured during this session's research but are no
  longer this SPEC's concern — they are preserved in full in the parked backlog note:
  `process/features/auth-accounts/backlog/auth-003-google-oauth-verification-deploy-blocked_NOTE_21-07-26.md`.

---

**Status:** SPEC locked — Terms-only scope. No open questions remain. Ready for INNOVATE/PLAN.
