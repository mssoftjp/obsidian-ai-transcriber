/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main-api.ts', // Entry point
    '!src/api-main.ts', // UI components
  ],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    '^.+\\.(?:bin|txt)$': '<rootDir>/tests/__mocks__/embeddedAsset.ts'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/to_delete/'
  ],
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 14,
      lines: 15,
      statements: 15
    }
  }
};
