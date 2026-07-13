<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ title }}
        </h2>
        <slot name="header-extra" />
      </div>
    </template>
    <div class="flex flex-col gap-4">
      <slot />
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>
