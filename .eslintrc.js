module.exports = {
    root: true,

    env: {
        browser: true,
        es2021:  true,
        node:    true,
    },

    parserOptions: {
        ecmaVersion: 13,
        parser:      '@typescript-eslint/parser',
        sourceType:  'module',
    },

    plugins: ['@typescript-eslint', 'vue', 'jest'],

    extends: [
        'airbnb-base',
        'plugin:@typescript-eslint/recommended',
        'plugin:vue/vue3-recommended',
    ],

    rules: {
        'arrow-parens':           'off',
        'class-methods-use-this': 'off',
        'func-names':             'off',
        'max-classes-per-file':   'off',
        'no-await-in-loop':       'off',
        'no-console':             'off',
        'no-continue':            'off',
        'no-else-return':         'off',
        'no-nested-ternary':      'off',
        'no-param-reassign':      'off',
        'no-underscore-dangle':   'off',

        'comma-dangle': ['warn', 'always-multiline'],
        'indent':       ['warn', 4, { SwitchCase: 0 }],

        'no-void':     ['error', { allowAsStatement: true }],
        'quote-props': ['warn', 'consistent-as-needed'],

        'key-spacing': ['warn', {
            beforeColon: false,
            afterColon:  true,
            align:       'value',
        }],

        'max-len': ['warn', 120, 4, {
            ignoreUrls:             true,
            ignoreComments:         false,
            ignoreRegExpLiterals:   true,
            ignoreStrings:          true,
            ignoreTemplateLiterals: true,
        }],

        'no-shadow': ['error', {
            allow: [
                'a', 'b', 'c', 'd', 'e',
                'f', 'g', 'h', 'i', 'j',
                'k', 'l', 'm', 'n', 'o',
                'p', 'q', 'r', 's', 't',
                'u', 'v', 'w', 'x', 'y', 'z',
            ],
        }],

        'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],

        'import/extensions':            'off',
        'import/no-unresolved':         'off',
        'import/order':                 'off',
        'import/prefer-default-export': 'off',

        '@typescript-eslint/no-explicit-any':       'off',
        '@typescript-eslint/no-non-null-assertion': 'off',

        'vue/html-indent':                             ['warn', 4],
        'vue/max-attributes-per-line':                 'off',
        'vue/multi-word-component-names':              'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline':  'off',

        'vue/component-tags-order': ['error', {
            order: ['template', 'style', 'script'],
        }],

        // 'generator-star-spacing': 'off',
        // 'no-new': 'off',
        // 'no-unused-vars': 'off',
        // 'no-var': 'error',
        // 'prefer-const': ['error', { destructuring: 'all' }],
        // 'quotes': ['warn', 'single', { avoidEscape: true }],
        // 'semi': ['warn', 'always'],
        // 'space-before-function-paren': 'off',
        // 'use-isnan': 'error',
        // 'standard/no-callback-literal': 'off',
        // 'no-unused-expressions': 'off',

        // 'comma-dangle': ['warn', 'always-multiline'],
        // 'key-spacing': ['warn', {
        //     beforeColon: false,
        //     afterColon: true,
        //     align: 'value'
        // }],
        // 'space-infix-ops': 'warn',

        // '@typescript-eslint/switch-exhaustiveness-check': 'error',
        // '@typescript-eslint/no-non-null-assertion': 'off'

    },
};
