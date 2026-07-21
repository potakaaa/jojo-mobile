---
name: plan:auth-003-terms-google-oauth
description: "SIMPLE plan for AUTH-003 (Terms-only split) — real Terms & Privacy content, Account tab entry point, light/dark verification"
date: 21-07-26
feature: auth-accounts
---

# AUTH-003 — Terms & Conditions Content (Terms Only) — Implementation Plan

Date: 21-07-26
Status: VALIDATED — Gate: CONDITIONAL — ready for EXECUTE
Complexity: SIMPLE

Source SPEC: `auth-003-terms-google-oauth_SPEC_21-07-26.md` (same folder). Complexity: **SIMPLE**
(single small feature slice, `apps/mobile` only, ~8 files, no schema/API/auth surface).

INNOVATE was skipped by orchestrator decision — there is no competing architecture here, only one
mechanical routing fact to get right (see Decision 1 below).

## Overview

Today's Terms screen (`apps/mobile/src/app/(auth)/terms.tsx`) is 2 lines of placeholder text,
reachable only from the pre-auth stack (signup, onboarding). This plan:

1. Replaces the placeholder text with real, structured (non-"Lorem ipsum", non-final-legal-review)
   Terms & Privacy boilerplate copy, stored as a single swappable content module so a future
   real-copy swap is content-only.
2. Adds the missing Account-tab entry point — which requires a genuine routing fix, not just a
   new link (see Decision 1).
3. Confirms the (now longer) screen still reads correctly and scrolls fully in light and dark mode.

## Decision 1 (locked): the Account link cannot reuse `(auth)/terms` — needs a second route

**The technical detail flagged for verification is real and blocks a naive "just add a Link"
approach.** Confirmed by reading `apps/mobile/src/app/_layout.tsx`'s `RootNavigator`: the app uses
four mutually-exclusive `Stack.Protected` guards — `(staff)` / `(tabs)` / `(onboarding)` / `(auth)`.
Only ONE of these four top-level groups is ever mounted at a time, driven by auth/onboarding state.
`(auth)/terms.tsx` is registered inside the `(auth)` Stack (`(auth)/_layout.tsx`), which is **only
mounted when `!isAuthenticated`**. An authenticated customer viewing the Account tab is in the
`(tabs)` group — the `(auth)` group and its `terms` screen are not mounted at all, so
`router.push('/(auth)/terms')` from Account would resolve to nothing.

**Fix:** add a second, sibling route inside the `(tabs)` group — `(tabs)/terms/` — following the
exact existing precedent set by `(tabs)/notifications/` and `(tabs)/history/` (a folder with its
own `_layout.tsx` Stack + `index.tsx`, not registered as a tab, reached only via
`router.push('/(tabs)/terms')`, hidden from the floating tab bar automatically because
`floating-tab-bar.tsx`'s `ICONS` map is an allowlist — routes absent from it render no tab button,
confirmed by reading the filter at `floating-tab-bar.tsx:314`).

To avoid duplicating the copy across two screen files, the actual Terms & Privacy text is extracted
into one shared content module + one shared presentational body component, and both route files
(`(auth)/terms.tsx` and the new `(tabs)/terms/index.tsx`) render the same shared body. This is the
single new architectural piece in this otherwise-content-only plan, and it is the smallest option
that satisfies "one screen, no copy duplication, reachable from both stacks."

