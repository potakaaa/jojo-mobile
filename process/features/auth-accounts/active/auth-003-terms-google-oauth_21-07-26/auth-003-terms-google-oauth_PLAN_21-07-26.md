---
name: plan:auth-003-terms-google-oauth
description: "SIMPLE plan for AUTH-003 (Terms-only split) — real Terms & Privacy content, now SPLIT into two separate documents/screens reachable via Help, light/dark verification"
date: 21-07-26
feature: auth-accounts
---

# AUTH-003 — Terms & Conditions Content (Terms Only) — Implementation Plan

Date: 21-07-26 (AMENDED same day — see `## AMENDMENT 1` below)
Status: AMENDED — supersedes the original "one combined screen, Account menu link" shape.
Complexity: SIMPLE (amendment is still a mechanical routing/content-split change, same risk class)

Source SPEC: `auth-003-terms-google-oauth_SPEC_21-07-26.md` (same folder) — **patched** by
`## AMENDMENT 1` below to override its "PRD §7 settles: ONE combined screen" Constraint.

INNOVATE was skipped by orchestrator decision both times — there is no competing architecture,
only mechanical routing/content facts to get right.

> **Read order for a fresh agent:** the original Overview/Decision 1/Touchpoints/Checklist below
> describe the FIRST implementation shape (combined screen, direct Account link). That shape was
> never executed (VALIDATE finished, EXECUTE had not started). `## AMENDMENT 1` is the current,
> authoritative shape — it supersedes the combined-screen approach entirely. Do not implement the
> original checklist as written; implement `## AMENDMENT 1 — Implementation Checklist` instead.
> The original sections are kept for history (Decision 1's routing facts about `Stack.Protected`
> groups and the `(tabs)/terms/` sibling-route pattern are still true and still used).

## Overview (original — history, routing facts still valid)

Today's Terms screen (`apps/mobile/src/app/(auth)/terms.tsx`) is 2 lines of placeholder text,
reachable only from the pre-auth stack (signup, onboarding). This plan:

1. Replaces the placeholder text with real, structured (non-"Lorem ipsum", non-final-legal-review)
   Terms & Privacy boilerplate copy, stored as a single swappable content module so a future
   real-copy swap is content-only.
2. Adds the missing Account-tab entry point — which requires a genuine routing fix, not just a
   new link (see Decision 1).
3. Confirms the (now longer) screen still reads correctly and scrolls fully in light and dark mode.

**Superseded by AMENDMENT 1:** item 2 (direct Account link to one combined screen) is replaced by
Help-only reachability with two separate documents. Item 1's content module is kept (just split by
`group` at render time, not restructured); item 3 is unchanged in spirit, extended to 2 screens.

## Decision 1 (locked, still valid): the Account/Help link cannot reuse `(auth)/terms` — needs new route(s)

**The technical detail flagged for verification is real and blocks a naive "just add a Link"
approach.** Confirmed by reading `apps/mobile/src/app/_layout.tsx`'s `RootNavigator`: the app uses
four mutually-exclusive `Stack.Protected` guards — `(staff)` / `(tabs)` / `(onboarding)` / `(auth)`.
Only ONE of these four top-level groups is ever mounted at a time, driven by auth/onboarding state.
`(auth)/terms.tsx` is registered inside the `(auth)` Stack (`(auth)/_layout.tsx`), which is **only
mounted when `!isAuthenticated`**. An authenticated customer viewing Account/Help is in the
`(tabs)` group — the `(auth)` group and its `terms` screen are not mounted at all, so
`router.push('/(auth)/terms')` from a `(tabs)` screen would resolve to nothing.

**Fix (unchanged mechanism, now applied twice):** add sibling route(s) inside the `(tabs)` group —
`(tabs)/terms/` and (new, per AMENDMENT 1) `(tabs)/privacy/` — following the exact existing
precedent set by `(tabs)/notifications/` and `(tabs)/history/` (a folder with its own `_layout.tsx`
Stack + `index.tsx`, not registered as a tab, reached only via `router.push(...)`, hidden from the
floating tab bar automatically because `floating-tab-bar.tsx`'s `ICONS` map is an allowlist —
routes absent from it render no tab button, confirmed by reading the filter at
`floating-tab-bar.tsx:314`).

To avoid duplicating the copy, the actual Terms/Privacy text stays in one shared content module +
one shared presentational body component (now filtered by `group` — see AMENDMENT 1), and every
route file renders that same shared body filtered to its own document.

**Rejected alternative:** moving `terms.tsx` out of `(auth)` entirely into some shared top-level
location outside all four Stack.Protected groups. Not possible — Expo Router's typed file-based
routing requires every screen to live inside some registered group, and `Stack.Protected` gates
whole groups, not individual files across groups.

**VALIDATE confirmation (V2 Layer 2, original pass):** verified directly against source —
`_layout.ios.tsx`/`_layout.android.tsx` register only the 5 real tabs (`index`, `order`, `rewards`,
`branches`, `account`); `notifications` and `history` are NOT declared there and are still
reachable as sibling stacks purely via Expo Router's file-system auto-discovery + the
`FloatingTabBar` ICONS allowlist filter. The same mechanism picks up `(tabs)/terms/` AND the new
`(tabs)/privacy/` with zero `_layout.{ios,android,web}.tsx` edits. Confirmed sound; still applies.

## Touchpoints (original — superseded in part by AMENDMENT 1; see the amendment's own touchpoints table for the authoritative file list)

| File | Change |
|---|---|
| `apps/mobile/src/features/legal/terms-privacy-content.ts` | New. Plain data module: exported `LEGAL_SECTIONS` array, each entry `{ group: 'terms' \| 'privacy'; heading: string; body: string }`. **Still current** — AMENDMENT 1 reuses this file unchanged; only the render-time filtering changes. |
| `apps/mobile/src/features/legal/components/terms-privacy-body.tsx` | New. Presentational component. **Superseded** — AMENDMENT 1 adds a `group` prop so it renders only one document's sections; see amendment. |
| `apps/mobile/src/features/legal/__tests__/terms-privacy-content.test.ts` | New. **Superseded** — AMENDMENT 1 extends this test file's assertions for the split; see amendment. |
| `apps/mobile/src/app/(auth)/terms.tsx` | Edit. **Superseded** — AMENDMENT 1 changes this to Terms-and-Conditions-ONLY content (`group:'terms'`), not combined. |
| `apps/mobile/src/app/(auth)/_layout.tsx` | Edit. **Superseded** — AMENDMENT 1 keeps this screen's title as "Terms & Conditions" (reverts the combined "Terms & Privacy" title rename this row originally called for — never executed, so nothing to revert in code, just noting the plan no longer wants that rename). |
| `apps/mobile/src/app/(tabs)/terms/_layout.tsx` + `index.tsx` | New. **Still current**, repointed — AMENDMENT 1 keeps this route as the Terms-and-Conditions screen (`group:'terms'`), but its only entry point becomes Help, not Account. |
| `apps/mobile/src/app/(tabs)/account/index.tsx` | Edit. **Superseded** — AMENDMENT 1 REMOVES the direct "Terms & Privacy" row from Account's menu instead of adding one (see amendment; this reflects the merge-conflict-added row the user asked to remove). |

