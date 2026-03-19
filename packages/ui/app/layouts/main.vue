<template>
  <Default :ui="{ full: 'from-[var(--color-theme-from)] via-[var(--color-theme-via)] to-[var(--color-theme-to)]' }">
    <slot />
  </Default>
</template>

<script setup lang="ts">
import Default from './default.vue';
</script>
