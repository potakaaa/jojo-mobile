---
name: spec:auth-003-terms-google-oauth
description: "Product-discovery SPEC for GitHub issue #105 (AUTH-003), narrowed to Terms only — real Terms & Conditions content wired into signup/onboarding/Account. Google sign-in device verification is split out and parked (see backlog). AMENDED 21-07-26: Terms and Privacy split into two documents, reachable via Help."
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

**AMENDMENT 1 (21-07-26, same day, user):** Terms and Privacy are further split into two SEPARATE
documents/screens, reachable via the Help screen (not a direct Account link). See
`## AMENDMENT 1 Override` below — this overrides this SPEC's original single-combined-screen
framing.

## Summary

The Terms & Conditions screen customers see today still shows two lines of placeholder text. It
needs to show real legal copy and be reachable everywhere a customer would expect to find it:
signup, onboarding (both already link to it), and their Account settings (does not yet link to
it — **narrowed by AMENDMENT 1**: reachability now goes through Help, not a direct Account link).
This SPEC covers wiring a real-copy slot into the screen(s), adding the missing reachability point,
and confirming the screen(s) read correctly in light and dark mode. It does not cover drafting the
legal copy itself (sourced externally) or anything related to Google sign-in.

## User Stories / Jobs To Be Done

1. **As a customer signing up**, I want to read the actual Terms & Conditions (not placeholder
   text) before I agree to them, so that I know what I'm actually agreeing to.
2. **As an existing customer**, I want to find and re-read the Terms & Conditions (and separately,
   the Privacy Policy) from my Account settings at any time, so that I don't have to go through
   signup again just to check them. **(AMENDMENT 1: via Help, with 2 distinct nav rows — one per
   document.)**

## What The User Wants (Behavioral Outcomes)

- Opening the Terms screen (from signup, from onboarding, or from Help) shows real, finished
  legal copy — no "placeholder" wording anywhere on screen. **(AMENDMENT 1: same applies
  separately to the Privacy Policy screen.)**
- The Terms screen is reachable from three places: the signup flow, the post-signup onboarding
  flow (both already link to it today, Terms-only content), and — **AMENDMENT 1** — the Help
  screen (not a direct Account-menu link). The Privacy Policy screen is reachable only from Help.
- The screen(s) read correctly and are fully scrollable to the end in both light and dark mode, on
  a small device.
- ~~Terms and Privacy content live together on one screen (not two separate screens)~~ —
  **OVERRIDDEN by AMENDMENT 1**: Terms and Privacy are now two separate documents/screens, each
  reachable via its own row inside Help.

## Flow / State Diagram

**Terms & Conditions / Privacy Policy reachability (AMENDMENT 1 — current, authoritative):**
```
Signup screen ──"Terms"──► Terms & Conditions screen (real copy, scrollable, light/dark)
Onboarding    ──"Terms"──► Terms & Conditions screen   (already wired)
Account tab   ──"Help"───► Help screen ──"Terms and Conditions"──► Terms & Conditions screen (NEW)
                                       └─"Privacy Policy"────────► Privacy Policy screen      (NEW)
```

~~Original (pre-amendment) diagram — superseded, kept for history:~~
```
Signup screen ──"Terms"──► Terms & Conditions screen (real copy, scrollable, light/dark)
Onboarding    ──"Terms"──► Terms & Conditions screen   (already wired)
Account tab   ──"Terms"──► Terms & Conditions screen   (direct link — REMOVED by AMENDMENT 1)
```

## Acceptance Criteria (Testable Outcomes)

