const path = require('path');

module.exports = {
    parserOptions: {
        parser:     '@typescript-eslint/parser',
        project: path.join(__dirname, 'tsconfig.json'),
        sourceType: 'module',
        ecmaVersion: 2019,
    }
};
