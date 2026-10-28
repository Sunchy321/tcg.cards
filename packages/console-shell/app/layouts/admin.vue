<template>
  <div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
    <aside class="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div class="flex h-14 shrink-0 items-center border-b border-gray-200 dark:border-gray-800">
        <UDropdownMenu
          v-if="showBrandGameSwitcher"
          :items="gameMenuItems"
          :content="{ align: 'start' }"
          :ui="{ content: 'min-w-56' }"
          class="w-full"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="h-14 w-full justify-start gap-2 rounded-none px-5 text-left text-sm font-semibold"
          >
            <UIcon :name="currentGameIcon" class="size-5 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-left">{{ currentGameLabel }}</span>
            <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-muted" />
          </UButton>
          <template #item="{ item }">
            <span class="flex w-full items-center gap-2">
              <UIcon :name="item.icon" class="size-4 shrink-0" />
              <span class="min-w-0 flex-1 truncate text-left">{{ item.label }}</span>
              <UIcon
                v-if="item.value === currentGame"
                name="i-lucide-check"
                class="size-4 text-primary"
              />
            </span>
          </template>
        </UDropdownMenu>
        <div v-else class="flex h-full items-center gap-2 px-5">
          <UIcon name="i-lucide-layout-dashboard" class="size-5 text-primary" />
          <span class="text-base font-semibold">Console</span>
        </div>
      </div>

      <nav class="flex flex-1 flex-col overflow-y-auto p-2">
        <template v-if="accessibleGames.length > 0">
          <div v-if="!showBrandGameSwitcher" class="px-2 py-2">
            <p class="mb-1.5 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">游戏数据</p>
            <USelect
              :model-value="currentGame ?? undefined"
              :items="gameSelectItems"
              size="sm"
              class="w-full"
              @update:model-value="void handleGameSelect($event as Game)"
            />
          </div>
          <SidebarNavMenu :items="gameNavItems" />
        </template>

        <template v-if="showUserManagement">
          <div
            v-if="accessibleGames.length > 0"
            class="mx-2 my-2 border-t border-gray-200 dark:border-gray-800"
          />
          <div class="px-2 py-2">
            <p class="mb-1 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">用户管理</p>
          </div>
          <SidebarNavMenu :items="userNavItems" />
        </template>

        <template v-if="devNavItems.length > 0">
          <div
            v-if="accessibleGames.length > 0 || showUserManagement"
            class="mx-2 my-2 border-t border-gray-200 dark:border-gray-800"
          />
          <div class="px-2 py-2">
            <p class="mb-1 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">开发</p>
          </div>
          <SidebarNavMenu :items="devNavItems" />
        </template>
      </nav>

      <div class="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800">
        <UButton
          icon="i-lucide-settings"
          label="设置"
          color="neutral"
          variant="ghost"
          class="w-full justify-start"
          to="/settings"
        />
      </div>
    </aside>

    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-900">
        <div class="flex-1">
          <slot name="header">
            <h1 class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ currentTitle }}
            </h1>
          </slot>
        </div>

        <div class="flex items-center gap-2">
          <component :is="headerRightComponent" v-if="headerRightComponent" />

          <span
            v-if="session"
            class="text-sm text-gray-500 dark:text-gray-400"
          >
            {{ userName }}
          </span>

          <UBadge
            v-if="session"
            :label="sessionRole"
            color="primary"
            variant="soft"
            size="sm"
          />

          <UButton
            v-if="session && host"
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            title="退出登录"
            :loading="signingOut"
            @click="void handleSignOut()"
          />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-6">
        <div v-if="initializing" class="flex h-full items-center justify-center">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-gray-500 dark:text-gray-400" />
        </div>

        <div v-else-if="session || host?.localGames" class="min-h-full">
          <slot />
        </div>

        <div v-else class="flex h-full flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-lock" class="size-10" />
          <p class="text-sm">Session unavailable</p>
          <UButton
            v-if="host?.initialize"
            label="Retry"
            :loading="initializing"
            @click="void initializeHost()"
          />
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :description="errorMessage"
          icon="i-lucide-circle-alert"
          class="mt-6"
        />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  GAME_LABELS,
  canManageUsers,
  getAccessibleGames,
  getDevNavItems,
  getGameNavItems,
  getGameSelectItems,
  getUserNavItems,
  resolveGameFromPath,
  type ConsoleNavLink,
} from '@tcg-cards/console-core';

