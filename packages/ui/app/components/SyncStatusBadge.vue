<template>
  <span
    v-if="status"
    class="inline-flex items-center gap-1 text-xs"
    :class="statusClass"
  >
    <UIcon
      :name="icon"
      :class="{ 'animate-spin': status === 'syncing' }"
      class="text-xs"
    />
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ status: string | null }>();

const icon = computed(() => {
  switch (props.status) {
    case 'synced': return 'lucide:check';
    case 'syncing': return 'lucide:loader';
    case 'unsaved': return 'lucide:cloud-off';
    case 'failed': return 'lucide:alert-circle';
    default: return '';
  }
});

const statusClass = computed(() => {
  switch (props.status) {
    case 'synced': return 'text-gray-400';
    case 'syncing': return 'text-blue-500';
    case 'unsaved': return 'text-amber-500';
    case 'failed': return 'text-red-500';
    default: return '';
  }
});
</script>
