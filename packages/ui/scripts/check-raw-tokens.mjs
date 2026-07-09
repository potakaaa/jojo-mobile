#!/usr/bin/env node
/**
 * AC3 (hex half) gate: fail if any component source file under
 * `packages/ui/src/components/` contains a raw hex color literal. Token values
 * live only in `theme.ts` (which is excluded); components must reference tokens,
 * never inline a hex.
 *
 * This is the Fully-Automated half of AC3. The magic-spacing/radius numeric
 * check is intentionally NOT automated here (regex can't safely distinguish a
 * spacing literal from a legitimate non-style number) — that is an Agent-Probe
 * code-review spot-check per the plan's Verification Evidence table.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, '..', 'src', 'components');
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

function collectTsx(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...collectTsx(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of collectTsx(componentsDir)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const match = line.match(HEX_RE);
    if (match) {
      violations.push(`${file}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`check-raw-tokens: found ${violations.length} raw hex literal(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log('check-raw-tokens: OK — no raw hex literals in components/*.tsx');
