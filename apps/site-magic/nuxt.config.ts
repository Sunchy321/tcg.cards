import { fileURLToPath } from 'url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['../../packages/ui'],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  alias: {
    '#model':  fileURLToPath(new URL('./node_modules/@tcg-cards/model/src', import.meta.url)),
    '#schema': fileURLToPath(new URL('./server/db/schema', import.meta.url)),
    '#search': fileURLToPath(new URL('./search', import.meta.url)),
  },

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

  fonts: {
    providers: {
      google:      false,
      googleicons: false,
    },
  },
});
