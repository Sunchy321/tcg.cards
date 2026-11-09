<template>
  <div class="space-y-1">
    <template v-for="item in items" :key="item.label">
      <template v-if="item.children">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          @click="toggle(item.label)"
        >
          <UIcon :name="item.icon" class="size-4" />
          <span class="flex-1 text-left">{{ item.label }}</span>
          <UIcon
            :name="isOpen(item.label) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-4"
          />
        </button>
        <div v-if="isOpen(item.label)" class="mt-1 space-y-1">
          <UButton
            v-for="child in item.children"
            :key="child.label"
            :to="child.to"
            color="neutral"
            :variant="isActive(child.to) ? 'soft' : 'ghost'"
            class="w-full justify-start pl-8"
          >
            <UIcon :name="child.icon" class="size-4" />
            {{ child.label }}
          </UButton>
        </div>
      </template>

      <UButton
        v-else
        :to="item.to"
        color="neutral"
        :variant="isActive(item.to) ? 'soft' : 'ghost'"
        class="w-full justify-start"
      >
        <UIcon :name="item.icon" class="size-4" />
        {{ item.label }}
      </UButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ConsoleNavLink } from '@tcg-cards/console-core';

const props = defineProps<{
  items: ConsoleNavLink[];
}>();

const route = useRoute();

const openLabels = ref(new Set<string>());

watch(() => props.items, items => {
  const next = new Set(openLabels.value);
  for (const item of items) {
    if (item.children) {
      next.add(item.label);
    }
  }
  openLabels.value = next;
}, { immediate: true });

function isOpen(label: string) {
  return openLabels.value.has(label);
}

function toggle(label: string) {
  const next = new Set(openLabels.value);
  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }
  openLabels.value = next;
}

function isActive(to?: string) {
  if (!to) {
    return false;
  }
  return route.path === to || (to !== '/' && route.path.startsWith(`${to}/`));
}
</script>
