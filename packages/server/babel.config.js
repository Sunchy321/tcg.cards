module.exports = {
    presets: ["@babel/preset-env"],
    plugins: [
        [
            "babel-plugin-root-import",
            {
                paths: [
                    { rootPathSuffix: './src' },
                    {
                        rootPathPrefix: '#data',
                        rootPathSuffix: './data'
                    }
                ]
            }
        ]
    ]
}