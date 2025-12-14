import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';

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
  'import/order': ['error', {
    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true }
  }],
  'import/no-duplicates': 'error',
  'import/no-mutable-exports': 'error',
  'import/no-cycle': 'off'
};

export default [
  {
    ignores: [
      'node_modules/**',
      '*.config.mjs',
      'scripts/**',
      'docs/**'
    ]
  },
  js.configs.recommended,
  ...flattenConfigs([...obsidianmd.configs.recommendedWithLocalesEn]),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname ?? process.cwd(),
        sourceType: 'module',
        ecmaVersion: 2022
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        Option: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin
    },
    rules: typescriptRules
  }
];

function flattenConfigs(configs) {
  return configs.flatMap((config) => expandConfig(config));
}

function expandConfig(config) {
  if (Array.isArray(config)) {
    return config.flatMap((item) => expandConfig(item));
  }

  if (!config || typeof config !== 'object') {
    return [];
  }

  if (!('extends' in config) || !config.extends) {
    return [config];
  }

  const { extends: extendList, ...rest } = config;
  const normalized = Array.isArray(extendList) ? extendList : [extendList];
  const inherited = normalized.flatMap((item) => expandConfig(item));
  return [...inherited, rest];
}
