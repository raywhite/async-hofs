import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@stylistic': stylistic },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-underscore-dangle': 'off',
      'no-param-reassign': 'off',
      'prefer-arrow-callback': 'off',
      'func-names': 'off',
      'no-plusplus': 'off',
      'no-loop-func': 'off',
      'no-await-in-loop': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'no-promise-executor-return': 'off',
      'prefer-promise-reject-errors': 'off',
      'prefer-exponentiation-operator': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
