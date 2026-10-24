import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { developmentIdentity, electronOptions } from './electron/options';

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
    devHandlers: [{
      route: '/__desktop_identity',
      handler: (event) => {
        const challenge = new URL(event.node.req.url ?? '/', 'http://localhost').searchParams.get('challenge') ?? '';
        event.node.res.setHeader('Cache-Control', 'no-store');
        event.node.res.end(/^[a-f0-9]{64}$/.test(challenge) ? createHmac('sha256', developmentIdentity).update(challenge).digest('hex') : '');
      },
    }],
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
        'lucide:database', 'lucide:folder-tree', 'lucide:sparkles', 'lucide:upload',
      ],
      scan: {
        // The local collection is already bundled in full; scanning its `i:` prefix
        // would confuse it with Nuxt Icon's optional icon-name prefix.
        ignoreCollections: ['i'],
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
