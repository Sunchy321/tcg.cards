<template>
  <div class="flex h-full gap-4 overflow-hidden p-4">
    <!-- Sidebar list -->
    <div class="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm font-medium text-slate-700">公告列表</span>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-globe" size="xs" variant="ghost" :loading="crawling" @click="handleCrawl" />
          <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="createNew" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div
          v-for="item in announcements"
          :key="item.id"
          class="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
          :class="selectedId === item.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-100'"
          @click="selectAnnouncement(item)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{{ item.name }}</div>
            <div class="flex items-center gap-1 text-xs text-slate-400">
              <span>{{ item.date }}</span>
              <span>·</span>
              <span>{{ item.source }}</span>
            </div>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" class="opacity-0 group-hover:opacity-100" @click.stop="confirmDelete(item)" />
        </div>
        <p v-if="announcements.length === 0 && !loading" class="py-8 text-center text-sm text-slate-400">暂无公告</p>
        <div v-if="loading" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-slate-400" />
        </div>
      </div>
    </div>

    <!-- Edit panel -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <template v-if="selectedAnnouncement || isCreating">
        <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <span class="text-sm text-slate-500">编辑公告</span>
          <div class="flex items-center gap-2">
            <UButton v-if="form.id" icon="i-lucide-wand" label="投影" color="neutral" variant="ghost" size="sm" :loading="projecting" @click="handleProject" />
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <div class="grid grid-cols-4 gap-4">
            <UFormField label="来源" required>
              <USelect v-model="form.source" :items="sourceOptions" class="w-full" />
            </UFormField>
            <UFormField label="日期" required>
              <UInput v-model="form.date" type="date" />
            </UFormField>
            <UFormField label="生效日期">
              <UInput v-model="form.effectiveDate" type="date" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="版本" required>
              <USelect v-model="form.version" :items="patchOptions" placeholder="选择版本" class="w-full" />
            </UFormField>
            <UFormField label="对比版本">
              <USelect v-model="form.lastVersion" :items="patchOptionsWithEmpty" placeholder="留空则与版本相同" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="名称" required>
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(link, index) in form.link" :key="index" class="flex gap-2">
                <UInput v-model="link.url" placeholder="URL" class="flex-1" />
                <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
                <UButton icon="i-lucide-external-link" size="sm" color="neutral" variant="ghost" :disabled="!link.url" @click="openUrl(link.url)" />
                <UButton v-show="link.label === 'blizzard'" icon="i-lucide-sparkles" size="sm" color="primary" variant="ghost" :disabled="!aiConfigured || !link.url" :loading="link._parsing" @click="handleAiParse(index)" />
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>

          <!-- Items -->
          <div class="border-t border-slate-200 pt-4">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目</span>
              <UButton icon="i-lucide-plus" label="添加条目" size="xs" @click="addItem" />
            </div>
            <div class="space-y-3">
              <div v-for="(item, index) in form.items" :key="index" class="relative rounded-lg border border-slate-200 p-3">
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" class="absolute right-2 top-2" @click="removeItem(index)" />
                <div class="grid grid-cols-4 gap-3 pr-6">
                  <UFormField label="类型" required>
                    <USelect v-model="item.type" :items="itemTypeOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="状态">
                    <USelect v-model="item.status" :items="statusOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="赛制 (keyword)">
                    <UInput v-model="item.format" placeholder="standard / constructed" />
                  </UFormField>
                  <UFormField label="名称">
                    <UInput v-model="item.name" placeholder="变更描述" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-4 gap-3">
                  <UFormField label="卡牌ID"><UInput v-model="item.cardId" /></UFormField>
                  <UFormField label="系列ID"><UInput v-model="item.setId" /></UFormField>
                  <UFormField label="规则ID"><UInput v-model="item.ruleId" /></UFormField>
                  <UFormField label="分组"><UInput v-model="item.group" /></UFormField>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <UFormField label="relatedCards">
                    <UInput v-model="item.relatedCardsStr" placeholder="card1, card2" />
                  </UFormField>
                  <UFormField label="分数"><UInputNumber v-model="item.score" :min="1" /></UFormField>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
        <UIcon name="i-lucide-file-text" class="size-10 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton icon="i-lucide-plus" label="创建新公告" @click="createNew" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', title: '公告管理' });

import { openUrl } from '@tauri-apps/plugin-opener';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { computed, onMounted, reactive, ref } from 'vue';

