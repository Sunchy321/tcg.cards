import { fileURLToPath } from 'url';

export default defineNuxtConfig({
  extends: ['../../packages/ui'],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  devServer: { port: 3009 },

  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#7c2d12' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      mainSiteUrl: process.env.MAIN_SITE_URL ?? 'http://localhost:3000',
    },
  },

  alias: {
    '#shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2025-07-15',

  icon: {
    provider: 'server',
  },

  i18n: {
    defaultLocale: 'zhs',
    locales:       [
      { code: 'en', language: 'en-US', name: 'English' },
      { code: 'zhs', language: 'zh-CN', name: 'Chinese (Simplified)' },
    ],
    strategy: 'no_prefix',
  },

  fonts: {
    providers: {
      google:      false,
      googleicons: false,
    },
  },
});
