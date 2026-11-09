// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import customConfig from 'eslint-config-custom/nuxt.mjs';

export default withNuxt(
  customConfig,
  {
    files:           ['scripts/**/*.ts'],
    languageOptions: {
      globals: {
        Bun:     'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files:           ['src/composables/useApiClient.ts', 'src/utils/**/*.test.ts'],
    languageOptions: {
      globals: {
        Bun:         'readonly',
        RequestInfo: 'readonly',
        RequestInit: 'readonly',
      },
    },
  },
  {
    ignores: ['src-tauri/', 'dist/', 'node_modules/'],
  },
);
