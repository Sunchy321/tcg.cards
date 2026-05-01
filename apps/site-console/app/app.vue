<script setup lang="ts">
import { provideConsolePlatform } from '@tcg-cards/console-platform';

import { useSiteConsolePlatform } from '~/composables/useConsolePlatform';

provideConsolePlatform(useSiteConsolePlatform());
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
