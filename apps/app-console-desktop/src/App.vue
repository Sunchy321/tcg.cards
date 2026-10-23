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

import { useDesktopPlatform } from './composables/useDesktopPlatform';

provideConsolePlatform(useDesktopPlatform());
provideConsoleAdminHost(createConsoleAdminHost({
  localGames: GAMES,
  async signOut() {},
}));
</script>
