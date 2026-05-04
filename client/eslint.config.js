import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

const baseReactConfig = {
  extends: [
    js.configs.recommended,
    reactHooks.configs['recommended-latest'],
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
    parserOptions: {
      ecmaVersion: 'latest',
      ecmaFeatures: { jsx: true },
      sourceType: 'module',
    },
  },
  rules: {
    'no-unused-vars': ['error', {
      varsIgnorePattern: '^[A-Z_|motion]',
      argsIgnorePattern: '^[A-Z_]',
      caughtErrorsIgnorePattern: '^[A-Z_]',
    }],
  },
}

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'public/vendor']),
  {
    files: ['src/context/AuthContext.jsx'],
    ...baseReactConfig,
    rules: {
      ...baseReactConfig.rules,
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['**/*.{test,spec}.{js,jsx}', 'src/context/AuthContext.jsx', 'vite.config.js', 'vitest.setup.js'],
    ...baseReactConfig,
  },
  {
    files: ['**/*.{test,spec}.{js,jsx}'],
    ...baseReactConfig,
    languageOptions: {
      ...baseReactConfig.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.vitest,
      },
    },
  },
  {
    files: ['vite.config.js', 'vitest.setup.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
])
