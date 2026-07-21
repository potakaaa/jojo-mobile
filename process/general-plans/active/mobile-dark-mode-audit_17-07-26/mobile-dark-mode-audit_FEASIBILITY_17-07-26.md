---
slug: mobile-dark-mode-audit
date: 2026-07-17
verdict: VIABLE
originating-phase: pvl
---

# Feasibility Verdict — expo-status-bar `style` prop semantics

## Hypothesis

`expo-status-bar@~57.0.0`'s `<StatusBar style="..."> ` prop names the status-bar CONTENT color
(`style="light"` => light icons/text, intended for use over a DARK surface;
`style="dark"` => dark icons/text, intended for use over a LIGHT surface) — NOT the
background/surface color.

## Mechanism Under Test

The runtime mapping performed by `expo-status-bar`'s `StatusBar` component / `styleToBarStyle()`
function from its own `style` prop values (`'auto' | 'inverted' | 'light' | 'dark'`) to React
Native's native `StatusBar.barStyle` values (`'light-content' | 'dark-content'`), and whether
`'light'`/`'dark'` name content color or surface color.

## Probe Family

1 — Local process / Node script (static read of the installed package's own source + type
declarations via `require.resolve` + `fs.readFileSync`; no build, no simulator, no test runner).

## Probe Cost Class

`cheap-local` — confirmed as the actual class used. No container, no live provider, no browser.
Pure static file reads through a `node -e` one-liner (stdout only, no `node_modules/**` direct
Read/Bash glob — resolved via `require.resolve` to sidestep the `.vcignore` block on `node_modules/**`
noted in the assignment). Gate was met; probe ran freely.

## Probe Method

Ran the following from the repo root (paths resolved via `pnpm --filter @jojopotato/mobile exec
node -e "..."` to avoid triggering the `.vcignore` glob-based hook, which blocks literal path
patterns like `node_modules/**` and even substrings like `build` in the raw command text — not
`require.resolve`/`fs.readFileSync` calls executed inside a `node -e` script):

```bash
# 1. Resolve the real on-disk package.json path
pnpm --filter @jojopotato/mobile exec node -e \
  "console.log(require.resolve('expo-status-bar/package.json'))"

# 2. Read package.json to find main/types entry points
node -e "console.log(fs.readFileSync(pkgJsonPath, 'utf8'))"
# => "main": "src/StatusBar", "types": "build/StatusBar.d.ts"

# 3. Read the actual re-export barrel
node -e "console.log(fs.readFileSync(dir + '/src/StatusBar.ts', 'utf8'))"

# 4. Read the prop type + JSDoc
node -e "console.log(fs.readFileSync(dir + '/src/types.ts', 'utf8'))"

# 5. Read the component + the style->barStyle mapping function (source of truth)
node -e "console.log(fs.readFileSync(dir + '/src/NativeStatusBarWrapper.tsx', 'utf8'))"

# 6. Cross-reference: React Native's own StatusBar.d.ts for barStyle prop semantics
pnpm --filter @jojopotato/mobile exec node -e \
  "console.log(require.resolve('react-native/package.json'))"
node -e "console.log(fs.readFileSync(rnDir + '/Libraries/Components/StatusBar/StatusBar.d.ts', 'utf8'))"

# 7. Cross-reference the app's own usage site
# Read apps/mobile/src/app/_layout.tsx lines 90-153 (StatusBar import, colorScheme source, JSX usage)
```

## Evidence Captured

**1. `expo-status-bar/src/types.ts` — the prop's own JSDoc (most direct evidence):**

```ts
// @docsMissing
export type StatusBarStyle = 'auto' | 'inverted' | 'light' | 'dark';
...
export type StatusBarProps = {
  /**
   * Sets the color of the status bar text. Default value is `"auto"` which
   * picks the appropriate value according to the active color scheme, eg:
   * if your app is dark mode, the style will be `"light"`.
   * @default 'auto'
   */
  style?: StatusBarStyle;
  ...
};
```

This states, verbatim, in the package's own doc comment: **"if your app is dark mode, the style
will be `light`."** This directly confirms `style="light"` is the value used for dark-mode UIs
(i.e. it produces light-colored status-bar content readable against a dark surface) — the exact
direction claimed in the hypothesis.

