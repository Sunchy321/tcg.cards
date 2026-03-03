<template>
  <Default
    :ui="{
      full: 'from-indigo-500 via-purple-500 to-purple-600'
    }"
  >
    <slot />
  </Default>
</template>

<script setup lang="ts">
import Default from './default.vue';
</script>
