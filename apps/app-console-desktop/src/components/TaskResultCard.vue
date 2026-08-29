<template>
  <UCard v-if="result">
    <template #header>
      <div class="flex items-center gap-2">
        <span class="font-medium">导入报告</span>
        <UBadge label="Success" color="success" variant="soft" />
      </div>
    </template>
    <div class="grid gap-3 sm:grid-cols-4">
      <div
        v-for="group in groups"
        :key="group.label"
        class="rounded-lg border border-default p-3"
      >
        <div class="text-xs text-muted">{{ group.label }}</div>
        <div
          v-if="group.counts"
          class="mt-1 flex items-center gap-2 font-mono text-sm"
        >
          <span>+{{ group.counts.inserted }}</span>
          <span>~{{ group.counts.updated }}</span>
          <span>={{ group.counts.unchanged }}</span>
          <span>-{{ group.counts.deleted }}</span>
        </div>
        <div v-else class="mt-1 font-mono text-sm">{{ group.value }}</div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface ImportCountsLike {
  inserted:  number;
  updated:   number;
  unchanged: number;
  deleted:   number;
}

interface ReportGroup {
  label:  string;
  counts?: ImportCountsLike;
  value?:  string | number;
}

function isImportCounts(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.inserted === 'number'
    && typeof obj.updated === 'number'
    && typeof obj.unchanged === 'number'
    && typeof obj.deleted === 'number';
}

const props = defineProps<{
  result: Record<string, unknown> | null;
}>();

const groups = computed<ReportGroup[]>(() => {
  if (!props.result) return [];
  return Object.entries(props.result).map(([label, value]) => (
    isImportCounts(value)
      ? { label, counts: value as ImportCountsLike }
      : { label, value: value as string | number }
  ));
});
</script>
