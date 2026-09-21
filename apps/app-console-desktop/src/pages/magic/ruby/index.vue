<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-languages" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">卡名注音</h1>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </div>
      <p class="mt-1 text-sm text-muted">日文卡名的注音（振り仮名）。审核通过后才会在站点显示；未通过的读音不会渲染。</p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" :description="error" />

    <!-- filters + counts -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField label="状态" class="w-40">
          <USelect v-model="statusFilter" :items="statusItems" class="w-full" />
        </UFormField>
        <UFormField label="来源" class="w-56">
          <USelect v-model="sourceFilter" :items="sourceItems" class="w-full" />
        </UFormField>
        <UFormField label="关键词" class="flex-1 min-w-48">
          <UInput v-model="searchInput" placeholder="名称或注音" icon="i-lucide-search" @keydown.enter="applySearch" />
        </UFormField>
        <UButton label="查询" icon="i-lucide-search" @click="applySearch" />
        <UButton
          label="按当前筛选全部转正"
          icon="i-lucide-check-check"
          color="primary"
          variant="soft"
          :loading="promoting"
          @click="promoteFiltered"
        />
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span class="text-muted">草稿 {{ counts.draft }} · 已通过 {{ counts.reviewed }}</span>
        <span v-for="s in counts.bySource" :key="`${s.source}:${s.status}`" class="rounded bg-slate-100 px-2 py-0.5 text-xs">
          {{ sourceLabel(s.source) }} / {{ s.status === 'draft' ? '草稿' : '已通过' }} {{ s.count }}
        </span>
      </div>
    </div>

    <!-- rows -->
    <div class="rounded-xl border border-slate-200 bg-white">
      <div v-if="items.length === 0" class="p-6 text-sm text-muted">没有符合条件的记录。</div>
      <table v-else class="w-full text-sm">
        <thead class="border-b border-slate-200 text-left text-xs text-muted">
          <tr>
            <th class="p-3 w-80">牌面卡名区</th>
            <th class="p-3">名称</th>
            <th class="p-3">注音预览</th>
            <th class="p-3 w-32">来源</th>
            <th class="p-3 w-24">状态</th>
            <th class="p-3 w-56"/>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="`${row.lang}:${row.kind}:${row.name}`" class="border-b border-slate-100 last:border-0">
            <td class="p-3">
              <!--
                The name band of the printed card, shown at full width so the
                reading is legible. Only the stored image's own pixels are
                shown — nothing is resampled or re-encoded, the box clips.
                The band spans the title bar of every frame generation: old
                frames carry it low, borderless prints carry it high.
              -->
              <button
                v-if="previewOf(row)"
                type="button"
                class="block w-80 cursor-zoom-in"
                @click="zoom(row)"
              >
                <div class="overflow-hidden rounded border border-slate-200" style="aspect-ratio: 353 / 100">
                  <img
                    :src="previewOf(row)"
                    :alt="row.name"
                    class="w-full"
                    style="transform: translateY(-0.7%)"
                  >
                </div>
              </button>
              <div
                v-else
                class="flex items-center justify-center rounded border border-dashed border-slate-300 py-6 text-xs text-muted"
              >无卡图</div>
            </td>
            <td class="p-3">
              <div class="font-medium">{{ row.name }}</div>
              <div v-if="targetOf(row)" class="font-mono text-xs text-muted">
                {{ targetOf(row)!.set }}:{{ targetOf(row)!.number }}
              </div>
            </td>
            <td class="p-3 text-lg">
              <NameRuby :name="row.name" :ruby="row.rubyName" />
            </td>
            <td class="p-3 text-xs text-muted">
              {{ sourceLabel(row.source) }}
              <div v-if="row.exceptionsList.length > 0" class="mt-1">
                例外 {{ row.exceptionsList.length }}
              </div>
            </td>
            <td class="p-3">
              <span
                class="rounded px-2 py-0.5 text-xs"
                :class="row.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
              >{{ row.status === 'reviewed' ? '已通过' : '草稿' }}</span>
            </td>
            <td class="p-3">
              <div class="flex justify-end gap-2">
                <UButton v-if="row.status === 'draft'" label="通过" size="xs" color="primary" @click="promoteRow(row)" />
                <UButton v-else label="退回草稿" size="xs" color="neutral" variant="soft" @click="demoteRow(row)" />
                <UButton label="修正" size="xs" color="neutral" variant="outline" @click="openEdit(row)" />
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

    <!-- zoom: the stored image at full size, for reading the printed reading off the card -->
    <UModal v-model:open="zoomOpen" :title="zoomTitle">
      <template #body>
        <img
          v-if="zoomSrc"
          :src="zoomSrc"
          :alt="zoomTitle"
          class="mx-auto max-h-[75vh] w-auto rounded border border-slate-200"
        >
      </template>
    </UModal>

    <!-- edit dialog: the preview is the site's own renderer, so what is reviewed is what ships -->
    <UModal v-model:open="editOpen" :title="`修正注音 — ${editForm.name}`">
      <template #body>
        <div class="space-y-4">
          <div class="rounded-lg border border-slate-200 p-3">
            <div class="text-xs text-muted">预览</div>
            <div class="mt-1 text-xl">
              <NameRuby :name="editForm.name" :ruby="editForm.rubyName || null" />
            </div>
            <div v-if="editError" class="mt-2 text-xs text-red-600">{{ editError }}</div>
          </div>
          <UFormField label="注音串" help="形如 名称（かな）：括号内为假名读音，基底须与名称逐字一致。">
            <UInput v-model="editForm.rubyName" class="w-full font-mono" placeholder="包囲（ほうい）の搭（とう）" />
          </UFormField>
          <div>
            <div class="mb-2 text-xs text-muted">印刷例外（同名不同印刷的读音，键为 系列:编号）</div>
            <div v-for="(ex, i) in editForm.exceptions" :key="i" class="mb-2 flex gap-2">
              <UInput v-model="ex.key" class="w-32 font-mono" placeholder="2x2:117" />
              <UInput v-model="ex.rubyName" class="flex-1 font-mono" placeholder="稲妻（いなづま）" />
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="editForm.exceptions.splice(i, 1)" />
            </div>
            <UButton label="添加例外" icon="i-lucide-plus" size="xs" color="neutral" variant="soft" @click="editForm.exceptions.push({ key: '', rubyName: '' })" />
          </div>
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