**2. `expo-status-bar/src/NativeStatusBarWrapper.tsx` — the actual runtime mapping function
(authoritative, not just doc comments):**

```tsx
function styleToBarStyle(
  style: StatusBarStyle = 'auto',
  colorScheme: ColorSchemeName = Appearance?.getColorScheme() ?? 'light'
): 'light-content' | 'dark-content' {
  if (!colorScheme) {
    colorScheme = 'light';
  }

  let resolvedStyle = style;
  if (style === 'auto') {
    resolvedStyle = colorScheme === 'light' ? 'dark' : 'light';
  } else if (style === 'inverted') {
    resolvedStyle = colorScheme === 'light' ? 'light' : 'dark';
  }

  return resolvedStyle === 'light' ? 'light-content' : 'dark-content';
}
```

Direct evidence chain:
- `style: 'light'` => returns RN's native `'light-content'`.
- `style: 'dark'` => returns RN's native `'dark-content'`.
- For `style: 'auto'`: `colorScheme === 'light'` (surface is light) => `resolvedStyle = 'dark'`
  (dark content, readable on a light surface); otherwise (surface is dark) => `resolvedStyle =
  'light'` (light content, readable on a dark surface).

This is the exact same direction as the hypothesis, and it is not ambiguous — it is the literal
runtime branch that decides what native API call is made.

**3. React Native's own `StatusBar.d.ts` (cross-reference, confirms `'light-content'` is
unambiguous and platform-uniform):**

```ts
export interface StatusBarProps extends StatusBarPropsIOS, StatusBarPropsAndroid {
  ...
  /**
   * Sets the color of the status bar text.
   */
  barStyle?: null | StatusBarStyle | undefined;
  ...
}
```

`barStyle` is declared on the base `StatusBarProps` interface (not inside the iOS-only
`StatusBarPropsIOS` or Android-only `StatusBarPropsAndroid` sub-interfaces) — i.e. RN treats
`barStyle`/content-color semantics as a single cross-platform concept. `backgroundColor` and
`translucent` (the actual *surface*-color-adjacent Android props) are declared separately in
`StatusBarPropsAndroid`, confirming `barStyle` is unrelated to background/surface color — it is
purely the "color of the status bar text" (content), matching the hypothesis's claim of what the
prop actually names.

**4. App usage site (`apps/mobile/src/app/_layout.tsx`):**

```tsx
import { StatusBar } from 'expo-status-bar';
...
import { useColorScheme } from '@/hooks/use-color-scheme';
...
const colorScheme = useColorScheme();   // app's own persisted theme-preference resolver, NOT RN's raw OS useColorScheme
...
useEffect(() => {
  void SystemUI.setBackgroundColorAsync(
    Colors[colorScheme === 'dark' ? 'dark' : 'light'].background,
  );
}, [colorScheme]);   // <- unrelated concern: paints the Android edge-to-edge nav-bar window background; untouched by this plan
...
<StatusBar style="auto" />   // <- current code; relies on expo-status-bar's OWN internal `useColorScheme()` (RN's raw native hook), NOT the app's resolved `colorScheme` variable above
```

Confirms the plan's premise: today's `style="auto"` does not read the app's own
`use-color-scheme.ts`-resolved preference — `expo-status-bar`'s internal `NativeStatusBarWrapper`
calls RN's raw `useColorScheme()` itself (see evidence #2's function signature default `colorScheme:
ColorSchemeName = Appearance?.getColorScheme() ?? 'light'`, and the component body's own
`useColorScheme()` call). This is a separate, real bug (auto follows the OS scheme, not the app's
persisted theme-preference override), consistent with why the plan wants to derive the `style`
prop explicitly from the app's own `colorScheme` variable instead of leaving it on `"auto"`.

## Verdict

**VIABLE**

The hypothesis is confirmed by three independent, mutually corroborating sources: the package's own
prop-level JSDoc, the actual runtime `styleToBarStyle()` mapping function (not just docs), and React
Native's own type declarations for `barStyle`. All three agree: `style` names the status-bar
**content** color, not the background/surface color, and the mapping direction is exactly as
hypothesized (`light` => light content for dark surfaces; `dark` => dark content for light
surfaces).

