const path = require('path');

module.exports = {
    parser: 'vue-eslint-parser',

    parserOptions: {
        parser:      '@typescript-eslint/parser',
        project: path.join(__dirname, 'tsconfig.json'),
    },

    globals: {
        defineProps: 'readonly',
    },

    env: {
        'vue/setup-compiler-macros': true,
    },

    rules: {
        'no-implied-eval': 'off',

        '@typescript-eslint/no-implied-eval':                'warn',
        '@typescript-eslint/no-misused-promises':            'off',
        '@typescript-eslint/prefer-includes':                'warn',
        '@typescript-eslint/prefer-nullish-coalescing':      'warn',
        '@typescript-eslint/prefer-regexp-exec':             'warn',
        '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
        '@typescript-eslint/promise-function-async':         'warn',
        '@typescript-eslint/restrict-plus-operands':         'error',
        '@typescript-eslint/switch-exhaustiveness-check':    'error',
        '@typescript-eslint/no-confusing-void-expression':   'off',
    },
};
