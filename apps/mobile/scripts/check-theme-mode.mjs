#!/usr/bin/env node
/**
 * AC9 gate — the durable guard against the dark-mode bug class returning.
 *
 * `tsc --noEmit` already makes a MISSING `mode` prop a hard compile error (the
 * components' `mode: ThemeMode` is required, no default). This script is the
 * second, distinct check AC9 asks for — it catches the classes tsc cannot:
 *
 *   1. RAW `useColorScheme` IMPORTS from react-native outside the two allowed
 *      hook files. tsc is perfectly happy with these; they silently bypass the
 *      app's theme-preference resolver and re-introduce "screen ignores the
 *      user's Light/Dark choice". See CLAUDE.md §Theming.
 *   2. SPREAD ATTRIBUTES on a themed component (`<Card {...props} />`). A spread
 *      whose source widens to `any` satisfies tsc's required-prop check while
 *      passing no real `mode` — the one hole big enough to drive the original
 *      bug back through. Always a hard fail; an intentional case needs an
 *      explicit allow-list entry below.
 *   3. RAW HEX COLOUR LITERALS in apps/mobile screens. `packages/ui` has had
 *      this guard for a while (`packages/ui/scripts/check-raw-tokens.mjs`) but
 *      it has zero reach into apps/mobile — which is exactly where per-screen
 *      `mode`/`theme` threading happens and where a stray hex would hide.
 *
 * Run: `pnpm --filter @jojopotato/mobile guard:theme-mode`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, '..');
const repoRoot = join(mobileRoot, '..', '..');
const mobileSrc = join(mobileRoot, 'src');
const uiComponents = join(repoRoot, 'packages', 'ui', 'src', 'components');
const uiSrc = join(repoRoot, 'packages', 'ui', 'src');

/* ------------------------------------------------------------------ *
 * Allow-lists — every entry needs a reason. Empty by design: today the
 * codebase is clean on all three checks, and it should stay that way.
 * ------------------------------------------------------------------ */

/** Themed-component call sites permitted to use a spread attribute. */
const SPREAD_ALLOW_LIST = [
  // { file: 'src/path/to/file.tsx', component: 'Card', reason: '...' },
];

/** Themed-component call sites permitted to omit `mode`. */
const MISSING_MODE_ALLOW_LIST = [
  // { file: 'src/path/to/file.tsx', component: 'Card', reason: '...' },
];

/**
 * Files exempt from the hex check.
 *
 * `map-style.ts` is a Google Maps JSON style spec: the Maps SDK takes hex
 * strings and nothing else, so it cannot reference RN theme tokens. It is not
 * RN styling and is not theme-mode-aware.
 */
const HEX_EXEMPT_FILES = ['src/features/branches/map-style.ts'];

/**
 * Pre-existing raw hex literals, recorded as a baseline so the gate can go
 * green today while still failing on anything NEW. These predate the dark-mode
 * audit (it introduced zero new hex literals) and are tracked as follow-up
 * cleanup, not silently blessed.
 */
const HEX_BASELINE = [
  {
    // Line drifts whenever this file is edited above it — the baseline is keyed
    // by line number. Moved 408 → 412 by the alert/toast pass (Alert.alert ->
    // ConfirmDialog); the literal itself is untouched and still pre-existing.
    file: 'src/app/(staff)/order-detail/[orderId].tsx',
    line: 412,
    reason: 'pre-existing brand red',
  },
  {
    file: 'src/app/(tabs)/order/tracking/[orderId].tsx',
    line: 189,
    reason: 'pre-existing status green',
  },
  {
    file: 'src/app/(tabs)/order/tracking/[orderId].tsx',
    line: 194,
    reason: 'pre-existing status green',
  },
];

/** The only two files allowed to import react-native's raw `useColorScheme`. */
const COLOR_SCHEME_ALLOWED_FILES = [
  'apps/mobile/src/hooks/use-color-scheme.ts',
  'apps/mobile/src/hooks/use-color-scheme.web.ts',
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function collect(dir, exts, { skipTests = true } = {}) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipTests && entry.name === '__tests__') continue;
      if (entry.name === 'node_modules') continue;
      out.push(...collect(full, exts, { skipTests }));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file) => relative(mobileRoot, file);

