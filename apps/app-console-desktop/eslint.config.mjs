// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import customConfig from 'eslint-config-custom/nuxt.mjs';

export default withNuxt(
  customConfig,
  {
    files: ['electron/**/*.ts', 'shared/**/*.ts'],
    rules: { 'no-undef': 'off' },
  },
);
