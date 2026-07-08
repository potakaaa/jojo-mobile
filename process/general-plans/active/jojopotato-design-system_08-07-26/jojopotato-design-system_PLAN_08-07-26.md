# Jojo Potato Design System Port + Showcase

**Date**: 08-07-26
**Complexity**: Simple
**Status**: 🔨 CODE DONE

## Overview

`packages/ui/src/theme.ts` currently holds invented placeholder brand values ("do not treat as
final" per its own comment). We now have the *real* jojopotato.ph design system pulled directly
from the live site (Astro + Tailwind v4, `www.jojopotato.ph`): its `globals.css` `@theme` block
(user-pasted, verbatim) plus additional on-page colors recovered via `curl` + grep of the rendered
HTML. This plan replaces the placeholder tokens with the real ones — colors, fonts (Fredoka +
Plus Jakarta Sans), weights, radii, and the brand's signature flat "comic outline" shadow — as a
reusable token set in `@jojopotato/ui`, wires the two brand fonts into the Expo app, and turns the
app's root screen into a living style-guide/showcase so the tokens are visibly exercised, not just
declared.

## Quick Links

- [Phase Completion Rules](#phase-completion-rules)
- [Execution Brief](#execution-brief)
- [Scope](#scope)
- [Design Token Reference](#design-token-reference-source-of-truth-for-execute)
- [Functional Requirements](#functional-requirements)
- [Acceptance Criteria](#acceptance-criteria)
- [Implementation Checklist](#implementation-checklist)
- [Risks and Mitigations](#risks-and-mitigations)
- [Integration Notes](#integration-notes)
- [Touchpoints](#touchpoints)
- [Public Contracts](#public-contracts)
- [Blast Radius](#blast-radius)
- [Verification Evidence](#verification-evidence)
- [Test Infra Improvement Notes](#test-infra-improvement-notes)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

## Phase Completion Rules

A phase is NOT complete until:

1. **Integration Test** - Works with other system pieces
2. **Manual Test** - User can perform the action
3. **Data Verification** - Database/state changes confirmed
4. **Error Handling** - Failure cases handled gracefully
5. **User Confirmation** - User says "it works"

Status meanings:
- ⏳ PLANNED - Not started
- 🔨 CODE DONE - Written but not E2E tested
- 🧪 TESTING - Currently being tested
- ✅ VERIFIED - Tested AND confirmed working
- 🚧 BLOCKED - Has issues

After each phase, document:
- [ ] What was tested manually
- [ ] Data verified in DB (show query + result) — N/A, no DB in this plan
- [ ] Errors encountered and fixed
- [ ] User confirmation received

## Execution Brief

Four logical phases, single session:

**Phase 1 — Token rewrite (`packages/ui`)**
- What happens: `theme.ts` is replaced with the real jojopotato.ph tokens (`Palette`, `Brand`,
  `Colors`, `Spacing` (kept), `Radii`, `Shadows`, `FontFamily`, `TypeScale`); a new `JojoButton`
  primitive is added to prove the tokens work in a reusable component.
- Test: `pnpm --filter @jojopotato/ui typecheck` and `lint`.
- Verify: read the built file, confirm every hex/weight/radius traces to the
  [Design Token Reference](#design-token-reference-source-of-truth-for-execute) table below.
- Done when: `@jojopotato/ui` typechecks/lints clean and exports the new token groups + `JojoButton`.

**Phase 2 — Font loading (`apps/mobile`)**
- What happens: `@expo-google-fonts/fredoka` + `@expo-google-fonts/plus-jakarta-sans` + `expo-font`
  are added; `_layout.tsx` loads them via `useFonts` gated behind `expo-splash-screen`
  prevent/hide; `constants/theme.ts` drops the old system-font `Fonts` export in favor of
  re-exporting `FontFamily` (and the other new token groups) from `@jojopotato/ui`.
- Test: `pnpm --filter @jojopotato/mobile typecheck`.
- Verify: `pnpm ios` (or `pnpm web`) — splash holds until fonts are ready, no system-font flash.
- Done when: app boots showing Fredoka/Plus Jakarta Sans, not system fonts.

**Phase 3 — Showcase screen (`apps/mobile/src/app/index.tsx`)**
- What happens: the root screen becomes a scrollable style-guide: color swatches (brand +
  semantic + neutral scale), typography specimen (every loaded weight/size), spacing scale,
  radius scale, and a shadow/button demo using `JojoButton`.
- Test: `pnpm --filter @jojopotato/mobile typecheck` and `lint`.
- Verify: `pnpm ios`/`pnpm web`, scroll the full screen, toggle device light/dark mode.
- Done when: every token group from Phase 1 is visibly rendered somewhere on the screen.

**Phase 4 — Full verification pass**
- What happens: workspace-wide `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- Test: all three green.
- Verify: no regressions in packages not touched by this plan (`types`, `utils`).
- Done when: all three commands exit 0.

**Expected Outcome**
- `@jojopotato/ui` exports the real jojopotato.ph tokens instead of invented placeholders.
- The Expo app renders Fredoka (display) + Plus Jakarta Sans (body) instead of system fonts.
- The app's root screen is a working, visual reference for every token group — usable by future
  screens/components without re-deriving values from the website again.

## Scope

**In scope**
- Color, typography, spacing, radius, and shadow tokens in `packages/ui/src/theme.ts`.
- Font loading wiring in the Expo app (`_layout.tsx`).
- One reusable primitive (`JojoButton`) proving the tokens compose into a real component.
- Root-screen (`app/index.tsx`) showcase of all token groups.

**Out of scope**
- Repainting `app.json` splash/adaptive-icon background colors or the app icon art itself — those
  are still placeholder per `process/context/all-context.md` ("do not treat as final") and belong
  to a separate branding pass, not this token/showcase plan.
- Porting the website's CSS keyframe animations (`jojoFloat`, `jojoPop`, marquee, sheen) 1:1 —
  RN needs Reanimated for equivalents; noted as a future "motion personality" follow-up, not
  required to prove the token system works.
- Any new screen/route beyond the root showcase (e.g. a dedicated `/design-system` route) — the
  user asked for the root page specifically.
- Adding `expo-linear-gradient` or other new visual-effect dependencies for the website's radial
  gradients / dot-texture overlays — flat color swatches are enough to prove the palette; gradients
  can be layered on later once a real screen needs them.

## Design Token Reference (source of truth for EXECUTE)

Two confidence tiers — EXECUTE must not invent values outside this table.

### Tier 1 — Confirmed (user-pasted `globals.css` `@theme` block, verbatim)

| Token | Hex | Website role |
|---|---|---|
| `cream` | `#FFF6E6` | page background |
| `ink` | `#1C1714` | text, thick outline borders, hard-shadow color |
| `jyellow` | `#FFD21E` | brand primary, `::selection` background |
| `jred` | `#E81E26` | accent / link hover / primary CTA |
| `jorange` | `#FF7A18` | accent |
| `jgold` | `#F7B500` | accent, paired with `jyellow` in gradients |
| `jbrown` | `#C1440E` | accent, flavor-tag color |
| `panel` | `#2a2420` | dark panel background |
| `panelBorder` | `#4a4038` | dark panel border |

Fonts (Tier 1, confirmed): `--font-display: "Fredoka", sans-serif` (site loads weight range
600–700), `--font-body: "Plus Jakarta Sans", sans-serif` (site loads weight range 400–800). Both
are real, freely-available Google Fonts.

### Tier 2 — Secondary (observed via `curl` + grep of live rendered HTML inline styles; supporting palette, not in the pasted `globals.css`)

| Token | Hex | Observed role |
|---|---|---|
| `creamTint1` | `#FFF1CC` | light panel bg |
| `creamTint2` | `#FBEFD2` | light panel bg |
| `creamTint3` | `#EFE7D2` | light panel bg / flavor-tag bg |
| `creamTint4` | `#FFE9D2` | light panel bg |
| `creamTint5` | `#FCE7E4` | light panel bg (pink-cream) |
| `goldLight` | `#FFE27A` | gradient stop paired with `jgold`/`jyellow` |
| `green` | `#1a9a4a` | flavor-tag accent (bright) |
| `greenDark` | `#0A6630` | flavor-tag accent (dark) |
| `redDark` | `#C01020` | secondary red variant |
| `neutral100` | `#e8e2d8` | divider / light neutral |
| `neutral200` | `#cfc6b9` | secondary text on light |
| `neutral300` | `#c9bfb2` | secondary text on light |
| `neutral400` | `#b9aea0` | secondary text on light |
| `neutral500` | `#8a8076` | tertiary text |
| `neutral600` | `#6a5a45` | secondary text |
| `neutral700` | `#5a4a36` | body text on light panels |
| `neutral800` | `#4a4038` | = `panelBorder` (Tier 1 dup, kept as alias) |
| `neutral900` | `#3a322c` | divider on dark |
| `neutral950` | `#2a2420` | = `panel` (Tier 1 dup, kept as alias) |

### Tier 2 — Structural patterns (not literal tokens, RN-adapted)

- **Border radius scale observed:** 10, 12, 14, 16, 18, 20, 24, 26, 34, 40px + `999px` (pill) +
  `50%` (circle). Map to a named step scale: `xs=10 sm=12 md=16 lg=20 xl=24 2xl=34 3xl=40
  full=999`. RN's `borderRadius` does not accept percentage strings — circular elements must set
  `borderRadius` to half of an explicit `width`/`height` at the call site; do not add a `circle`
  token, document this as a usage note instead.
- **Signature "comic" shadow (brand-defining detail):** flat, no-blur, offset shadow using the ink
  color — `4px 4px 0 #1C1714`, `5px 5px 0`, `6px 6px 0` — paired with a `2px solid #1C1714`
  outline on buttons/cards. This is the single most distinctive visual signature of the brand and
  must be preserved, not smoothed away. Also present: soft elevation shadows (`0 16px 28px -18px
  rgba(28,23,20,.4)`, `0 24px 40px -22px rgba(28,23,20,.45)`, `0 40px 70px -34px
  rgba(28,23,20,.7)`) for floating/elevated surfaces.
- **RN shadow caveat:** CSS `box-shadow` has no 1:1 RN equivalent. iOS uses
  `shadowColor/shadowOffset/shadowOpacity/shadowRadius`; Android only has `elevation` (soft,
  undirected — it cannot reproduce a hard offset shadow). Tokens must ship both: iOS gets the
  accurate hard-offset look via `shadowOffset` + `shadowOpacity: 1` + `shadowRadius: 0`; Android
  gets an `elevation` approximation. This is a known, acceptable platform gap — do not attempt a
  custom Android hard-shadow workaround in this pass.
- **Weights observed in use:** 700 (dominant — headings/buttons), 600 (semi-bold), 500 (medium —
  body/secondary), 800 (rare — large numerals/emphasis), 400 (body base, from the font-face range
  even if not directly observed inline).
- **Type scale:** only a few literal `clamp()` samples were observed (heading range
  ~17–26px, body range ~13.5–19px). A full-size RN scale (`display/h1/h2/h3/body/bodySmall/caption`)
  is *designed to fit* that observed range, not literally extracted — flag as such in the token
  file comment so a future pass can refine with more samples if the web team shares their real
  scale.
- **Out of scope, noted only:** `jojoFloat`, `jojoFloatB`, `jojoSpin`, `jojoPop`, `marqueeMove`,
  `sheen` keyframes — bouncy/floaty motion personality, real port needs Reanimated, not this plan.

## Assumptions and Constraints

- Fredoka and Plus Jakarta Sans are available via `@expo-google-fonts/fredoka` and
  `@expo-google-fonts/plus-jakarta-sans` (standard Expo font packages, MIT/OFL-licensed Google
  Fonts) — no font files need to be manually downloaded/hosted.
  `@expo-google-fonts/fredoka` ships static weights `Fredoka_300Light` … `Fredoka_700Bold`; load
  only `Fredoka_600SemiBold` + `Fredoka_700Bold` to match the site's declared 600–700 range.
  `@expo-google-fonts/plus-jakarta-sans` ships `PlusJakartaSans_400Regular` …
  `_800ExtraBold`; load `400/500/600/700/800` to match the site's declared 400–800 range.
- `packages/ui` has no build step (raw TS via workspace link) — new files follow that convention,
  no compiler/bundler config changes needed.
- No test runner exists in this repo (`process/context/tests/all-tests.md`) — verification is
  typecheck + lint + manual Expo run, not automated component tests. This plan does not introduce
  a test runner (tokens/JSX styling isn't the "real business logic" trigger that doc calls out).
- `Colors.light`/`Colors.dark` gain new keys (`border`, `accent`) beyond the current
  `text/background/backgroundElement/backgroundSelected/textSecondary/tint` set — purely additive,
  every existing consumer (`brand-wordmark.tsx`, `use-theme.ts`, `app/index.tsx`) only reads
  existing keys and keeps working unchanged.

## Functional Requirements

- `packages/ui/src/theme.ts` exports `Palette`, `Brand`, `Colors`, `Spacing`, `Radii`, `Shadows`,
  `FontFamily`, `TypeScale` — all values traceable to the Design Token Reference above.
- `packages/ui` exports a `JojoButton` primitive using `Colors`, `Radii.full`, the signature
  offset `Shadows` token, and `FontFamily.display.bold`.
- `apps/mobile` loads Fredoka (600/700) and Plus Jakarta Sans (400/500/600/700/800) at startup,
  gated behind the splash screen so no fallback-font flash occurs.
- `apps/mobile/src/constants/theme.ts` re-exports the new token groups; the old system-font
  `Fonts` platform-select export is removed (it was unused outside its own definition — verified
  via repo grep) and replaced by `FontFamily`.
- `apps/mobile/src/app/index.tsx` renders every token group visibly: color swatches, type
  specimen, spacing scale, radius scale, and a shadow/button demo.

## Non-Functional Requirements

- No new runtime dependencies beyond the two font packages + `expo-font` (already implied by
  `expo`, but declared explicitly per repo convention of explicit deps).
- Showcase screen must scroll cleanly on a small device (iPhone SE-class width) without horizontal
  overflow — mirrors the site's own `overflow-x: hidden` discipline.
- Both light and dark color modes must render legibly (existing `useTheme()` / `useColorScheme()`
  hooks already handle the split; just feed them the real tokens).

## Acceptance Criteria

1. `packages/ui/src/theme.ts` contains zero references to the old invented placeholder values
   (`potatoBrown #5F3A22`, `fryGold #E8A33D`, `ketchupRed #D94F30`, cream `#FFF8EE`).
2. Every color token's hex value matches the Design Token Reference table exactly (no invented
   hexes).
3. `pnpm --filter @jojopotato/ui typecheck` and `lint` pass.
4. `pnpm --filter @jojopotato/mobile typecheck` and `lint` pass.
5. `pnpm ios` (or `pnpm web` if no simulator available) boots with Fredoka/Plus Jakarta Sans
   visibly rendered, no system-font flash after the splash screen hides.
6. The root screen shows, scannable in one scroll pass: brand color swatches, semantic
   light-mode swatches, the neutral scale, a Fredoka specimen, a Plus Jakarta Sans specimen at
   each loaded weight, the spacing scale, the radius scale, and at least one `JojoButton` with the
   signature offset shadow visible.
7. Toggling the device's system light/dark appearance changes the showcase's semantic colors
   without a crash or unstyled flash.
8. `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all exit 0 at the workspace root.

## Implementation Checklist

- [x] 1. Add `expo-font`, `@expo-google-fonts/fredoka`, `@expo-google-fonts/plus-jakarta-sans` to
      `apps/mobile/package.json`; run `pnpm install`.
      Test: `pnpm --filter @jojopotato/mobile typecheck` still green post-install (no code changed
      yet — this step only proves the install/resolution didn't break the workspace).
- [x] 2. Rewrite `packages/ui/src/theme.ts`: add `Palette` (Tier 1 + Tier 2 hexes), update `Brand`
      to the real name/tagline/cream/ink, update `Colors.light`/`Colors.dark` to the real semantic
      mapping (add `border`, `accent` keys), keep `Spacing` unchanged, add `Radii` (named step
      scale per the Design Token Reference), add `Shadows` (offset trio + soft trio, iOS+Android
      keys per the RN caveat), add `FontFamily` (display/body weight maps to the exact
      `@expo-google-fonts` export names), add `TypeScale` (with an inline comment flagging it as
      "designed to fit observed range, not literally extracted").
      Test: `pnpm --filter @jojopotato/ui typecheck`.
- [x] 3. Add `packages/ui/src/jojo-button.tsx`: a `Pressable`-based primitive — `Radii.full` pill
      shape, `2px` ink border, the signature offset `Shadows` token, `FontFamily.display.bold`
      label text, `jyellow` default background. Export it from `packages/ui/src/index.ts`.
      Test: `pnpm --filter @jojopotato/ui typecheck` and `lint`.
- [x] 4. Update `packages/ui/src/brand-wordmark.tsx` to use `FontFamily.display.bold` instead of
      the generic `fontWeight: '700'`.
      Test: `pnpm --filter @jojopotato/ui typecheck`.
- [x] 5. Update `apps/mobile/src/constants/theme.ts`: remove the old `Platform.select` `Fonts`
      export, re-export `FontFamily`, `Radii`, `Shadows`, `TypeScale`, `Palette` from
      `@jojopotato/ui` alongside the existing `Brand`/`Colors`/`Spacing`/`MaxContentWidth`.
      Test: `pnpm --filter @jojopotato/mobile typecheck` (confirms no other file still imports the
      removed `Fonts` export — repo grep already shows zero external consumers).
- [x] 6. Wire font loading in `apps/mobile/src/app/_layout.tsx`: `SplashScreen.preventAutoHideAsync()`
      at module scope, `useFonts({...Fredoka weights, ...PlusJakartaSans weights})`, hide the
      splash screen once `fontsLoaded` (or bail to `null`/render-nothing while loading, matching
      the standard Expo Router font-loading recipe).
      Test: `pnpm --filter @jojopotato/mobile typecheck`; manual: `pnpm ios` (or `pnpm web`) —
      splash holds, then app renders with the custom fonts, no console font-loading errors.
- [x] 7. Rebuild `apps/mobile/src/app/index.tsx` as the showcase: header (`BrandWordmark` +
      tagline), color section (brand swatches, light-mode semantic swatches, neutral scale — each
      chip labeled with its token name + hex), typography section (Fredoka 600/700 sample lines,
      Plus Jakarta Sans 400/500/600/700/800 sample lines), spacing section (a row of boxes sized
      per `Spacing` token, labeled), radius section (a row of squares with each `Radii` step
      applied, labeled), and a shadow/button demo section rendering 2–3 `JojoButton` instances.
      Wrap in a `ScrollView` inside the existing `SafeAreaView`/`MaxContentWidth` pattern.
      Test: `pnpm --filter @jojopotato/mobile typecheck` and `lint`.
- [~] 8. Manual cross-check: `pnpm ios` (or `pnpm web`), scroll the full showcase, toggle the
      device/simulator's light/dark appearance, confirm no horizontal overflow and no console
      warnings.
      Test: visual — see Acceptance Criteria 5–7.
      PARTIAL: no iOS simulator/device available in the execution environment. Substituted a
      static `expo export --platform ios` — bundle compiled clean (2.4MB hbc) and all 7 loaded
      font TTFs are bundled, proving imports/font wiring resolve. A true on-device visual pass
      (font rendering AC 5, one-scroll scan AC 6, light/dark toggle AC 7) remains an honest gap.
- [x] 9. Run the full workspace verification suite: `pnpm typecheck`, `pnpm lint`,
      `pnpm format:check`.
      Test: all three exit 0; confirms `packages/types` and `packages/utils` (untouched by this
      plan) still pass.

## Risks and Mitigations

- **Risk:** Android's `elevation` can't reproduce the brand's hard offset shadow, so the signature
  "comic" look will read differently per platform. **Mitigation:** documented as an accepted,
  known RN platform gap in the Design Token Reference; the 2px ink border carries most of the
  visual identity on Android even without the exact shadow.
- **Risk:** The Tier 2 (secondary) hexes were scraped from rendered HTML, not the authoritative
  stylesheet, so a couple could be one-off inline overrides rather than true design-system colors.
  **Mitigation:** they are kept in a clearly separate `Palette` tier with inline comments; nothing
  in `Colors.light`/`Colors.dark` semantic mapping depends on a Tier 2 value being "wrong" in a
  way that breaks the UI — worst case is a slightly mislabeled neutral shade, not a broken build.
- **Risk:** Removing the old `Fonts` export from `constants/theme.ts` could break an import
  elsewhere. **Mitigation:** already grepped — zero consumers outside its own definition; Step 5's
  typecheck is the safety net regardless.

## Integration Notes

- No backend/API/schema touches — this is a pure client-side design-token + UI change.
- No environment variables added or changed.
- `apps/mobile/app.json` (splash/adaptive-icon background colors, bundle id) is intentionally left
  untouched — see Scope/Out of scope.

## Touchpoints

| File | Package | Change |
|---|---|---|
| `packages/ui/src/theme.ts` | `@jojopotato/ui` | Full token rewrite (Palette/Brand/Colors/Radii/Shadows/FontFamily/TypeScale) |
| `packages/ui/src/jojo-button.tsx` | `@jojopotato/ui` | New file — reusable button primitive |
| `packages/ui/src/brand-wordmark.tsx` | `@jojopotato/ui` | Use `FontFamily.display.bold` |
| `packages/ui/src/index.ts` | `@jojopotato/ui` | Export `JojoButton` |
| `apps/mobile/package.json` | `@jojopotato/mobile` | Add 3 font-related deps |
| `apps/mobile/src/constants/theme.ts` | `@jojopotato/mobile` | Drop `Fonts`, re-export new token groups |
| `apps/mobile/src/app/_layout.tsx` | `@jojopotato/mobile` | Font loading + splash gating |
| `apps/mobile/src/app/index.tsx` | `@jojopotato/mobile` | Replaced with showcase screen |

## Public Contracts

`packages/ui`'s barrel (`src/index.ts`) is the contract surface for every consumer in this
monorepo (currently only `apps/mobile`, but treated as a real package boundary per repo
convention):

- `Palette` (new) — flat hex map, both tiers, with inline tier comments.
- `Brand` (changed values, same shape) — `name`, `tagline`, plus brand hex fields renamed/updated
  to match the real palette (old `potatoBrown/fryGold/ketchupRed/cream` fields removed).
- `Colors` (changed values, additive shape) — `light`/`dark`, existing keys
  (`text/background/backgroundElement/backgroundSelected/textSecondary/tint`) keep their meaning,
  two new keys added (`border`, `accent`).
- `Spacing` (unchanged) — `half/one/two/three/four/five/six`.
- `Radii` (new) — `xs/sm/md/lg/xl/2xl/3xl/full`, numeric dp values (no `circle` token — see usage
  note in Design Token Reference).
- `Shadows` (new) — offset trio (`offsetSm/offsetMd/offsetLg`) + soft trio, each an RN style object
  with both iOS (`shadowColor/shadowOffset/shadowOpacity/shadowRadius`) and Android (`elevation`)
  keys.
- `FontFamily` (new) — `{ display: { semibold, bold }, body: { regular, medium, semibold, bold,
  extrabold } }`, string values matching exact `@expo-google-fonts` export names.
- `TypeScale` (new) — `display/h1/h2/h3/body/bodySmall/caption` numeric px sizes.
- `JojoButton` (new component) — `{ label: string; onPress: () => void; variant?: ... }`-style
  props (exact shape decided at EXECUTE time, kept minimal).
- `ThemeMode`/`ThemeColor` types (unchanged shape, still derived from `Colors`).

## Blast Radius

- **Packages touched:** 2 (`@jojopotato/ui`, `@jojopotato/mobile`).
- **Files touched:** ~8 (see Touchpoints).
- **Risk class:** Low — no schema, auth, API, billing, or migration surface; no new external
  services; purely presentational/token changes consumed only inside this monorepo.
- **Consumers of the changed contract:** `apps/mobile` only (grepped — no other package imports
  `@jojopotato/ui`).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter @jojopotato/ui typecheck` | Fully-Automated | AC 1, 2, 3 (token shapes are valid TS, no stray placeholder values compile-checked by type usage) |
| `pnpm --filter @jojopotato/ui lint` | Fully-Automated | AC 3 (style/conventions) |
| `pnpm --filter @jojopotato/mobile typecheck` | Fully-Automated | AC 4 (font-loading + theme re-export wiring is type-correct) |
| `pnpm --filter @jojopotato/mobile lint` | Fully-Automated | AC 4 |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` (root) | Fully-Automated | AC 8 (no cross-package regression) |
| `grep` for old placeholder hexes (`#5F3A22`, `#E8A33D`, `#D94F30`, `#FFF8EE`) in `packages/ui/src/theme.ts` | Fully-Automated | AC 1 |
| Manual `pnpm ios`/`pnpm web` run, scroll showcase, toggle light/dark | Agent-Probe / Hybrid (no automated RN test runner exists yet) | AC 5, 6, 7 |

## Test Infra Improvement Notes

(none identified yet — this plan does not introduce new business logic requiring a test runner;
per `process/context/tests/all-tests.md`, that decision is reserved for when real logic like cart
math or currency formatting needs coverage)

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/jojopotato-design-system_08-07-26/jojopotato-design-system_PLAN_08-07-26.md`
2. **Last completed phase or step:** none — plan just written, EXECUTE not yet started.
3. **Validate-contract status:** skipped — user explicitly chose "Skip VALIDATE, proceed to
   EXECUTE" on 08-07-26 when asked (plan is low risk: no schema/auth/API/billing surface, 2
   packages, ~8 files — see [Blast Radius](#blast-radius)). No validate-contract written; the
   placeholder heading below is intentionally left as-is.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `packages/ui/src/theme.ts` (current placeholder),
   `packages/ui/src/brand-wordmark.tsx`, `packages/ui/src/index.ts`, `packages/ui/package.json`,
   `apps/mobile/src/constants/theme.ts`, `apps/mobile/src/hooks/use-theme.ts`,
   `apps/mobile/src/app/index.tsx`, `apps/mobile/src/app/_layout.tsx`,
   `apps/mobile/package.json`, `apps/mobile/app.json`.
5. **Next step for a fresh agent picking up mid-execution:** re-read this plan's
   [Design Token Reference](#design-token-reference-source-of-truth-for-execute) section first (it
   is the single source of truth for every value), confirm which Implementation Checklist items
   are already checked, then continue from the first unchecked item.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Cursor + RIPER-5 Guidance

- **Cursor Plan mode:** import the [Implementation Checklist](#implementation-checklist) directly;
  after each phase, stop and verify per [Phase Completion Rules](#phase-completion-rules).
- **RIPER-5:** this plan is the output of PLAN. Next step is `ENTER VALIDATE MODE` (recommended —
  see Resume/Handoff item 3) or, if explicitly skipped with a stated reason, `ENTER EXECUTE MODE`
  naming this plan file.
- Avoid writing implementation code until EXECUTE is explicitly entered. If scope expands
  mid-flight (e.g. the user wants a dedicated `/design-system` route, or the full motion-personality
  port), pause and convert the growth into a follow-up plan rather than silently expanding this one.
- **After each phase: STOP and verify before proceeding.**
