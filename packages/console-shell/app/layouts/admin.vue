<template>
  <div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
    <aside class="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div class="flex h-14 items-center gap-2 border-b border-gray-200 px-5 dark:border-gray-800">
        <UIcon name="i-lucide-layout-dashboard" class="size-5 text-primary" />
        <span class="text-base font-semibold">Console</span>
      </div>

      <nav class="flex flex-1 flex-col overflow-y-auto p-2">
        <template v-if="accessibleGames.length > 0">
          <div class="px-2 py-2">
            <p class="mb-1.5 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">游戏数据</p>
            <USelect
              :model-value="currentGame ?? undefined"
              :items="gameSelectItems"
              size="sm"
              class="w-full"
              @update:model-value="void handleGameSelect($event as Game)"
            />
          </div>
          <UNavigationMenu :items="gameNavItems" orientation="vertical" class="w-full" />
        </template>

        <template v-if="showUserManagement">
          <div class="px-2 py-2">
            <p class="mb-1 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">用户管理</p>
          </div>
          <UNavigationMenu :items="userNavItems" orientation="vertical" class="w-full" />
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

        <div v-else-if="session" class="min-h-full">
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
  canManageUsers,
  getAccessibleGames,
  getGameNavItems,
  getGameSelectItems,
  getUserNavItems,
  resolveGameFromPath,
} from '@tcg-cards/console-core';

import { useConsolePlatform } from '@tcg-cards/console-platform';

import { consoleAdminHostKey } from '../composables/admin-host';

import type { Game } from '@tcg-cards/shared';

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
const accessibleGames = computed(() => getAccessibleGames(userRole.value));
const showUserManagement = computed(() => canManageUsers(userRole.value));
const gameSelectItems = computed(() => getGameSelectItems(accessibleGames.value));
const userNavItems = getUserNavItems();

const currentGame = useState<Game | null>('console-admin-current-game', () =>
  resolveGameFromPath(route.path) ?? accessibleGames.value[0] ?? null,
);

const gameNavItems = computed(() => {
  if (!currentGame.value) {
    return [];
  }

  return getGameNavItems(currentGame.value)
    .map(group => group.filter(item => isRouteAccessible(item.to)))
    .filter(group => group.length > 0);
});

const currentTitle = computed(() => {
  const title = route.meta.title;

  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const items = [
    ...gameNavItems.value.flat(),
    ...userNavItems.flat(),
    { label: '设置', to: '/settings' },
  ];

  const match = items
    .filter(item => route.path === item.to || (item.to !== '/' && route.path.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];

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
