module.exports = function() {
    return {
        boot:   ['i18n', 'axios', 'notify', 'utility', 'websocket'],
        css:    ['app.styl'],
        extras: ['mdi-v5'],

        framework: {
            iconSet:    'mdi-v5', // Quasar icon set
            lang:       'en-us', // Quasar language pack
            all:        'auto',
            components: [],
            directives: [],
            plugins:    ['Notify', 'LocalStorage'],
        },

        supportIE: false,

        build: {
            scopeHoisting: true,
            vueRouterMode: 'history',

            // showProgress: false,
            // gzip: true,
            // analyze: true,

            // Options below are automatically set depending on the env, set them if you want to override
            // preloadChunks: false,
            // extractCSS: false,

            // https://quasar.dev/quasar-cli/cli-documentation/handling-webpack
            extendWebpack(cfg) {
                cfg.module.rules.push({
                    enforce: 'pre',
                    test:    /\.(js|vue)$/,
                    loader:  'eslint-loader',
                    exclude: /node_modules/,
                    options: {
                        formatter: require('eslint').CLIEngine.getFormatter(
                            'stylish',
                        ),
                    },
                });
            },
        },

        devServer: {
            https: false,
            port:  8080,
            open:  true,
        },

        animations: [],

        ssr: {
            pwa: false,
        },

        pwa: {
            workboxPluginMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
            workboxOptions:    {}, // only for GenerateSW
            manifest:          {
                name:             'Client',
                short_name:       'Client',
                description:      'A Card Client',
                display:          'standalone',
                orientation:      'portrait',
                background_color: '#ffffff',
                theme_color:      '#027be3',
                icons:            [
                    {
                        src:   'statics/icons/icon-128x128.png',
                        sizes: '128x128',
                        type:  'image/png',
                    },
                    {
                        src:   'statics/icons/icon-192x192.png',
                        sizes: '192x192',
                        type:  'image/png',
                    },
                    {
                        src:   'statics/icons/icon-256x256.png',
                        sizes: '256x256',
                        type:  'image/png',
                    },
                    {
                        src:   'statics/icons/icon-384x384.png',
                        sizes: '384x384',
                        type:  'image/png',
                    },
                    {
                        src:   'statics/icons/icon-512x512.png',
                        sizes: '512x512',
                        type:  'image/png',
                    },
                ],
            },
        },

        cordova: {
            // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
            id: 'org.cordova.quasar.app',
        },

        capacitor: {
            hideSplashscreen: true,
        },

        electron: {
            bundler: 'packager', // 'packager' or 'builder'

            packager: {
                // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
                // OS X / Mac App Store
                // appBundleId: '',
                // appCategoryType: '',
                // osxSign: '',
                // protocol: 'myapp://path',
                // Windows only
                // win32metadata: { ... }
            },

            builder: {
                // https://www.electron.build/configuration/configuration

                appId: 'card-client',
            },

            // More info: https://quasar.dev/quasar-cli/developing-electron-apps/node-integration
            nodeIntegration: true,

            extendWebpack() {
                // do something with Electron main process Webpack cfg
                // chainWebpack also available besides this extendWebpack
            },
        },
    };
};
