<template>
  <div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
    <!-- Sidebar -->
    <aside
      class="flex w-60 shrink-0 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
    >
      <!-- Logo -->
      <div class="flex h-14 items-center gap-2 px-5 border-b border-gray-200 dark:border-gray-800">
        <UIcon name="i-lucide-layout-dashboard" class="size-5 text-primary" />
        <span class="text-base font-semibold">Console</span>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto p-2 flex flex-col">
        <!-- Game management section -->
        <template v-if="accessibleGames.length > 0">
          <div class="px-2 py-2">
            <p class="mb-1.5 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">游戏数据</p>
            <USelect
              v-model="currentGame"
              :items="gameSelectItems"
              size="sm"
              class="w-full"
              @update:model-value="handleGameSelect"
            />
          </div>
          <UNavigationMenu :items="gameNavItems" orientation="vertical" class="w-full" />
        </template>

        <!-- User management section -->
        <template v-if="canManageUsers">
          <div class="px-2 py-2">
            <p class="mb-1 px-1 text-xs font-medium text-gray-400 dark:text-gray-500">用户管理</p>
          </div>
          <UNavigationMenu :items="userNavItems" orientation="vertical" class="w-full" />
        </template>
      </nav>

      <!-- Bottom area -->
      <div class="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
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

    <!-- Main area -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Header -->
      <header
        class="flex h-14 items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6"
      >
        <div class="flex-1">
          <slot name="header">
            <h1 class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ currentTitle }}
            </h1>
          </slot>
        </div>

        <div class="flex items-center gap-2">
          <span
            v-if="session"
            class="text-sm text-gray-500 dark:text-gray-400"
          >
            {{ session.data?.user?.name }}
          </span>

          <UBadge
            v-if="session"
            :label="session.data?.user?.role ?? 'user'"
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
            :loading="signingOut"
            @click="signOut"
          />
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GAMES } from '#shared';
import { authClient } from '~/composables/auth';
import { GAME_LABELS, useCurrentGame } from '~/composables/game';

const route = useRoute();

const currentTitle = computed(() => String(route.meta.title ?? ''));

const session = authClient.useSession();

const signingOut = ref(false);

async function signOut() {
  signingOut.value = true;
  await authClient.signOut();
  await navigateTo('/login');
}

const role = computed(() => (session.value.data?.user as { role?: string } | undefined)?.role ?? null);

// owner can manage all games; admin/xxx can only manage game xxx
const accessibleGames = computed<string[]>(() => {
  const r = role.value;
  if (!r) return [];
  if (r === 'owner') return [...GAMES];
  if (r.startsWith('admin/')) {
    const game = r.slice('admin/'.length);
    if ((GAMES as readonly string[]).includes(game)) return [game];
  }
  return [];
});

const canManageUsers = computed(() => {
  const r = role.value;
  return r === 'owner' || r === 'admin';
});

const currentGame = useCurrentGame();

function handleGameSelect(value: string) {
  void navigateTo(`/${value}`);
}

// When accessible games change, ensure currentGame is still valid
watch(accessibleGames, games => {
  if (games.length > 0 && !games.includes(currentGame.value)) {
    currentGame.value = games[0] as typeof currentGame.value;
  }
}, { immediate: true });

const gameSelectItems = computed(() =>
  accessibleGames.value.map(g => ({
    label: GAME_LABELS[g as keyof typeof GAME_LABELS] ?? g,
    value: g,
  })),
);

const gameNavItems = computed(() => [
  [
    {
      label: '概览',
      icon:  'i-lucide-layout-dashboard',
      to:    `/${currentGame.value}`,
      exact: true,
    },
    {
      label: '数据源',
      icon:  'i-lucide-database',
      to:    `/${currentGame.value}/data-source`,
    },
    {
      label: '数据导入',
      icon:  'i-lucide-download',
      to:    `/${currentGame.value}/data-import`,
    },
    ...(currentGame.value === 'hearthstone'
      ? [
        {
          label: '图片',
          icon:  'i-lucide-image',
          to:    `/${currentGame.value}/image`,
        },
        {
          label: '标签',
          icon:  'i-lucide-tags',
          to:    `/${currentGame.value}/tag`,
        },
      ]
      : []),
    {
      label: '卡牌',
      icon:  'i-lucide-layers',
      to:    `/${currentGame.value}/card`,
    },
    {
      label: '系列',
      icon:  'i-lucide-folder-open',
      to:    `/${currentGame.value}/set`,
    },
    {
      label: '赛制',
      icon:  'i-lucide-shield-check',
      to:    `/${currentGame.value}/format`,
    },
    {
      label: '公告',
      icon:  'i-lucide-megaphone',
      to:    `/${currentGame.value}/announcement`,
    },
    ...(currentGame.value === 'magic'
      ? [
        {
          label: '规则',
          icon:  'i-lucide-book-open',
          to:    `/${currentGame.value}/rule`,
        },
      ]
      : []),
  ],
]);

const userNavItems = [
  [
    {
      label: '用户',
      icon:  'i-lucide-users',
      to:    '/user',
    },
  ],
];
</script>
