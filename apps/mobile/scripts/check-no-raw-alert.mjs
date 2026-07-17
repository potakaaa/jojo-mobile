#!/usr/bin/env node
/**
 * AC1 gate — no raw `Alert.alert(` may reach `apps/mobile/src`.
 *
 * The app has ONE notification language: `Toast` (single-button notices) and
 * `ConfirmDialog` (real two-choice decisions), both themed and both in
 * `packages/ui`. A raw OS `Alert.alert()` bypasses the theme entirely and is the
 * exact inconsistency the alert/toast pass removed.
 *
 * This is a standing REGRESSION gate, not a one-time migration proof: it stops a
 * future PR from quietly reintroducing one. `tsc` cannot catch this — an
 * `Alert.alert()` call is perfectly well-typed.
 *
 * Mirrors `check-theme-mode.mjs`: same script family, same comment-stripping
 * discipline (prose legitimately mentions `Alert.alert(` — including this
 * header — and scanning comments as code produces confident, wrong violations).
 *
 * Run: `pnpm --filter @jojopotato/mobile guard:no-raw-alert`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, '..');
const mobileSrc = join(mobileRoot, 'src');

/**
 * Call sites permitted to use a raw `Alert.alert(`. Empty by design — every
 * entry needs a stated reason.
 */
const ALLOW_LIST = [
  // { file: 'src/path/to/file.tsx', reason: '...' },
];

function collect(dir, exts) {
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
      if (entry.name === 'node_modules') continue;
      out.push(...collect(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out `//` and block comments, preserving every other character position
 * and all newlines so reported line numbers stay exact. Copied in shape from
 * `check-theme-mode.mjs`'s stripComments for the same reason it exists there.
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

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const violations = [];
let filesScanned = 0;

for (const file of collect(mobileSrc, ['.ts', '.tsx'])) {
  const relFile = relative(mobileRoot, file);
  if (ALLOW_LIST.some((entry) => entry.file === relFile)) continue;

  filesScanned++;
  const text = stripComments(readFileSync(file, 'utf8'));
  const re = /\bAlert\s*\.\s*alert\s*\(/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    violations.push(
      `${relFile}:${lineOf(text, match.index)}  raw Alert.alert() — use the shared <Toast> for a ` +
        `single-button notice, or <ConfirmDialog> for a two-choice decision. Both are themed and ` +
        `exported from @jojopotato/ui. If a raw alert is genuinely required, add an ALLOW_LIST ` +
        `entry with a reason.`,
    );
  }
}

if (filesScanned === 0) {
  console.error(
    'check-no-raw-alert: scanned ZERO files under apps/mobile/src — the detection is broken ' +
      '(a silently-empty guard passes everything). Failing loudly instead.',
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`check-no-raw-alert: found ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('');
  process.exit(1);
}

console.log(
  `check-no-raw-alert: OK — ${filesScanned} file(s) scanned, no raw Alert.alert() call sites.`,
);