import { useConsolePlatform } from '@tcg-cards/console-platform';

import { consoleAdminHostKey, consoleAdminStorageKeys } from '../composables/admin-host';

import { GAMES, type Game } from '@tcg-cards/base';

interface ConsoleSessionLike {
  user?: {
    name?: string | null;
    role?: string | null;
  } | null;
}

const route = useRoute();
const router = useRouter();
const platform = useConsolePlatform<ConsoleSessionLike>();
const host = inject(consoleAdminHostKey, null);

/** Optional Vue component injected by the consumer (desktop app) for the header right area. */
const headerRightComponent: any = inject('admin-header-right', null);

const initializing = ref(false);
const signingOut = ref(false);
const errorMessage = ref('');

const session = computed(() => platform.session.get());
const userRole = computed(() => session.value?.user?.role ?? null);
const userName = computed(() => session.value?.user?.name ?? 'Console User');
const sessionRole = computed(() => userRole.value ?? 'user');
const accessibleGames = computed(() => host?.localGames ?? getAccessibleGames(userRole.value));
const showUserManagement = computed(() => canManageUsers(userRole.value));
const gameSelectItems = computed(() => getGameSelectItems(accessibleGames.value));
const showBrandGameSwitcher = computed(() => host?.gameSwitcher?.placement === 'brand' && accessibleGames.value.length > 0);
const userNavItems = getUserNavItems();
const devNavItems = computed(() => {
  return getDevNavItems().filter(item => isRouteAccessible(item.to!));
});

/** Returns the last game stored by a host that enables game persistence. */
function readSavedGame(): Game | null {
  if (!host?.gameSwitcher?.persistSelection || typeof window === 'undefined') {
    return null;
  }

  try {
    const game = window.localStorage.getItem(consoleAdminStorageKeys.currentGame);
    return game && GAMES.includes(game as Game) && accessibleGames.value.includes(game as Game)
      ? game as Game
      : null;
  } catch {
    return null;
  }
}

const currentGame = useState<Game | null>('console-admin-current-game', () =>
  resolveGameFromPath(route.path) ?? readSavedGame() ?? accessibleGames.value[0] ?? null,
);

/** Icon for each game shown in the console switcher. */
const gameIcons: Record<Game, string> = {
  magic:       'i:magic-logo',
  hearthstone: 'i:hearthstone-logo',
  yugioh:      'i:yugioh-logo',
  shadowverse: 'i-lucide-sparkles',
};

const simplifiedChineseGameLabels: Record<Game, string> = {
  magic:       '万智牌',
  hearthstone: '炉石传说',
  yugioh:      '游戏王',
  shadowverse: '影之诗',
};
const gameLocale = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
  ? 'zhs'
  : 'en';

/** Returns a game name in the renderer's detected language. */
function getGameLabel(game: Game): string {
  return gameLocale === 'zhs' ? simplifiedChineseGameLabels[game] : GAME_LABELS[game];
}

const gameMenuItems = computed(() => accessibleGames.value.map(game => ({
  label:    getGameLabel(game),
  value:    game,
  icon:     gameIcons[game],
  onSelect: () => { void handleGameSelect(game); },
})));

const currentGameLabel = computed(() => currentGame.value ? getGameLabel(currentGame.value) : '游戏数据');
const currentGameIcon = computed(() => currentGame.value ? gameIcons[currentGame.value] : 'i-lucide-layout-dashboard');