definePageMeta({ layout: 'admin', title: '卡名注音' });

type RubyStatus = 'draft' | 'reviewed';
type RubyKind = 'name' | 'flavor_name';

interface RubyRow {
  lang:           string;
  kind:           RubyKind;
  name:           string;
  rubyName:       string;
  exceptions:     Record<string, string> | null;
  source:         string;
  status:         RubyStatus;
  updatedAt:      string;
  exceptionsList: Array<{ key: string, rubyName: string }>;
}

interface RubyTarget {
  cardId:    string;
  set:       string;
  number:    string;
  partIndex: number;
}

const loading = ref(false);
const saving = ref(false);
const promoting = ref(false);
const error = ref('');

const items = ref<RubyRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const statusFilter = ref<RubyStatus | 'all'>('draft');
const sourceFilter = ref<string>('all');
const searchInput = ref('');
const search = ref('');
const counts = ref<{
  draft:    number;
  reviewed: number;
  bySource: Array<{ source: string, status: RubyStatus, count: number }>;
}>({ draft: 0, reviewed: 0, bySource: [] });

/** One representative printing per reading, so a row can be checked against the site. */
const targets = ref<Record<string, RubyTarget>>({});

/** Stored card image of that printing, keyed the same way as `targets`. */
const previews = ref<Record<string, string>>({});

function previewOf(row: RubyRow): string | undefined {
  return previews.value[previewKey(row)];
}

const zoomOpen = ref(false);
const zoomSrc = ref('');
const zoomTitle = ref('');

/** The image is already stored at native resolution; the dialog only gives it room. */
function zoom(row: RubyRow) {
  const src = previewOf(row);
  if (src == null) return;
  zoomSrc.value = src;
  zoomTitle.value = row.name;
  zoomOpen.value = true;
}

function previewKey(row: RubyRow): string {
  const target = targetOf(row);
  return target == null ? '' : `${target.set}\u0000${row.lang}\u0000${target.number}\u0000${target.partIndex}`;
}

const statusItems = [
  { label: '草稿', value: 'draft' },
  { label: '已通过', value: 'reviewed' },
  { label: '全部', value: 'all' },
];

