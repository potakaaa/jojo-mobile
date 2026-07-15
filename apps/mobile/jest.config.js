/**
 * RN component test runner for `apps/mobile` (added Phase 4). Mirrors
 * `packages/ui/jest.config.js`: the standard `jest-expo` preset + the pnpm-aware
 * `transformIgnorePatterns` (keyed off `.pnpm/` directory names so RN/Expo
 * packages that ship untranspiled Flow/ESM are still Babel-transformed).
 *
 * Split from vitest by file extension: jest owns `*.test.tsx` (RN component
 * rendering), vitest keeps `*.test.ts` (pure-TS logic, `vitest.config.ts`). The
 * two suites never collect each other's files.
 *
 * `setupFiles` installs a hand-rolled `react-native-reanimated` mock: this repo's
 * pin (reanimated 4.5.0 + react-native-worklets 0.10.0) crashes at import under
 * jest even via the library's own `/mock` export (`loadUnpackers` undefined), so a
 * no-op stub of the handful of APIs actually used is required. Empirically proven
 * during the phase-4 inner PVL probe. See `src/test-utils/jest-setup.ts`.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.tsx'],
  setupFiles: ['<rootDir>/src/test-utils/jest-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!.*(react-native|expo|@react-navigation|react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|@jojopotato))',
  ],
};
