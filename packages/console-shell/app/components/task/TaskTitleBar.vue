<template>
  <div class="flex items-center gap-3 px-4 py-2">
    <span class="text-sm font-medium truncate">{{ title }}</span>
    <span
      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      :class="statusColor"
    >
      <span class="size-1.5 rounded-full currentColor" />
      {{ statusLabel }}
    </span>
    <span class="ml-auto text-xs text-muted tabular-nums">{{ rightInfo }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title:       string;
  statusLabel: string;
  statusColor: string;
  rightInfo:   string;
}>();
</script>
