import { getCurrentWindow } from '@tauri-apps/api/window';
import { isAdminRole } from '@tcg-cards/auth';
import {
  canManageUsers,
  getAccessibleGames,
  resolveGameFromPath,
  type Game,
} from '@tcg-cards/console-core';
import type { ConsoleStorage } from '@tcg-cards/console-platform';

import { currentAuthState, getSession, signOut as desktopSignOut } from '../auth';
import { ensureLoginWindow } from '../windows';

const LAST_GAME_KEY = 'console-desktop-last-game';
const LAST_ROUTE_KEY = 'console-desktop-last-route';

export function useDesktopConsoleAdminHost(storage: ConsoleStorage) {
  const route = useRoute();
  const router = useRouter();
  const currentGame = useState<Game | null>('console-admin-current-game', () => null);
  const hasRestoredState = ref(false);

  const userRole = computed(() => currentAuthState.value?.user.role ?? null);
  const accessibleGames = computed(() => getAccessibleGames(userRole.value));
  const showUserManagement = computed(() => canManageUsers(userRole.value));

  function loadStoredGame(): Game | null {
    const value = storage.get(LAST_GAME_KEY);
    return accessibleGames.value.find(game => game === value) ?? null;
  }

  function saveStoredGame(game: Game | null) {
    if (!game) {
      storage.remove(LAST_GAME_KEY);
      return;
    }

    storage.set(LAST_GAME_KEY, game);
  }

  function loadStoredRoute(): string | null {
    const value = storage.get(LAST_ROUTE_KEY);
    return value && value.startsWith('/') ? value : null;
  }

  function saveStoredRoute(path: string) {
    storage.set(LAST_ROUTE_KEY, path);
  }

  function isRouteAccessible(path: string) {
    if (router.resolve(path).matched.length === 0) {
      return false;
    }

    const game = resolveGameFromPath(path);

    if (game) {
      return accessibleGames.value.includes(game);
    }

    if (path === '/user') {
      return showUserManagement.value;
    }

    return path === '/' || path === '/settings';
  }

  function resolveActiveGame(path: string) {
    const fromPath = resolveGameFromPath(path);

    if (fromPath && accessibleGames.value.includes(fromPath)) {
      currentGame.value = fromPath;
      return;
    }

    const savedGame = loadStoredGame();
    if (savedGame) {
      currentGame.value = savedGame;
      return;
    }

    currentGame.value = accessibleGames.value[0] ?? null;
  }

  function resolveInitialPath() {
    const savedRoute = loadStoredRoute();
    if (savedRoute && isRouteAccessible(savedRoute)) {
      return savedRoute;
    }

    const savedGame = loadStoredGame();
    if (savedGame) {
      return `/${savedGame}`;
    }

    if (isRouteAccessible(route.path)) {
      return route.path;
    }

    return accessibleGames.value[0] ? `/${accessibleGames.value[0]}` : '/settings';
  }

  async function switchToLoginWindow() {
    await ensureLoginWindow();
    await getCurrentWindow().close();
  }

  watch(
    () => route.path,
    path => {
      if (!hasRestoredState.value) {
        return;
      }

      resolveActiveGame(path);
      saveStoredRoute(path);
      saveStoredGame(currentGame.value);
    },
  );

  watch(currentGame, game => {
    if (!hasRestoredState.value) {
      return;
    }

    saveStoredGame(game);
  });

  return createConsoleAdminHost({
    async initialize() {
      const next = await getSession();

      if (!next) {
        currentAuthState.value = null;
        await switchToLoginWindow();
        return;
      }

      if (!isAdminRole(next.user.role)) {
        await desktopSignOut();
        currentAuthState.value = null;
        await switchToLoginWindow();
        return;
      }

      currentAuthState.value = next;

      const nextPath = resolveInitialPath();
      if (nextPath !== route.path) {
        await router.replace(nextPath);
      }

      resolveActiveGame(nextPath);
      hasRestoredState.value = true;
      saveStoredRoute(nextPath);
      saveStoredGame(currentGame.value);
    },

    async signOut() {
      await desktopSignOut();
      currentAuthState.value = null;
      await switchToLoginWindow();
    },
  });
}
