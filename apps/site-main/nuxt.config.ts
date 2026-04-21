import { fileURLToPath } from 'url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['../../packages/ui'],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  devServer: { port: 3000 },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      meta: [
        { name: 'theme-color', content: '#0284c7' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      gameBaseUrls: {
        hearthstone: process.env.HEARTHSTONE_BASE_URL ?? 'http://localhost:3002',
        magic:       process.env.MAGIC_BASE_URL ?? 'https://magic.tcg.cards',
        yugioh:      process.env.YUGIOH_BASE_URL ?? 'https://yugioh.tcg.cards',
        ptcg:        process.env.PTCG_BASE_URL ?? 'https://ptcg.tcg.cards',
        lorcana:     process.env.LORCANA_BASE_URL ?? 'https://lorcana.tcg.cards',
      },
    },
  },

  alias: {
    '#shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    '#app-ui': fileURLToPath(new URL('../../packages/ui/app', import.meta.url)),
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true },
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
