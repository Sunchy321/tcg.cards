import { fileURLToPath } from 'url';

export default defineNuxtConfig({
  extends: ['../../packages/ui'],

  modules: ['nitro-cloudflare-dev', '@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  devServer: { port: 2996 },

  app: {
    head: {
      title: 'TCG.CARDS API Documentation',
      meta:  [
        { name: 'theme-color', content: '#0f6d6d' },
      ],
    },
  },

  experimental: {
    typedPages: true,
  },

  runtimeConfig: {
    public: {
      assetBaseUrl: process.env.ASSET_BASE_URL ?? 'https://asset.tcg.cards',
    },
  },

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
    '/':         { redirect: { to: '/v1', statusCode: 302 } },
    '/v1/**':    { prerender: true },
    '/settings': { ssr: true },
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
    provider: 'server',
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
      google:      false,
      googleicons: false,
    },
  },
});