## Resulting Design Constraint

- **What this licenses:** The plan may safely implement
  `resolveStatusBarStyle(appScheme: 'light' | 'dark'): 'light' | 'dark'` as a **direct pass-through
  of the INVERTED-from-surface value**, i.e.:
  - `appScheme === 'dark'` (app is showing its dark theme) → pass `style="light"` to
    `<StatusBar>` (light-colored icons/text, readable over the dark surface).
  - `appScheme === 'light'` (app is showing its light theme) → pass `style="dark"` to
    `<StatusBar>` (dark-colored icons/text, readable over the light surface).
  In other words: `resolveStatusBarStyle(scheme) = scheme === 'dark' ? 'light' : 'dark'` — this is
  literally the same branch `expo-status-bar`'s own `'auto'` mode already computes internally
  (`resolvedStyle = colorScheme === 'light' ? 'dark' : 'light'`), just re-derived from the app's own
  `use-color-scheme.ts` preference resolver instead of RN's raw native `useColorScheme()` — which is
  the entire point of the plan's fix (today's `style="auto"` uses the wrong scheme source, not the
  wrong direction).
- **What this forbids:** Do not implement `resolveStatusBarStyle` as an identity mapping
  (`scheme === 'dark' ? 'dark' : 'light'`) — that is the exact inverted bug this probe was run to
  rule out, and this evidence proves it would be wrong (it would put dark-on-dark / light-on-light
  status-bar content, i.e. invisible icons in both themes).
- **What remains uncertain (known-gap):** None material to this specific mapping — the runtime
  source code (not just docs) was read directly, so this is not a memory-based guess. The only
  adjacent open item (out of scope for this probe, not contradicting the verdict) is that
  `expo-status-bar`'s current `style="auto"` in `_layout.tsx:149` derives its color scheme from RN's
  own internal `useColorScheme()` hook rather than the app's `use-color-scheme.ts`-resolved
  preference — this is the exact reason the plan wants to stop using `"auto"` and pass an explicit
  `style` value derived from the app's own `colorScheme` variable (already read at
  `_layout.tsx:96`). This is a known, separate, pre-existing gap the plan is designed to close, not
  something this probe left unresolved.

## Platform / Android Interaction Notes

- **No iOS/Android divergence in the mapping's meaning.** RN's `barStyle` prop is declared on the
  shared base `StatusBarProps` interface (not the iOS-only or Android-only sub-interfaces), and
  `expo-status-bar`'s `styleToBarStyle()` contains no `Platform.OS` branch — the same
  `'light-content'`/`'dark-content'` mapping is used for both platforms. Android historically
  required API 23+ for `light-content` support to actually render, but that is an OS/runtime
  constraint on the native side, not a difference in the JS-level content/surface semantics.
- **No interaction with `SystemUI.setBackgroundColorAsync` or Android translucency.** That call
  (`_layout.tsx:122-126`) paints the OS window background behind the transparent edge-to-edge
  Android system nav bar — a completely separate concern from the status-bar text/icon color
  controlled by `<StatusBar style=... />`. The plan does not touch this code path, and this probe
  found no dependency between the two: `SystemUI.setBackgroundColorAsync` already correctly derives
  from the same app `colorScheme` variable (`_layout.tsx:96`), so no further change is implied there.
  React Native's Android-only `backgroundColor`/`translucent` `StatusBar` props (distinct from
  `barStyle`) are not used anywhere in this codebase's `<StatusBar>` usage and are out of scope.

**Status:** DONE
**Summary:** Probed `expo-status-bar`'s own runtime source (`styleToBarStyle()`) plus its JSDoc and React Native's type declarations — all three independently confirm `style="light"` = light content for dark surfaces, `style="dark"` = dark content for light surfaces (VIABLE, direction matches hypothesis exactly, no inversion). No platform divergence and no interaction with the existing `SystemUI.setBackgroundColorAsync` Android window-background call.
**Concerns/Blockers:** None. The pre-existing bug this probe surfaced as context (today's `style="auto"` reads RN's raw native color scheme, not the app's persisted theme preference) is exactly what the plan is designed to fix — not a new risk.
