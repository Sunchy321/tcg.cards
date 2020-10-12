module.exports = {
    root: true,

    parserOptions: {
        parser: 'babel-eslint',
        sourceType: 'module',
    },

    env: {
        browser: true,
    },

    plugins: ['vue'],

    extends: ['standard', 'plugin:vue/recommended'],

    globals: {
        ga: true, // Google Analytics
        cordova: true,
        __statics: true,
        process: true,
        Capacitor: true,
        chrome: true,
    },

    // add your custom rules here
    rules: {
        // allow async-await
        'generator-star-spacing': 'off',
        // allow paren-less arrow functions
        'arrow-parens': 'off',
        'one-var': 'off',

        'import/first': 'off',
        'import/named': 'error',
        'import/namespace': 'error',
        'import/default': 'error',
        'import/export': 'error',
        'import/extensions': 'off',
        'import/no-unresolved': 'off',
        'import/no-extraneous-dependencies': 'off',
        'prefer-promise-reject-errors': 'off',

        // allow debugger during development only
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',

        'arrow-parens': 'off',
        'generator-star-spacing': 'off',
        'indent': ['warn', 4, { SwitchCase: 0 }],
        'no-new': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '(^_|reject)' }],
        'no-var': 'error',
        'prefer-const': ['error', { destructuring: 'all' }],
        'quotes': ['warn', 'single', { avoidEscape: true }],
        'semi': ['warn', 'always'],
        'space-before-function-paren': 'off',
        'use-isnan': 'error',
        'standard/no-callback-literal': 'off',
        'no-unused-expressions': 'off',

        'comma-dangle': ['warn', 'always-multiline'],
        'key-spacing': ['warn', {
            beforeColon: false,
            afterColon: true,
            align: 'value'
        }],
        'quote-props': ['warn', 'consistent-as-needed'],

        'vue/no-unused-components': 'warn',
        'vue/html-indent': ['warn', 4],
        'vue/max-attributes-per-line': 'off',
    },
};
