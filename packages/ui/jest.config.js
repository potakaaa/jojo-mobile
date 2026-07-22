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
  // and the setup file under src/test-utils/ live outside this glob and are
  // never collected as test suites.
  testMatch: ['**/*.test.tsx'],
  // Installs the reanimated + gesture-handler mocks SwipeableRow needs to render
  // (this repo's reanimated 4.5.0 pin crashes at import under jest otherwise).
  setupFiles: ['<rootDir>/src/test-utils/jest-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!.*(react-native|expo|@react-navigation|react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|react-native-gesture-handler|react-native-reanimated|@jojopotato))',
  ],
};
