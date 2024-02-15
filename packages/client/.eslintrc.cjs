const path = require('path');

module.exports = {
    parserOptions: {
        ecmaVersion:         'latest',
        extraFileExtensions: ['.vue'],
        project:             [
            path.join(__dirname, 'tsconfig.json'),
            path.join(__dirname, '..', 'searcher', 'tsconfig.json')
        ],
    },

    globals: {
        ga:        true, // Google Analytics
        cordova:   true,
        __statics: true,
        process:   true,
        Capacitor: true,
        chrome:    true,
    },

    ignorePatterns: ['**/searcher/**/*'],

    rules: {
        'no-implied-eval': 'off',

        '@typescript-eslint/no-implied-eval':                'warn',
        '@typescript-eslint/no-misused-promises':            'warn',
        '@typescript-eslint/prefer-includes':                'warn',
        '@typescript-eslint/prefer-nullish-coalescing':      'warn',
        '@typescript-eslint/prefer-regexp-exec':             'warn',
        '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
        '@typescript-eslint/promise-function-async':         'warn',
        '@typescript-eslint/restrict-plus-operands':         'error',
        '@typescript-eslint/switch-exhaustiveness-check':    'error',

        '@typescript-eslint/strict-boolean-expressions': ['error', {
            allowNullableBoolean: true,
        }],
    },
};
