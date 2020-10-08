module.exports = {
    root: true,

    parserOptions: {
        parser: 'babel-eslint',
        sourceType: 'module',
    },

    env: {
        browser: true,
    },

    extends: [
        'standard',
        'prettier',
        // Uncomment any of the lines below to choose desired strictness,
        // but leave only one uncommented!
        // See https://vuejs.github.io/eslint-plugin-vue/rules/#available-rules
        'plugin:vue/essential', // Priority A: Essential (Error Prevention)
        // 'plugin:vue/strongly-recommended' // Priority B: Strongly Recommended (Improving Readability)
        // 'plugin:vue/recommended' // Priority C: Recommended (Minimizing Arbitrary Choices and Cognitive Overhead)
    ],

    // required to lint *.vue files
    plugins: ['vue'],

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
        'vue/no-unused-components': 'warn',
    },
};
