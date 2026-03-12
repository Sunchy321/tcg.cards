<template>
  <UCard>
    <template #header>
      <h2 class="text-base font-semibold text-gray-900 dark:text-white">
        {{ title }}
      </h2>
    </template>
    <div class="flex flex-col gap-4">
      <slot />
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>
