import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import stylistic from '@stylistic/eslint-plugin';

import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ['node_modules/', 'dist/', '.eslintrc.cjs']
  },
  eslint.configs.recommended,
  stylistic.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',

      '@stylistic/arrow-parens': ['warn', 'as-needed'],
      '@stylistic/semi': ['warn', 'always'],

      '@stylistic/comma-dangle': ['warn', {
        arrays:    'always-multiline',
        objects:   'always-multiline',
        imports:   'always-multiline',
        exports:   'always-multiline',
        functions: 'always-multiline',
      }],

      '@stylistic/key-spacing': ['warn', {
        beforeColon: false,
        afterColon:  true,
        align:       'value',
      }],

      '@stylistic/member-delimiter-style': ['warn', {
        multiline: {
          delimiter:   'semi',
          requireLast: true,
        },

        singleline: {
          delimiter:   'comma',
          requireLast: false,
        },

        multilineDetection: 'brackets',
      }],

      '@stylistic/no-multi-spaces': ['warn', {
        exceptions: {
          Property:         true,
          ImportAttribute:  true,
          TSTypeAnnotation: true,
        },
      }],
    }
  }
])
