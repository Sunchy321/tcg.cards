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
import { useSiteConsolePlatform } from '~/composables/useConsolePlatform';
import { useSiteConsoleAdminHost } from '~/composables/useConsoleAdminHost';

provideConsolePlatform(useSiteConsolePlatform());
provideConsoleAdminHost(useSiteConsoleAdminHost());
</script>
