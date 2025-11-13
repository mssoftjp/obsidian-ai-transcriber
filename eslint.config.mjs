import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

const typescriptRules = {
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-empty-function': 'warn',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
  '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  '@typescript-eslint/await-thenable': 'off',
  '@typescript-eslint/no-base-to-string': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/restrict-template-expressions': 'off',
  'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always'],
  curly: ['error', 'all'],
  'brace-style': ['error', '1tbs'],
  indent: ['error', 'tab'],
  quotes: ['error', 'single', { avoidEscape: true }],
  semi: ['error', 'always'],
  'no-trailing-spaces': 'error',
  'comma-dangle': ['error', 'never'],
  'object-curly-spacing': ['error', 'always'],
  'array-bracket-spacing': ['error', 'never']
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'main.js',
      '*.config.mjs',
      'scripts/**',
      'docs/**'
    ]
  },
  js.configs.recommended,
  ...flattenConfigs([...obsidianmd.configs.recommended]),
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
      '@typescript-eslint': tsPlugin
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