(AC1 and AC3 below are unchanged by AMENDMENT 1, now covering 2 screens where applicable. AC2 and
AC4 are superseded — see `## AMENDMENT 1 Override` for the amended AC2'/AC4'/AC5'/AC6' set, and
the plan file's own amended Acceptance Criteria section for the authoritative current list.)

1. The Terms screen shows finished legal copy with no placeholder wording remaining anywhere on
   screen.
   `proven by:` manual content review once real copy is supplied externally and wired in (no
   automated test can judge "is this real legal text" — this is a content-sourcing outcome, not
   a behavioral one). `strategy:` Agent-Probe.
2. ~~The Terms screen is reachable from Account, in addition to the two existing entry points
   (signup, onboarding).~~ **SUPERSEDED — see AC2' in `## AMENDMENT 1 Override`.**
   `proven by:` a render/navigation test asserting Account renders a Terms link that routes to
   the Terms screen. `strategy:` Fully-Automated (if an apps/mobile RN test runner exists for this
   surface) — otherwise Agent-Probe per the project's standing no-RN-runner gap; see Constraints.
3. The Terms screen scrolls to the end and reads correctly in both light and dark mode on a
   small device.
   `proven by:` manual on-device walkthrough (light + dark, small device). `strategy:` Agent-Probe
   (screen-render correctness is not automatable in this repo today — standing project-wide gap).
4. ~~Terms and Privacy content appear together on one screen, matching PRD §7's single "Terms and
   Privacy" navigation entry — not split into two separate screens.~~ **SUPERSEDED — see AC4' in
   `## AMENDMENT 1 Override`: Terms and Privacy are now two separate screens by direct user
   instruction.**
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
- Any UI redesign of the Terms/Privacy screens beyond making the copy real and adding the Help
  entry points — no new visual treatment is requested.
- ~~Splitting Terms and Privacy into two separate screens — explicitly rejected; PRD §7 already
  specifies one combined entry.~~ **REVERSED by AMENDMENT 1 — see below.** This is now explicitly
  IN scope, by direct user instruction.

## Constraints

- ~~PRD §7 already settles the Terms-vs-Privacy split — one combined "Terms and Privacy" screen,
  not two.~~ **OVERRIDDEN 21-07-26, see `## AMENDMENT 1 Override` below.** The user directly
  instructed splitting Terms and Privacy into two separate documents/screens, reachable via Help.
  This Constraint no longer applies — kept struck through for history, not deleted.
- No apps/mobile RN component/E2E test runner exists in this repo (standing, project-wide,
  already-tracked gap) — every on-device visual/navigation acceptance criterion in this SPEC is
  Agent-Probe by necessity, consistent with every other on-device-UX plan in this codebase.
- `terms.tsx` uses `useTheme()` + theme tokens directly today and looks correct on inspection,
  but was never explicitly probed by the prior mobile-dark-mode-audit session (that audit's
  `guard:theme-mode` script only tracks `@jojopotato/ui` library components, not this screen) —
  treat light/dark correctness as needing verification, not assumed clean. Applies equally to the
  new Privacy Policy screen once built.

## Open Questions

None. The one open question from the prior SPEC draft (whether to widen this issue to include
standing up a deployed backend, or park the Google-verification thread) is resolved: the user
chose to split — Terms only, for now. Google sign-in verification is now fully out of scope (see
above) and tracked separately in the backlog. The subsequent AMENDMENT 1 split (Terms vs Privacy
as two screens, reachable via Help) is also resolved — see below, no ambiguity remains.

## Background / Research Findings

- `terms.tsx` (`apps/mobile/src/app/(auth)/terms.tsx:18-22`) is 2 lines of placeholder text
  today. No real legal draft exists anywhere in this repo.
- Already linked from `login.tsx:236-237` and `onboarding.tsx:63-64` (both in the public
  `(auth)` stack), both already labeled "Terms & Conditions" (Terms-only wording) — these links
  need zero edits once the pre-auth screen renders Terms-only content per AMENDMENT 1.
- Account (`(tabs)/account/index.tsx`) is a fully real, already-built screen (profile,
  edit-profile, notifications, help, order history, theme toggle, sign-out) — not the
  `<ComingSoon>` placeholder a stale context doc claims (flagged for UPDATE PROCESS correction
  separately, not part of this SPEC's scope). Its own `help.tsx` sub-screen, however, IS
  currently a bare `<ComingSoon>` placeholder — confirmed live 21-07-26 — and is being built out
  for real by AMENDMENT 1, for the first time.
- PRD §7 (`docs/jojo-potato-mobile-prd.md:706`) lists exactly one combined nav entry: "Terms and
  Privacy" — this SPEC originally treated that as settling the split question; **AMENDMENT 1
  overrides that reading by direct user instruction** (see below).
- `terms.tsx` uses `useTheme()` + `theme.background/text/textSecondary` tokens directly — looks
  correct on inspection, but sits outside `guard:theme-mode`'s scope (that script only tracks
  `@jojopotato/ui` library components) and was never explicitly probed by the prior
  mobile-dark-mode-audit session. Treat as unverified, not assumed clean.
- Google OAuth research findings (server config, client dispatch, missing deployed backend,
  onboarding-gate routing being provider-agnostic by inspection, upstream better-auth open
  issues for Google+Expo specifically) were captured during this session's research but are no
  longer this SPEC's concern — they are preserved in full in the parked backlog note:
  `process/features/auth-accounts/backlog/auth-003-google-oauth-verification-deploy-blocked_NOTE_21-07-26.md`.

## AMENDMENT 1 Override (21-07-26)

**Direct user instruction, recorded verbatim:** "separate terms and conditions and privacy policy,
also put it on help and have 2 nav same ui just 2 navs inside the help"

This is an explicit, dated, user-authorized override of this SPEC's original Constraints-section
claim that PRD §7 settles a single combined screen. It is not a gap, not re-litigated, and not
derived from new research — it is a direct product decision delivered after this SPEC was locked
(VALIDATE on the pre-amendment plan shape had already completed; zero implementation existed on
disk for either shape at the time of this override).

Effective changes to this SPEC's scope:

1. Terms and Conditions and Privacy Policy become two separate documents/screens, not one combined
   page (overrides the old Constraint above and the old AC4/Flow diagram framing).
2. The "Account tab" reachability point (User Story 2, Flow diagram, old AC2) is narrowed: Account's
   top-level menu does NOT get a direct Terms/Privacy link (and a merge-conflict-added row pointing
   at the old combined route is removed). Instead, the existing Help screen (in Account, currently
   a bare `<ComingSoon>` placeholder) becomes the real entry point — Help gets 2 new nav rows, one
   per document, using the same `SettingsRow`/`Card` UI convention already used elsewhere in
   Account.
3. The pre-auth entry points (signup, onboarding — via `(auth)/terms`) are UNCHANGED in
   reachability; only their rendered content narrows to Terms-and-Conditions-only (no Privacy
   content on that pre-auth screen), consistent with those links' existing "Terms & Conditions"
   labels — zero edits needed to `login.tsx`/`onboarding.tsx` themselves.

Amended acceptance criteria (supersede AC2 and AC4 above; AC1 and AC3 carry over, now covering both
documents/screens):

- **AC2'**: The Terms and Conditions screen and the Privacy Policy screen are each reachable via
  their own row inside Help — not via a direct Account-menu link. Help shows exactly 2 nav rows,
  each opening its own document. `strategy:` Agent-Probe (standing no-RN-runner gap).
- **AC4'**: Terms and Conditions and Privacy Policy are two SEPARATE documents/screens (not one
  combined page). `strategy:` Fully-Automated (content-module filter-by-group test) + source
  inspection (two distinct route files).
- **AC5' (new):** Account's top-level menu no longer shows a direct "Terms & Privacy" row.
  `strategy:` Agent-Probe / source inspection.
- **AC6' (new):** The pre-auth `(auth)/terms` screen (reached from login/onboarding) shows
  Terms-and-Conditions-only content correctly (not the old combined content). `strategy:`
  Agent-Probe.

See the plan file's `## AMENDMENT 1` section
(`auth-003-terms-google-oauth_PLAN_21-07-26.md`) for the full implementation detail, touchpoints,
checklist, and validate-contract re-run requirement.

---

**Status:** SPEC locked, AMENDED same-day (21-07-26). No open questions remain — the amendment
itself resolved cleanly with no ambiguity. Ready for PLAN's amended shape → fresh VALIDATE →
EXECUTE.
