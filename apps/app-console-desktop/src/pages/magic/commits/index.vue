<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-puzzle" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">卡牌补全</h1>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
          <UButton label="运行投影" icon="i-lucide-box" color="primary" variant="soft" :loading="projecting" @click="runProject" />
          <UButton label="新增补全" icon="i-lucide-plus" @click="openCreate" />
        </div>
      </div>
      <p class="mt-1 text-sm text-muted">
        补充各数据源都缺失、但实际存在的印刷（语言、印文等）。保存后需运行投影才会生效；删除一条补全并重新投影，对应印刷会从站点撤下。
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />

    <!-- filters -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="系列" class="w-40">
          <USelect v-model="setFilter" :items="setItems" class="w-full" />
        </UFormField>
        <UFormField label="卡牌" class="flex-1 min-w-48">
          <UInput v-model="searchInput" placeholder="英文名检索" icon="i-lucide-search" @keydown.enter="applySearch" />
        </UFormField>
        <UButton label="查询" icon="i-lucide-search" @click="applySearch" />
      </div>
    </div>

    <!-- rows -->
    <div class="rounded-xl border border-slate-200 bg-white">
      <div v-if="items.length === 0" class="p-6 text-sm text-muted">没有符合条件的补全记录。</div>
      <table v-else class="w-full text-sm">
        <thead class="border-b border-slate-200 text-left text-xs text-muted">
          <tr>
            <th class="p-3">卡牌</th>
            <th class="p-3 w-40">位置</th>
            <th class="p-3 w-20">语言</th>
            <th class="p-3">印文摘要</th>
            <th class="p-3 w-24">渠道</th>
            <th class="p-3 w-64">来源说明</th>
            <th class="p-3 w-32"/>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="rowKey(row)" class="border-b border-slate-100 last:border-0">
            <td class="p-3 font-medium">{{ row.cardName ?? '（未识别卡牌）' }}</td>
            <td class="p-3 font-mono text-xs">{{ row.set }}:{{ row.number }}</td>
            <td class="p-3">{{ langLabel(row.lang) }}</td>
            <td class="p-3">
              <template v-if="row.summary !== ''">{{ row.summary }}</template>
              <span v-else class="text-muted">（无印文，投影时回落英文）</span>
              <UBadge v-if="row.asserted > 1" :label="row.asserted + ' 面'" color="neutral" variant="soft" class="ml-2" />
            </td>
            <td class="p-3 text-xs text-muted">{{ originLabel(row.origin) }}</td>
            <td class="p-3 text-xs text-muted">{{ row.note ?? '' }}</td>
            <td class="p-3">
              <div class="flex justify-end gap-2">
                <UButton label="编辑" size="xs" color="neutral" variant="outline" @click="openEdit(row)" />
                <UButton label="删除" size="xs" color="error" variant="ghost" @click="confirmRemove(row)" />
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

    <!-- entry / edit dialog -->
    <UModal v-model:open="formOpen" :title="formTitle" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div v-if="formError" class="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error">{{ formError }}</div>

          <!-- card picker (locked once chosen; edit reuses the row's card) -->
          <div class="rounded-lg border border-slate-200 p-3">
            <div class="mb-2 text-xs text-muted">卡牌</div>
            <template v-if="form.card == null">
              <UInput
                v-model="cardSearchInput"
                class="w-full"
                placeholder="输入英文卡名检索"
                icon="i-lucide-search"
                @update:model-value="onCardSearchInput"
              />
              <div v-if="candidates.length > 0" class="mt-2 max-h-48 space-y-1 overflow-y-auto">
                <button
                  v-for="c in candidates"
                  :key="c.oracleId"
                  type="button"
                  class="block w-full rounded border border-slate-200 p-2 text-left text-sm hover:border-primary-400"
                  @click="chooseCard(c)"
                >
                  <span class="font-medium">{{ c.name }}</span>
                  <span class="ml-2 font-mono text-xs text-muted">如 {{ c.set }}:{{ c.number }}</span>
                </button>
              </div>
              <div v-else-if="cardSearchInput.trim() !== ''" class="mt-2 text-xs text-muted">无匹配卡牌。</div>
            </template>
            <div v-else class="flex items-center justify-between">
              <div>
                <span class="font-medium">{{ form.card.name }}</span>
                <span class="ml-2 text-xs text-muted">共 {{ form.card.faceNames.length }} 面</span>
              </div>
              <UButton v-if="!editing" label="重选" size="xs" color="neutral" variant="ghost" @click="resetCard" />
            </div>
          </div>

          <!-- position -->
          <div class="flex gap-3">
            <UFormField label="系列代码" class="flex-1">
              <UInput v-model="form.set" class="w-full font-mono" placeholder="如 msc" :disabled="editing || form.card == null" />
            </UFormField>
            <UFormField label="收藏编号" class="flex-1">
              <UInput v-model="form.number" class="w-full font-mono" placeholder="如 806" :disabled="editing || form.card == null" />
            </UFormField>
            <UFormField label="语言" class="flex-1">
              <USelect v-model="form.lang" :items="langItems" class="w-full" :disabled="form.card == null" />
            </UFormField>
          </div>

          <!-- per-face printed surfaces -->
          <div v-if="form.card != null">
            <div class="mb-2 text-xs text-muted">印文（留空的字段投影时回落英文；多面卡请填对应面的内容）</div>
            <div v-for="(face, i) in form.faces" :key="i" class="mb-3 rounded-lg border border-slate-200 p-3">
              <div class="mb-2 text-xs font-medium">{{ faceLabel(i) }}</div>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="印文名" class="col-span-1">
                  <UInput v-model="face.printedName" class="w-full" />
                </UFormField>
                <UFormField label="类别行" class="col-span-1">
                  <UInput v-model="face.printedTypeLine" class="w-full" />
                </UFormField>
                <UFormField label="规则文字" class="col-span-2">
                  <UTextarea v-model="face.printedText" class="w-full" :rows="3" />
                </UFormField>
                <UFormField label="风味名" class="col-span-1">
                  <UInput v-model="face.flavorName" class="w-full" />
                </UFormField>
                <UFormField label="画师" class="col-span-1">
                  <UInput v-model="face.artist" class="w-full" />
                </UFormField>
                <UFormField label="风味文字" class="col-span-2">
                  <UTextarea v-model="face.flavorText" class="w-full" :rows="2" />
                </UFormField>
                <UFormField label="水印" class="col-span-1">
                  <UInput v-model="face.watermark" class="w-full" />
                </UFormField>
              </div>
            </div>
          </div>

          <!-- optional metadata + note -->
          <div class="flex gap-3">
            <UFormField label="稀有度（可选覆盖）" class="flex-1">
              <USelect v-model="form.rarity" :items="rarityItems" class="w-full" />
            </UFormField>
            <UFormField label="发行日期（可选覆盖）" class="flex-1">
              <UInput v-model="form.releaseDate" class="w-full" placeholder="YYYY-MM-DD" />
            </UFormField>
          </div>
          <UFormField label="来源说明" help="这条数据从哪里来，便于日后核对。">
            <UTextarea v-model="form.note" class="w-full" :rows="2" placeholder="如：mtgch 数据 + 实物照片核对" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="formOpen = false" />
          <UButton label="保存" color="primary" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>

    <!-- delete confirmation -->
    <UModal v-model:open="removeOpen" title="删除补全">
      <template #body>
        <p class="text-sm">
          删除后重新投影，该印刷（{{ removeSummary }}）会从站点撤下。确定删除？
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="removeOpen = false" />
          <UButton label="删除" color="error" :loading="removing" @click="doRemove" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '卡牌补全' });

