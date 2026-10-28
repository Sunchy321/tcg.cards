import { fileURLToPath } from 'url';
import { IconUsageScanner } from '@nuxt/icon/utils';
import { useNuxt } from 'nuxt/kit';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['@tcg-cards/ui'],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  devServer: { port: 3002 },

  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#d97706' },
      ],
    },
  },

  experimental: {
    typedPages: true,
  },

  runtimeConfig: {
    public: {
      assetBaseUrl:       process.env.ASSET_BASE_URL ?? 'https://asset.tcg.cards',
      hasDataSourcesPage: true,
    },
  },

  css: ['~/assets/css/main.css'],

  alias: {
    '#shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    '#model':  fileURLToPath(new URL('../../packages/model/src', import.meta.url)),
    '#search': fileURLToPath(new URL('../../packages/search/src', import.meta.url)),
    '#db':     fileURLToPath(new URL('../../packages/db/src', import.meta.url)),
    '#schema': fileURLToPath(new URL('../../packages/db/src/schema', import.meta.url)),
  },

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  routeRules: {
    '/':             { prerender: true },
    '/data-sources': { prerender: true },
  },

  compatibilityDate: '2025-07-15',

  nitro: {
    preset: 'cloudflare_module',

    cloudflare: {
      deployConfig: true,
      nodeCompat:   true,
    },
  },

  vite: {
    server: {
      warmup: {
        clientFiles: ['./app/**/*.vue'],
      },
    },
    optimizeDeps: {
      include: [
        '@iconify-json/lucide',
        '@iconify-json/simple-icons',
      ],
    },
  },

  icon: {
    provider:      'none',
    serverBundle:  false,
    fallbackToApi: false,
    // Hyphenated names still need collection prefixes when the server bundle is disabled.
    collections:   ['lucide', 'simple-icons', 'i'],
    clientBundle:  {
      scan: {
        // Action definitions and app configuration also contain icon names.
        globInclude:       ['app/**/*.{vue,ts,js,jsx,tsx}'],
        // The complete custom collection below also covers constructed names.
        ignoreCollections: ['i'],
      },
      includeCustomCollections: true,
    },
  },

  hooks: {
    'modules:done'() {
      const nuxt = useNuxt();
      nuxt.hook('icon:clientBundleIcons', icons => {
        // Nuxt UI resolves its built-in icon names from app configuration at runtime.
        const scanner = new IconUsageScanner({ ignoreCollections: ['i'] });
        scanner.extractFromCode(JSON.stringify(nuxt.options.appConfig), icons);
      });
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales:       [
      { code: 'en', language: 'en-US', name: 'English', file: 'en/index.ts' },
      { code: 'zhs', language: 'zh-CN', name: 'Chinese (Simplified)', file: 'zhs/index.ts' },
    ],
    strategy:              'no_prefix',
    detectBrowserLanguage: {
      useCookie:  true,
      redirectOn: 'root',
    },
  },

  fonts: {
    providers: {
      bunny:       false,
      fontshare:   false,
      google:      false,
      googleicons: false,
    },
  },
});
