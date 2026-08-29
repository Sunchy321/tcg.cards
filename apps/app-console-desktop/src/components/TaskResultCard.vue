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
        v-for="metric in metrics"
        :key="metric.label"
        class="rounded-lg border border-default p-3"
      >
        <div class="text-xs text-muted">{{ metric.label }}</div>
        <div class="mt-1 font-mono text-sm">{{ metric.value }}</div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface ReportMetric {
  label: string;
  value: string | number;
}

/** Flattens a task result record into label/value metrics for the report grid. */
function flattenMetrics(node: Record<string, unknown>, prefix = ''): ReportMetric[] {
  const metrics: ReportMetric[] = [];
  for (const [key, value] of Object.entries(node)) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object') {
      metrics.push(...flattenMetrics(value as Record<string, unknown>, label));
    } else {
      metrics.push({ label, value: value as string | number });
    }
  }
  return metrics;
}

const props = defineProps<{
  result: Record<string, unknown> | null;
}>();

const metrics = computed(() => (props.result ? flattenMetrics(props.result) : []));
</script>
