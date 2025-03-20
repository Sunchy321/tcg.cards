import eslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import vueEslint from 'eslint-plugin-vue';
import stylistic from '@stylistic/eslint-plugin';

import { globalIgnores } from 'eslint/config';

import globals from 'globals';

export default tsEslint.config(
    globalIgnores([
        '**/dist',
        '**/lib',
        '**/src-capacitor',
        '**/src-cordova',
        '**/.quasar',
        '**/node_modules',
        '**/src-ssr',
    ]),

    {
        extends: [eslint.configs.recommended],

        rules: {
            'no-unused-vars': 'off',
        },
    },
    {
        extends: [tsEslint.configs.recommended],

        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],

        rules: {
            '@typescript-eslint/no-explicit-any':   'off',
            '@typescript-eslint/no-empty-function': 'off',

            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    varsIgnorePattern:         '^_',
                    caughtErrorsIgnorePattern: '^_',
                    argsIgnorePattern:         '^_',
                },
            ],

        },
    },
    {
        extends: [tsEslint.configs.stylistic],

        rules: {
            '@typescript-eslint/consistent-type-definitions': 'off',
        },
    },
    {
        extends: [vueEslint.configs['flat/recommended']],

        languageOptions: {
            parserOptions: {
                parser: '@typescript-eslint/parser',
            },
            globals: {
                ...globals.browser,
            },
        },

        rules: {
            '@typescript-eslint/consistent-type-definitions': 'off',
            '@typescript-eslint/no-explicit-any':             'off',
            '@typescript-eslint/no-empty-function':           'off',

            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    varsIgnorePattern:         '^_',
                    caughtErrorsIgnorePattern: '^_',
                    argsIgnorePattern:         '^_',
                },
            ],

            'vue/max-attributes-per-line':                 'off',
            'vue/multi-word-component-names':              'off',
            'vue/singleline-html-element-content-newline': 'off',

            'vue/html-indent': ['warn', 4],

        },
    },
    {
        extends: [stylistic.configs.recommended],

        rules: {
            '@stylistic/arrow-parens': ['warn', 'as-needed'],
            '@stylistic/semi':         ['warn', 'always'],

            '@stylistic/brace-style': ['warn', '1tbs', {
                allowSingleLine: true,
            }],

            '@stylistic/indent': ['warn', 4, {
                SwitchCase: 0,
            }],

            '@stylistic/key-spacing': ['warn', {
                beforeColon: false,
                afterColon:  true,
                align:       'value',
            }],

            '@stylistic/max-statements-per-line': ['error', {
                max: 2,
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
        },
    },
);
