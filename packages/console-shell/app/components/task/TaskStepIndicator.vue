<template>
  <div class="flex items-center flex-wrap gap-1 px-4 py-2">
    <template v-for="(item, i) in visibleItems" :key="i">
      <button
        v-if="item.kind === 'ellipsis'"
        class="step step-ellipsis"
        :title="`${item.count} 个隐藏阶段`"
        @click="expanded = true"
      >
        <span>… {{ item.count }}</span>
      </button>
      <button
        v-else-if="item.kind === 'collapse'"
        class="step step-collapse"
        @click="expanded = false"
      >
        <span>▲ 收起</span>
      </button>
      <template v-else>
        <div
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs shrink-0"
          :class="stepColor(item.stage, currentStageKey, status)"
        >
          <span
            v-if="item.stage.stageKey === currentStageKey && status === 'running'"
            class="size-2 rounded-full bg-current animate-pulse"
          />
          <UIcon v-else :name="stepIcon(item.stage, currentStageKey, status)" class="size-3" />
          <span class="whitespace-nowrap">{{ item.stage.label }}</span>
          <span v-if="stepLabel(item.stage, currentStageKey, status)" class="tabular-nums text-[10px] opacity-70">
            {{ stepLabel(item.stage, currentStageKey, status) }}
          </span>
        </div>
        <UIcon
          v-if="i < visibleItems.length - 1 && visibleItems[i + 1]!.kind === 'stage'"
          name="lucide:chevron-right"
          class="size-3 text-muted shrink-0"
        />
      </template>
    </template>
    <div v-if="stages.length === 0" class="text-xs text-muted">暂无阶段信息</div>
  </div>
</template>

<script setup lang="ts">
import type { TaskStage } from '@tcg-cards/model/src/task';

const props = defineProps<{
  stages:          TaskStage[];
  currentStageKey: string | null;
  status:          string;
}>();

const expanded = ref(false);

type Item =
  | { kind: 'stage'; stage: TaskStage }
  | { kind: 'ellipsis'; count: number }
  | { kind: 'collapse' };

const visibleItems = computed<Item[]>(() => {
  const { stages, currentStageKey } = props;
  if (stages.length === 0) return [];
  if (expanded.value) return [...stages.map(s => ({ kind: 'stage' as const, stage: s })), { kind: 'collapse' as const }];
  if (!currentStageKey) {
    const show = Math.min(5, stages.length);
    const items: Item[] = stages.slice(0, show).map(s => ({ kind: 'stage', stage: s }));
    if (show < stages.length) items.push({ kind: 'ellipsis', count: stages.length - show });
    return items;
  }
  const idx = stages.findIndex(s => s.stageKey === currentStageKey);
  if (idx < 0) return stages.map(s => ({ kind: 'stage', stage: s }));
  const before = 2, after = 2;
  const start = Math.max(0, idx - before);
  const end = Math.min(stages.length, idx + after + 1);
  const items: Item[] = [];
  if (start > 0) items.push({ kind: 'ellipsis', count: start });
  for (let i = start; i < end; i++) items.push({ kind: 'stage', stage: stages[i]! });
  if (end < stages.length) items.push({ kind: 'ellipsis', count: stages.length - end });
  return items;
});

function stepIcon(stage: TaskStage, currentKey: string | null, status: string): string {
  if (status === 'failed' && stage.stageKey === currentKey) return 'lucide:x';
  if (stage.status === 'completed') return 'lucide:check';
  if (stage.status === 'failed') return 'lucide:x';
  if (stage.stageKey === currentKey) {
    if (['paused', 'resuming'].includes(status)) return 'lucide:pause';
    return 'lucide:circle';
  }
  if (['canceled', 'abandoned'].includes(stage.status)) return 'lucide:x';
  return 'lucide:circle';
}

function stepColor(stage: TaskStage, currentKey: string | null, status: string): string {
  if (stage.status === 'completed') return 'text-success';
  if (stage.status === 'failed') return 'text-error';
  if (stage.stageKey === currentKey) {
    if (['paused', 'resuming'].includes(status)) return 'text-warning';
    if (['failed', 'canceled', 'abandoned'].includes(status)) return 'text-muted';
    return 'text-primary';
  }
  if (stage.status === 'pending') return 'text-muted';
  return 'text-muted';
}

function stepLabel(stage: TaskStage, currentKey: string | null, status: string): string {
  if (stage.stageKey === currentKey && status === 'running' && stage.total) {
    return `${stage.done ?? 0}/${stage.total}`;
  }
  return '';
}
</script>

<style scoped>
.step-ellipsis { color: #9ca3af; cursor: pointer; border: none; background: transparent; font-family: inherit; font-size: 11px; padding: 1px 4px; border-radius: 4px; }
.step-ellipsis:hover { background: #f3f4f6; }
.step-collapse { color: #6b7280; cursor: pointer; border: none; background: transparent; font-family: inherit; font-size: 11px; padding: 1px 4px; border-radius: 4px; }
.step-collapse:hover { background: #f3f4f6; }
:root.dark .step-ellipsis:hover { background: #374151; }
:root.dark .step-collapse:hover { background: #374151; }
</style>
