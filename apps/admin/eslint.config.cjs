const baseConfig = require('@jojopotato/config/eslint-base');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

// Option A (per phase-00 plan ADR): reuse the plain-TS base and layer a small
// local web-React override (react-hooks + browser globals) inline, rather than
// adding a new shared `@jojopotato/config/eslint-web-react` export for a single
// web app (YAGNI — promote to Option B once a second web app exists).
module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    ignores: ['dist/**', '.tanstack/**', 'src/routeTree.gen.ts'],
  },
];
