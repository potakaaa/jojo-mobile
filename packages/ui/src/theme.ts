/**
 * Jojo Potato design system tokens, ported from the live jojopotato.ph site
 * (Astro + Tailwind v4 `globals.css` @theme block + colors recovered from the
 * rendered HTML). Shared across apps via `@jojopotato/ui`.
 *
 * Every value here traces to the plan's "Design Token Reference" table:
 * process/general-plans/active/jojopotato-design-system_08-07-26/jojopotato-design-system_PLAN_08-07-26.md
 * Do not invent new hexes/weights/radii/shadows outside that table.
 */
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Flat hex map of every brand color, split into two confidence tiers.
 *
 * Tier 1 — confirmed from the user-pasted `globals.css` @theme block (verbatim).
 * Tier 2 — secondary, observed via curl+grep of the live rendered HTML inline
 * styles (supporting palette; a few could be one-off inline overrides).
 */
export const Palette = {
  // --- Tier 1 (confirmed, from globals.css @theme) ---
  cream: '#FFF6E6', // page background
  ink: '#1C1714', // text, thick outline borders, hard-shadow color
  jyellow: '#FFD21E', // brand primary, ::selection background
  jred: '#E81E26', // accent / link hover / primary CTA
  jorange: '#FF7A18', // accent
  jgold: '#F7B500', // accent, paired with jyellow in gradients
  jbrown: '#C1440E', // accent, flavor-tag color
  panel: '#2a2420', // dark panel background
  panelBorder: '#4a4038', // dark panel border

  // --- Tier 2 (secondary, scraped from rendered HTML — supporting palette) ---
  creamTint1: '#FFF1CC', // light panel bg
  creamTint2: '#FBEFD2', // light panel bg
  creamTint3: '#EFE7D2', // light panel bg / flavor-tag bg
  creamTint4: '#FFE9D2', // light panel bg
  creamTint5: '#FCE7E4', // light panel bg (pink-cream)
  goldLight: '#FFE27A', // gradient stop paired with jgold/jyellow
  green: '#1a9a4a', // flavor-tag accent (bright)
  greenDark: '#0A6630', // flavor-tag accent (dark)
  redDark: '#C01020', // secondary red variant
  neutral100: '#e8e2d8', // divider / light neutral
  neutral200: '#cfc6b9', // secondary text on light
  neutral300: '#c9bfb2', // secondary text on light
  neutral400: '#b9aea0', // secondary text on light
  neutral500: '#8a8076', // tertiary text
  neutral600: '#6a5a45', // secondary text
  neutral700: '#5a4a36', // body text on light panels
  neutral800: '#4a4038', // = panelBorder (Tier 1 dup, kept as alias)
  neutral900: '#3a322c', // divider on dark
  neutral950: '#2a2420', // = panel (Tier 1 dup, kept as alias)
} as const;

/**
 * Brand identity + primary brand hues. Placeholder fields
 * (potatoBrown/fryGold/ketchupRed) from the old invented palette are removed.
 */
export const Brand = {
  name: 'Jojo Potato',
  tagline: 'Order ahead. Pick up fresh.',
  primary: Palette.jyellow,
  red: Palette.jred,
  orange: Palette.jorange,
  gold: Palette.jgold,
  brown: Palette.jbrown,
  cream: Palette.cream,
  ink: Palette.ink,
} as const;

/**
 * Semantic light/dark color mapping. Existing keys keep their meaning; two new
 * keys (`border`, `accent`) are additive.
 */
export const Colors = {
  light: {
    text: Palette.ink,
    background: Palette.cream,
    backgroundElement: Palette.creamTint1,
    backgroundSelected: Palette.creamTint3,
    textSecondary: Palette.neutral700,
    tint: Palette.jyellow,
    border: Palette.ink,
    accent: Palette.jred,
  },
  dark: {
    text: Palette.cream,
    background: Palette.panel,
    backgroundElement: Palette.neutral900,
    backgroundSelected: Palette.panelBorder,
    textSecondary: Palette.neutral400,
    tint: Palette.jyellow,
    border: Palette.panelBorder,
    accent: Palette.jred,
  },
} as const;

