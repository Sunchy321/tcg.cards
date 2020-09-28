module.exports = {
    presets: ["@babel/preset-env"],
    plugins: [
        [
            "babel-plugin-root-import",
            {
                paths: [
                    { rootPathSuffix: './src' },
                    {
                        rootPathPrefix: '@/data',
                        rootPathSuffix: './data'
                    },
                    {
                        rootPathPrefix: '@/config',
                        rootPathSuffix: './config.js'
                    },
                    {
                        rootPathPrefix: '@/logger',
                        rootPathSuffix: './src/logger.js'
                    }
                ]
            }
        ]
    ]
}