interface CommitRow {
  oracleId:  string;
  set:       string;
  number:    string;
  lang:      string;
  cardName:  string | null;
  origin:    string;
  note:      string | null;
  summary:   string;
  asserted:  number;
  updatedAt: string;
}

interface CardCandidate {
  oracleId:  string;
  name:      string;
  set:       string;
  number:    string;
  faceNames: string[];
}

interface FaceForm {
  printedName:     string;
  printedTypeLine: string;
  printedText:     string;
  flavorName:      string;
  flavorText:      string;
  artist:          string;
  watermark:       string;
}

const loading = ref(false);
const saving = ref(false);
const removing = ref(false);
const projecting = ref(false);
const error = ref('');

const items = ref<CommitRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const sets = ref<Array<{ code: string, commits: number }>>([]);

const setFilter = ref('all');
const searchInput = ref('');
const search = ref('');

const langItems = [
  { label: '简体中文', value: 'zhs' },
  { label: '繁体中文', value: 'zht' },
  { label: '日文', value: 'ja' },
  { label: '韩文', value: 'ko' },
  { label: '法文', value: 'fr' },
  { label: '德文', value: 'de' },
  { label: '西班牙文', value: 'es' },
  { label: '意大利文', value: 'it' },
  { label: '葡萄牙文', value: 'pt' },
  { label: '俄文', value: 'ru' },
];

