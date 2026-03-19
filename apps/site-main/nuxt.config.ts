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

  fonts: {
    providers: {
      google:      false,
      googleicons: false,
    },
  },
});
