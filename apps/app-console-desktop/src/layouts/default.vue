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
            @update:model-value="void handleGameSelect($event as string)"
          />
          </div>
          <UNavigationMenu :items="navItems" orientation="vertical" class="w-full" />
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
          <h1 class="text-sm font-medium text-gray-500 dark:text-gray-400">
            {{ currentTitle }}
          </h1>
        </div>

        <div class="flex items-center gap-2">
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
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            title="退出登录"
            :loading="submitting"
            @click="handleSignOut"
          />
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div v-if="loading" class="flex h-full items-center justify-center">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-gray-500 dark:text-gray-400" />
        </div>

        <div v-else-if="session" class="min-h-full">
          <slot />
        </div>

        <div v-else class="flex h-full flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
          <UIcon name="i-lucide-lock" class="size-10" />
          <p class="text-sm">Session unavailable</p>
          <UButton label="Retry" :loading="loading" @click="refreshSession" />
        </div>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="soft"
          :description="errorMsg"
          icon="i-lucide-circle-alert"
          class="m-6"
        />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isAdminRole } from '@tcg-cards/auth';
import {
  canManageUsers,
  getAccessibleGames,
  getGameNavItems,
  getGameSelectItems,
  getUserNavItems,
  resolveGameFromPath,
  type Game,
} from '@tcg-cards/console-core';

import { currentAuthState, getSession, signOut } from '../auth';
import { ensureLoginWindow } from '../windows';

const LAST_GAME_KEY = 'console-desktop-last-game';
const LAST_ROUTE_KEY = 'console-desktop-last-route';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const submitting = ref(false);
const errorMsg = ref('');
const hasRestoredState = ref(false);

const session = computed(() => currentAuthState.value);
const userRole = computed(() => session.value?.user.role ?? null);
const userName = computed(() => session.value?.user.name ?? 'Console User');
const accessibleGames = computed(() => getAccessibleGames(userRole.value));
const showUserManagement = computed(() => canManageUsers(userRole.value));
const gameSelectItems = computed(() => getGameSelectItems(accessibleGames.value));

const currentGame = ref<Game | null>(null);
const navItems = computed(() => currentGame.value ? getGameNavItems(currentGame.value) : []);
const userNavItems = computed(() => getUserNavItems());
const sessionRole = computed(() => session.value?.user.role ?? 'user');

const currentTitle = computed(() => {
  const title = route.meta.title;
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const items = [
    ...navItems.value.flat(),
    ...userNavItems.value.flat(),
    { label: '设置', to: '/settings' },
  ];

  const match = items
    .filter(item => route.path === item.to || (item.to !== '/' && route.path.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return match?.label ?? '';
});

function loadStoredGame(): Game | null {
  const value = localStorage.getItem(LAST_GAME_KEY);
  return accessibleGames.value.find(game => game === value) ?? null;
}

function saveStoredGame(game: Game | null) {
  if (!game) {
    localStorage.removeItem(LAST_GAME_KEY);
    return;
  }

  localStorage.setItem(LAST_GAME_KEY, game);
}

function loadStoredRoute(): string | null {
  const value = localStorage.getItem(LAST_ROUTE_KEY);
  return value && value.startsWith('/') ? value : null;
}

function saveStoredRoute(path: string) {
  localStorage.setItem(LAST_ROUTE_KEY, path);
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

function resolveGameSwitchPath(game: Game) {
  const activeGame = resolveGameFromPath(route.path);

  if (!activeGame) {
    return route.path;
  }

  const suffix = route.path.slice(`/${activeGame}`.length);
  const candidate = `/${game}${suffix}`;
  return isRouteAccessible(candidate) ? candidate : `/${game}`;
}

function persistState() {
  saveStoredRoute(route.path);
  saveStoredGame(currentGame.value);
}

async function switchToLoginWindow() {
  await ensureLoginWindow();
  await getCurrentWindow().close();
}

async function refreshSession() {
  loading.value = true;
  errorMsg.value = '';

  try {
    const next = await getSession();

    if (!next) {
      currentAuthState.value = null;
      await switchToLoginWindow();
      return;
    }

    if (!isAdminRole(next.user.role)) {
      await signOut();
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
    persistState();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : 'Failed to restore session';
  } finally {
    loading.value = false;
  }
}

async function handleSignOut() {
  submitting.value = true;
  errorMsg.value = '';

  try {
    await signOut();
    currentAuthState.value = null;
    await switchToLoginWindow();
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : 'Failed to sign out';
  } finally {
    submitting.value = false;
  }
}

async function handleGameSelect(value: string) {
  const game = accessibleGames.value.find(item => item === value);
  if (!game) {
    return;
  }

  currentGame.value = game;

  const nextPath = resolveGameSwitchPath(game);
  if (nextPath !== route.path) {
    await router.push(nextPath);
  }
}

onMounted(async () => {
  await refreshSession();
});

watch(
  () => route.path,
  path => {
    if (!hasRestoredState.value) {
      return;
    }

    resolveActiveGame(path);
    persistState();
  },
);

watch(currentGame, game => {
  if (!hasRestoredState.value) {
    return;
  }

  saveStoredGame(game);
});
</script>
