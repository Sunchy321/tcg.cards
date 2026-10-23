/**
 * Replays the recovery a browser gets for free from Vite's HMR full-reload.
 *
 * On a cold dev start the Tauri webview can load modules with mixed optimizeDeps
 * browserHashes before the HMR websocket is ready, duplicating `vue` and breaking
 * the unhead injection context. The colors plugin then throws "useHead() was called
 * without provide context" during bootstrap. A regular browser auto-reloads to
 * recover; the webview misses the signal, so reload once here. `pre` order runs
 * before the failing plugins so the `app:error` hook is registered in time.
 */
export default defineNuxtPlugin({
  enforce: 'pre',
  setup(nuxtApp) {
    if (!import.meta.dev) {
      return;
    }

    let retried = false;

    nuxtApp.hook('app:error', (error) => {
      if (retried) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('useHead() was called without provide context')) {
        return;
      }

      retried = true;
      setTimeout(() => window.location.reload(), 0);
    });
  },
});
