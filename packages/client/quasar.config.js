/* eslint-env node */

/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 */

// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-js

/* eslint func-names: 0 */
/* eslint global-require: 0 */

import { configure } from 'quasar/wrappers/index.js';
import path from 'path';

export default configure((/* ctx */) => ({
    eslint: {
        // fix: true,
        // include = [],
        // exclude = [],
        // rawOptions = {},
        warnings: true,
        errors:   true,
    },

    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: [
        'i18n',
        'server',
        'notify',
        'utility',
    ],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#css
    css: [
        'app.sass',
    ],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
        'mdi-v7',
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#build
    build: {
        target: {
            browser: ['es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
            node:    'node16',
        },

        vueRouterMode: 'history', // available values: 'hash', 'history'
        // vueRouterBase,
        // vueDevtools,
        vueOptionsAPI: false,

        // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

        // publicPath: '/',
        // analyze: true,
        // env: {},
        // rawDefine: {}
        // ignorePublicFolder: true,
        // minify: 'esbuild',
        // polyfillModulePreload: true,
        // distDir

        // extendViteConf (viteConf) {},
        // viteVuePluginOptions: {},

        alias: {
            'setup':        path.join(__dirname, 'src/setup'),
            'store':        path.join(__dirname, 'src/stores'),
            '@static':      path.join(__dirname, 'node_modules/card-common/static'),
            '@data':        path.join(__dirname, 'node_modules/card-common/data'),
            '@common':      path.join(__dirname, 'node_modules/card-common/src'),
            '@interface':   path.join(__dirname, 'node_modules/card-interface/src'),
            '@search':      path.join(__dirname, 'node_modules/card-search/src'),
            '@search-data': path.join(__dirname, 'node_modules/card-search/data'),
        },

        vitePlugins: [
            // ['@intlify/unplugin-vue-i18n/vite', {
            //     include: path.resolve(__dirname, './src/i18n/**'),
            // }],
            ['@rollup/plugin-yaml'],
        ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#devServer
    devServer: {
        // https: true
        port: 4000,
        open: true, // opens browser window automatically
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#framework
    framework: {
        config: {},

        iconSet: 'mdi-v7', // Quasar icon set
        lang:    'en-US', // Quasar language pack

        // For special cases outside of where the auto-import strategy can have an impact
        // (like functional components as one of the examples),
        // you can manually specify Quasar components/directives to be available everywhere:
        //
        // components: [],
        // directives: [],

        // Quasar plugins
        plugins: ['Notify', 'LocalStorage', 'Dialog'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   registerServiceWorker: 'src-pwa/register-service-worker',
    //   serviceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
        // ssrPwaHtmlFilename: 'offline.html', // do NOT use index.html as name!
        // will mess up SSR

        // extendSSRWebserverConf (esbuildConf) {},
        // extendPackageJson (json) {},

        pwa: false,

        // manualStoreHydration: true,
        // manualPostHydrationTrigger: true,

        prodPort: 3000, // The default port that the production server should use
        // (gets superseded if process.env.PORT is specified at runtime)

        middlewares: [
            'render', // keep this as last one
        ],
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
        workboxMode:                  'generateSW', // or 'injectManifest'
        injectPwaMetaTags:            true,
        swFilename:                   'sw.js',
        manifestFilename:             'manifest.json',
        useCredentialsForManifestTag: false,
        // extendGenerateSWOptions (cfg) {}
        // extendInjectManifestOptions (cfg) {},
        // extendManifestJson (json) {}
        // extendPWACustomSWConf (esbuildConf) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {
        // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
        hideSplashscreen: true,
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
        // extendElectronMainConf (esbuildConf)
        // extendElectronPreloadConf (esbuildConf)

        inspectPort: 5858,

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

            appId: 'quasar-project',
        },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
        contentScripts: [
            'my-content-script',
        ],

        // extendBexScriptsConf (esbuildConf) {}
        // extendBexManifestJson (json) {}
    },
}));
