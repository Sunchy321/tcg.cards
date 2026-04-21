<template>
  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
    <div class="text-xs text-gray-500 dark:text-white/50 sm:w-28 sm:pt-2 shrink-0">
      {{ label }}
    </div>

    <div class="min-w-0 flex-1">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
