<template>
  <div class="desktop-page min-h-full space-y-5 p-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">万智牌系列</h1>
        <p class="mt-1 text-sm text-muted">查看系列资料，维护系列符号和双面牌图标。</p>
      </div>
      <div class="flex gap-2">
        <UButton label="发布数据" icon="i-lucide-upload" color="neutral" variant="soft" to="/magic/publish" />
        <UButton label="刷新列表" icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loading" @click="load" />
      </div>
    </header>

    <UAlert v-if="error" color="error" title="系列资料暂时无法读取" :description="error" />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <UInput v-model="search" icon="i-lucide-search" placeholder="查找系列名称或代码" aria-label="查找系列" class="w-full sm:w-80" />
      <span class="text-sm text-muted">{{ filtered.length }} 个系列</span>
    </div>
    <div class="overflow-x-auto rounded-lg border border-default bg-default">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-default bg-elevated text-xs text-muted">
          <tr><th class="p-3">系列</th><th class="p-3">发行日期</th><th class="p-3">卡牌</th><th class="p-3">语言</th><th class="p-3">补充包</th><th class="p-3">展示设置</th><th class="p-3"><span class="sr-only">操作</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row.setId" class="border-b border-muted last:border-0">
            <td class="p-3"><div class="font-medium text-highlighted">{{ row.name }}</div><div class="mt-1 text-xs text-muted">{{ row.setId.toUpperCase() }} · {{ row.englishName }}</div></td>
            <td class="whitespace-nowrap p-3 text-muted">{{ row.releaseDate ?? '—' }}</td>
            <td class="p-3 tabular-nums">{{ row.cardCount }}</td>
            <td class="p-3 tabular-nums">{{ row.langs.length }}</td>
            <td class="p-3 tabular-nums">{{ row.boosterCount }}</td>
            <td class="p-3"><UBadge :label="row.symbolStyle?.length || row.doubleFacedIcon?.length ? '已设置' : '未设置'" color="neutral" variant="soft" /></td>
            <td class="p-3 text-right"><UButton label="编辑展示" size="xs" color="neutral" variant="soft" @click="edit(row)" /></td>
          </tr>
          <tr v-if="!visible.length"><td colspan="7" class="p-10 text-center text-muted">{{ loading ? '正在读取系列…' : '暂无符合条件的系列。' }}</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="filtered.length > pageSize" class="flex items-center justify-between">
      <span class="text-xs text-muted">第 {{ page }} / {{ pageCount }} 页</span>
      <div class="flex gap-2"><UButton label="上一页" size="sm" color="neutral" variant="soft" :disabled="page <= 1" @click="page--" /><UButton label="下一页" size="sm" color="neutral" variant="soft" :disabled="page >= pageCount" @click="page++" /></div>
    </div>

    <UModal v-model:open="editOpen" :title="`展示设置 · ${form.name}`" description="保存后立即生效，更新系列资料时会保留你的选择。">
      <template #body>
        <div class="space-y-4">
          <UFormField label="系列符号样式" help="多个样式用逗号分隔；留空表示不指定样式。">
            <UInput v-model="form.styles" class="w-full" />
          </UFormField>
          <UFormField label="正面图标"><USelect v-model="form.front" :items="iconItems" class="w-full" /></UFormField>
          <UFormField label="背面图标"><USelect v-model="form.back" :items="iconItems" class="w-full" /></UFormField>
          <UAlert v-if="editError" color="error" title="无法保存" :description="editError" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2"><UButton label="取消" color="neutral" variant="ghost" :disabled="saving" @click="editOpen = false" /><UButton label="保存" :loading="saving" @click="save" /></div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { transformIcons } from '@tcg-cards/model/magic/schema/set';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '系列管理' });

/** Local series rows returned by the desktop management API. */
type Row = Awaited<ReturnType<typeof orpc.magic.set.list>>[number];
const rows = ref<Row[]>([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const page = ref(1);
const pageSize = 50;
const editOpen = ref(false);
const saving = ref(false);
const editError = ref('');
const form = reactive({ setId: '', name: '', styles: '', front: 'none', back: 'none' });
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return rows.value.filter(row => [row.setId, row.name, row.englishName].some(v => v.toLowerCase().includes(query)));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch(search, () => {
  page.value = 1;
});

/** Human-readable labels for the transform icons already shipped with the site. */
const iconLabels: Record<string, string> = { '0':             '默认正面', '1':             '默认背面', 'sun':           '太阳', 'moon':          '月亮',
  'land':          '地', 'planeswalker':  '鹏洛客', 'compass':       '罗盘', 'emrakul':       '伊莫库', 'eldritch-moon': '异月',
  'rising-sun':    '旭日', 'open-fan':      '展开的折扇', 'closed-fan':    '合拢的折扇' };
const iconItems = computed(() => {
  const values = new Set<string>([...transformIcons, form.front, form.back]);
  return [{ label: '不指定', value: 'none' }, ...[...values].filter(v => v !== 'none')
    .map(value => ({ label: iconLabels[value] ?? value, value }))];
});
/** Loads the local result without triggering another import. */
async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await orpc.magic.set.list();
    page.value = Math.min(page.value, pageCount.value);
  } catch {
    error.value = '请确认本地数据服务可用后重试。';
  } finally {
    loading.value = false;
  }
}
/** Copies persisted selections into ordinary editing controls. */
function edit(row: Row) {
  Object.assign(form, { setId:  row.setId, name:   row.name, styles: row.symbolStyle?.join(', ') ?? '',
    front:  row.doubleFacedIcon?.[0] ?? 'none', back:   row.doubleFacedIcon?.[1] ?? 'none' });
  editError.value = '';
  editOpen.value = true;
}
/** Writes shared display choices immediately and refreshes the visible series. */
async function save() {
  if ((form.front === 'none') !== (form.back === 'none')) {
    editError.value = '请选择正反两面的图标，或同时设为不指定。';
    return;
  }
  saving.value = true;
  editError.value = '';
  try {
    const styles = form.styles.split(/[,，]/).map(v => v.trim()).filter(Boolean);
    await orpc.magic.set.saveDisplay({ setId:           form.setId, symbolStyle:     styles.length ? styles : null,
      doubleFacedIcon: form.front === 'none' ? null : [form.front, form.back] });
    editOpen.value = false;
    await load();
  } catch {
    editError.value = '展示设置未能保存，请稍后重试。';
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
