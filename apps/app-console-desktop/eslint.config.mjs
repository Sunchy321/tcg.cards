// @ts-check
import libConfig from 'eslint-config-custom/library.mjs';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['src-tauri/', 'dist/', 'node_modules/'],
  },
  ...libConfig,
  {
    files:           ['src/**'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  ...pluginVue.configs['flat/recommended'],
  {
    files:           ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
]);
