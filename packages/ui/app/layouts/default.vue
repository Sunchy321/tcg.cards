<template>
  <div
    class="h-dvh flex flex-col overflow-hidden bg-linear-to-br"
    :class="props.ui?.full ?? ''"
  >
    <AppHeader />

    <UMain class="flex-1 overflow-y-auto container mx-auto items-center justify-center px-4 py-8">
      <slot />
    </UMain>

    <AppFooter v-if="!props.noFooter" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  ui?: {
    full?: string;
  };
  noFooter?: boolean;
}>();
</script>
