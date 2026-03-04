import { fileURLToPath } from 'url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxtjs/i18n',
  ],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  alias: {
    '#model': fileURLToPath(new URL('./node_modules/model/src', import.meta.url)),
  },

  routeRules: {
    '/': { prerender: true },
  },

  compatibilityDate: '2025-01-15',

  icon: {
    provider:          'server',
    customCollections: [
      {
        prefix:    'i',
        dir:       './app/assets/icons',
        recursive: true,
      },
    ],
  },
});
