<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { GAMES } from '@tcg-cards/base';
import { provideConsolePlatform } from '@tcg-cards/console-platform';
import { createConsoleAdminHost, provideConsoleAdminHost } from '@tcg-cards/console-shell/app/composables/admin-host';
import { markRaw } from 'vue';

import { useDesktopPlatform } from './composables/useDesktopPlatform';
import GlobalTasks from './components/GlobalTasks.vue';
import { useTasks } from './composables/useTasks';

provideConsolePlatform(useDesktopPlatform());
provide('admin-header-right', markRaw(GlobalTasks));
provideConsoleAdminHost(
  createConsoleAdminHost({
    localGames: GAMES,
    async signOut() {},
  }),
);

const router = useRouter();
let unsubscribe: (() => void) | undefined;
onMounted(() => {
  useTasks().listen();
  unsubscribe = window.desktop.onOpenSettings(() => {
    void router.push('/settings');
  });
});
onBeforeUnmount(() => unsubscribe?.());
</script>
