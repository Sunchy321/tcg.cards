// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import customConfig from 'eslint-config-custom/nuxt.mjs';
import tseslint from 'typescript-eslint';

export default withNuxt(
  customConfig,
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        Bun: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
  },
  {
    ignores: ['src-tauri/', 'dist/', 'node_modules/'],
  },
);
