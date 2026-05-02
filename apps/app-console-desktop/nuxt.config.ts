export default defineNuxtConfig({
  extends: ['@tcg-cards/console-shell'],

  ssr: false,
  srcDir: 'src',

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devServer: {
    port: 1420,
  },

  css: ['./src/style.css'],

  router: {
    options: {
      hashMode: true,
    },
  },

  fonts: {
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
    },
  },

  compatibilityDate: '2026-05-01',
});
