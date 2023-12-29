module.exports = {
    root: true,

    env: {
        browser: true,
        es2021:  true,
        node:    true,
    },

    parser: 'vue-eslint-parser',

    parserOptions: {
        parser:      '@typescript-eslint/parser',
        sourceType:  'module',
        ecmaVersion: 2020,
    },

    ignorePatterns: ['**/dist', '**/lib'],

    plugins: ['@typescript-eslint', 'vue'],

    extends: [
        'airbnb-base',
        'plugin:@typescript-eslint/recommended',
        'plugin:vue/vue3-recommended',
    ],

    overrides: [
        {
            files: ['.eslintrc.js', 'webpack.config.js', 'quasar.conf.js'],
            rules: {
                'import/no-extraneous-dependencies':  'off',
                '@typescript-eslint/no-var-requires': 'off',
            },
        },
    ],

    rules: {
        'arrow-parens':                'off',
        'brace-style':                 'off',
        'class-methods-use-this':      'off',
        'comma-dangle':                'off',
        'comma-spacing':               'off',
        'func-call-spacing':           'off',
        'func-names':                  'off',
        'indent':                      'off',
        'keyword-spacing':             'off',
        'lines-between-class-members': 'off',
        'max-classes-per-file':        'off',
        'no-await-in-loop':            'off',
        'no-console':                  'off',
        'no-continue':                 'off',
        'no-else-return':              'off',
        'no-lonely-if':                'off',
        'no-nested-ternary':           'off',
        'no-param-reassign':           'off',
        'no-shadow':                   'off',
        'no-underscore-dangle':        'off',
        'no-unused-expressions':       'off',
        'no-use-before-define':        'off',
        'object-curly-spacing':        'off',
        'quotes':                      'off',
        'semi':                        'off',
        'space-before-function-paren': 'off',
        'space-infix-ops':             'off',

        'key-spacing': ['warn', { beforeColon: false, afterColon: true, align: 'value' }],
        'no-void':     ['error', { allowAsStatement: true }],
        'quote-props': ['warn', 'consistent-as-needed'],

        'max-len': ['warn', 130, 4, {
            ignoreUrls:             true,
            ignoreComments:         false,
            ignoreRegExpLiterals:   true,
            ignoreStrings:          true,
            ignoreTemplateLiterals: true,
        }],

        'generator-star-spacing': ['error', {
            before:    false,
            after:     true,
            anonymous: 'neither',
            method:    { before: false, after: true },
        }],

        'prefer-destructuring': ['warn', {
            array:  false,
            object: true,
        }],

        'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],

        'import/extensions':            'off',
        'import/no-unresolved':         'off',
        'import/order':                 'off',
        'import/prefer-default-export': 'off',

        '@typescript-eslint/explicit-module-boundary-types':       'error',
        '@typescript-eslint/func-call-spacing':                    'warn',
        '@typescript-eslint/keyword-spacing':                      'warn',
        '@typescript-eslint/no-confusing-void-expression':         'error',
        '@typescript-eslint/no-empty-function':                    'off',
        '@typescript-eslint/no-empty-interface':                   'off',
        '@typescript-eslint/no-explicit-any':                      'off',
        '@typescript-eslint/no-for-in-array':                      'error',
        '@typescript-eslint/no-inferrable-types':                  'error',
        '@typescript-eslint/no-non-null-assertion':                'off',
        '@typescript-eslint/no-unused-expressions':                'error',
        '@typescript-eslint/no-use-before-define':                 'error',
        '@typescript-eslint/prefer-for-of':                        'warn',
        '@typescript-eslint/prefer-function-type':                 'warn',
        '@typescript-eslint/prefer-optional-chain':                'warn',
        '@typescript-eslint/semi':                                 'error',
        '@typescript-eslint/sort-type-union-intersection-members': 'warn',
        '@typescript-eslint/space-infix-ops':                      'warn',
        '@typescript-eslint/type-annotation-spacing':              'warn',

        '@typescript-eslint/brace-style':                 ['warn', '1tbs', { allowSingleLine: true }],
        '@typescript-eslint/comma-dangle':                ['warn', 'always-multiline'],
        '@typescript-eslint/comma-spacing':               ['warn', { before: false, after: true }],
        '@typescript-eslint/indent':                      ['warn', 4, { SwitchCase: 0 }],
        '@typescript-eslint/lines-between-class-members': ['warn', 'always', { exceptAfterSingleLine: true }],
        '@typescript-eslint/no-unused-vars':              ['warn', { varsIgnorePattern: '^(_{1,3})$' }],
        '@typescript-eslint/object-curly-spacing':        ['warn', 'always'],
        '@typescript-eslint/quotes':                      ['error', 'single'],

        '@typescript-eslint/member-delimiter-style': ['warn', {
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

        '@typescript-eslint/no-shadow': ['error', {
            allow: [
                'a', 'b', 'c', 'd', 'e',
                'f', 'g', 'h', 'i', 'j',
                'k', 'l', 'm', 'n', 'o',
                'p', 'q', 'r', 's', 't',
                'u', 'v', 'w', 'x', 'y', 'z',
            ],
        }],

        '@typescript-eslint/space-before-function-paren': ['warn', {
            anonymous:  'always',
            named:      'never',
            asyncArrow: 'always',
        }],

        'vue/max-attributes-per-line':                 'off',
        'vue/multi-word-component-names':              'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline':  'off',
        'vue/component-tags-order':                    'off',

        'vue/block-order':          ['error', { order: ['template', 'style', 'script'] }],
        'vue/html-indent':          ['warn', 4],
        'vue/no-unused-properties': ['warn', { groups: ['setup'] }],
    },
};
