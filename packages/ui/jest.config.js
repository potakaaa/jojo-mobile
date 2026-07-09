/**
 * First test runner in the repo — scoped to `packages/ui` only (no root-level
 * jest config). Uses the standard `jest-expo` preset.
 *
 * pnpm note: the standard Expo `transformIgnorePatterns` (keyed on the top-level
 * `node_modules/`) does NOT work here. pnpm stores real files at
 * `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...`, so the leading
 * `node_modules/.pnpm/` segment always trips a `node_modules/(?!...)` lookahead
 * and the RN/Expo packages (which ship untranspiled Flow/ESM) get skipped by
 * Babel — causing `SyntaxError: Cannot use import statement outside a module`
 * in `@react-native/jest-preset/jest/setup.js`. Keying the pattern off the
 * `.pnpm/` directory names (scoped packages are flattened to `@scope+name@ver`)
 * whitelists the ecosystem packages for transform instead.
 */
module.exports = {
  preset: 'jest-expo',
  // Only *.test.tsx files are suites; shared fixtures (e.g. __tests__/mocks.ts)
  // live in __tests__ but must not be collected as test suites.
  testMatch: ['**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!.*(react-native|expo|@react-navigation|react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|@jojopotato))',
  ],
};