## Public Contracts

None. No API, schema, or cross-package contract changes in either the original or amended shape.

## Blast Radius (original estimate — see AMENDMENT 1 for the current, authoritative estimate)

- **Packages touched:** `apps/mobile` only.
- **Risk class:** none of the high-risk classes apply (no auth, billing, schema, public API,
  deploy/container, or secrets/trust-boundary surface). Pure UI/content/navigation change.

## Content Note (locked decision, deviates from a strict literal SPEC reading — recorded explicitly; still valid, extended by AMENDMENT 1)

The SPEC's own Out-of-Scope section frames "drafting the real legal Terms & Conditions / Privacy
Policy text" as sourced externally, and AC1's `proven by:` clause anticipates copy being supplied
later. The orchestrator's task instruction for this PLAN session explicitly directed writing real,
structured (non-placeholder-worded) boilerplate ToS+Privacy content, appropriate for a
food-ordering app, while making clear this is NOT final legal-reviewed copy — genuine legal review
remains an external follow-up. This plan follows that instruction over the SPEC's more conservative
framing (unchanged by AMENDMENT 1 — the split does not change how the content itself is sourced,
only how it's grouped/rendered/reached).

**Content-risk CONCERN (original, resolved via Execute-Agent Instruction E2 below):** the
boilerplate text must avoid specific jurisdiction/venue names, specific data-retention duration
commitments, and named third-party processors.

## Acceptance Criteria (original — see AMENDMENT 1 for the amended AC set that supersedes AC2 and AC4 below)

(mirrors the locked SPEC's Acceptance Criteria 1-4; AC2 and AC4 are overridden by AMENDMENT 1 — see below)

1. The Terms/Privacy screens show finished structured legal-style copy with no literal
   "placeholder" wording anywhere on screen — proven by the content-module unit test (mechanical
   half) plus a manual content read (qualitative half, Agent-Probe). **Unchanged by amendment.**
2. ~~The screen is reachable from Account, in addition to the two existing entry points (signup,
   onboarding)~~ — **SUPERSEDED by AMENDMENT 1 AC2'** (see below): reachable from Help, not
   directly from Account; two documents, each with its own entry point inside Help.
3. The screens scroll to the end and read correctly in both light and dark mode on a small
   device — proven by a manual on-device walkthrough (Agent-Probe). **Unchanged, now covers both
   screens.**
4. ~~Terms and Privacy content appear together on one screen (not split into two)~~ — **SUPERSEDED
   by AMENDMENT 1 AC4'**: this is now a direct, explicit user-requested override of that PRD §7
   reading — Terms and Privacy are split into two separate screens/documents, each reachable via
   its own row inside Help.

## Implementation Checklist (original — DO NOT EXECUTE AS WRITTEN; superseded by AMENDMENT 1's checklist below)

(kept for history only — see `## AMENDMENT 1 — Implementation Checklist` for the authoritative
11-step checklist to actually execute)

## Test Infra Improvement Notes

(none identified yet)

---

## AMENDMENT 1 — Split Terms/Privacy into two documents, reachable via Help (21-07-26)

### Trigger

Direct user instruction, delivered to the orchestrator after VALIDATE completed on the original
shape (EXECUTE had not yet started — zero implementation exists on disk for either shape):

> "separate terms and conditions and privacy policy, also put it on help and have 2 nav same ui
> just 2 navs inside the help"

Three explicit, locked decisions from this instruction:

1. **Split the content** — Terms and Conditions and Privacy Policy become two genuinely separate
   documents/screens, not one combined page.
2. **Relocate the entry point** — remove the direct "Terms & Privacy" row from Account's top-level
   menu (this row was added during a merge-conflict resolution during this session, targeting the
   old combined `(tabs)/terms` route — it is being removed, not repointed).
3. **Reachability now lives inside Help** — Help gets 2 new nav rows ("Terms and Conditions",
   "Privacy Policy"), same `SettingsRow`-inside-`Card` UI convention as everywhere else in Account,
   each navigating to its own screen.

### SPEC override (recorded, not re-litigated)

This directly overrides the SPEC's Constraints section claim "PRD §7 already settles the
Terms-vs-Privacy split — one combined screen, not two." The SPEC file itself is patched with a
dated override paragraph (see the SPEC file's own `## AMENDMENT 1 Override` section) rather than
rewritten — same treatment this plan already gave the original Content Note deviation: an explicit,
dated, user-authorized override, not a gap and not re-derived from scratch.

### Ground truth confirmed before writing this checklist (do not re-derive)

- `apps/mobile/src/app/(tabs)/account/help.tsx` is CURRENTLY a bare `<ComingSoon isNestedScreen
  onBack={...} />` placeholder — never built out. This is the FIRST real implementation of this
  screen. It is nested under Account's stack (reached via `router.push('/(tabs)/account/help')`),
  `headerShown:false` on that stack (NAV-003 doc comment) — so the new real screen supplies its own
  back affordance the same way `(tabs)/terms/index.tsx` will (see AMENDMENT 1 touchpoints below):
  `SafeAreaView` + `ScreenHeader` (from `@jojopotato/ui`) + `onBack={() => router.back()}`.
- `apps/mobile/src/app/(auth)/login.tsx:236-238` and `apps/mobile/src/app/(auth)/onboarding.tsx:63-65`
  both already link to `/(auth)/terms` with the label "Terms & Conditions" (already Terms-only
  wording, not "Terms & Privacy"). **Zero edits needed to either file** — once `(auth)/terms.tsx`
  renders Terms-and-Conditions-only content (`group:'terms'`), these existing links become correct
  automatically. No Privacy Policy link is added to the pre-auth stack (out of scope, not
  requested, no existing pre-auth entry point expects one).
- Shared content module `apps/mobile/src/features/legal/terms-privacy-content.ts` already models
  `LEGAL_SECTIONS: LegalSection[]` with a `group: 'terms' | 'privacy'` field per entry, plus
  `LEGAL_LAST_UPDATED` — the grouping already exists in the data shape; only a render-time filter
  is needed, no data restructuring.
- Shared render component `apps/mobile/src/features/legal/components/terms-privacy-body.tsx`
  (`TermsPrivacyBody({ theme })`) currently renders BOTH groups combined — needs a `group: 'terms'
  | 'privacy'` prop so it renders only the matching subset. One component + a filter prop is the
  minimal-diff option (matches this session's established lazy-diff convention), reusing all
  existing render logic — not two separate components.
- Routes currently rendering the combined content: `(auth)/terms.tsx` (pre-auth, unchanged
  reachability) and `(tabs)/terms/_layout.tsx` + `index.tsx` (post-auth — currently planned to be
  linked directly from Account; that direct link is removed per this amendment, replaced by a Help
  row).
- `(tabs)/account/index.tsx`'s original plan (this file's Touchpoints table, row 8/checklist step
  7) added a `SettingsRow`/`AccountLink` "Terms & Privacy" entry pointing at `/(tabs)/terms` — **this
  row is removed by this amendment**, not added — Help's own existing menu row (already present,
  unmodified) is the only entry point into legal content from Account going forward.

### AMENDMENT 1 — Touchpoints (authoritative — supersedes the original Touchpoints table above)

| File | Change |
|---|---|
| `apps/mobile/src/features/legal/components/terms-privacy-body.tsx` | **Edit** (or already-new, whichever lands first — see Resume note). Add a required `group: 'terms' \| 'privacy'` prop; filter `LEGAL_SECTIONS` to only that group before rendering; drop the two-heading combined layout in favor of rendering just that group's sections under no extra top-level heading (the screen's own `ScreenHeader title` already names the document). |
| `apps/mobile/src/features/legal/terms-privacy-content.ts` | **No structural change** — `group` field already exists per entry; confirm content still splits cleanly (Terms sections vs Privacy sections) when filtered — no data edit expected. |
| `apps/mobile/src/app/(auth)/terms.tsx` | **Edit.** Render `<TermsPrivacyBody theme={theme} group="terms" />` (Terms-and-Conditions-only). Header/title text on this pre-auth screen should read "Terms & Conditions" (matches what login/onboarding already call it) — do NOT rename it to "Terms & Privacy". |
| `apps/mobile/src/app/(auth)/_layout.tsx` | **Edit (VALIDATE-added — confirmed necessary, was missing from this table).** The pre-amendment EXECUTE pass already changed this file's `<Stack.Screen name="terms" options={{ title: ... }}>` from `"Terms & Conditions"` to `"Terms & Privacy"` (confirmed on disk, line 18) — this is the file that actually renders the pre-auth screen's on-screen native header title (`terms.tsx` itself has no `ScreenHeader`/title element of its own — confirmed by direct read). Without reverting this line back to `title: 'Terms & Conditions'`, AC6' will silently pass on content but fail on title: the pre-auth screen will show Terms-only *content* while the native header still reads "Terms & Privacy". |
| `apps/mobile/src/app/(tabs)/terms/_layout.tsx` + `index.tsx` | **Keep as-is per the original plan's shape** (new sibling route, `useHideTabBarWhile(useIsFocused())`, `ScreenHeader`), but render `<TermsPrivacyBody theme={theme} group="terms" />` and set `ScreenHeader title="Terms and Conditions"`. This is now reached ONLY via Help, not Account. |
| `apps/mobile/src/app/(tabs)/privacy/_layout.tsx` | **New.** Thin `Stack` wrapper (`headerShown:false`), mirroring `(tabs)/terms/_layout.tsx` exactly (same doc-comment convention, same `useHideTabBarWhile` pattern), adjusted for Privacy. |
| `apps/mobile/src/app/(tabs)/privacy/index.tsx` | **New.** Mirrors `(tabs)/terms/index.tsx` exactly: `SafeAreaView` + `useHideTabBarWhile(useIsFocused())` + `ScrollView` (same `Spacing.four`/`Spacing.three` padding) + `<ScreenHeader title="Privacy Policy" onBack={() => router.back()} mode={mode} />` + `<TermsPrivacyBody theme={theme} group="privacy" />`. |
| `apps/mobile/src/app/(tabs)/account/index.tsx` | **Edit — REMOVE**, not add. Delete the "Terms & Privacy" `SettingsRow`/`AccountLink` entry that was added to this file during this session's merge-conflict resolution (pointing at `/(tabs)/terms`). Help's own pre-existing row in the same Card is untouched — it already exists and is correct. |
| `apps/mobile/src/app/(tabs)/account/help.tsx` | **Rewrite — first real implementation.** Replace `<ComingSoon isNestedScreen onBack={...} />` with: `SafeAreaView` + `ScreenHeader title="Help" onBack={() => router.back()}` (matching `(tabs)/terms/index.tsx`'s pattern) + a `Card` containing 2 `SettingsRow` entries: "Terms and Conditions" → `router.push('/(tabs)/terms')`, "Privacy Policy" → `router.push('/(tabs)/privacy')`. Use the same icon/row conventions already established in `account/index.tsx`'s menu (e.g. `document-text-outline` for Terms — confirmed a valid Ionicons glyph; `shield-checkmark-outline` for Privacy — also confirmed a valid Ionicons glyph in this repo's `@expo/vector-icons` glyphmap). **VALIDATE-added (confirmed necessary):** compute `const scheme = useColorScheme(); const mode = scheme === 'dark' ? 'dark' : 'light';` (same pattern as `account/index.tsx` and `coming-soon.tsx`) and pass `mode={mode}` to both `Card` and `SettingsRow` — unlike `ScreenHeader` (`mode` optional, defaults `'light'`), `Card`/`SettingsRow` declare `mode: ThemeMode` as a REQUIRED prop with no default (confirmed by direct read of `packages/ui/src/components/{card,settings-row}.tsx`) — omitting it is a typecheck FAIL, not a style nicety. |
| `apps/mobile/src/features/legal/__tests__/terms-privacy-content.test.ts` | **Extend.** Add assertions: filtering `LEGAL_SECTIONS` by `group:'terms'` returns ≥1 entry and excludes every `group:'privacy'` entry (and vice versa) — proves the split is real at the data layer, not just a rendering nicety. If `TermsPrivacyBody`'s filter logic can be isolated as a pure function (e.g. extract a small `filterLegalSections(group)` helper into the content module or a co-located util), test that function directly; otherwise this stays a data-module-only assertion (component render-level behavior remains Agent-Probe, matching this repo's standing no-RN-render-runner gap). |

**Not touched, verified unnecessary (unchanged from original plan):** `floating-tab-bar.tsx`
(ICONS allowlist excludes unlisted route names by construction); `_layout.ios.tsx`/
`_layout.android.tsx` (sibling stacks auto-discovered, zero edits); `(onboarding)/index.tsx`, all of
`packages/*` (pure `apps/mobile` change).

### AMENDMENT 1 — Public Contracts

None. Same as original — no API/schema/cross-package contracts. Two new app-internal Expo Router
paths (`/(tabs)/terms`, `/(tabs)/privacy`) instead of one.

### AMENDMENT 1 — Blast Radius

- **Packages touched:** `apps/mobile` only (unchanged).
- **Files:** ~9 total (VALIDATE-corrected from ~8 — `(auth)/_layout.tsx` was missing from the
  original count) — 1 component edit (`terms-privacy-body.tsx`), 1 pre-auth screen edit
  (`(auth)/terms.tsx`), 1 pre-auth layout title revert (`(auth)/_layout.tsx` — VALIDATE-added),
  1 existing post-auth route repointed/edited (`(tabs)/terms/index.tsx`),
  2 new files (`(tabs)/privacy/_layout.tsx` + `index.tsx`), 1 Account edit (remove row), 1 Help
  rewrite, 1 test file extension. (`_layout.tsx` for `(tabs)/terms/` is unchanged from the original
  plan and does not need re-editing beyond what the original checklist already specified — confirmed
  already present on disk, see Resume note correction below.)
- **Risk class:** none of the high-risk classes apply — unchanged, pure UI/content/navigation.
- **Runtime surfaces touched:** `apps/mobile` only.

### AMENDMENT 1 — Acceptance Criteria (supersede AC2 and AC4 from the original AC list above; AC1 and AC3 carry over unchanged, now covering 2 screens)

1. (unchanged from original AC1) Both screens show finished structured legal-style copy with no
   literal "placeholder" wording — proven by the content-module unit test (mechanical half) plus a
   manual content read (qualitative half, Agent-Probe), for BOTH documents now.
2'. **(supersedes original AC2)** The Terms and Conditions screen and the Privacy Policy screen are
   each reachable via their own row inside the Help screen — not via a direct Account-menu link.
   Help shows exactly 2 nav rows (using the same `SettingsRow`/`Card` UI convention as elsewhere in
   Account), each opening its own document — proven by a manual on-device walkthrough (Agent-Probe;
   standing no-RN-runner gap, same as before).
3. (unchanged from original AC3, now covering 2 screens) Both screens scroll to the end and read
   correctly in both light and dark mode on a small device — proven by a manual on-device
   walkthrough (Agent-Probe).
4'. **(supersedes original AC4)** Terms and Conditions and Privacy Policy are two SEPARATE documents/
   screens (not one combined page) — this is a direct, explicit user override of the SPEC's prior
   "PRD §7 settles: one combined screen" framing, recorded here as an authorized decision, not a
   gap. Proven by a Fully-Automated structural test on the shared content module (filtering by
   `group` excludes the other group's sections) plus source inspection confirming two distinct
   route files.
5' (new). Account's top-level menu no longer shows a direct "Terms & Privacy" row (the
   merge-conflict-added row is removed) — proven by source inspection / a manual on-device
   walkthrough confirming its absence.
6' (new). The pre-auth `(auth)/terms` screen (reached from login/onboarding) shows
   Terms-and-Conditions-only content correctly (not the old combined content) — proven by a manual
   on-device walkthrough covering the pre-auth entry point specifically.

### AMENDMENT 1 — Implementation Checklist (authoritative — execute this, not the original checklist)

1. Confirm/create `apps/mobile/src/features/legal/terms-privacy-content.ts` exactly as originally
   specified (real structured boilerplate, `group: 'terms' | 'privacy'` per section, top-of-file
   "not final legal-reviewed text" comment, Execute-Agent Instruction E2 content guardrails still
   apply verbatim — see below).
2. Add a `group: 'terms' | 'privacy'` prop to `TermsPrivacyBody({ theme, group })` — filter
   `LEGAL_SECTIONS` to `s => s.group === group` before rendering; drop the combined two-heading
   layout (the calling screen's own `ScreenHeader title` already names which document this is).
3. Edit `apps/mobile/src/app/(auth)/terms.tsx` — render `<TermsPrivacyBody theme={theme}
   group="terms" />`; update the top doc-comment to reflect real, Terms-only shared content.
3b. **(VALIDATE-added, MANDATORY — do not skip):** Edit `apps/mobile/src/app/(auth)/_layout.tsx`
    — revert the `<Stack.Screen name="terms" options={{ title: ... }}>` value from
    `"Terms & Privacy"` back to `"Terms & Conditions"`. Confirmed on disk today: this file (not
    `terms.tsx`) owns the on-screen native header title for the pre-auth screen — step 3 alone
    cannot make the title read "Terms & Conditions" without this edit, and AC6' would otherwise
    silently fail on title text while passing on content.
4. Confirm `apps/mobile/src/app/(tabs)/terms/_layout.tsx` exists (it does — created by the
   pre-amendment EXECUTE pass, no edit needed here).
5. Create/edit `apps/mobile/src/app/(tabs)/terms/index.tsx` — `SafeAreaView` +
   `useHideTabBarWhile(useIsFocused())` (focus-gated, per Execute-Agent Instruction E3, still
   applies) + `ScrollView` + `<ScreenHeader title="Terms and Conditions" onBack={() =>
   router.back()} mode={mode} />` + `<TermsPrivacyBody theme={theme} group="terms" />`.
6. Create `apps/mobile/src/app/(tabs)/privacy/_layout.tsx` — mirror step 4 exactly, adjusted for
   Privacy.
7. Create `apps/mobile/src/app/(tabs)/privacy/index.tsx` — mirror step 5 exactly:
   `<ScreenHeader title="Privacy Policy" onBack={() => router.back()} mode={mode} />` +
   `<TermsPrivacyBody theme={theme} group="privacy" />`.
8. Edit `apps/mobile/src/app/(tabs)/account/index.tsx` — REMOVE the "Terms & Privacy"
   `SettingsRow` entry that points at `/(tabs)/terms` (VALIDATE correction: per the co-located
   EXECUTE report, this row was added by the pre-amendment EXECUTE pass itself, not a merge-conflict
   resolution — the removal action is unchanged either way). Leave the existing "Help" row in the
   same Card untouched.
9. Rewrite `apps/mobile/src/app/(tabs)/account/help.tsx` — replace the `<ComingSoon>` placeholder
   with `SafeAreaView` + `ScreenHeader title="Help" onBack={() => router.back()}` + a `Card`
   containing 2 `SettingsRow` entries ("Terms and Conditions" → `router.push('/(tabs)/terms')`,
   "Privacy Policy" → `router.push('/(tabs)/privacy')`), matching `account/index.tsx`'s existing
   `SettingsRow`/icon conventions.
10. Extend `apps/mobile/src/features/legal/__tests__/terms-privacy-content.test.ts` — add
    assertions proving the split is real at the data layer: filtering `LEGAL_SECTIONS` by
    `group:'terms'` returns ≥1 entry and 0 entries with `group:'privacy'` (and the mirror case).
    Keep the original placeholder-string and non-empty-field assertions.
11. **Before running typecheck (Execute-Agent Instruction E1' — extends original E1, MANDATORY):**
    run `npx expo start` once, wait for typed-routes codegen to regenerate
    `apps/mobile/.expo/types/router.d.ts` to include `/(tabs)/privacy`, then stop it.
    **VALIDATE correction:** confirmed on disk today, `router.d.ts` ALREADY contains `/(tabs)/terms`
    and `/(tabs)/account/help` (regenerated by the pre-amendment EXECUTE pass's own E1 step) — only
    `/(tabs)/privacy` is genuinely missing. Re-running `npx expo start` is still required (and
    harmless/idempotent for the already-present routes) so `tsc --noEmit` does not fail on
    `router.push('/(tabs)/privacy')` in `help.tsx`.
12. Run `pnpm --filter @jojopotato/mobile typecheck`, `pnpm --filter @jojopotato/mobile test`
    (vitest), `pnpm --filter @jojopotato/mobile lint`, and `pnpm format:check` on touched files —
    fix any failures before considering EXECUTE complete.
13. Manual Agent-Probe walkthrough (owed by the user — see Verification Evidence): Help shows
    exactly 2 nav rows; each opens its own document; each scrolls to end correctly in light + dark
    mode on a small device; Account's menu no longer shows a direct Terms row; the pre-auth
    `(auth)/terms` screen (via signup/onboarding) shows Terms-and-Conditions-only content
    correctly; `router.back()` from each Help sub-screen returns to Help (not Account directly);
    the floating tab bar reappears correctly after leaving either screen for another tab.

### AMENDMENT 1 — Execute-Agent Instructions (extend, do not replace, the original E1-E3)

- **E1' (extends E1):** the typed-routes codegen step must cover BOTH new route paths
  (`/(tabs)/terms` and `/(tabs)/privacy`), not just one — see checklist step 11.
- **E2 (unchanged, still applies):** content guardrails on `LEGAL_SECTIONS` text — avoid specific
  jurisdiction/venue, specific data-retention duration commitments, named third-party processors.
- **E3 (unchanged, still applies, now applies to BOTH `(tabs)/terms/index.tsx` and
  `(tabs)/privacy/index.tsx`):** use `useHideTabBarWhile(useIsFocused())`, never a bare `true`.
- **E4 (new):** when choosing the Privacy Policy row's icon in `help.tsx`, prefer an Ionicons name
  already used elsewhere in this codebase if one fits (grep `@jojopotato/ui`/`apps/mobile` icon
  usage before picking a brand-new name) — otherwise any reasonable, typecheck-valid Ionicons name
  is acceptable; this is a cosmetic choice, not a gate.

## Verification Evidence (AMENDMENT 1 — supersedes/extends the original table)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `terms-privacy-content.test.ts`: filtering by `group:'terms'` returns ≥1 entry, 0 `group:'privacy'` entries (and mirror case) | Fully-Automated | AC4' (genuine split at the data layer) |
| `terms-privacy-content.test.ts`: no section `heading`/`body` contains `"placeholder"` (case-insensitive) | Fully-Automated | AC1 (mechanical half) |
| `terms-privacy-content.test.ts`: every section has non-empty `heading`/`body` | Fully-Automated | AC1 (structural completeness) |
| Source inspection: two distinct route files (`(tabs)/terms/index.tsx`, `(tabs)/privacy/index.tsx`) each rendering `TermsPrivacyBody` with a different `group` prop; `(auth)/terms.tsx` renders `group="terms"` only | Fully-Automated (via the extended vitest assertions plus direct source read at code review) | AC4' (two separate screens, not one) |
| Manual on-device walkthrough: Help screen shows exactly 2 `SettingsRow` entries; each navigates to its own screen; `router.back()` returns to Help | Agent-Probe | AC2' (reachable via Help, not directly from Account) |
| Manual on-device walkthrough: Account's top-level menu no longer shows a direct "Terms & Privacy" row | Agent-Probe (or source inspection at code review) | AC5' (row removed) |
| Manual on-device walkthrough: pre-auth `(auth)/terms` (via signup/onboarding) shows Terms-and-Conditions-only content | Agent-Probe | AC6' (pre-auth entry point unaffected in reachability, correct in content) |
| Manual on-device walkthrough: both screens scroll to end and read correctly in light + dark mode, small device | Agent-Probe | AC3 (unchanged, now covers 2 screens) |
| Manual review: read both rendered screens top-to-bottom, confirm no "placeholder"-style wording, genuine (if brief) boilerplate | Agent-Probe | AC1 (qualitative half) |

**Known-gap note (unchanged from original):** the Agent-Probe rows above have no Fully-Automated or
Hybrid path today — standing project-wide "no `apps/mobile` RN component/navigation/E2E test
runner" gap, already tracked, not new. Per the vacuous-green ban, these are Agent-Probe (a real
proving strategy), never Known-Gap — no backlog stub required.

### AMENDMENT 1 — Test Infra Improvement Notes

(none newly identified by this amendment — same standing gap as the rest of this plan)

### AMENDMENT 1 — Phase Completion Rules (supersedes the original)

This remains a SIMPLE, single-phase plan.

- **CODE DONE** when AMENDMENT 1's Implementation Checklist steps 1-12 are complete and all
  automated gates (typed-routes codegen, typecheck, vitest, lint, format:check) are green.
- **VERIFIED** (eligible to move from `active/` to `completed/`) only after step 13's manual
  Agent-Probe walkthrough (both screens, both entry points, Account row removal, pre-auth content
  check, `router.back()` behavior, tab-bar reappearance) has been performed and confirmed by the
  user. Code completion alone does not justify archival — this task folder stays in `active/`
  until the walkthrough is done.

### AMENDMENT 1 — Resume and Execution Handoff (supersedes the original)

1. **Selected plan file path:** `process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md` (this file — read `## AMENDMENT 1` onward as authoritative; original sections above it are history/context only).
2. **Last completed phase or step:** PLAN-SUPPLEMENT complete (this amendment). Original VALIDATE
   (Gate: CONDITIONAL) covered the pre-amendment shape; **inner PVL must re-run** before EXECUTE,
   because the blast radius, touchpoints, and acceptance criteria materially changed (new
   `(tabs)/privacy/` route pair, `help.tsx` rewrite, Account-row removal instead of addition,
   `TermsPrivacyBody`'s new `group` prop). **VALIDATE CORRECTION (confirmed by direct file read
   and by the existing EXECUTE report co-located in this task folder):** the claim that "zero
   implementation exists on disk for either shape" is FALSE — the pre-amendment (combined-screen)
   shape was already fully EXECUTEd and is CODE DONE with all 4 automated gates green
   (`auth-003-terms-google-oauth_REPORT_21-07-26.md`, status `COMPLETE_WITH_GAPS`). On disk today:
   `features/legal/terms-privacy-content.ts`, `features/legal/components/terms-privacy-body.tsx`,
   `features/legal/__tests__/terms-privacy-content.test.ts`, `(auth)/terms.tsx` (edited),
   `(auth)/_layout.tsx` (title already changed to "Terms & Privacy"), `(tabs)/terms/_layout.tsx` +
   `index.tsx` (both new), and `(tabs)/account/index.tsx` (already has the 4th "Terms & Privacy"
   row). AMENDMENT 1's real remaining work is therefore a set of EDITS to this already-existing,
   already-green implementation (add `group` prop, revert 2 titles, remove 1 Account row, add 2 new
   Privacy files, rewrite Help, extend the test file) — not fresh creation from a blank slate. The
   Implementation Checklist's own "if not already present" hedges (steps 4/12) already anticipate
   this correctly; only this narrative summary was stale.
3. **Validate-contract status:** the original validate-contract below (Gate: CONDITIONAL,
   `generated-by: outer-pvl`, dated 21-07-26) is PRE-AMENDMENT and does not cover AMENDMENT 1's
   scope. A fresh VALIDATE pass (V1-V7) is required before EXECUTE — the orchestrator should route
   to `vc-validate-agent` next, not directly to EXECUTE. This is a genuine re-validation, not a
   PVL-supplement continuation (the change is broad plan-refresh scope, not a narrow V7 gap-list
   fix).
4. **Supporting context files loaded:** unchanged from the original plan's list, plus this session's
   direct orchestrator instruction (verbatim quoted under `### Trigger` above) and confirmed live
   facts about `help.tsx`'s current `<ComingSoon>` state and the pre-auth login/onboarding link
   labels (already Terms-only, zero edits needed there).
5. **Next step for a fresh agent picking up mid-execution:** route to VALIDATE first (fresh V1-V7
   pass against AMENDMENT 1's touchpoints/blast-radius/AC set), THEN EXECUTE the 13-step amended
   checklist in order (content module + component filter-prop first, since every route file depends
   on them; typed-routes codegen — step 11 — before the typecheck gate in step 12), then hand off
   the Agent-Probe walkthrough (step 13) to the user before marking this task folder `VERIFIED`.

## Validate Contract — PRE-AMENDMENT (HISTORICAL, SUPERSEDED — kept for history only; see the new `## Validate Contract` section below, which is authoritative for AMENDMENT 1)

Status: CONDITIONAL (pre-amendment shape only)
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: Score 1/7 (only S7 — 8 files in blast radius — present, pre-amendment). Single package
(`apps/mobile`), no schema/API/auth surface, no phase program, INNOVATE skipped (no competing
approaches). This rationale still holds directionally for AMENDMENT 1 (still ~8 files, still
`apps/mobile`-only, still no competing architecture) but the fresh VALIDATE pass must confirm the
new touchpoints (`(tabs)/privacy/`, `help.tsx` rewrite) independently rather than inheriting this
verdict.

Execution strategy (via vc-agent-strategy-compare, for the NEXT phase — VALIDATE, then EXECUTE):
- Score: 1/7 — signal present: S7 (5+ files in blast radius: ~8 files)
- Recommended strategy: Sequential — one vc-validate-agent, then one vc-execute-agent, opus for
  EXECUTE, single context window each
- Agent count: 1 (VALIDATE) + 1 (EXECUTE) — no fan-out
- Model: sonnet (vc-validate-agent); opus (vc-execute-agent — code-execution leg)
- Cost guard: not triggered (well under 30 agents)

Test gates (C3 5-column table) — PRE-AMENDMENT, superseded by AMENDMENT 1's own Verification
Evidence table above; retained here for history only:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4 (superseded) | `LEGAL_SECTIONS` contains ≥1 `group:'terms'` + ≥1 `group:'privacy'` entry in one shared array | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` group-presence assertion | A |
| AC1-mechanical | No section `heading`/`body` contains `"placeholder"` (case-insensitive) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` placeholder-string assertion | A |
| AC1-structural | Every section has non-empty `heading`/`body` | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` completeness assertion | A |
| AC4-single-source (superseded) | Exactly one shared content module, no duplicate copy | Fully-Automated | Same test file (imports the canonical module directly) + source inspection at code review | A |
| Typed-routes codegen (superseded — now covers 2 routes) | `/(tabs)/terms` resolves as a valid typed route | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` (after `npx expo start` once — Execute-Agent Instruction E1) | B |
| AC2 (superseded by AC2') | Terms reachable from Account tab; `router.back()` returns to Account | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 11) | B |
| AC3 | Screen scrolls to end and renders correctly in light + dark mode, both entry points | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 11) | B |
| AC1-qualitative | Copy reads as genuine boilerplate, no placeholder-style wording remains | Agent-Probe | Manual top-to-bottom content read (Implementation Checklist step 11) | B |

Dimension findings (pre-amendment — historical):
- Infra fit: PASS — pure `apps/mobile` change, no container/infra/runtime surface touched.
- Test coverage: PASS — mechanical assertions covered by a new vitest file; Agent-Probe rows
  correctly assigned per the vacuous-green ban.
- Breaking changes: PASS — no API/schema/public-contract changes.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface; content-risk addressed
  via E2.
- Decision 1 / Routing feasibility: CONCERN → resolved as E1.
- Content Note: CONCERN → resolved as E2.
- Implementation detail (useHideTabBarWhile): minor note → resolved as E3.

Execute-Agent Instructions (pre-amendment — E1/E2/E3 all still apply, extended by AMENDMENT 1's
E1'/E4 above):
- E1: typed-routes codegen before typecheck.
- E2: content guardrails (jurisdiction/venue, data-retention duration, named processors).
- E3: `useHideTabBarWhile(useIsFocused())`, not a bare `true`.

Backlog artifacts: none new required at the time of this original VALIDATE pass — the Google-OAuth
split-out backlog note was verified present and accurately referenced.

Gate: CONDITIONAL (pre-amendment shape; superseded — do not treat as authorization to EXECUTE
AMENDMENT 1's scope without a fresh VALIDATE pass)

## Validate Contract

Status: PASS
Date: 21-07-26
date: 2026-07-21
generated-by: outer-pvl
supersedes: 2026-07-21 (outer-pvl) — outer PVL has current evidence (this is a fresh outer-PVL
pass against AMENDMENT 1's amended scope; the pre-amendment contract above covered a different,
now-abandoned combined-screen/direct-Account-link shape)

Parallel strategy: sequential
Rationale: Score 1/7 (only S7 — ~9 files in blast radius — present). Single package
(`apps/mobile`), no schema/API/auth/billing surface, no phase program, INNOVATE was skipped
(no competing architecture — this is a mechanical routing/content-split change). A single
vc-validate-agent pass plus a single vc-execute-agent pass is proportionate; no fan-out needed.

Execution strategy (via vc-agent-strategy-compare, for the NEXT phase — EXECUTE):
- Score: 1/7 — signal present: S7 (5+ files in blast radius: ~9 files)
- Recommended strategy: Sequential — one vc-execute-agent (opus, code-execution leg), single
  context window
- Agent count: 1 (EXECUTE) — no fan-out
- Model: opus (vc-execute-agent — code-execution leg)
- Cost guard: not triggered (well under 30 agents)

**VALIDATE finding, corrected in-plan (no longer an open concern):** direct file reads during this
VALIDATE pass confirmed the plan's Resume/Handoff narrative was factually wrong — the pre-amendment
(combined-screen) shape was already fully EXECUTEd and CODE DONE with all 4 gates green (see
`auth-003-terms-google-oauth_REPORT_21-07-26.md`, co-located in this task folder), not "zero
implementation on disk." Two real touchpoint gaps were found and FIXED IN PLAN this pass (both now
reflected in the Touchpoints table and Implementation Checklist above):
1. `apps/mobile/src/app/(auth)/_layout.tsx` was missing entirely from AMENDMENT 1's Touchpoints
   table, but its `Stack.Screen name="terms"` `title` (currently "Terms & Privacy" on disk, confirmed
   by direct read) is what actually renders the pre-auth screen's native header — without reverting
   it, AC6' would silently fail on title while passing on content. Added as checklist step 3b.
2. `(tabs)/account/help.tsx`'s rewrite instruction did not say to compute `mode` from
   `useColorScheme()` and pass it to `Card`/`SettingsRow` — both declare `mode: ThemeMode` as a
   REQUIRED prop with no default (confirmed by direct read of `packages/ui/src/components/
   {card,settings-row}.tsx`), unlike `ScreenHeader` (optional, defaults `'light'`). Omitting it is a
   typecheck FAIL, not a style nicety. Added explicitly to the Touchpoints row and checklist step 9
   context.
A third, lower-stakes narrative inaccuracy (checklist step 8's "added during this session's
merge-conflict resolution" claim — actually added by the pre-amendment EXECUTE pass, per its own
report) and a fourth (checklist step 11's claim that `router.d.ts` "has neither" `/(tabs)/terms`
nor `/(tabs)/privacy` — confirmed on disk that `/(tabs)/terms` and `/(tabs)/account/help` are
ALREADY present; only `/(tabs)/privacy` is genuinely missing) were also corrected in-plan. None of
these four changed the required EXECUTE actions except finding #1, which is a genuine new mandatory
step (3b) that did not previously exist anywhere in the checklist.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC4' | `LEGAL_SECTIONS` filtered by `group:'terms'` returns ≥1 entry and 0 `group:'privacy'` entries (and the mirror case) — proves the split is real at the data layer | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` new group-filter assertions (Implementation Checklist step 10) | B |
| AC1-mechanical (both docs) | No section `heading`/`body` contains `"placeholder"` (case-insensitive) | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` (already implemented and green from the pre-amendment EXECUTE pass; unaffected by the split) | A |
| AC1-structural (both docs) | Every section has non-empty `heading`/`body` | Fully-Automated | `pnpm --filter @jojopotato/mobile test` → `terms-privacy-content.test.ts` (already implemented and green; unaffected by the split) | A |
| Typed-routes codegen (`/(tabs)/privacy`) | `/(tabs)/privacy` resolves as a valid typed route | Fully-Automated | `pnpm --filter @jojopotato/mobile typecheck` (after `npx expo start` once — Execute-Agent Instruction E1', checklist step 11) | A |
| AC2' | Help shows exactly 2 nav rows, each opening its own document; `router.back()` returns to Help | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 13) | D |
| AC3 (both docs) | Both screens scroll to end and read correctly in light + dark mode, small device | Agent-Probe | Manual on-device walkthrough (Implementation Checklist step 13) | D |
| AC5' | Account's top-level menu no longer shows a direct "Terms & Privacy" row | Agent-Probe (source-confirmed at code review: `account/index.tsx` no longer contains the `SettingsRow` pointing at `/(tabs)/terms`) | Manual on-device walkthrough + source inspection (checklist steps 8, 13) | D |
| AC6' | Pre-auth `(auth)/terms` shows Terms-and-Conditions-only content AND title, correctly | Agent-Probe (source-confirmed at code review: `(auth)/_layout.tsx`'s `title` reverted, `terms.tsx` renders `group="terms"`) | Manual on-device walkthrough + source inspection (checklist steps 3, 3b, 13) | D |
| AC1-qualitative (both docs) | Copy reads as genuine boilerplate, no placeholder-style wording remains | Agent-Probe | Manual top-to-bottom content read (Implementation Checklist step 13) | D |

C-4 reconciliation: gap-resolution D rows above are the standing, already-tracked, project-wide
"no `apps/mobile` RN component/navigation/E2E test runner" gap — Agent-Probe is the real proving
strategy for these (not Known-Gap; per the vacuous-green ban, Known-Gap is never used to silently
pass a developed behavior with zero automated coverage — Agent-Probe genuinely proves these, a
human/agent judgment call is the correct tier here, not an excuse to skip testing).

Failing stub (AC4' — the one row with genuinely new, not-yet-written Fully-Automated coverage):
```
test("should exclude group:'privacy' entries when filtered by group:'terms' (and the mirror case)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: LEGAL_SECTIONS filtered by group excludes the other group's entries")
})
```
(AC1-mechanical/AC1-structural and the typed-routes codegen gate are already-implemented, already-
green gates carried over unaffected by the split — no stub needed for gates that are not new.)

Dimension findings:
- Infra fit: PASS — pure `apps/mobile` change; typed-routes codegen requirement correctly scoped
  (only `/(tabs)/privacy` is genuinely missing from `router.d.ts` as of this VALIDATE pass;
  `/(tabs)/terms` and `/(tabs)/account/help` are already present, confirmed by direct read).
- Test coverage: PASS — Fully-Automated split-assertion extension is real and mechanically
  feasible; Agent-Probe tier correctly assigned to all on-device rows per the vacuous-green ban;
  no developed behavior rests on Known-Gap alone.
- Breaking changes: PASS — no API/schema/public-contract changes; two new app-internal Expo Router
  paths only.
- Security surface: PASS — no auth/billing/secrets/trust-boundary surface touched; content
  guardrails (E2) still verified honored in the shipped `terms-privacy-content.ts` (no
  jurisdiction/venue, no data-retention duration, no named processor).
- Section — AMENDMENT 1 Touchpoints/Checklist feasibility: CONCERN → RESOLVED IN PLAN this pass
  (the two real gaps above, now fixed as Touchpoints table rows + checklist steps 3b and the
  `help.tsx` mode-prop instruction). Mechanical feasibility otherwise confirmed: every edit target
  string is present and uniquely matchable (direct-read-confirmed against
  `terms-privacy-body.tsx`, `terms-privacy-content.ts`, `(auth)/terms.tsx`, `(auth)/_layout.tsx`,
  `(tabs)/terms/{_layout,index}.tsx`, `(tabs)/account/{index,help}.tsx`); no test file breaks from
  the Account-row removal (`account-screen.test.tsx` asserts on "Edit profile"/"Notifications"/
  "Help"/"Order History" only, never "Terms & Privacy" — confirmed by direct read); both Ionicons
  glyphs (`document-text-outline`, `shield-checkmark-outline`) confirmed present in this repo's
  `@expo/vector-icons` glyphmap.
- Section — Decision 1 / routing feasibility (carried over from the original plan, re-confirmed
  for AMENDMENT 1): PASS — `(tabs)/privacy` follows the exact same sibling-route mechanism as
  `(tabs)/terms`/`notifications`/`history`, already proven working end-to-end by the pre-amendment
  EXECUTE pass for `(tabs)/terms`; the `floating-tab-bar.tsx` `ICONS` allowlist does not include
  `privacy`/`terms`, confirmed by direct read — no accidental tab-bar appearance risk.

Open gaps: none unresolved. The 4 Agent-Probe rows above are the standing, already-tracked,
project-wide gap (no `apps/mobile` RN E2E/navigation runner) — not new debt, correctly assigned.

What this coverage does NOT prove:
- The Fully-Automated content-module tests prove the DATA-layer split is real (filtering excludes
  the other group) — they do NOT prove either screen actually RENDERS correctly on a device, in
  either light or dark mode, or that `router.back()` genuinely returns to Help rather than Account.
- The typed-routes codegen gate proves `/(tabs)/privacy` is a valid TypeScript route string — it
  does NOT prove the floating tab bar visually reappears correctly after leaving the screen, or
  that the screen is reachable via a real tap on Help's row (only that the route STRING typechecks).
- Source inspection (used for AC5'/AC6' as a partial substitute) proves the CODE no longer contains
  the removed row / renders the correct `group` prop and title string — it does NOT prove a human
  eye reading the live screen agrees the content and title look correct together.
(Required until C3 is implemented — temporary C3 mitigation)

Gate: PASS (no FAILs, plan updated — both confirmed gaps fixed in-plan this pass, zero unresolved
CONCERNs remain)

Accepted by: N/A — Gate is PASS, not CONDITIONAL; no concerns required user acceptance this pass
(both gaps found during VALIDATE were resolved in-plan directly, not carried forward as accepted
risk).

What This Coverage Does NOT Prove: see the "What this coverage does NOT prove" bullets immediately
above this line — restated here in title-case for mechanical section-presence discovery.

## Autonomous Goal Block (updated post-VALIDATE — AMENDMENT 1's fresh contract is now PASS)

SESSION GOAL: Ship AUTH-003 (Terms-only) — real Terms & Conditions content AND a separate real
Privacy Policy, both reachable via Help (not directly from Account), verified in light/dark.
Charter + umbrella plan: N/A — single SIMPLE plan, no phase-program umbrella exists for this feature.
Autonomy: Standard RIPER-5 gates apply (no standing /goal active for this task). VALIDATE has now
passed (Gate: PASS, see `## Validate Contract` above) against AMENDMENT 1's amended scope. EXECUTE
requires explicit "ENTER EXECUTE MODE".
Hard stop conditions / safety constraints:
- No auth/schema/API/billing surface may be touched by this plan (confirmed none exists in scope) — if EXECUTE discovers any, stop and return to PLAN.
- Content must not assert specific jurisdiction/venue, specific data-retention periods, or named third-party processors (Execute-Agent Instruction E2) — these would be actively-wrong operational claims, not just "not final legal review."
- Typed-routes codegen (E1') must run and cover `/(tabs)/privacy` before the typecheck gate is considered authoritative (`/(tabs)/terms`/`/(tabs)/account/help` are already present in `router.d.ts`).
- Checklist step 3b (`(auth)/_layout.tsx` title revert) is MANDATORY — do not skip it.
- Do not implement the pre-amendment "combined screen + direct Account link" shape — it is fully superseded.
Next phase: EXECUTE the 13-step AMENDMENT 1 Implementation Checklist (steps 1-12 code, step 13 is
the user-owed Agent-Probe walkthrough):
process/features/auth-accounts/active/auth-003-terms-google-oauth_21-07-26/auth-003-terms-google-oauth_PLAN_21-07-26.md
Validate contract: see `## Validate Contract` above (Gate: PASS, generated-by: outer-pvl, dated
2026-07-21) — the pre-amendment contract above it is HISTORICAL ONLY.
Execute start: `pnpm --filter @jojopotato/mobile typecheck` (after `npx expo start` once per E1') | `pnpm --filter @jojopotato/mobile test` | `pnpm --filter @jojopotato/mobile lint` | `pnpm format:check` | high-risk pack: no (no high-risk class present)

## Context Sources

Context loaded for this plan/amendment: `process/context/all-context.md` (root router) and
`process/context/tests/all-tests.md` (test runner: `apps/mobile` vitest, node env — no new runner
needed; post-phase testing gates run via `pnpm --filter @jojopotato/mobile test`).
