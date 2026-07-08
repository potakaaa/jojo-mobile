const expoConfig = require('@jojopotato/config/eslint');

module.exports = [
  ...expoConfig,
  {
    ignores: ['.expo/**', 'dist/**'],
  },
];
