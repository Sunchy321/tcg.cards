<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-folder-open"
              class="size-5 text-primary-500"
            />
            <h1 class="text-xl font-semibold">
              Set 管理
            </h1>
          </div>
          <p class="mt-1 text-sm text-slate-500">
            查询和编辑 hearthstone.sets 与 hearthstone.set_localizations。
          </p>
        </div>
        <UButton
          label="刷新"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="loading"
          @click="loadSets()"
        />
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="mb-3 font-medium text-slate-700">
            筛选
          </div>
          <div class="space-y-3">
            <UInput
              v-model="filters.q"
              icon="i-lucide-search"
              placeholder="搜索 setId / dbfId / slug / rawName"
              class="w-full"
              @keyup.enter="searchSets"
            />
            <div class="grid gap-3 md:grid-cols-2">
              <UInput
                v-model="filters.type"
                placeholder="按 type 筛选"
                class="w-full"
                @keyup.enter="searchSets"
              />
              <UInput
                v-model="filters.group"
                placeholder="按 group 筛选"
                class="w-full"
                @keyup.enter="searchSets"
              />
            </div>
            <div class="flex justify-end gap-2">
              <UButton
                label="清空"
                color="neutral"
                variant="ghost"
                @click="resetFilters"
              />
              <UButton
                label="查询"
                icon="i-lucide-search"
                :loading="loading"
                @click="searchSets"
              />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div class="font-medium text-slate-700">
                Set 列表
              </div>
              <p class="text-xs text-slate-400">
                共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页
              </p>
            </div>
            <UBadge
              :label="`${items.length} 条`"
              color="neutral"
              variant="soft"
            />
          </div>

          <div
            v-if="loading && items.length === 0"
            class="flex justify-center py-10"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="size-6 animate-spin text-slate-400"
            />
          </div>
          <div
            v-else-if="items.length === 0"
            class="py-10 text-center text-sm text-slate-400"
          >
            没有匹配的 Set
          </div>
          <div
            v-else
            class="max-h-[36rem] space-y-2 overflow-y-auto p-2"
          >
            <button
              v-for="item in items"
              :key="item.setId"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedSetId === item.setId ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'"
              @click="selectSet(item.setId)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-medium">{{ item.setId }}</span>
                    <span
                      v-if="item.dbfId != null"
                      class="font-mono text-xs text-slate-400"
                    >#{{ item.dbfId }}</span>
                  </div>
                  <div class="mt-1 truncate text-xs text-slate-400">
                    {{ preferredName(item) }}
                  </div>
                </div>
                <UBadge
                  :label="item.type"
                  color="primary"
                  variant="soft"
                  size="xs"
                />
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge
                  v-if="item.slug"
                  :label="item.slug"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  v-if="item.rawName"
                  :label="item.rawName"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
                <UBadge
                  v-if="item.group"
                  :label="item.group"
                  color="warning"
                  variant="soft"
                  size="xs"
                />
              </div>
              <div class="mt-2 text-xs text-slate-400">
                {{ item.releaseDate || '无发售日期' }}
              </div>
            </button>
          </div>

          <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <UButton
              label="上一页"
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="soft"
              :disabled="page <= 1 || loading"
              @click="goPage(page - 1)"
            />
            <span class="text-xs text-slate-400">{{ page }} / {{ totalPages }}</span>
            <UButton
              label="下一页"
              trailing-icon="i-lucide-chevron-right"
              color="neutral"
              variant="soft"
              :disabled="page >= totalPages || loading"
              @click="goPage(page + 1)"
            />
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div class="font-medium text-slate-700">
              编辑配置
            </div>
            <p class="mt-1 text-xs text-slate-400">
              setId 为主键不可修改，localization 保存时整组覆盖。
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              label="重新加载"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              :disabled="selectedSetId == null || detailLoading"
              :loading="detailLoading"
              @click="selectedSetId != null && selectSet(selectedSetId)"
            />
            <UButton
              label="保存"
              icon="i-lucide-save"
              :loading="saving"
              :disabled="!canSave"
              @click="saveSet"
            />
          </div>
        </div>

        <div
          v-if="form.setId.length === 0"
          class="py-24 text-center text-sm text-slate-400"
        >
          请先从左侧选择一个 Set
        </div>
        <div
          v-else
          class="space-y-5 p-4"
        >
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="formError"
          />
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                setId
              </div>
              <UInput
                :model-value="form.setId"
                disabled
                class="w-full font-mono"
              />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                dbfId
              </div>
              <UInput
                v-model="form.dbfId"
                placeholder="整数，可留空"
                class="w-full"
              />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                slug
              </div>
              <UInput
                v-model="form.slug"
                placeholder="slug，可留空"
                class="w-full"
              />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                rawName
              </div>
              <UInput
                v-model="form.rawName"
                placeholder="raw enum name，可留空"
                class="w-full"
              />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                type
              </div>
              <UInput
                v-model="form.type"
                placeholder="例如 unknown / core"
                class="w-full"
              />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                group
              </div>
              <UInput
                v-model="form.group"
                placeholder="分组，可留空"
                class="w-full"
              />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                releaseDate
              </div>
              <UInput
                v-model="form.releaseDate"
                placeholder="YYYY-MM-DD"
                class="w-full"
              />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                cardCountFull
              </div>
              <UInput
                v-model="form.cardCountFull"
                placeholder="整数，可留空"
                class="w-full"
              />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">
                cardCount
              </div>
              <UInput
                v-model="form.cardCount"
                placeholder="整数，可留空"
                class="w-full"
              />
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium text-slate-700">
                  Localization
                </div>
                <p class="mt-1 text-xs text-slate-400">
                  支持多语言名称，保存时整组覆盖。
                </p>
              </div>
              <UButton
                label="新增语言"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                @click="addLocalization"
              />
            </div>
            <div
              v-if="form.localization.length === 0"
              class="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400"
            >
              暂无 localization，点击"新增语言"添加。
            </div>
            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="item in form.localization"
                :key="item.key"
                class="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"
              >
                <UInput
                  v-model="item.lang"
                  placeholder="lang，例如 zhs / en"
                  class="w-full"
                />
                <UInput
                  v-model="item.name"
                  placeholder="显示名称"
                  class="w-full"
                />
                <div class="flex justify-end">
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeLocalization(item.key)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useToast } from '@nuxt/ui/composables/useToast.js';
import { useApiClient } from '../../../composables/useApiClient';
import type { Router } from '../../../../../service-internal/src/orpc/service';
import type { SetLocalization, SetProfile } from '#model/hearthstone/schema/set';

