// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import customConfig from 'eslint-config-custom/nuxt.mjs';

export default withNuxt(
  customConfig,
  {
    files:           ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        Bun:         'readonly',
        RequestInit: 'readonly',
      },
    },
  },
);
