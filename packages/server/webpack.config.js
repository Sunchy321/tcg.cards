const path = require('path');

const TsconfigPathPlugin = require('tsconfig-paths-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry:  './src/app.ts',
    output: {
        path:              path.resolve(__dirname, 'dist'),
        filename:          '[name].js',
        sourceMapFilename: '[name].js.map',
        clean:             true,
    },
    target:           'node',
    externalsPresets: { node: true },
    externals:        [nodeExternals()],
    resolve:          {
        extensions: ['.ts', '.js'],
        plugins:    [new TsconfigPathPlugin()],
    },
    module: {
        rules: [
            {
                test:    /\.ts/,
                exclude: /node_modules/,
                use:     [{
                    loader: 'ts-loader',
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
