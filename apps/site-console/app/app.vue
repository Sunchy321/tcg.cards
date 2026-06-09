<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { provideConsolePlatform } from '@tcg-cards/console-platform';

import { provideConsoleAdminHost } from '@tcg-cards/console-shell/app/composables/admin-host';
import { provideConsoleFieldSyncHost } from '@tcg-cards/console-shell/app/composables/field-sync-host';
import { useSiteConsoleFieldSyncHost } from '~/composables/useConsoleFieldSyncHost';
import { useSiteConsolePlatform } from '~/composables/useConsolePlatform';
import { useSiteConsoleAdminHost } from '~/composables/useConsoleAdminHost';

const platform = useSiteConsolePlatform();

provideConsolePlatform(platform);
provideConsoleAdminHost(useSiteConsoleAdminHost());
provideConsoleFieldSyncHost(useSiteConsoleFieldSyncHost(platform.api));
</script>
