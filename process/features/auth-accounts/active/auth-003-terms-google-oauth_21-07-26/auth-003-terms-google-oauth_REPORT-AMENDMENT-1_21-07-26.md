---
phase: auth-003-terms-google-oauth-amendment-1
date: 2026-07-21
status: COMPLETE_WITH_GAPS
feature: auth-accounts
plan: process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md
---

# AUTH-003 AMENDMENT 1 — EXECUTE Report

Scope: AMENDMENT 1 only (split Terms/Privacy into two documents reachable via Help). The
pre-amendment combined-screen shape was already CODE DONE before this pass; its report is the
sibling `auth-003-terms-google-oauth_REPORT_21-07-26.md`. This report covers the amendment edits.

## What Was Done

Implemented AMENDMENT 1 Implementation Checklist steps 1–12 exactly as written.

- **Step 1 — content module** (`features/legal/terms-privacy-content.ts`): confirmed present,
  `group: 'terms' | 'privacy'` field already per-section, 7 terms + 4 privacy sections split cleanly.
  E2 content guardrails re-verified honored (no jurisdiction/venue, no data-retention duration, no
  named processor). No structural change needed.
- **Step 2 — `TermsPrivacyBody`** (`features/legal/components/terms-privacy-body.tsx`): added a
  required `group: 'terms' | 'privacy'` prop; now filters `LEGAL_SECTIONS` to `s.group === group`
  before rendering and dropped the combined two-heading (`GROUP_LABELS`) layout — the calling
  screen's `ScreenHeader title` names the document. "Last updated" line retained.
- **Step 3 — `(auth)/terms.tsx`**: renders `<TermsPrivacyBody theme={theme} group="terms" />`;
  doc-comment updated to Terms-only.
- **Step 3b (VALIDATE-added, mandatory) — `(auth)/_layout.tsx`**: reverted the `terms`
  `Stack.Screen` `title` from `"Terms & Privacy"` back to `"Terms & Conditions"` (this file owns
  the pre-auth native header title).
- **Step 4 — `(tabs)/terms/_layout.tsx`**: confirmed present; no edit per checklist.
- **Step 5 — `(tabs)/terms/index.tsx`**: `ScreenHeader title="Terms and Conditions"`,
  `<TermsPrivacyBody theme={theme} group="terms" />`; doc-comment updated; E3
  `useHideTabBarWhile(useIsFocused())` preserved.
- **Step 6 — `(tabs)/privacy/_layout.tsx`** (new): thin `Stack headerShown:false`, mirrors
  `(tabs)/terms/_layout.tsx`.
- **Step 7 — `(tabs)/privacy/index.tsx`** (new): mirrors terms index — `SafeAreaView edges={['top']}`
  + `useHideTabBarWhile(useIsFocused())` (E3) + `ScreenHeader title="Privacy Policy"` +
  `<TermsPrivacyBody theme={theme} group="privacy" />` + identical tab-bar clearance.
- **Step 8 — `(tabs)/account/index.tsx`**: REMOVED the "Terms & Privacy" `SettingsRow` and its
  preceding `SettingsRow.Divider` (7 lines). The "Help" row in the same Card is untouched.
- **Step 9 — `(tabs)/account/help.tsx`** (rewrite from `<ComingSoon>`): `SafeAreaView
  edges={['top','bottom']}` (nested-account-screen pattern, mirrors `edit-profile.tsx`, not the
  top-level sibling-stack tab-bar-hide pattern) + `ScreenHeader title="Help" onBack` + a `Card`
  with 2 `SettingsRow` rows: "Terms and Conditions" → `/(tabs)/terms`, "Privacy Policy" →
  `/(tabs)/privacy`. `mode` computed via `useColorScheme()` and passed to `Card` + both
  `SettingsRow`s (VALIDATE-caught required prop). Icons: `document-text-outline` (Terms),
  `shield-checkmark-outline` (Privacy) — both existing Ionicons glyphs (E4).
- **Step 10 — test file** (`features/legal/__tests__/terms-privacy-content.test.ts`): added 2
  AC4' assertions — filtering by `group:'terms'` returns ≥1 and 0 privacy entries, and the mirror
  case. Original placeholder-string / non-empty / group-presence assertions retained.
