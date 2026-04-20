// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import customConfig from 'eslint-config-custom/nuxt.mjs';

export default withNuxt(
  customConfig,
  {
    files:           ['scripts/**/*.ts'],
    languageOptions: {
      globals: {
        Bun: 'readonly',
      },
    },
  },
);