/**
 * Blank out `//` and block comments, preserving every other character position
 * and all newlines so reported line numbers stay exact.
 *
 * Required, not cosmetic: prose legitimately mentions components and props
 * (`/** Resolve a line to a MenuItem for `<CartItem>` *\/`), and scanning
 * comments as if they were code produces confident, wrong violations.
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === quote && text[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * True if the JSX opening tag carries a real SPREAD ATTRIBUTE (`<Card {...p}>`).
 *
 * Deliberately distinguishes that from an object spread inside a prop VALUE
 * (`<CartItem item={{ ...sample, qty }} />`), which is ordinary, safe, and
 * common — a naive `/\{\s*\.\.\./` test flags both and cries wolf. Only a brace
 * at ATTRIBUTE position (i.e. not preceded by `=`) is a spread attribute.
 */
function hasSpreadAttribute(tag) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (quote) {
      if (ch === quote && tag[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '}') {
      depth--;
      continue;
    }
    if (ch !== '{') continue;

    if (depth === 0) {
      // Attribute position unless the previous non-space char is `=`.
      let j = i - 1;
      while (j >= 0 && /\s/.test(tag[j])) j--;
      const isValueBrace = tag[j] === '=';
      if (!isValueBrace && /^\{\s*\.\.\./.test(tag.slice(i))) return true;
    }
    depth++;
  }
  return false;
}

/**
 * Derive the tracked component list from source rather than hardcoding it: any
 * component in `packages/ui` declaring a `mode: ThemeMode` prop is tracked, so
 * a NEW themed component is covered the moment it lands. A hardcoded list would
 * silently drift (the plan's own prose said "26" when there are 27).
 */
function deriveTrackedComponents() {
  const names = new Map();
  for (const file of collect(uiComponents, ['.tsx'])) {
    const text = readFileSync(file, 'utf8');
    if (!/\bmode\s*:\s*ThemeMode\b/.test(text)) continue;
    // `export function Card(` and `export const Input = forwardRef(` both count.
    const re = /^export\s+(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/gm;
    let match;
    while ((match = re.exec(text)) !== null) {
      const name = match[1];
      // Skip co-exported SCREAMING_SNAKE constants (PAYMENT_METHOD_LABELS,
      // REWARDS_TERMS_TITLE, ...). They live in component files but are not
      // components; counting them inflates the tracked total and tracks names
      // that can never appear as JSX.
      if (!/[a-z]/.test(name)) continue;
      names.set(name, file);
    }
  }
  return names;
}

/**
 * Return the attribute text of the JSX opening tag starting at `start`.
 * Walks forward tracking brace depth and string state so nested expressions
 * (`style={[a, b]}`, `onPress={() => f('>')}`) don't end the tag early.
 */
function readOpeningTag(text, start) {
  let i = start;
  let depth = 0;
  let quote = null;
  while (i < text.length) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    } else if (ch === '>' && depth === 0) {
      return text.slice(start, i + 1);
    }
    i++;
  }
  return null;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const allowed = (list, file, component) =>
  list.some((entry) => entry.file === file && entry.component === component);

/* ------------------------------------------------------------------ *
 * Check 1 — raw react-native `useColorScheme` imports
 * ------------------------------------------------------------------ */

function checkColorSchemeImports() {
  const violations = [];
  const files = [
    ...collect(mobileSrc, ['.ts', '.tsx'], { skipTests: false }),
    ...collect(uiSrc, ['.ts', '.tsx'], { skipTests: false }),
  ];
  for (const file of files) {
    const repoRel = relative(repoRoot, file);
    if (COLOR_SCHEME_ALLOWED_FILES.includes(repoRel)) continue;
    const text = stripComments(readFileSync(file, 'utf8'));
    // Any `import { ... useColorScheme ... } from 'react-native'` form.
    const re = /import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (/\buseColorScheme\b/.test(match[1])) {
        violations.push(
          `${repoRel}:${lineOf(text, match.index)}  imports react-native's useColorScheme ` +
            `(use @/hooks/use-color-scheme instead — it honors the saved theme preference)`,
        );
      }
    }
  }
  return violations;
}

