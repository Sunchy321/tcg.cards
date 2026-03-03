<template>
  <div
    class="min-h-screen flex flex-col bg-linear-to-br"
    :class="props.ui?.full ?? ''"
  >
    <AppHeader />

    <UMain class="flex-1 flex items-center justify-center px-4 py-8 pt-18">
      <slot />
    </UMain>

    <AppFooter />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  ui?: {
    full?: string;
  };
}>();
</script>
