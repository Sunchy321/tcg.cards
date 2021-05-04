module.exports = {
    root: true,

    parserOptions: {
        parser:     '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2019,
        ecmaFeatures: {
            legacyDecorators: true
        },
        jsx: true
    },

    env: {
        browser: true,
    },

    extends: [
        'standard',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:vue/vue3-recommended'
    ],

    globals: {
        ga:        true, // Google Analytics
        cordova:   true,
        __statics: true,
        process:   true,
        Capacitor: true,
        chrome:    true,
    },

    // add your custom rules here
    rules: {
        // allow async-await
        'generator-star-spacing': 'off',
        // allow paren-less arrow functions
        'arrow-parens':           'off',
        'one-var':                'off',

        'import/first':                      'off',
        'import/named':                      'error',
        'import/namespace':                  'error',
        'import/default':                    'error',
        'import/export':                     'error',
        'import/extensions':                 'off',
        'import/no-unresolved':              'off',
        'import/no-extraneous-dependencies': 'off',
        'prefer-promise-reject-errors':      'off',

        // allow debugger during development only
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',

        'no-new':                       'off',
        'no-unused-vars':               ['warn', { argsIgnorePattern: '^_' }],
        'no-var':                       'error',
        'prefer-const':                 ['error', { destructuring: 'all' }],
        'quotes':                       ['warn', 'single', { avoidEscape: true }],
        'semi':                         ['warn', 'always'],
        'space-before-function-paren':  'off',
        'use-isnan':                    'error',
        'standard/no-callback-literal': 'off',
        'no-unused-expressions':        'off',

        'comma-dangle': ['warn', 'always-multiline'],
        'key-spacing':  ['warn', {
            beforeColon: false,
            afterColon:  true,
            align:       'value',
        }],
        'quote-props': ['warn', 'consistent-as-needed'],
        'no-void': 'off',
        'no-unused-vars': 'off',
        'indent': 'off',

        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/indent': ['warn', 4, { SwitchCase: 0 }],
        '@typescript-eslint/no-non-null-assertion': 'off',

        'vue/no-unused-components':                    'warn',
        'vue/html-indent':                             ['warn', 4],
        'vue/max-attributes-per-line':                 'off',
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline':  'off',

        'vue/component-tags-order': ['error', {
            order: ['template', 'style', 'script'],
        }],
    },
};
