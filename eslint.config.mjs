import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

import { globalIgnores } from 'eslint/config';

export default tseslint.config(
    globalIgnores(['**/dist', '**/lib']),
    eslint.configs.recommended,
    tseslint.configs.stylistic,
    {
        extends: [tseslint.configs.recommended],

        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs'],

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
