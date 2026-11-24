module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/external-mocks.ts'],
  roots: ['<rootDir>/test'],
  testRegex: '.e2e-spec.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/'],
  // Pact provider verification specs live under test/pact and are matched by
  // the testRegex above (provider-verification.e2e-spec.ts). They are run as
  // part of the backend e2e suite so that CI fails when any published pact is
  // not satisfied. Pact files are expected in PACT_DIR (defaults to the
  // downloaded CI artifact location).
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  },
  testTimeout: 60000,
};