**Rejected alternative:** moving `terms.tsx` out of `(auth)` entirely into some shared top-level
location outside all four Stack.Protected groups. Not possible — Expo Router's typed file-based
routing requires every screen to live inside some registered group, and `Stack.Protected` gates
whole groups, not individual files across groups. Two thin route wrappers over one shared content
component is the standard pattern already used in this codebase for the equivalent problem
(`(tabs)/history` being reachable from two different tabs — see that file's own header comment).

**VALIDATE confirmation (V2 Layer 2):** verified directly against source — `_layout.ios.tsx`/
`_layout.android.tsx` register only the 5 real tabs (`index`, `order`, `rewards`, `branches`,
`account`); `notifications` and `history` are NOT declared there and are still reachable as
sibling stacks purely via Expo Router's file-system auto-discovery + the `FloatingTabBar` ICONS
allowlist filter. The same mechanism will pick up `(tabs)/terms/` with zero `_layout.{ios,android,web}.tsx`
edits, exactly as the plan assumes. Confirmed sound.

## Touchpoints

| File | Change |
|---|---|
| `apps/mobile/src/features/legal/terms-privacy-content.ts` | **New.** Plain data module: exported `LEGAL_SECTIONS` array, each entry `{ group: 'terms' \| 'privacy'; heading: string; body: string }`. This is the swappable content slot — a future real-copy swap edits only this file. |
| `apps/mobile/src/features/legal/components/terms-privacy-body.tsx` | **New.** Presentational component `TermsPrivacyBody({ theme })` — renders two labeled groups ("Terms & Conditions", "Privacy Policy") from `LEGAL_SECTIONS`, using `theme.text`/`theme.textSecondary` tokens passed in by the caller (matches the existing `terms.tsx` token-consumption style — no `@jojopotato/ui` `mode` prop involved, this screen has never used the shared UI library). No `ScrollView`/`SafeAreaView` — the two route screens own their own scroll/safe-area wrapper, this component is content-only. |
| `apps/mobile/src/features/legal/__tests__/terms-privacy-content.test.ts` | **New.** `apps/mobile` node-env vitest (existing runner, no new dependency) — structural assertions on the content module only (see Verification Evidence). |
| `apps/mobile/src/app/(auth)/terms.tsx` | **Edit.** Replace the 2-line placeholder body with `<TermsPrivacyBody theme={theme} />` inside the existing `ScrollView`. Update the on-screen heading text if needed for combined Terms+Privacy framing (see UI note below). |
| `apps/mobile/src/app/(auth)/_layout.tsx` | **Edit.** `terms` screen's `options.title` "Terms & Conditions" → "Terms & Privacy" (matches PRD §7's combined nav-entry name; header-only change, one line). |
| `apps/mobile/src/app/(tabs)/terms/_layout.tsx` | **New.** Thin `Stack` wrapper, `headerShown: false` — identical shape to `(tabs)/notifications/_layout.tsx` / `(tabs)/history/_layout.tsx` (copy their doc-comment convention, adjusted for Terms). |
| `apps/mobile/src/app/(tabs)/terms/index.tsx` | **New.** `SafeAreaView` + `ScrollView` (padded, matching `(auth)/terms.tsx`'s existing `Spacing.four`/`Spacing.three` values) + in-content `<ScreenHeader title="Terms & Privacy" onBack={() => router.back()} mode={mode} />` (from `@jojopotato/ui`, same pattern as `(tabs)/notifications/index.tsx`) + `<TermsPrivacyBody theme={theme} />`. Uses `useHideTabBarWhile(useIsFocused())` (from `@/components/floating-tab-bar` + `expo-router`) to hide the floating tab bar while this screen is FOCUSED (not just mounted) — see Execute-Agent Instruction E3. |
| `apps/mobile/src/app/(tabs)/account/index.tsx` | **Edit.** Add one `<AccountLink label="Terms & Privacy" onPress={() => router.push('/(tabs)/terms')} color={theme.accent} />` inside the existing link `<Card>`, alongside Notifications/Help/Order History. |

**Not touched, verified unnecessary:** `floating-tab-bar.tsx` (ICONS allowlist already excludes
unlisted route names by construction — confirmed at `floating-tab-bar.tsx:314`, `if (!(route.name
in ICONS)) return null;`); `_layout.ios.tsx`/`_layout.android.tsx` (VALIDATE-confirmed: these only
list the 5 real tabs; sibling stacks like `notifications`/`history` are picked up by Expo Router's
file-system auto-discovery with zero edits here, and `(tabs)/terms/` will behave identically);
`(onboarding)/index.tsx` (SPEC confirms only `login.tsx`/`(auth)/onboarding.tsx`
link to Terms today, both already inside `(auth)` and already correctly wired — no new link needed
there); any `packages/*` file (this is a pure `apps/mobile` UI/content change).

## Public Contracts

None. No API, schema, or cross-package contract changes. The only "contract" is the new route path
`/(tabs)/terms`, which is app-internal (Expo Router typed route, not exposed to any other package
or service).

## Blast Radius

- **Packages touched:** `apps/mobile` only.
- **Files:** 8 total (3 new content/component/test files, 2 new route files, 3 edited files).
- **Risk class:** none of the high-risk classes apply (no auth, billing, schema, public API,
  deploy/container, or secrets/trust-boundary surface). Pure UI/content/navigation change.
- **Runtime surfaces touched:** `apps/mobile` only; no backend, no `packages/api`, no other app.

## Content Note (locked decision, deviates from a strict literal SPEC reading — recorded explicitly)

The SPEC's own Out-of-Scope section frames "drafting the real legal Terms & Conditions / Privacy
Policy text" as sourced externally, and AC1's `proven by:` clause anticipates copy being supplied
later. The orchestrator's task instruction for this PLAN session explicitly directs writing real,
structured (non-placeholder-worded) boilerplate ToS+Privacy content NOW, appropriate for a
food-ordering app (sections: acceptance of terms, use of service, orders/payments, account/data,
changes to terms; privacy — what's collected/how used/contact), while making clear this is NOT
final legal-reviewed copy — genuine legal review remains an external follow-up.

**This plan follows the orchestrator's explicit instruction** (the direct work order for this PLAN
session) over the SPEC's more conservative framing: `terms-privacy-content.ts` ships real structured
boilerplate text, not a literal "Placeholder" string, satisfying AC1's "no placeholder wording on
screen" requirement mechanically. A one-line code comment on the content module states plainly that
this is boilerplate pending real legal review — this is a code comment, not on-screen text, so it
does not reintroduce placeholder wording on the rendered screen. No new backlog note is needed for
"legal review is a future step" — the content module's own header comment carries that forward
durably, matching how the existing repo already handles similar deferred-real-content notes.

**VALIDATE finding (Content Note deviation itself):** confirmed this deviation is recorded
honestly and explicitly in-plan (not silently) — accepted as already-authorized, not re-litigated.
**Content-risk CONCERN (new, see validate-contract below):** the plan does not yet constrain WHAT
the boilerplate says beyond section topics. Because the actual `LEGAL_SECTIONS` text does not exist
yet at VALIDATE time (it is Implementation Checklist step 1, not yet executed), it cannot be audited
directly for embedded factual claims. Resolved via Execute-Agent Instruction E2 below — the content
must avoid specific jurisdiction/venue names, specific data-retention duration commitments, and
named third-party processors, to avoid shipping an actively-wrong operational claim under the guise
of "not a placeholder."

## Acceptance Criteria

(mirrors the locked SPEC's Acceptance Criteria 1-4 verbatim; see the SPEC file for full text)

1. The Terms & Privacy screen shows finished structured legal-style copy with no literal
   "placeholder" wording anywhere on screen — proven by the content-module unit test (mechanical
   half) plus a manual content read (qualitative half, Agent-Probe).
2. The screen is reachable from Account, in addition to the two existing entry points (signup,
   onboarding) — proven by a manual on-device walkthrough (Agent-Probe; no `apps/mobile` RN
   render/navigation test runner exists — standing project-wide gap).
3. The screen scrolls to the end and reads correctly in both light and dark mode on a small
   device — proven by a manual on-device walkthrough (Agent-Probe).
4. Terms and Privacy content appear together on one screen (not split into two), matching PRD §7 —
   proven by a Fully-Automated structural test on the shared content module.

## Implementation Checklist

1. Create `apps/mobile/src/features/legal/terms-privacy-content.ts` — export `LEGAL_SECTIONS:
   { group: 'terms' | 'privacy'; heading: string; body: string }[]`, populated with real structured
   boilerplate (5 Terms sections + 4 Privacy sections per the Content Note above), plus a top-of-file
   comment: "Boilerplate ToS/Privacy copy — NOT final legal-reviewed text; swap this file's content
   when real copy is supplied. Content-only change point (see AUTH-003 plan)." **Follow
   Execute-Agent Instruction E2 (below) while drafting the actual section text.**
2. Create `apps/mobile/src/features/legal/components/terms-privacy-body.tsx` — export
   `TermsPrivacyBody({ theme }: { theme: ReturnType<typeof useTheme> })`, rendering `LEGAL_SECTIONS`
   grouped under two headings ("Terms & Conditions" for `group: 'terms'`, "Privacy Policy" for
   `group: 'privacy'`), each section as a sub-heading `Text` + body `Text`, using
   `theme.text`/`theme.textSecondary` — no `ScrollView`/`SafeAreaView` inside this component.
3. Edit `apps/mobile/src/app/(auth)/terms.tsx` — remove the 2 placeholder `Text` nodes, render
   `<TermsPrivacyBody theme={theme} />` inside the existing `ScrollView`; update the file's top
   doc-comment (currently says "Placeholder copy only") to reflect real shared content.
4. Edit `apps/mobile/src/app/(auth)/_layout.tsx` — change the `terms` `Stack.Screen`'s `title` from
   `'Terms & Conditions'` to `'Terms & Privacy'`.
5. Create `apps/mobile/src/app/(tabs)/terms/_layout.tsx` — thin `Stack` (`headerShown: false`),
   doc-comment copied/adapted from `(tabs)/notifications/_layout.tsx` explaining why this lives
   above the tabs (reachable only from Account today, but structurally a sibling-push like
   Notifications/History, not nested inside Account's own stack).
6. Create `apps/mobile/src/app/(tabs)/terms/index.tsx` — `SafeAreaView` + `useHideTabBarWhile(useIsFocused())`
   (see Execute-Agent Instruction E3 — must be focus-gated, not a bare `true`) +
   `ScrollView` (padded, matching `(auth)/terms.tsx`'s existing `Spacing.four`/`Spacing.three`
   values) + `<ScreenHeader title="Terms & Privacy" onBack={() => router.back()} mode={mode} />` +
   `<TermsPrivacyBody theme={theme} />`.
7. Edit `apps/mobile/src/app/(tabs)/account/index.tsx` — add `<AccountLink label="Terms &
   Privacy" onPress={() => router.push('/(tabs)/terms')} color={theme.accent} />` as a 4th entry in
   the existing link `<Card>`'s `linkList`, after "Order History".
8. Create `apps/mobile/src/features/legal/__tests__/terms-privacy-content.test.ts` (vitest, node
   env — existing `apps/mobile` runner, no new dependency) asserting: (a) `LEGAL_SECTIONS` contains
   at least one entry with `group: 'terms'` and at least one with `group: 'privacy'` (proves AC4 —
   both live in one shared content module, one screen); (b) no section's `heading` or `body`
   contains the substring `"placeholder"` (case-insensitive) (proves the mechanical half of AC1);
   (c) every section has non-empty `heading` and `body` strings.
9. **Before running typecheck (Execute-Agent Instruction E1 — MANDATORY, VALIDATE-confirmed real
   gap):** run `npx expo start` once, wait for the Metro/typed-routes codegen to regenerate
   `apps/mobile/.expo/types/router.d.ts`, then stop it. VALIDATE confirmed today's on-disk
   `router.d.ts` contains `/(auth)/terms` but does NOT yet contain a `/(tabs)/terms` entry — without
   this regeneration step, `tsc --noEmit` is expected to fail on the new `router.push('/(tabs)/terms')`
   call site in `account/index.tsx` (typed routes reject unknown path literals).
10. Run `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile test`
    (vitest), `pnpm --filter @jojopotato/mobile lint`, and `pnpm format:check` on touched files —
    fix any failures before considering EXECUTE complete.
11. Manual Agent-Probe walkthrough (owed by the user, not automatable — see Verification Evidence):
    light + dark mode render and full scroll-to-end on a small device, for both entry points
    (`(auth)/terms` via signup/onboarding while signed out, `(tabs)/terms` via Account while signed
    in), plus confirming the new Account link navigates correctly and `router.back()` returns to
    Account (not stranding on a different tab), plus confirming the floating tab bar reappears
    correctly after leaving the Terms screen for another tab (E3 focus-gating check).

## Test Infra Improvement Notes

(none identified yet)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `terms-privacy-content.test.ts`: at least one `group:'terms'` and one `group:'privacy'` entry exist in one shared array | Fully-Automated | AC4 (Terms and Privacy content appear together on one screen, one shared content source) |
| `terms-privacy-content.test.ts`: no section `heading`/`body` contains `"placeholder"` (case-insensitive) | Fully-Automated | AC1 (mechanical half — no literal placeholder wording; the "is this genuinely finished legal copy" judgment remains Agent-Probe, see below) |
| `terms-privacy-content.test.ts`: every section has non-empty `heading`/`body` | Fully-Automated | AC1 (structural completeness of the content module) |
| Manual on-device walkthrough: Account tab shows a "Terms & Privacy" link; tapping it opens the Terms & Privacy screen; `router.back()` returns to Account | Agent-Probe | AC2 (reachable from Account, in addition to the two existing entry points) — no `apps/mobile` RN render/navigation test runner exists (standing, project-wide gap; matches SPEC's own strategy note) |
| Manual on-device walkthrough: light mode + dark mode, small device, both `(auth)/terms` and `(tabs)/terms` entry points, scroll to the very end of the (now longer) content | Agent-Probe | AC3 (screen reads correctly and scrolls fully in both themes) |
| Manual review: read the rendered screen top-to-bottom and confirm no "placeholder"-style wording remains and the copy reads as genuine (if brief) ToS/Privacy boilerplate, not filler text | Agent-Probe | AC1 (qualitative half — content quality judgment, not automatable) |
| Source inspection: exactly one shared `LEGAL_SECTIONS` module, exactly two route files rendering it (`(auth)/terms.tsx`, `(tabs)/terms/index.tsx`), no second independent copy of the text | Fully-Automated (via the vitest test in step 8, which imports the single content module directly — if a second/duplicate module existed the import would not cover it) | AC4 (single source of truth, not split copies) |

**Known-gap note:** AC2 and AC3 have no Fully-Automated or Hybrid path available today — this
repo has no `apps/mobile` RN component/navigation/E2E test runner (standing project-wide gap,
already tracked; consistent with every other on-device-UX plan, e.g. `mobile-dark-mode-audit`,
MENU-004). This is not a new gap introduced by this plan and does not block CONDITIONAL/PASS —
per the vacuous-green ban, these two rows are Agent-Probe (a real proving strategy), never
Known-Gap, so no backlog stub is required for them.

## Phase Completion Rules

This is a SIMPLE, single-phase plan — there are no sub-phases to sequence. The plan is:

- **CODE DONE** when Implementation Checklist steps 1-10 are complete and all automated gates
  (typed-routes codegen, typecheck, vitest, lint, format:check) are green.
- **VERIFIED** (eligible to move from `active/` to `completed/`) only after step 11's manual
  Agent-Probe walkthrough (light/dark on both entry points, Account navigation, `router.back()`
  behavior, tab-bar reappearance, and a content-quality read) has been performed and confirmed by
  the user. Per the project's standing convention (matching every other on-device-UX plan in this
  codebase), code completion alone does NOT justify archival — this task folder stays in `active/`
  until the walkthrough is done.

## Resume and Execution Handoff

1. **Selected plan file path:** `process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md` (this file).
2. **Last completed phase or step:** VALIDATE complete (Gate: CONDITIONAL) — no implementation started.
3. **Validate-contract status:** written below, Gate: CONDITIONAL — 2 concerns resolved as
   Execute-Agent Instructions (E1 typed-routes codegen, E2 content-risk guardrail), 1 minor
   implementation-detail reminder (E3 focus-gating). No plan-text structural rewrite required beyond
   the confirmations/instructions folded into this file during VALIDATE.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`; SPEC at `auth-003-terms-google-oauth_SPEC_21-07-26.md` (same folder); direct reads of `apps/mobile/src/app/_layout.tsx`, `(auth)/_layout.tsx`, `(auth)/terms.tsx`, `(tabs)/account/index.tsx`, `(tabs)/notifications/_layout.tsx` + `index.tsx`, `(tabs)/history/_layout.tsx` + `index.tsx`, `(tabs)/_layout.ios.tsx`, `floating-tab-bar.tsx` (ICONS filter), `apps/mobile/hooks/use-theme.ts`, `apps/mobile/.expo/types/router.d.ts` (confirmed `/(tabs)/terms` absent today).
5. **Next step for a fresh agent picking up mid-execution:** EXECUTE the 11 checklist steps in order (content module and component first, since both route files depend on them; typed-routes codegen — step 9 — before the typecheck gate in step 10), then hand off the Agent-Probe walkthrough (step 11) to the user before marking this task folder `VERIFIED`/moving it to `completed/`.

## Validate Contract

Status: CONDITIONAL
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 1/7 (only S7 — 8 files in blast radius — present). Single package
(`apps/mobile`), no schema/API/auth surface, no phase program, INNOVATE skipped (no competing
approaches). Sequential single-agent VALIDATE was correct; EXECUTE should also run as a single
sequential vc-execute-agent pass — no fan-out warranted.

Execution strategy (via vc-agent-strategy-compare, for the NEXT phase — EXECUTE):
- Score: 1/7 — signal present: S7 (5+ files in blast radius: 8 files)
- Recommended strategy: Sequential — one vc-execute-agent, opus, single context window
- Agent count: 1 (EXECUTE) — no fan-out
- Model: opus (vc-execute-agent — code-execution leg); no other agents needed for this phase
- Cost guard: not triggered (well under 30 agents)

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 | `LEGAL_SECTIONS` contains ≥1 `group:'terms'` + ≥1 `group:'privacy'` entry in one shared array | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` group-presence assertion | A |
| AC1-mechanical | No section `heading`/`body` contains `"placeholder"` (case-insensitive) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` placeholder-string assertion | A |
| AC1-structural | Every section has non-empty `heading`/`body` | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` completeness assertion | A |
| AC4-single-source | Exactly one shared content module, no duplicate copy | Fully-Automated | Same test file (imports the canonical module directly) + source inspection at code review | A |
| Typed-routes codegen | `/(tabs)/terms` resolves as a valid typed route | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` (after `npx expo start` once — Execute-Agent Instruction E1) | B |
| AC2 | Terms reachable from Account tab; `router.back()` returns to Account | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 11) | B |
| AC3 | Screen scrolls to end and renders correctly in light + dark mode, both entry points | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 11) | B |
| AC1-qualitative | Copy reads as genuine boilerplate, no placeholder-style wording remains | Agent-Probe | Manual top-to-bottom content read (Implementation Checklist step 11) | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist — typed-routes codegen step and the
  3 Agent-Probe walkthrough items are all executed within this same plan's Implementation Checklist
  step 9/11, not deferred elsewhere)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- `apps/mobile/src/features/legal/`: Fully-automated: `pnpm --filter @jojopotato/mobile test` (terms-privacy-content.test.ts) | hybrid: n/a | agent-probe: on-device light/dark + navigation walkthrough (Implementation Checklist step 11) | known-gap: none (Agent-Probe is the proving strategy for AC2/AC3/AC1-qualitative, not a gap — no `apps/mobile` RN E2E runner exists, standing project-wide gap, not new)

Dimension findings:
- Infra fit: PASS — pure `apps/mobile` change, no container/infra/runtime surface touched, no port/env/config surface involved.
- Test coverage: PASS — mechanical AC4/AC1-structural/AC1-mechanical fully covered by a new vitest file matching the existing `src/**/__tests__/**/*.test.ts` glob (no new runner needed); AC2/AC3/AC1-qualitative correctly assigned Agent-Probe (a valid proving strategy per the vacuous-green ban, not Known-Gap) given the standing project-wide no-RN-E2E-runner gap.
- Breaking changes: PASS — no API/schema/public-contract changes; the only new "contract" is an app-internal Expo Router path, not exposed externally.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface. Content-risk (legal-copy factual accuracy) is not a STRIDE/OWASP security concern but is addressed via Execute-Agent Instruction E2 below since specific over-committing legal claims could create real risk if shipped as if final.
- Section — Decision 1 / Routing feasibility: CONCERN → resolved as Execute-Agent Instruction E1 — mechanical feasibility of the `(tabs)/terms` sibling-route approach is confirmed sound (verified `_layout.ios.tsx`/`_layout.android.tsx` don't need edits, ICONS allowlist filter confirmed, ScreenHeader/useHideTabBarWhile pattern confirmed against `notifications`/`history`), but the plan's checklist did not originally call out the mandatory typed-routes codegen regeneration step (`.expo/types/router.d.ts` verified on-disk today to lack a `/(tabs)/terms` entry) before `tsc --noEmit` can pass. Added as checklist step 9 + E1 in this VALIDATE pass.
- Section — Content Note: CONCERN → resolved as Execute-Agent Instruction E2 — the plan honestly records its deviation from the SPEC's externally-sourced-copy framing (accepted, not re-litigated) but did not yet constrain the actual boilerplate text against embedding specific jurisdiction/venue claims, specific data-retention periods, or named third-party processors. Since the content module doesn't exist yet at VALIDATE time, this cannot be checked directly — constrained prospectively via E2 instead.
- Section — Implementation detail (useHideTabBarWhile): minor note, not counted as a CONCERN — confirmed `history`/`notifications` both use `useHideTabBarWhile(useIsFocused())` (focus-gated), not a bare `true`; folded into checklist step 6 + Execute-Agent Instruction E3 as a precise reminder, not a plan defect.

Execute-Agent Instructions:
- E1 (MANDATORY, ties to checklist step 9): Run `npx expo start` once and stop it before running `tsc --noEmit`/`pnpm --filter @jojopotato/mobile typecheck`, so `.expo/types/router.d.ts` regenerates to include the new `/(tabs)/terms` route. VALIDATE confirmed today's on-disk `router.d.ts` lacks this entry (only `/(auth)/terms` exists); without regeneration, typecheck is expected to fail on `router.push('/(tabs)/terms')` in `account/index.tsx`.
- E2 (ties to checklist step 1): When drafting `LEGAL_SECTIONS`' actual section text, avoid embedding: (a) a specific jurisdiction/venue for dispute resolution (e.g. do not assert "the courts of [specific city/country] have exclusive jurisdiction"), (b) a specific data-retention duration commitment (e.g. do not promise "we delete your data after 90 days" unless that is a real, locked operational policy), (c) named third-party payment or data processors not actually integrated in this codebase (e.g. do not name a specific payment gateway by name — `payment_status`/processor selection remains an open question per `all-context.md` §Open Questions). Keep the language generic legal-boilerplate framing consistent with the module's own "not final legal-reviewed text" header comment. This avoids shipping an actively-wrong operational claim under the guise of "no placeholder wording."
- E3 (ties to checklist step 6): Use `useHideTabBarWhile(useIsFocused())` in `(tabs)/terms/index.tsx` (import `useIsFocused` from `expo-router`), matching `notifications`/`history` exactly — not a bare `useHideTabBarWhile(true)`, which would leave the floating tab bar permanently hidden after the user navigates away from Terms to another tab.

Backlog artifacts: none new required — the Google-OAuth split-out backlog note
(`process/features/auth-accounts/backlog/auth-003-google-oauth-verification-deploy-blocked_NOTE_21-07-26.md`)
was verified present and accurately referenced; no new gap requires a fresh backlog artifact.

Open gaps: none beyond the standing, already-tracked, project-wide "no `apps/mobile` RN E2E/navigation
test runner" gap (AC2/AC3/AC1-qualitative — Agent-Probe, not Known-Gap, not new debt).

What this coverage does NOT prove:
- The 4 Fully-Automated content-module tests do NOT prove: legal accuracy or regulatory compliance
  of the copy; correct visual rendering, typography, or scroll behavior on any real device; correct
  navigation wiring end-to-end (Account link tap → screen mount → back() → Account); light/dark
  visual correctness; or that `TermsPrivacyBody` is genuinely consumed by both route files at
  runtime (the "single shared module" assertion is an import-coverage proxy, not an exhaustive
  source-tree scan for a second duplicate copy).
- The typed-routes codegen gate (typecheck after `expo start`) proves the route path is
  type-valid; it does NOT prove the screen actually renders correctly or that navigation UX is
  correct — that is the Agent-Probe walkthrough's job.
- The 3 Agent-Probe rows (AC2, AC3, AC1-qualitative) prove correctness only for the specific
  device/theme combinations actually walked through in one manual session; they do NOT provide
  ongoing automated regression protection — a future silent change to routing, theming, or content
  could reintroduce a bug with no automated gate to catch it, since no `apps/mobile` RN E2E/navigation
  runner exists yet (standing, tracked gap, not new).

Gate: CONDITIONAL (2 concerns identified and resolved via Execute-Agent Instructions E1/E2, no
unresolved FAILs, no plan-text structural changes required beyond the instructions/confirmations
folded into this file)
Accepted by: session — concerns are both mechanical/instructional (E1 typed-routes codegen step,
E2 content-copy guardrail) with no architectural or scope impact; resolved in-line as Execute-Agent
Instructions per the orchestrator's delegation to complete the full V1-V7 VALIDATE cycle and write
the contract in this pass. No FAILs were found; EXECUTE may proceed.

## Autonomous Goal Block

SESSION GOAL: Ship AUTH-003 (Terms-only) — real Terms & Privacy content, reachable from Account, verified in light/dark.
Charter + umbrella plan: N/A — single SIMPLE plan, no phase-program umbrella exists for this feature.
Autonomy: Standard RIPER-5 gates apply (no standing /goal active for this task). EXECUTE requires explicit "ENTER EXECUTE MODE".
Hard stop conditions / safety constraints:
- No auth/schema/API/billing surface may be touched by this plan (confirmed none exists in scope) — if EXECUTE discovers any, stop and return to PLAN.
- Content must not assert specific jurisdiction/venue, specific data-retention periods, or named third-party processors (Execute-Agent Instruction E2) — these would be actively-wrong operational claims, not just "not final legal review."
- Typed-routes codegen (E1) must run before the typecheck gate is considered authoritative.
Next phase: EXECUTE: process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md
Validate contract: inline in plan (see `## Validate Contract` section above)
Execute start: `pnpm --filter @jojopotato/mobile typecheck` (after `npx expo start` once per E1) | `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/mobile lint` | `pnpm format:check` | high-risk pack: no (no high-risk class present)