const client = useDesktopRuntimeClient();

interface LinkEntry { url: string; label?: string; _parsing?: boolean }
interface ItemForm {
  id?: string; type: string; name: string; effectiveDate: string; format: string;
  status: string; score?: number; group: string; version?: number; lastVersion?: number;
  cardId: string; setId: string; ruleId: string; relatedCardsStr: string;
}

const announcements = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const projecting = ref(false);
const aiConfigured = ref(false);
const crawling = ref(false);
const patches = ref<Array<{ buildNumber: number; name: string }>>([]);
const patchOptions = computed(() => patches.value.map(p => ({ label: `${p.buildNumber} · ${p.name}`, value: p.buildNumber })));
const patchOptionsWithEmpty = computed(() => [{ label: '(与版本相同)', value: undefined }, ...patchOptions.value]);

const emptyItem = (): ItemForm => ({
  type: 'card_update', name: '', effectiveDate: '', format: '', status: '',
  score: undefined, group: '', version: undefined, lastVersion: undefined,
  cardId: '', setId: '', ruleId: '', relatedCardsStr: '',
});

const form = reactive({
  id: '', source: 'blizzard', date: new Date().toISOString().split('T')[0]!,
  effectiveDate: '', version: 1, lastVersion: undefined, name: '',
  link: [] as LinkEntry[], items: [] as ItemForm[],
});

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [{ label: 'Blizzard', value: 'blizzard' }, { label: '系列发售', value: 'release' }];

const itemTypeOptions = [
  { label: 'card_change', value: 'card_change' }, { label: 'card_update', value: 'card_update' },
  { label: 'set_change', value: 'set_change' }, { label: 'rule_change', value: 'rule_change' },
  { label: 'format_birth', value: 'format_birth' }, { label: 'format_death', value: 'format_death' },
];

const statusOptions = [
  { label: 'buff', value: 'buff' }, { label: 'nerf', value: 'nerf' },
  { label: 'tweak', value: 'tweak' }, { label: 'revert', value: 'revert' },
  { label: 'rework', value: 'rework' }, { label: 'text_fix', value: 'text_fix' },
  { label: 'text_adjust', value: 'text_adjust' }, { label: 'bugged', value: 'bugged' },
  { label: 'bugfix', value: 'bugfix' }, { label: 'banned', value: 'banned' },
  { label: 'banned_in_card_pool', value: 'banned_in_card_pool' }, { label: 'banned_in_deck', value: 'banned_in_deck' },
  { label: 'legal', value: 'legal' }, { label: 'unavailable', value: 'unavailable' },
  { label: 'minor', value: 'minor' }, { label: 'score', value: 'score' },
  { label: 'extend', value: 'extend' },
];

import { useToast } from '@nuxt/ui/composables';
const toast = useToast();

function showToast(title: string, description?: string, color?: 'error' | 'success') {
  toast.add({ title, description, color });
}

