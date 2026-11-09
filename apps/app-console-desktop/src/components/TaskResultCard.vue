<template>
  <UCard v-if="groups.length > 0">
    <template #header>
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ title ?? '处理结果' }}</span>
        <UBadge label="已完成" color="success" variant="soft" />
      </div>
    </template>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="(group, index) in groups" :key="`${group.label}:${index}`" class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">{{ group.label }}</div>
        <div v-if="group.counts" class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span>新增 {{ group.counts.inserted }}</span>
          <span>更新 {{ group.counts.updated }}</span>
          <span>未变化 {{ group.counts.unchanged }}</span>
          <span>移除 {{ group.counts.deleted }}</span>
        </div>
        <div v-else class="mt-1 whitespace-pre-wrap text-sm">{{ group.value }}</div>
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
  label:   string;
  counts?: ImportCountsLike;
  value?:  string | number;
}

const props = defineProps<{
  title?:  string;
  result:  Record<string, unknown> | null;
  labels?: Record<string, string>;
}>();

const defaultLabels: Record<string, string> = {
  cards:             '卡牌',
  rulings:           '裁定',
  card:              '卡牌译文',
  scryfall:          '卡牌关联',
  oracle:            '卡牌说明',
  flavor:            '风味文字',
  ruling:            '裁定译文',
  set:               '系列译名',
  type:              '牌张类别',
  sets:              '系列',
  totalRowCount:     '数据总数',
  changedRowCount:   '本次更新',
  insertedRowCount:  '新增记录',
  updatedRowCount:   '更新记录',
  deletedRowCount:   '移除记录',
  unchangedRowCount: '未变化记录',
  inserted:          '新增记录',
  updated:           '更新记录',
  unchanged:         '未变化记录',
  deleted:           '移除记录',
  fresh:             '资料有效',
  localMissing:      '本地无对应卡牌',
  fetched:           '已更新资料',
  notFound:          '未找到卡牌',
  errors:            '更新失败',
  glossed:           '发现注音',
  anchored:          '匹配卡牌',
  mismatched:        '卡名不匹配',
  unanchored:        '无对应印刷',
  invalid:           '注音无效',
};

function isImportCounts(value: unknown): value is ImportCountsLike {
  if (!value || typeof value !== 'object') return false;
  const counts = value as Record<string, unknown>;
  return typeof counts.inserted === 'number'
    && typeof counts.updated === 'number'
    && typeof counts.unchanged === 'number'
    && typeof counts.deleted === 'number';
}

function labelFor(path: string[]): string {
  const labels = { ...defaultLabels, ...props.labels };
  const known = path.map(key => labels[key]).filter((label): label is string => label != null);
  return known.join(' · ') || '其他结果';
}

function collect(value: unknown, path: string[], groups: ReportGroup[]) {
  if (isImportCounts(value)) {
    groups.push({ label: labelFor(path), counts: value });
    return;
  }
  if (Array.isArray(value)) {
    groups.push({ label: labelFor(path), value: `${value.length} 项` });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collect(child, [...path, key], groups);
    return;
  }
  groups.push({ label: labelFor(path), value: value == null ? '—' : String(value) });
}

const groups = computed(() => {
  const result: ReportGroup[] = [];
  if (props.result) {
    for (const [key, value] of Object.entries(props.result)) collect(value, [key], result);
  }
  return result;
});
</script>
