import { fileURLToPath } from 'url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['../../packages/ui'],

  modules: ['nitro-cloudflare-dev', '@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  devServer: { port: 2999 },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      meta: [
        { name: 'theme-color', content: '#4f46e5' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  alias: {
    '#shared': fileURLToPath(new URL('./node_modules/@tcg-cards/shared/src', import.meta.url)),
    '#model':  fileURLToPath(new URL('./node_modules/@tcg-cards/model/src', import.meta.url)),
    '#search': fileURLToPath(new URL('./node_modules/@tcg-cards/search/src', import.meta.url)),
    '#schema': fileURLToPath(new URL('./server/db/schema', import.meta.url)),
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

  // i18n: {
  //   defaultLocale: 'en',
  //   locales:       [
  //     { code: 'en', language: 'en-US', name: 'English', file: 'en/index.ts' },
  //     { code: 'zhs', language: 'zh-CN', name: 'Chinese (Simplified)', file: 'zhs/index.ts' },
  //   ],
  //   strategy:              'no_prefix',
  //   detectBrowserLanguage: {
  //     useCookie:  true,
  //     redirectOn: 'root',
  //   },
  // },

  i18n: {
    defaultLocale: 'en',
    strategy:      'no_prefix',
  },

  fonts: {
    providers: {
      google:      false,
      googleicons: false,
    },
  },
});
