<template>
  <div v-if="report" class="rounded-xl border border-slate-200 bg-white">
    <div class="flex items-center gap-2 p-4">
      <UIcon name="i-lucide-search-check" class="size-4 text-info" />
      <span class="font-medium">图片质量报告</span>
      <UBadge :label="report.set" color="info" variant="soft" />
      <span class="text-xs text-muted">
        检查 {{ report.images }} 个编号的卡图,尺寸偏小 {{ report.problems.length }} 张,未导入 {{ report.missing.length }} 个
      </span>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ml-auto"
        aria-label="关闭报告"
        @click="$emit('close')"
      />
    </div>

    <div v-if="error" class="border-t border-slate-200 p-4">
      <UAlert color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />
    </div>
    <div v-else-if="entries.length === 0" class="border-t border-slate-200 p-4">
      <UAlert
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        description="所有卡图尺寸正常,也没有缺失的编号。"
      />
    </div>
    <div v-else class="border-t border-slate-200 p-4">
      <div class="space-y-1">
        <div v-for="entry in entries" :key="entry.label">
          <span class="font-mono text-xs text-muted">{{ entry.label }}</span>
          <span class="font-mono text-xs">{{ entry.numbers }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatNumberInput } from '~/utils/import-numbers';

/** One face image smaller than half of its language's baseline width. */
interface QualityProblem {
  lang:   string;
  number: string;
  width:  number;
  height: number;
}

/** Result of the set-wide image quality check, as returned by the runtime. */
interface QualityReport {
  set:      string;
  prints:   number;
  images:   number;
  problems: QualityProblem[];
  missing:  Array<{ lang: string, number: string }>;
}

const props = defineProps<{
  report: QualityReport | null;
  error?: string;
}>();

defineEmits<{ close: [] }>();

/** One inline report segment: `lang/(size): numbers` for undersized images, `lang:` for missing ones. */
interface ReportEntry {
  label:   string;
  numbers: string;
}

/** Problems group by language and measured size; missing numbers group by language alone. */
const entries = computed<ReportEntry[]>(() => {
  if (!props.report) return [];
  const groups = new Map<string, string[]>();
  const group = (label: string, number: string): string[] => {
    let numbers = groups.get(label);
    if (!numbers) {
      numbers = [];
      groups.set(label, numbers);
    }
    numbers.push(number);
    return numbers;
  };
  for (const problem of props.report.problems) {
    group(`${problem.lang}/(${problem.width}×${problem.height}):`, problem.number);
  }
  for (const entry of props.report.missing) group(`${entry.lang}:`, entry.number);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, numbers]) => ({ label, numbers: formatNumberInput(numbers) }));
});
</script>
