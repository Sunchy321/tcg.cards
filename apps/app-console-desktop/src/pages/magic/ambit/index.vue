<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">收录范围</h1>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </div>
      <p class="mt-1 text-sm text-muted">
        手动设置单张卡的收录范围（常规 / 附加 / 全部）。保存后立即生效；清除手动设置后会恢复自动判断，重新整理卡牌数据也会保留你的选择。
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />

    <!-- filters + counts -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="范围" class="w-56">
          <USelect
            v-model="overrideFilter"
            :items="[{ label: '仅显示手动设置', value: 'only' }, { label: '全部卡牌', value: 'all' }]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="关键词" class="flex-1 min-w-48">
          <UInput v-model="searchInput" placeholder="卡牌名称" icon="i-lucide-search" @keydown.enter="applySearch" />
        </UFormField>
        <UButton label="查询" icon="i-lucide-search" @click="applySearch" />
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span class="text-muted">手动设置 {{ counts.overrides }} 条</span>
        <UBadge
          v-for="s in counts.byAmbit"
          :key="s.ambit"
          :label="`${ambitLabel(s.ambit)} ${s.count}`"
          color="neutral"
          variant="soft"
        />
      </div>
    </div>

    <!-- rows -->
    <div class="rounded-xl border border-slate-200 bg-white">
      <div v-if="items.length === 0" class="p-6 text-sm text-muted">没有符合条件的卡牌。</div>
      <table v-else class="w-full text-sm">
        <thead class="border-b border-slate-200 text-left text-xs text-muted">
          <tr>
            <th class="p-3">名称</th>
            <th class="p-3">类型行</th>
            <th class="p-3 w-24">当前范围</th>
            <th class="p-3 w-64">手动设置</th>
            <th class="p-3 w-40"/>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.cardId" class="border-b border-slate-100 last:border-0">
            <td class="p-3">
              <div class="font-medium">{{ row.name }}</div>
              <div class="font-mono text-xs text-muted">{{ row.cardId }}</div>
            </td>
            <td class="p-3 text-xs text-muted">{{ row.typeline }}</td>
            <td class="p-3">
              <UBadge :label="ambitLabel(row.cardAmbit)" :color="ambitColor(row.cardAmbit)" variant="soft" />
            </td>
            <td class="p-3 text-xs">
              <template v-if="row.override">
                <div>设置为 <UBadge :label="ambitLabel(row.override.ambit)" :color="ambitColor(row.override.ambit)" variant="subtle" size="sm" /></div>
                <div v-if="row.override.reason" class="mt-1 text-muted">{{ row.override.reason }}</div>
                <div class="text-muted">{{ formatTime(row.override.updatedAt) }}</div>
              </template>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="p-3">
              <div class="flex justify-end gap-2">
                <UButton
                  :label="row.override ? '修改' : '设置范围'"
                  size="xs"
                  color="primary"
                  :variant="row.override ? 'soft' : 'outline'"
                  @click="openEdit(row)"
                />
                <UButton
                  v-if="row.override"
                  label="清除手动设置"
                  size="xs"
                  color="error"
                  variant="outline"
                  :loading="removing === row.cardId"
                  @click="removeOverride(row)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="total > pageSize" class="flex items-center justify-between border-t border-slate-200 p-3 text-sm">
        <span class="text-muted">共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
        <div class="flex gap-2">
          <UButton label="上一页" size="xs" color="neutral" variant="soft" :disabled="page <= 1" @click="go(page - 1)" />
          <UButton label="下一页" size="xs" color="neutral" variant="soft" :disabled="page >= pageCount" @click="go(page + 1)" />
        </div>
      </div>
    </div>

    <!-- edit dialog -->
    <UModal v-model:open="editOpen" :title="`收录范围 — ${editForm.name}`">
      <template #body>
        <div class="space-y-4">
          <UFormField label="范围" help="常规：正常对局会遇到的卡；附加：对局中出现的衍生实体与趣味卡；全部：从不进对局的内容。">
            <USelect v-model="editForm.ambit" :items="ambitItems" class="w-full" />
          </UFormField>
          <UFormField label="理由" help="一句话说明为什么修正这张卡的范围。">
            <UInput v-model="editForm.reason" class="w-full" placeholder="例如：官方衍生物，网站未自动识别" />
          </UFormField>
          <UFormField label="备注">
            <UInput v-model="editForm.note" class="w-full" placeholder="出处或补充说明（可选）" />
          </UFormField>
          <div v-if="editError" class="text-xs text-error">{{ editError }}</div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="editOpen = false" />
          <UButton label="保存" color="primary" :loading="saving" @click="saveEdit" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '收录范围' });

type Ambit = 'primary' | 'additional' | 'full';

interface AmbitRow {
  cardId:    string;
  oracleId:  string;
  name:      string;
  typeline:  string;
  category:  string;
  cardAmbit: Ambit;
  override:  { ambit: Ambit, reason: string | null, note: string | null, updatedAt: string } | null;
}

const loading = ref(false);
const saving = ref(false);
const removing = ref('');
const error = ref('');

const items = ref<AmbitRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const overrideFilter = ref<'only' | 'all'>('only');
const searchInput = ref('');
const search = ref('');
const counts = ref<{ overrides: number, byAmbit: Array<{ ambit: Ambit, count: number }> }>({ overrides: 0, byAmbit: [] });

const ambitItems = [
  { label: '常规', value: 'primary' },
  { label: '附加', value: 'additional' },
  { label: '全部', value: 'full' },
];

function ambitLabel(ambit: Ambit): string {
  return ambitItems.find(item => item.value === ambit)?.label ?? ambit;
}

function ambitColor(ambit: Ambit): 'primary' | 'warning' | 'neutral' {
  switch (ambit) {
  case 'primary': return 'primary';
  case 'additional': return 'warning';
  case 'full': return 'neutral';
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await orpc.magic.ambit.list({
      search:       search.value || undefined,
      overrideOnly: overrideFilter.value === 'only',
      page:         page.value,
      pageSize,
    });
    items.value = res.items;
    total.value = res.total;
    counts.value = res.counts;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function applySearch() {
  search.value = searchInput.value.trim();
  page.value = 1;
  void load();
}

function go(next: number) {
  page.value = next;
  void load();
}

watch(overrideFilter, () => {
  page.value = 1;
  void load();
});

// --- edit ---
const editOpen = ref(false);
const editError = ref('');
const editForm = reactive<{ cardId: string, name: string, ambit: Ambit, reason: string, note: string }>({
  cardId: '',
  name:   '',
  ambit:  'primary',
  reason: '',
  note:   '',
});

function openEdit(row: AmbitRow) {
  editError.value = '';
  editForm.cardId = row.cardId;
  editForm.name = row.name;
  editForm.ambit = row.override?.ambit ?? row.cardAmbit;
  editForm.reason = row.override?.reason ?? '';
  editForm.note = row.override?.note ?? '';
  editOpen.value = true;
}

async function saveEdit() {
  saving.value = true;
  editError.value = '';
  try {
    await orpc.magic.ambit.set({
      cardId: editForm.cardId,
      ambit:  editForm.ambit,
      reason: editForm.reason.trim() || null,
      note:   editForm.note.trim() || null,
    });
    editOpen.value = false;
    await load();
  } catch (err) {
    editError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function removeOverride(row: AmbitRow) {
  removing.value = row.cardId;
  error.value = '';
  try {
    await orpc.magic.ambit.remove({ cardId: row.cardId });
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    removing.value = '';
  }
}

onMounted(() => {
  void load();
});
</script>
