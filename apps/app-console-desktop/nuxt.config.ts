export default defineNuxtConfig({
  extends: ['@tcg-cards/console-shell'],

  ssr:    false,
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
      google:      false,
      googleicons: false,
      bunny:       false,
      fontshare:   false,
      fontsource:  false,
    },
  },

  icon: {
    provider:     'none',
    clientBundle: {
      scan: {
        globExclude: ['dist', 'build', 'coverage', 'test', 'tests', '.*'],
        globInclude: [
          'src/**/*.{vue,ts}',
          'node_modules/@tcg-cards/console-core/src/**/*.{vue,ts}',
          'node_modules/@tcg-cards/console-shell/app/**/*.{vue,ts}',
          'node_modules/@nuxt/ui/dist/**/*.{js,mjs,ts}',
        ],
      },
    },
  },

  compatibilityDate: '2026-05-01',
});