export type ThemeMode = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Minimum tappable-target size (dp) for interactive controls.
 *
 * Added in the kid-friendly UI pass (Phase A, 16-07-26) as an explicit,
 * flagged addition to the locked design-token table — NOT a reopening of the
 * `jojopotato-design-system_08-07-26` token set. It encodes the AC-A1 48×48
 * touch-target floor once so buttons/chips/rows can reference a single source
 * instead of hardcoding `48`.
 */
export const MinTouchTarget = 48;

/**
 * Named border-radius step scale (dp). Derived from the observed radius scale
 * (10/12/14/16/18/20/24/26/34/40 + 999 pill).
 *
 * Usage note: RN `borderRadius` does not accept percentage strings, so there is
 * no `circle` token — for circular elements set `borderRadius` to half of an
 * explicit `width`/`height` at the call site.
 */
export const Radii = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 34,
  '3xl': 40,
  full: 999,
} as const;

/**
 * Shadow tokens. CSS `box-shadow` has no 1:1 RN equivalent, so each token ships
 * iOS keys (`shadowColor/shadowOffset/shadowOpacity/shadowRadius`) plus an
 * Android `elevation` approximation.
 *
 * The `offset*` trio is the brand's signature flat "comic" hard shadow
 * (no blur, ink color, offset) — paired with a 2px ink outline. Android's
 * `elevation` cannot reproduce a directed hard shadow; this is a known,
 * accepted platform gap (do NOT add a custom Android hard-shadow workaround).
 * The `soft*` trio is for floating/elevated surfaces.
 */
export const Shadows = {
  // Signature flat "comic" hard offset shadows (4/5/6 px, ink, no blur).
  offsetSm: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  offsetMd: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  offsetLg: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
  // Soft elevation shadows (rgba(28,23,20,.x)) for floating surfaces.
  softSm: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 8,
  },
  softMd: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 16,
  },
  softLg: {
    shadowColor: Palette.ink,
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 0.7,
    shadowRadius: 70,
    elevation: 24,
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * Font family names. Values are the exact `@expo-google-fonts` static-weight
 * export identifiers, loaded in `apps/mobile/src/app/_layout.tsx`.
 *
 * `display.bold` = Plus Jakarta Sans ExtraBold (see the flagged amendment on the
 * `display` block below); `body` = Plus Jakarta Sans (site declares weight range
 * 400–800). The `display.semibold` value below is a dead token (zero consumers),
 * retained only to avoid reshaping the token map.
 */
export const FontFamily = {
  /**
   * Display (heading) family. `bold` was repointed from the previous rounded
   * display face to `PlusJakartaSans_800ExtraBold` (font-tone-payment-overflow,
   * 20-07-26) as an explicit, flagged amendment to the locked design-token
   * table — NOT a reopening of the `jojopotato-design-system_08-07-26` token set
   * (same precedent as `MinTouchTarget` at theme.ts:109-118). This gives
   * headings a more professional/grown-up tone while keeping a single source of
   * truth: all `FontFamily.display.bold` consumers pick up the new family with
   * zero call-site edits. `semibold` keeps its original value below but has zero
   * consumers (dead token).
   */
  display: {
    semibold: 'Fredoka_600SemiBold',
    bold: 'PlusJakartaSans_800ExtraBold',
  },
  body: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extrabold: 'PlusJakartaSans_800ExtraBold',
  },
} as const;

/**
 * Type scale (px). DESIGNED TO FIT the observed clamp() range
 * (headings ~17–26px, body ~13.5–19px), NOT literally extracted from the site.
 * A future pass can refine these if the web team shares their real scale.
 */
export const TypeScale = {
  display: 32,
  h1: 26,
  h2: 22,
  h3: 18,
  body: 16,
  bodySmall: 14,
  caption: 12,
} as const satisfies Record<string, TextStyle['fontSize']>;
