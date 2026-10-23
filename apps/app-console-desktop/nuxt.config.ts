import { fileURLToPath } from 'node:url';
import { electronOptions } from './electron/options';

export default defineNuxtConfig({
  extends: ['@tcg-cards/console-shell', '@tcg-cards/ui'],
  ssr: false,
  srcDir: 'src',
  modules: ['nuxt-electron', '@nuxt/ui', '@nuxt/icon'],
  electron: electronOptions,
  devServer: { port: 1420 },
  css: ['~/assets/css/main.css'],
  router: { options: { hashMode: true } },
  nitro: {
    publicAssets: [
      { dir: fileURLToPath(new URL('./node_modules/@tcg-cards/ui/public', import.meta.url)), baseURL: '/' },
    ],
  },
  fonts: {
    providers: { google: false, googleicons: false, bunny: false, fontshare: false, fontsource: false },
  },
  icon: {
    provider: 'none',
    clientBundle: {
      // Layout icons are selected dynamically, so template scanning cannot discover them.
      icons: [
        'lucide:layout-dashboard', 'lucide:chevron-down', 'lucide:settings',
        'lucide:log-out', 'lucide:loader-circle', 'lucide:circle-alert',
      ],
      scan: {
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