- **Step 11 — typed-routes codegen (E1')**: ran `npx expo start` once; `router.d.ts` now carries
  the normalized `/(tabs)/privacy` route (was only present un-normalized as `/(tabs)/privacy/index`
  before the refresh). `/(tabs)/terms` and `/(tabs)/account/help` were already normalized.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Typed-routes codegen | `npx expo start` once (E1') | PASS — `/(tabs)/privacy` normalized in `router.d.ts` |
| Typecheck | `pnpm --filter @jojopotato/mobile typecheck` | PASS — 0 errors |
| Tests | `pnpm --filter @jojopotato/mobile test` | PASS — vitest incl. new AC4' assertions (8/8 in the legal suite); jest 25 suites / 93 tests |
| Lint | `pnpm --filter @jojopotato/mobile lint` | PASS — 0 errors (3 pre-existing warnings in untouched `scripts/dev-with-tunnel.mjs`) |
| Format | `pnpm format:check` (9 touched files) | PASS — all clean after LF normalization of `account/index.tsx` (see Deviations) |

AC4' Fully-Automated split assertions (the one genuinely-new gate) verified green.

## What Was Skipped or Deferred

- **Step 13 — manual Agent-Probe walkthrough**: user-owed, NOT performed by this agent (per the
  task instruction and the plan's Phase Completion Rules). Task folder stays in `active/` until the
  user performs it; code completion alone does not justify archival.

## Plan Deviations

- **One within-blast-radius, gate-required normalization (not a scope deviation):**
  `(tabs)/account/index.tsx` had CRLF line endings in the working tree (a pre-existing local
  artifact — `core.autocrlf: true`, git stores LF; the HEAD blob is LF and Prettier-clean). The
  file failed `prettier --check` identically WITH or WITHOUT my 7-line deletion — it is the
  documented repo-wide CRLF drift (`general-plans/backlog/crlf-line-ending-format-check-drift_NOTE_17-07-26.md`),
  not caused by AMENDMENT 1. To make the touched-files format gate green I ran `prettier --write` on
  that one file, normalizing it to LF (the repo's Prettier convention; all 8 other touched files
  are already LF). Git diff still shows exactly the 7-line deletion — the LF change is invisible to
  git under autocrlf. No content/behavior change.

## Test Infra Gaps Found

- None new. Client-side render/navigation behavior remains Agent-Probe only (standing project-wide
  "no `apps/mobile` RN component/navigation/E2E runner" gap) — already tracked, not new debt.

## Closeout Packet

- **Selected plan:** `process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md`
- **Finished:** AMENDMENT 1 checklist steps 1–12; all 5 automated gates green.
- **Verified vs unverified:** Data-layer split (AC4'), typed-route validity, no-placeholder/structural
  content — all Fully-Automated verified. On-device rendering, light/dark, `router.back()` behavior,
  tab-bar reappearance, Help 2-row reachability, Account-row absence, pre-auth Terms-only content —
  Agent-Probe, user-owed (step 13), unverified.
- **Cleanup remaining:** user Agent-Probe walkthrough (step 13); then UPDATE PROCESS.
- **Closeout classification:** `Keep in active/testing` — CODE DONE; not archivable until step 13.

## Forward Preview

### Test Infra Found
No new runner introduced. `apps/mobile` vitest (pure-TS) covers the AC4' content-module split;
`apps/mobile` jest covers RN component logic. No RN navigation/E2E runner exists (unchanged).

### Blast Radius Changes
`apps/mobile` only. New app-internal Expo Router path `/(tabs)/privacy` (sibling of `/(tabs)/terms`).
New files: `(tabs)/privacy/_layout.tsx`, `(tabs)/privacy/index.tsx`. Edited:
`features/legal/components/terms-privacy-body.tsx`, `features/legal/__tests__/terms-privacy-content.test.ts`,
`(auth)/terms.tsx`, `(auth)/_layout.tsx`, `(tabs)/terms/index.tsx`, `(tabs)/account/index.tsx`,
`(tabs)/account/help.tsx`. No package/schema/API/auth surface touched.

### Commands to Stay Green
`pnpm --filter @jojopotato/mobile typecheck` · `pnpm --filter @jojopotato/mobile test` ·
`pnpm --filter @jojopotato/mobile lint` · `pnpm format:check`. Re-run `npx expo start` once after any
new `(tabs)/*` route folder is added, before typecheck, so `router.d.ts` regenerates.

### Dependency Changes
None.

## Notes / Follow-up stubs

- No follow-up plan stubs created.
- No CONTEXT_PARTIAL items.
- Minor observation (not actioned, not a gate failure): `(tabs)/terms/_layout.tsx`'s doc-comment
  still says "renders the same combined copy" — now terms-only. Checklist step 4 explicitly said no
  edit to this file, so it was left untouched. Purely a stale comment; can be tidied at UPDATE PROCESS.
