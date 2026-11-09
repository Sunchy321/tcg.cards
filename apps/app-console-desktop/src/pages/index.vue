<template>
  <div />
</template>

<script setup lang="ts">
import { useDesktopNavigationState } from '../composables/useDesktopNavigationState';

definePageMeta({ layout: 'admin' });
const desktopNavigation = useDesktopNavigationState();

/** Restores the last destination instead of always starting at the first game. */
onMounted(() => {
  void desktopNavigation.restoreLastRoute();
});
</script>
