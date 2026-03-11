<template>
  <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
    <div class="text-xs text-gray-500 dark:text-white/50 sm:w-28 sm:pt-2 shrink-0">
      {{ label }}
    </div>
    <div class="flex-1 min-w-0">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