const rarityItems = [
  { label: '（不覆盖）', value: '' },
  { label: '秘稀', value: 'mythic' },
  { label: '金', value: 'rare' },
  { label: '银', value: 'uncommon' },
  { label: '普', value: 'common' },
  { label: '特别', value: 'special' },
  { label: '奖励', value: 'bonus' },
];

function langLabel(lang: string): string {
  return langItems.find(i => i.value === lang)?.label ?? lang;
}

function originLabel(origin: string): string {
  const labels: Record<string, string> = { manual: '手工', auto: '候选', batch: '批量' };
  return labels[origin] ?? origin;
}

function rowKey(row: Pick<CommitRow, 'oracleId' | 'set' | 'number' | 'lang'>): string {
  return `${row.oracleId}:${row.set}:${row.number}:${row.lang}`;
}

const setItems = computed(() => [
  { label: '全部系列', value: 'all' },
  ...sets.value.map(s => ({ label: `${s.code}（${s.commits}）`, value: s.code })),
]);

/** Face label for the form section: the card's own face name, or a positional fallback. */
function faceLabel(index: number): string {
  const name = form.card?.faceNames[index];
  return name != null && name !== '' ? name : `面 ${index + 1}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await orpc.magic.commits.list({
      set:    setFilter.value === 'all' ? undefined : setFilter.value,
      search: search.value !== '' ? search.value : undefined,
      page:   page.value,
      pageSize,
    });
    items.value = res.items;
    total.value = res.total;
    sets.value = res.sets;
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

watch(setFilter, () => {
  page.value = 1;
  void load();
});

async function runProject() {
  projecting.value = true;
  error.value = '';
  try {
    await orpc.magic.createTask.magicProject({});
    await navigateTo('/magic/project');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    projecting.value = false;
  }
}

// --- entry / edit form ---
const formOpen = ref(false);
const editing = ref(false);
const formError = ref('');
const cardSearchInput = ref('');
const candidates = ref<CardCandidate[]>([]);

const form = reactive<{
  editingKey:  string | null;
  card:        CardCandidate | null;
  set:         string;
  number:      string;
  lang:        string;
  faces:       FaceForm[];
  rarity:      string;
  releaseDate: string;
  note:        string;
}>({
  editingKey:  null,
  card:        null,
  set:         '',
  number:      '',
  lang:        'zhs',
  faces:       [],
  rarity:      '',
  releaseDate: '',
  note:        '',
});

const formTitle = computed(() => (editing.value ? '编辑补全' : '新增补全'));

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onCardSearchInput() {
  if (searchTimer != null) clearTimeout(searchTimer);
  const term = cardSearchInput.value.trim();
  if (term === '') {
    candidates.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      candidates.value = await orpc.magic.commits.cardSearch({ search: term });
    } catch {
      candidates.value = [];
    }
  }, 250);
}

function emptyFaces(count: number): FaceForm[] {
  return Array.from({ length: count }, () => ({
    printedName:     '',
    printedTypeLine: '',
    printedText:     '',
    flavorName:      '',
    flavorText:      '',
    artist:          '',
    watermark:       '',
  }));
}

function chooseCard(candidate: CardCandidate) {
  form.card = candidate;
  form.faces = emptyFaces(candidate.faceNames.length);
  candidates.value = [];
  cardSearchInput.value = '';
}

function resetCard() {
  form.card = null;
  form.faces = [];
}

function openCreate() {
  editing.value = false;
  formError.value = '';
  form.editingKey = null;
  form.card = null;
  form.set = '';
  form.number = '';
  form.lang = 'zhs';
  form.faces = [];
  form.rarity = '';
  form.releaseDate = '';
  form.note = '';
  cardSearchInput.value = '';
  candidates.value = [];
  formOpen.value = true;
}

async function openEdit(row: CommitRow) {
  editing.value = true;
  formError.value = '';
  form.editingKey = rowKey(row);
  form.set = row.set;
  form.number = row.number;
  form.lang = row.lang;
  form.rarity = '';
  form.releaseDate = '';
  form.note = row.note ?? '';
  try {
    const full = await orpc.magic.commits.get({
      oracleId: row.oracleId, set: row.set, number: row.number, lang: row.lang,
    });
    form.card = {
      oracleId:  row.oracleId,
      name:      row.cardName ?? '',
      set:       row.set,
      number:    row.number,
      faceNames: full.faceNames,
    };
    const faces = emptyFaces(Math.max(full.faceNames.length, full.faces.length));
    full.faces.forEach((face, i) => {
      const target = faces[i];
      if (target == null) return;
      target.printedName = face.printedName ?? '';
      target.printedTypeLine = face.printedTypeLine ?? '';
      target.printedText = face.printedText ?? '';
      target.flavorName = face.flavorName ?? '';
      target.flavorText = face.flavorText ?? '';
      target.artist = face.artist ?? '';
      target.watermark = face.watermark ?? '';
    });
    form.faces = faces;
    const metadata = full.metadata as { rarity?: string, releaseDate?: string } | null;
    form.rarity = metadata?.rarity ?? '';
    form.releaseDate = metadata?.releaseDate ?? '';
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  }
  formOpen.value = true;
}

async function save() {
  if (form.card == null) {
    formError.value = '请先检索并选择一张卡牌。';
    return;
  }
  saving.value = true;
  formError.value = '';
  try {
    await orpc.magic.commits.save({
      oracleId: form.card.oracleId,
      set:      form.set.trim(),
      number:   form.number.trim(),
      lang:     form.lang,
      faces:    form.faces,
      metadata: {
        ...(form.rarity !== '' ? { rarity: form.rarity } : {}),
        ...(form.releaseDate.trim() !== '' ? { releaseDate: form.releaseDate.trim() } : {}),
      },
      note: form.note.trim() === '' ? null : form.note.trim(),
    });
    formOpen.value = false;
    await load();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

// --- delete ---
const removeOpen = ref(false);
const removeTarget = ref<CommitRow | null>(null);

/** Position + language of the row pending deletion, for the confirm dialog text. */
const removeSummary = computed(() => {
  const target = removeTarget.value;
  if (target == null) return '';
  return `${target.set}:${target.number} ${langLabel(target.lang)}`;
});

function confirmRemove(row: CommitRow) {
  removeTarget.value = row;
  removeOpen.value = true;
}

async function doRemove() {
  const target = removeTarget.value;
  if (target == null) return;
  removing.value = true;
  error.value = '';
  try {
    await orpc.magic.commits.remove({
      oracleId: target.oracleId, set: target.set, number: target.number, lang: target.lang,
    });
    removeOpen.value = false;
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    removing.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
