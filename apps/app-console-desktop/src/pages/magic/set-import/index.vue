<template>
  <div class="desktop-page min-h-full space-y-5 p-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">系列导入</h1>
        <p class="mt-1 text-sm text-muted">从 Scryfall 更新系列资料，结合已导入的 MTGJSON 和 MTGCH 资料更新补充包组成与译名。</p>
      </div>
      <UButton label="查看系列" icon="i-lucide-folder-open" color="neutral" variant="soft" to="/magic/set" />
    </header>

    <TaskController title="系列导入" :operations="operations" @completed="onCompleted" @failed="onFailed" />
    <UAlert v-if="report" color="success" title="系列导入完成" :description="report" />
    <UAlert v-if="warnings" color="warning" title="以下资料已保留" :description="warnings" />
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '系列导入' });

const report = ref('');
const warnings = ref('');
const operations: TaskOperation[] = [{
  key:    'import',
  label:  '更新系列与补充包',
  icon:   'i-lucide-refresh-cw',
  create: () => orpc.magic.set.importTask({}) as Promise<TaskPageSnapshot>,
}];

/** Renders completed import counts and retained-data notices in product language. */
function onCompleted(snapshot: TaskPageSnapshot) {
  const result = snapshot.result as { series?: number, boosterSeries?: number, missingSeries?: string[], missingSupplements?: string[] } | undefined;
  report.value = `已更新 ${result?.series ?? 0} 个系列，处理 ${result?.boosterSeries ?? 0} 个系列的补充包。`;
  const messages: string[] = [];
  if (result?.missingSeries?.length) messages.push(`来源中未出现的已有系列：${result.missingSeries.join('、')}`);
  if (result?.missingSupplements?.length) messages.push(`缺少补充资料的系列：${result.missingSupplements.join('、')}`);
  warnings.value = messages.join('；');
}
/** Keeps retained-data notices visible when some booster replacements fail. */
function onFailed(_taskId: string, _code: string | null, message: string | null) {
  report.value = '';
  warnings.value = message?.startsWith('系列资料已更新；') ? message : '';
}
</script>