function parseRelatedCards(s: string): string[] {
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

function resetForm() {
  Object.assign(form, {
    id: '', source: 'blizzard', date: new Date().toISOString().split('T')[0]!,
    effectiveDate: '', version: 1, lastVersion: undefined, name: '', link: [], items: [],
  });
  selectedId.value = null; isCreating.value = false;
}

function fillForm(row: any) {
  Object.assign(form, {
    id: row.id, source: row.source, date: row.date,
    effectiveDate: row.effectiveDate ?? '', version: row.version,
    lastVersion: row.lastVersion ?? undefined, name: row.name,
    link: Array.isArray(row.link) ? row.link : [],
  });
  form.items = (row.items ?? []).map((i: any) => ({
    id: i.id, type: i.type ?? 'card_update', name: i.name ?? '',
    effectiveDate: i.effectiveDate ?? '', format: i.format ?? '', status: i.status ?? '',
    score: i.score ?? undefined, group: i.group ?? '',
    version: i.version, lastVersion: i.lastVersion,
    cardId: i.cardId ?? '', setId: i.setId ?? '', ruleId: i.ruleId ?? '',
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
  }));
  isCreating.value = false;
}

function selectAnnouncement(item: any) {
  selectedId.value = item.id;
  loadDetail(item.id);
}

async function loadDetail(id: string) {
  try {
    const detail: any = await client.hearthstone.announcement.get({ id });
    fillForm(detail);
  } catch (e: any) { showToast('加载详情失败', e.message, 'error'); }
}

function createNew() { resetForm(); isCreating.value = true; }
function addLink() { form.link.push({ url: '', label: '' }); }

async function handleCrawl() {
  crawling.value = true;
  try {
    const result: any = await client.hearthstone.announcement.crawlLinks({});

    resetForm();
    isCreating.value = true;

    form.name = result.name ?? '';
    form.date = result.date || new Date().toISOString().split('T')[0]!;
    form.link = (result.links ?? []).map((l: any) => ({ url: l.url, label: l.label }));
  } catch (e: any) {
    showToast('获取失败', e.message, 'error');
  } finally { crawling.value = false; }
}
function removeLink(i: number) { form.link.splice(i, 1); }
function addItem() { form.items.push(emptyItem()); }
function removeItem(i: number) { form.items.splice(i, 1); }

async function handleAiParse(index: number) {
  const link = form.link[index];
  if (!link?.url || !form.name) return;
  link._parsing = true;
  try {
    const result: any = await client.hearthstone.announcement.aiParse({
      name: form.name,
      links: [{ url: link.url, label: link.label }],
    });
    const items: ItemForm[] = (result.items ?? []).map((i: any) => ({
      type: i.type ?? 'card_update', name: i.name ?? '', format: i.format ?? '',
      status: i.status ?? '', score: i.score ?? undefined, group: i.group ?? '',
      cardId: i.cardId ?? '', setId: i.setId ?? '', ruleId: i.ruleId ?? '',
      effectiveDate: '', version: undefined, lastVersion: undefined,
      relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    }));
    form.items = [...form.items, ...items];
  } catch (e: any) {
    showToast('AI 解析失败', e.message, 'error');
  } finally { link._parsing = false; }
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = (await client.hearthstone.announcement.list({})) as any[];
  } catch (e: any) { showToast('加载失败', e.message, 'error'); }
  finally { loading.value = false; }
}

async function handleSubmit() {
  if (!form.name.trim()) { showToast('名称不能为空', '', 'error'); return; }
  saving.value = true;
  try {
    const payload = {
      source: form.source, date: form.date, effectiveDate: form.effectiveDate || null,
      version: form.version, lastVersion: form.lastVersion ?? null, name: form.name.trim(),
      link: form.link.filter(l => l.url),
      items: form.items.map(item => ({
        type: item.type, name: item.name || null, effectiveDate: item.effectiveDate || null,
        format: item.format || null, status: item.status || null, score: item.score ?? null,
        group: item.group || null, version: item.version ?? null, lastVersion: item.lastVersion ?? null,
        cardId: item.cardId || null, setId: item.setId || null, ruleId: item.ruleId || null,
        relatedCards: parseRelatedCards(item.relatedCardsStr),
        formats: [] as string[], cardIds: [] as string[],
        delta: null, glow: null, patchId: null,
      })),
    };
    if (isCreating.value) {
      await client.hearthstone.announcement.create(payload);
    } else if (form.id) {
      await client.hearthstone.announcement.update({ id: form.id, ...payload });
    }
    showToast('保存成功', '', 'success');
    await loadAnnouncements();
    resetForm();
  } catch (e: any) { showToast('保存失败', e.message, 'error'); }
  finally { saving.value = false; }
}

async function handleProject() {
  if (!form.id) return;
  projecting.value = true;
  try {
    await client.hearthstone.announcement.project({ announcementId: form.id });
    showToast('投影完成', '', 'success');
    await loadDetail(form.id);
  } catch (e: any) { showToast('投影失败', e.message, 'error'); }
  finally { projecting.value = false; }
}

function confirmDelete(item: any) {
  if (confirm(`确定要删除公告"${item.name}"吗？`)) handleDelete(item);
}
async function handleDelete(item: any) {
  try {
    await client.hearthstone.announcement.remove({ id: item.id });
    showToast('删除成功', '', 'success');
    if (selectedId.value === item.id) resetForm();
    await loadAnnouncements();
  } catch (e: any) { showToast('删除失败', e.message, 'error'); }
}

onMounted(async () => {
  await loadAnnouncements();
  try {
    const [health, patchList]: any[] = await Promise.all([
      client.runtime.health(),
      (client.hearthstone.announcement as any).patches(),
    ]);
    aiConfigured.value = !!health.aiConfigured;
    patches.value = patchList ?? [];
    if (patchList?.length > 0) form.version = patchList[0].buildNumber;
  } catch { /* ignore */ }
});
</script>