const sourceItems = computed(() => [
  { label: '全部来源', value: 'all' },
  ...[...new Set(counts.value.bySource.map(s => s.source))].sort().map(s => ({ label: sourceLabel(s), value: s })),
]);

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    mtga_loc:         'MTGA',
    scryfall_salvage: '印刷名回收',
    manual:           '人工录入',
    hand_test:        '测试',
  };
  return labels[source] ?? (source || '未知');
}

function keyOf(row: Pick<RubyRow, 'lang' | 'kind' | 'name'>): string {
  return `${row.lang}\u0000${row.kind}\u0000${row.name}`;
}

function targetOf(row: RubyRow): RubyTarget | undefined {
  return targets.value[keyOf({ lang: row.lang, kind: 'name', name: row.name })];
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await orpc.magic.ruby.list({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      source: sourceFilter.value === 'all' ? undefined : sourceFilter.value,
      search: search.value || undefined,
      page:   page.value,
      pageSize,
    });
    items.value = res.items;
    total.value = res.total;
    counts.value = res.counts;
    targets.value = items.value.length > 0
      ? await orpc.magic.ruby.targets({
        keys: items.value.map(row => ({ lang: row.lang, kind: row.kind, name: row.name })),
      })
      : {};
    await loadPreviews();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

/** Thumbnails load separately: rows render immediately, images fill in after. */
async function loadPreviews() {
  previews.value = {};
  const requests = [...new Set(items.value.map(row => previewKey(row)).filter(key => key !== ''))]
    .map(key => {
      const [set, lang, number, partIndex] = key.split('\u0000');
      return { set: set!, lang: lang!, number: number!, partIndex: Number(partIndex) };
    });
  if (requests.length === 0) return;
  try {
    previews.value = await orpc.magic.ruby.previews({ targets: requests });
  } catch {
    // A missing or unreadable image must not fail the review list itself.
    previews.value = {};
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

watch([statusFilter, sourceFilter], () => {
  page.value = 1;
  void load();
});

async function promoteRow(row: RubyRow) {
  await runPromote({ names: [{ lang: row.lang, kind: row.kind, name: row.name }] });
}

/**
 * Bulk promotion follows the current narrowing: a chosen source promotes every
 * draft of that source, a search term promotes every match, and an unfiltered
 * view promotes the rows on screen — so a click can never promote more than
 * what the console is showing.
 */
async function promoteFiltered() {
  if (sourceFilter.value !== 'all') {
    await runPromote({ source: sourceFilter.value });
    return;
  }
  if (search.value !== '') {
    await runPromote({ search: search.value });
    return;
  }
  const names = items.value.filter(row => row.status === 'draft')
    .map(row => ({ lang: row.lang, kind: row.kind, name: row.name }));
  if (names.length === 0) {
    error.value = '当前页没有草稿可转正。';
    return;
  }
  await runPromote({ names });
}

async function runPromote(selector: { source?: string, search?: string, names?: Array<{ lang: string, kind: RubyKind, name: string }> }) {
  promoting.value = true;
  error.value = '';
  try {
    await orpc.magic.ruby.promote(selector);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    promoting.value = false;
  }
}

async function demoteRow(row: RubyRow) {
  await orpc.magic.ruby.update({
    lang:     row.lang,
    kind:     row.kind,
    name:     row.name,
    rubyName: row.rubyName,
    status:   'draft',
  });
  await load();
}

// --- edit ---
const editOpen = ref(false);
const editError = ref('');
const editForm = reactive<{
  lang:       string;
  kind:       RubyKind;
  name:       string;
  rubyName:   string;
  exceptions: Array<{ key: string, rubyName: string }>;
}>({ lang: 'ja', kind: 'name', name: '', rubyName: '', exceptions: [] });

function openEdit(row: RubyRow) {
  editError.value = '';
  editForm.lang = row.lang;
  editForm.kind = row.kind;
  editForm.name = row.name;
  editForm.rubyName = row.rubyName;
  editForm.exceptions = row.exceptionsList.map(e => ({ ...e }));
  editOpen.value = true;
}

async function saveEdit() {
  saving.value = true;
  editError.value = '';
  try {
    await orpc.magic.ruby.update({
      lang:       editForm.lang,
      kind:       editForm.kind,
      name:       editForm.name,
      rubyName:   editForm.rubyName,
      exceptions: editForm.exceptions.filter(e => e.key.trim() !== '' && e.rubyName.trim() !== ''),
    });
    editOpen.value = false;
    await load();
  } catch (err) {
    editError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
