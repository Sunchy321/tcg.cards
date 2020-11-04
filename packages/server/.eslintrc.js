module.exports = {
    root: true,

    parser: '@typescript-eslint/parser',

    parserOptions: {
        project: './tsconfig.json'
    },

    env: {
        node: true,
    },

    plugins: ['@typescript-eslint'],

    extends: [
        'standard',
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended"
    ],

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
        'no-unused-vars': 'off',
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
        'space-infix-ops': 'warn',
        'quote-props': ['warn', 'consistent-as-needed'],

        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off'
    },
};
