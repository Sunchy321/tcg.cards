const path = require('path');

module.exports = {
    entry:  './src/index.ts',
    output: {
        filename: 'index.js',
        path:     path.resolve(__dirname, 'lib'),
    },
    module: {
        rules: [
            {
                test:    /\.js|\.ts/,
                exclude: /node_modules/,
                use:     [{
                    loader: 'babel-loader',
                }],
            },
            {
                test: /\.pegjs/,
                use:  [{
                    loader: 'pegjs-loader',
                }],
            },
        ],
    },
};