/* ------------------------------------------------------------------ *
 * Check 2 — themed-component call sites: spread attrs + missing `mode`
 * ------------------------------------------------------------------ */

function checkComponentCallSites(tracked) {
  const violations = [];
  let siteCount = 0;

  for (const file of collect(mobileSrc, ['.tsx'], { skipTests: false })) {
    const text = stripComments(readFileSync(file, 'utf8'));
    const relFile = rel(file);

    for (const name of tracked.keys()) {
      // `<Card ...` / `<Card>` / `<Card/>` — but not `<CardSomething`.
      const re = new RegExp(`<${name}(?![A-Za-z0-9_])`, 'g');
      let match;
      while ((match = re.exec(text)) !== null) {
        const tag = readOpeningTag(text, match.index);
        if (tag === null) continue;
        const line = lineOf(text, match.index);
        siteCount++;

        if (hasSpreadAttribute(tag)) {
          if (!allowed(SPREAD_ALLOW_LIST, relFile, name)) {
            violations.push(
              `${relFile}:${line}  <${name}> uses a spread attribute — a spread can widen to ` +
                `\`any\` and slip past tsc's required-\`mode\` check. Pass props explicitly, or ` +
                `add an entry to SPREAD_ALLOW_LIST with a reason.`,
            );
          }
          continue;
        }

        if (!/\bmode\s*=/.test(tag)) {
          if (!allowed(MISSING_MODE_ALLOW_LIST, relFile, name)) {
            violations.push(
              `${relFile}:${line}  <${name}> passes no \`mode\` prop — it would render the ` +
                `wrong theme. Thread the screen's resolved \`mode\`, or add an entry to ` +
                `MISSING_MODE_ALLOW_LIST with a reason.`,
            );
          }
        }
      }
    }
  }
  return { violations, siteCount };
}

/* ------------------------------------------------------------------ *
 * Check 3 — raw hex colour literals in apps/mobile screens
 * ------------------------------------------------------------------ */

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

function checkHexLiterals() {
  const violations = [];
  const files = [
    ...collect(join(mobileSrc, 'app'), ['.ts', '.tsx']),
    ...collect(join(mobileSrc, 'features'), ['.ts', '.tsx']),
  ];

  for (const file of files) {
    const relFile = rel(file);
    if (HEX_EXEMPT_FILES.includes(relFile)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    let inBlockComment = false;

    lines.forEach((raw, i) => {
      const line = raw.trim();
      // Skip comments: they carry issue refs (`#6936`) and token docs, not styling.
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        return;
      }
      if (line.startsWith('/*')) {
        if (!line.includes('*/')) inBlockComment = true;
        return;
      }
      if (line.startsWith('//') || line.startsWith('*')) return;
      if (!HEX_RE.test(line)) return;

      const lineNo = i + 1;
      if (HEX_BASELINE.some((b) => b.file === relFile && b.line === lineNo)) return;

      violations.push(
        `${relFile}:${lineNo}  raw hex colour literal — read a token from ` +
          `\`theme\`/\`Colors\` instead: ${line}`,
      );
    });
  }
  return violations;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const tracked = deriveTrackedComponents();
if (tracked.size === 0) {
  console.error(
    'check-theme-mode: derived ZERO themed components from packages/ui — the detection ' +
      'is broken (a silently-empty guard passes everything). Failing loudly instead.',
  );
  process.exit(1);
}

const importViolations = checkColorSchemeImports();
const { violations: siteViolations, siteCount } = checkComponentCallSites(tracked);
const hexViolations = checkHexLiterals();
const all = [...importViolations, ...siteViolations, ...hexViolations];

if (all.length > 0) {
  console.error(`check-theme-mode: found ${all.length} violation(s):\n`);
  for (const v of all) console.error(`  ${v}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check-theme-mode: OK — ${tracked.size} themed components tracked, ${siteCount} call site(s) ` +
    `checked; no raw useColorScheme import, no spread attrs, no new raw hex.`,
);
