// eslint.config.js
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
    ],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'ignoreRestSiblings': true 
      }],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];