const orpc = useApiClient<Router>();
const toast = useToast();

interface LocalizationFormItem {
  key:  string;
  lang: string;
  name: string;
}

const filters = reactive({ q: '', type: '', group: '' });
const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const formError = ref('');
const items = ref<SetProfile[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(50);
const selectedSetId = ref<string | null>(null);
const nextLocKey = ref(0);

const form = reactive({
  setId:         '',
  dbfId:         '',
  slug:          '',
  rawName:       '',
  type:          '',
  releaseDate:   '',
  cardCountFull: '',
  cardCount:     '',
  group:         '',
  localization:  [] as LocalizationFormItem[],
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));
const canSave = computed(() => form.setId.length > 0 && form.type.trim().length > 0 && !saving.value && !detailLoading.value);

function createLocRow(item?: Partial<SetLocalization>): LocalizationFormItem {
  nextLocKey.value += 1;
  return { key: `loc-${nextLocKey.value}`, lang: item?.lang ?? '', name: item?.name ?? '' };
}

function preferredName(item: SetProfile) {
  const zh = item.localization.find(loc => loc.lang === 'zhs');
  if (zh) return zh.name;
  const en = item.localization.find(loc => loc.lang === 'en');
  if (en) return en.name;
  return item.localization[0]?.name ?? item.rawName ?? item.slug ?? '未命名';
}

function applyProfile(item: SetProfile) {
  form.setId = item.setId;
  form.dbfId = item.dbfId == null ? '' : String(item.dbfId);
  form.slug = item.slug ?? '';
  form.rawName = item.rawName ?? '';
  form.type = item.type;
  form.releaseDate = item.releaseDate;
  form.cardCountFull = item.cardCountFull == null ? '' : String(item.cardCountFull);
  form.cardCount = item.cardCount == null ? '' : String(item.cardCount);
  form.group = item.group ?? '';
  form.localization = item.localization.map(loc => createLocRow(loc));
  formError.value = '';
}

function resetForm() {
  form.setId = ''; form.dbfId = ''; form.slug = ''; form.rawName = ''; form.type = '';
  form.releaseDate = ''; form.cardCountFull = ''; form.cardCount = ''; form.group = ''; form.localization = []; formError.value = '';
}

function resetFilters() { filters.q = ''; filters.type = ''; filters.group = ''; void loadSets(1); }

function addLocalization() { form.localization.push(createLocRow()); }
function removeLocalization(key: string) { form.localization = form.localization.filter(item => item.key !== key); }

function parseNullableInt(value: string, field: string) {
  const text = value.trim();
  if (text.length === 0) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} 必须是整数`);
  return parsed;
}

function normalizeNullableText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

async function loadSets(targetPage = page.value) {
  loading.value = true;
  try {
    const result = await orpc.hearthstone.set.list({
      q:     filters.q.trim().length > 0 ? filters.q.trim() : undefined,
      type:  filters.type.trim().length > 0 ? filters.type.trim() : undefined,
      group: filters.group.trim().length > 0 ? filters.group.trim() : undefined,
      page:  targetPage,
      limit: limit.value,
    });
    items.value = result.items;
    total.value = result.total;
    page.value = result.page;
    limit.value = result.limit;
    if (selectedSetId.value && !items.value.some(item => item.setId === selectedSetId.value)) {
      selectedSetId.value = null; resetForm();
    }
    if (selectedSetId.value == null && items.value.length > 0) {
      await selectSet(items.value[0]!.setId);
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '操作失败';
  } finally {
    loading.value = false;
  }
}

function searchSets() { void loadSets(1); }
function goPage(targetPage: number) { void loadSets(targetPage); }

async function selectSet(setId: string) {
  selectedSetId.value = setId; detailLoading.value = true; formError.value = '';
  try {
    const detail = await orpc.hearthstone.set.get({ setId });
    applyProfile(detail);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '操作失败';
  } finally {
    detailLoading.value = false;
  }
}

async function saveSet() {
  formError.value = ''; saving.value = true;
  try {
    const result = await orpc.hearthstone.set.update({
      setId:         form.setId,
      dbfId:         parseNullableInt(form.dbfId, 'dbfId'),
      slug:          normalizeNullableText(form.slug),
      rawName:       normalizeNullableText(form.rawName),
      type:          form.type.trim(),
      releaseDate:   form.releaseDate,
      cardCountFull: parseNullableInt(form.cardCountFull, 'cardCountFull'),
      cardCount:     parseNullableInt(form.cardCount, 'cardCount'),
      group:         normalizeNullableText(form.group),
      localization:  form.localization.map(item => ({ lang: item.lang.trim(), name: item.name.trim() })).filter(item => item.lang.length > 0 && item.name.length > 0),
    });
    applyProfile(result);
    await loadSets(page.value);
    toast.add({ title: '保存成功', description: `已更新 Set ${result.setId}`, color: 'success' });
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '操作失败';
    toast.add({ title: '保存失败', description: formError.value, color: 'error' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => { void loadSets(); });
</script>
