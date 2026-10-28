import { GAMES, type Game } from '@tcg-cards/base';
import { consoleAdminStorageKeys } from '@tcg-cards/console-shell/app/composables/admin-host';
import { useRouter } from 'vue-router';

const LAST_ROUTE_KEY = 'console-desktop-last-route';

/** Persists desktop navigation and restores the last valid route on startup. */
export function useDesktopNavigationState() {
  const router = useRouter();

  /** Reads the stored game when it still matches a supported game. */
  function readLastGame(): Game | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const game = window.localStorage.getItem(consoleAdminStorageKeys.currentGame);
      return game && GAMES.includes(game as Game) ? game as Game : null;
    } catch {
      return null;
    }
  }

  /** Returns a saved route only when it remains an internal, registered route. */
  function readLastRoute(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const path = window.localStorage.getItem(LAST_ROUTE_KEY);
      if (!path || !path.startsWith('/') || path.startsWith('//')) {
        return null;
      }

      return router.resolve(path).matched.length > 0 ? path : null;
    } catch {
      return null;
    }
  }

  /** Stores an internal route, including its query and hash. */
  function saveRoute(path: string) {
    if (typeof window === 'undefined' || !path.startsWith('/') || path.startsWith('//')) {
      return;
    }

    try {
      window.localStorage.setItem(LAST_ROUTE_KEY, path);
    } catch {
      // Keep navigation usable when local storage is unavailable.
    }
  }

  /** Restores the last valid page or falls back to the last selected game. */
  async function restoreLastRoute() {
    if (router.currentRoute.value.path !== '/') {
      return;
    }

    const path = readLastRoute() ?? `/${readLastGame() ?? GAMES[0]}`;
    await router.replace(router.resolve(path).matched.length > 0 ? path : `/${GAMES[0]}`);
  }

  /** Tracks route changes and reuses the saved destination when navigation returns to root. */
  function trackRoutes() {
    const stop = router.afterEach(to => {
      if (to.path === '/') {
        void restoreLastRoute();
        return;
      }

      saveRoute(to.fullPath);
    });

    const currentPath = router.currentRoute.value;
    if (currentPath.path !== '/') {
      saveRoute(currentPath.fullPath);
    }

    return stop;
  }

  return { restoreLastRoute, trackRoutes };
}
