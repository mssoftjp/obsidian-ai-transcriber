import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import importXPlugin from 'eslint-plugin-import-x';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typescriptRules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-empty-function': 'warn',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': ['error', {
    checksConditionals: true,
    checksSpreads: true,
    checksVoidReturn: true
  }],
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-base-to-string': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/restrict-template-expressions': ['error', {
    allowAny: false,
    allowBoolean: false,
    allowNullish: false,
    allowNumber: true,
    allowRegExp: false
  }],
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
  '@typescript-eslint/consistent-type-exports': 'error',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public', overrides: { constructors: 'no-public' } }],
  '@typescript-eslint/method-signature-style': ['error', 'property'],
  '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: false }],
  '@typescript-eslint/prefer-nullish-coalescing': ['error', {
    ignoreBooleanCoercion: false,
    ignoreConditionalTests: false,
    ignoreIfStatements: false,
    ignoreMixedLogicalExpressions: false,
    ignorePrimitives: { string: true },
    ignoreTernaryTests: false
  }],
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  'brace-style': ['error', '1tbs'],
  indent: 'off',
  quotes: ['error', 'single', { avoidEscape: true }],
  semi: ['error', 'always'],
  'no-trailing-spaces': 'error',
  'comma-dangle': ['error', 'never'],
  'object-curly-spacing': ['error', 'always'],
  'array-bracket-spacing': ['error', 'never'],
  'no-implicit-coercion': ['error', { boolean: true, number: true, string: true, disallowTemplateShorthand: true }],
  'import-x/order': ['error', {
    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true }
  }],
  'import-x/no-duplicates': 'error',
  'import-x/no-mutable-exports': 'error',
  'import-x/no-cycle': 'off',
  'obsidianmd/ui/sentence-case-locale-module': ['warn', {
    ignoreRegex: ['^GPT Transcribe(?:$| \\()']
  }]
};

const artifactRules = {
  // Disable plugin rules on build artifacts (generated JS; no typed linting).
  ...Object.fromEntries(Object.keys(tseslint.plugin.rules).map((ruleName) => [`@typescript-eslint/${ruleName}`, 'off'])),
  ...Object.fromEntries(Object.keys(obsidianmd.rules).map((ruleName) => [`obsidianmd/${ruleName}`, 'off']))
};

const webCodecsGlobals = {
  AudioData: 'readonly',
  AudioEncoder: 'readonly'
};

export default defineConfig(
  globalIgnores([
    'node_modules/**',
    '*.config.mjs',
    'jest.config.js',
    'scripts/**',
    'docs/**',
    'tests/**',
    'coverage/**'
  ]),
  js.configs.recommended,
  ...obsidianmd.configs.recommendedWithLocalesEn,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname ?? process.cwd(),
        sourceType: 'module',
        ecmaVersion: 2022
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...webCodecsGlobals,
        Option: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importXPlugin
    },
    rules: typescriptRules
  },
  {
    // Build artifacts are JS-only and not part of the TS project; disable plugin rules here.
    files: ['build/**/*.js', 'dist/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...webCodecsGlobals,
        Option: 'readonly'
      }
    },
    rules: {
      ...artifactRules,
      // Generated/bundled output often contains patterns that are fine in source.
      'no-console': 'off',
      'no-empty': 'off',
      'no-fallthrough': 'off',
      'no-irregular-whitespace': 'off',
      'no-restricted-globals': 'off',
      'no-useless-escape': 'off'
    }
  }
);