watch(currentGame, game => {
  if (!host?.gameSwitcher?.persistSelection || !game || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(consoleAdminStorageKeys.currentGame, game);
  } catch {
    // Keep game navigation usable when local storage is unavailable.
  }
}, { immediate: true });

/** Drops links whose route is inaccessible; prunes groups that end up empty. */
function filterAccessibleNav(items: ConsoleNavLink[]): ConsoleNavLink[] {
  const result: ConsoleNavLink[] = [];

  for (const item of items) {
    if (item.children) {
      const children = filterAccessibleNav(item.children);
      if (children.length > 0) {
        result.push({ ...item, children });
      }
    } else if (item.to && isRouteAccessible(item.to)) {
      result.push(item);
    }
  }

  return result;
}

/** Flattens nested groups into a flat link list for the page-title lookup. */
function flattenNav(items: ConsoleNavLink[]): ConsoleNavLink[] {
  return items.flatMap(item => (item.children ? flattenNav(item.children) : [item]));
}

const gameNavItems = computed(() => {
  if (!currentGame.value) {
    return [];
  }

  return filterAccessibleNav(getGameNavItems(currentGame.value));
});

const currentTitle = computed(() => {
  const title = route.meta.title;

  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const items = [
    ...flattenNav(gameNavItems.value),
    ...flattenNav(userNavItems),
    ...flattenNav(devNavItems.value),
    { label: '设置', to: '/settings' },
  ];

  const match = items
    .filter(item => route.path === item.to || (item.to !== '/' && route.path.startsWith(`${item.to}/`)))
    .sort((a, b) => (b.to ?? '').length - (a.to ?? '').length)[0];

  return match?.label ?? '';
});

function syncCurrentGame(path: string) {
  const nextGame = resolveGameFromPath(path);

  if (nextGame && accessibleGames.value.includes(nextGame)) {
    currentGame.value = nextGame;
    return;
  }

  if (accessibleGames.value.length === 0) {
    currentGame.value = null;
    return;
  }

  if (!currentGame.value || !accessibleGames.value.includes(currentGame.value)) {
    currentGame.value = accessibleGames.value[0] ?? null;
  }
}

watch(() => route.path, syncCurrentGame, { immediate: true });

watch(accessibleGames, games => {
  if (games.length === 0) {
    currentGame.value = null;
    return;
  }

  if (!currentGame.value || !games.includes(currentGame.value)) {
    currentGame.value = games[0] ?? null;
  }
}, { immediate: true });

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

  if (getDevNavItems().flat().some(item => item.to === path)) {
    return true;
  }

  return path === '/' || path === '/settings';
}

function resolveGameSwitchPath(game: Game) {
  const activeGame = resolveGameFromPath(route.path);

  if (!activeGame) {
    return `/${game}`;
  }

  const suffix = route.path.slice(`/${activeGame}`.length);
  const candidate = `/${game}${suffix}`;
  return isRouteAccessible(candidate) ? candidate : `/${game}`;
}

async function handleGameSelect(game: Game) {
  if (!accessibleGames.value.includes(game)) {
    return;
  }

  currentGame.value = game;
  await platform.router.push(resolveGameSwitchPath(game));
}

async function initializeHost() {
  if (!host?.initialize || initializing.value) {
    return;
  }

  initializing.value = true;
  errorMessage.value = '';

  try {
    await host.initialize();
  } catch (error) {
    console.error('Failed to initialize console admin shell:', error);
    errorMessage.value = error instanceof Error ? error.message : '初始化后台布局失败';
  } finally {
    initializing.value = false;
  }
}

async function handleSignOut() {
  if (!host || signingOut.value) {
    return;
  }

  signingOut.value = true;
  errorMessage.value = '';

  try {
    await host.signOut();
  } catch (error) {
    console.error('Failed to sign out from console admin shell:', error);
    errorMessage.value = error instanceof Error ? error.message : '退出登录失败';
  } finally {
    signingOut.value = false;
  }
}

onMounted(() => {
  if (host?.initialize) {
    void initializeHost();
  }
});
</script>
