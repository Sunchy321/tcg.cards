<template>
  <div class="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
    <!-- Sidebar -->
    <aside
      class="flex w-60 flex-shrink-0 flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
    >
      <!-- Logo -->
      <div class="flex h-14 items-center gap-2 px-5 border-b border-gray-200 dark:border-gray-800">
        <UIcon name="i-lucide-layout-dashboard" class="size-5 text-primary" />
        <span class="text-base font-semibold">Console</span>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto p-2">
        <UNavigationMenu :items="navItems" orientation="vertical" class="w-full" />
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
            {{ (session.user as any).username ?? session.user.name }}
          </span>

          <UBadge
            v-if="session"
            :label="(session.user as any).role ?? 'user'"
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
import { authClient } from '~/composables/auth';

const route = useRoute();

const currentTitle = computed(() => String(route.meta.title ?? ''));

const { data: session } = authClient.useSession();

const signingOut = ref(false);

async function signOut() {
  signingOut.value = true;
  await authClient.signOut();
  await navigateTo('/login');
}

const navItems = [
  [
    {
      label: '概览',
      icon:  'i-lucide-layout-dashboard',
      to:    '/',
      exact: true,
    },
  ],
  [
    {
      label: '卡牌',
      icon:  'i-lucide-layers',
      to:    '/card',
    },
    {
      label: '系列',
      icon:  'i-lucide-folder-open',
      to:    '/set',
    },
    {
      label: '格式',
      icon:  'i-lucide-shield-check',
      to:    '/format',
    },
  ],
  [
    {
      label: '用户',
      icon:  'i-lucide-users',
      to:    '/user',
    },
  ],
];
</script>
