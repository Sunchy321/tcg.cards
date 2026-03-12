<template>
  <div
    class="min-h-screen flex flex-col bg-linear-to-br"
    :class="props.ui?.full ?? ''"
  >
    <AppHeader>
      <template #right-end>
        <UserMenu />
      </template>
    </AppHeader>

    <UMain class="flex-1 container mx-auto items-center justify-center px-4 py-8">
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
