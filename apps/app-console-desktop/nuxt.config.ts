import { fileURLToPath } from 'url';

export default defineNuxtConfig({
  extends: ['@tcg-cards/console-shell'],

  ssr:    false,
  srcDir: 'src',

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxt/icon'],

  devServer: {
    port: 1420,
  },

  vite: {
    optimizeDeps: {
      include: [
        // Tauri cold starts are more sensitive to Vite's late dependency discovery.
        // Pre-bundle the desktop app's first-screen client deps to avoid a dev-time full reload.
        '@tauri-apps/api/core',
        '@tauri-apps/api/window',
        '@tauri-apps/api/webviewWindow',
        '@orpc/client',
        '@orpc/client/fetch',
        'better-auth',
        'better-auth/client/plugins',
        'better-auth/vue',
        'better-auth/adapters/drizzle',
        'better-auth/plugins',
        'better-auth/plugins/access',
        'better-auth/plugins/admin/access',
        '@iconify/vue',
        '@iconify/utils/lib/css/icon',
      ],
    },
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
    provider:          'none',
    customCollections: [
      {
        prefix:    'i',
        dir:       fileURLToPath(new URL('./node_modules/@tcg-cards/ui/app/assets/icons', import.meta.url)),
        recursive: true,
      },
    ],
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
