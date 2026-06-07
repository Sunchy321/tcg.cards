<template>
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
    <label class="text-gray-700 dark:text-gray-300 text-sm font-medium shrink-0">{{ label }}</label>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
</script>
