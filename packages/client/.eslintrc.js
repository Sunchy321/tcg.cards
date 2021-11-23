const path = require('path');

module.exports = {
    parserOptions: {
        parser:     '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
        project: path.join(__dirname, 'tsconfig.json'),
        sourceType: 'module',
        ecmaVersion: 2019,
    },

    globals: {
        ga:        true, // Google Analytics
        cordova:   true,
        __statics: true,
        process:   true,
        Capacitor: true,
        chrome:    true,
    },
};
