<template>
  <div />
</template>

<script setup lang="ts">
import { GAMES } from '@tcg-cards/base';

definePageMeta({ layout: 'admin' });
// Navigate after mounting so the page does not hold its own Suspense transition open.
onMounted(() => {
  void navigateTo(`/${GAMES[0]}`, { replace: true });
});
</script>
