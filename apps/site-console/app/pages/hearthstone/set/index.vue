<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-folder-open" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Set 管理</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            查询和编辑 `hearthstone.sets` 与 `hearthstone.set_localizations`。修改 `dbfId` 会直接影响导入映射和图片导出请求。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
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
    </UCard>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div class="space-y-4">
        <UCard>
          <template #header>
            <div>
              <div class="font-medium">筛选</div>
              <p class="mt-1 text-xs text-muted">可按 setId、dbfId、slug、rawName、本地化名称、type 和 group 搜索。</p>
            </div>
          </template>

          <div class="space-y-3">
            <UInput
              v-model="filters.q"
              icon="i-lucide-search"
              placeholder="搜索 setId / dbfId / slug / rawName / localization"
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
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
              <UButton label="查询" icon="i-lucide-search" :loading="loading" @click="searchSets" />
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">Set 列表</div>
                <p class="mt-1 text-xs text-muted">
                  共 {{ total }} 条，当前第 {{ page }} / {{ totalPages }} 页
                </p>
              </div>
              <UBadge :label="`${items.length} 条`" color="neutral" variant="soft" />
            </div>
          </template>

          <div v-if="loading && items.length === 0" class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
          </div>
          <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-muted">
            没有匹配的 Set
          </div>
          <div v-else class="max-h-160 space-y-2 overflow-y-auto pr-1">
            <button
              v-for="item in items"
              :key="item.setId"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-elevated"
              :class="selectedSetId === item.setId ? 'border-primary bg-primary/5' : 'border-default'"
              @click="selectSet(item.setId)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-medium">{{ item.setId }}</span>
                    <span v-if="item.dbfId != null" class="font-mono text-xs text-muted">#{{ item.dbfId }}</span>
                  </div>
                  <div class="mt-1 truncate text-xs text-muted">
                    {{ preferredName(item) }}
                  </div>
                </div>
                <UBadge :label="item.type" color="primary" variant="soft" size="xs" />
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
              <div class="mt-2 text-xs text-muted">
                {{ item.releaseDate.length > 0 ? item.releaseDate : '无发售日期' }}
              </div>
            </button>
          </div>

          <template #footer>
            <div class="flex items-center justify-between gap-3">
              <UButton
                label="上一页"
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="soft"
                :disabled="page <= 1 || loading"
                @click="goPage(page - 1)"
              />
              <span class="text-xs text-muted">{{ page }} / {{ totalPages }}</span>
              <UButton
                label="下一页"
                trailing-icon="i-lucide-chevron-right"
                color="neutral"
                variant="soft"
                :disabled="page >= totalPages || loading"
                @click="goPage(page + 1)"
              />
            </div>
          </template>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div class="font-medium">编辑配置</div>
              <p class="mt-1 text-xs text-muted">
                当前页面只编辑已有 `set`。`setId` 为主键不可修改，localization 会在保存时整组覆盖。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
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
        </template>

        <div v-if="form.setId.length === 0" class="py-24 text-center text-sm text-muted">
          请先从左侧选择一个 Set
        </div>

        <div v-else class="space-y-5">
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="formError"
          />

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">setId</div>
              <UInput :model-value="form.setId" disabled class="w-full font-mono" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">dbfId</div>
              <UInput v-model="form.dbfId" placeholder="整数，可留空" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">slug</div>
              <UInput v-model="form.slug" placeholder="slug，可留空" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">rawName</div>
              <UInput v-model="form.rawName" placeholder="raw enum name，可留空" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">type</div>
              <UInput v-model="form.type" placeholder="类型，例如 unknown / core" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">group</div>
              <UInput v-model="form.group" placeholder="分组，可留空" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <div class="space-y-2">
              <div class="text-xs text-muted">releaseDate</div>
              <UInput v-model="form.releaseDate" placeholder="YYYY-MM-DD 或空字符串" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">cardCountFull</div>
              <UInput v-model="form.cardCountFull" placeholder="整数，可留空" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">cardCount</div>
              <UInput v-model="form.cardCount" placeholder="整数，可留空" class="w-full" />
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">Localization</div>
                <p class="mt-1 text-xs text-muted">支持多语言名称；保存时将完整覆盖当前记录。</p>
              </div>
              <UButton
                label="新增语言"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                @click="addLocalization()"
              />
            </div>

            <div v-if="form.localization.length === 0" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
              暂无 localization，点击“新增语言”添加。
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="item in form.localization"
                :key="item.key"
                class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"
              >
                <UInput v-model="item.lang" placeholder="lang，例如 zhs / en" class="w-full" />
                <UInput v-model="item.name" placeholder="显示名称" class="w-full" />
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
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  SetLocalization,
  SetProfile,
} from '#model/hearthstone/schema/set';

definePageMeta({
  layout: 'admin',
  title:  '系列管理',
});

interface LocalizationFormItem {
  key:  string;
  lang: string;
  name: string;
}

const { $orpc } = useNuxtApp();
const toast = useToast();

const filters = reactive({
  q:     '',
  type:  '',
  group: '',
});

const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const formError = ref('');

const items = ref<SetProfile[]>([]);
const total = ref(0);
const page = ref(1);
const limit = ref(50);
const selectedSetId = ref<string | null>(null);

const nextLocalizationKey = ref(0);

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
const canSave = computed(() => (
  form.setId.length > 0
  && form.type.trim().length > 0
  && !saving.value
  && !detailLoading.value
));

function createLocalizationRow(item?: Partial<SetLocalization>): LocalizationFormItem {
  nextLocalizationKey.value += 1;

  return {
    key:  `loc-${nextLocalizationKey.value}`,
    lang: item?.lang ?? '',
    name: item?.name ?? '',
  };
}

function preferredName(item: SetProfile) {
  const zh = item.localization.find(loc => loc.lang === 'zhs');
  if (zh) {
    return zh.name;
  }

  const en = item.localization.find(loc => loc.lang === 'en');
  if (en) {
    return en.name;
  }

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
  form.localization = item.localization.map(loc => createLocalizationRow(loc));
  formError.value = '';
}

function resetForm() {
  form.setId = '';
  form.dbfId = '';
  form.slug = '';
  form.rawName = '';
  form.type = '';
  form.releaseDate = '';
  form.cardCountFull = '';
  form.cardCount = '';
  form.group = '';
  form.localization = [];
  formError.value = '';
}

function resetFilters() {
  filters.q = '';
  filters.type = '';
  filters.group = '';
  void loadSets(1);
}

function addLocalization() {
  form.localization.push(createLocalizationRow());
}

function removeLocalization(key: string) {
  form.localization = form.localization.filter(item => item.key !== key);
}

function parseNullableInt(value: string, field: string) {
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${field} 必须是整数`);
  }

  return parsed;
}

function normalizeNullableText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

async function loadSets(targetPage = page.value) {
  loading.value = true;

  try {
    const result = await $orpc.hearthstone.set.list({
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
      selectedSetId.value = null;
      resetForm();
    }

    if (selectedSetId.value == null && items.value.length > 0) {
      await selectSet(items.value[0]!.setId);
    }
  } catch (error) {
    formError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function searchSets() {
  void loadSets(1);
}

function goPage(targetPage: number) {
  void loadSets(targetPage);
}

async function selectSet(setId: string) {
  selectedSetId.value = setId;
  detailLoading.value = true;
  formError.value = '';

  try {
    const detail = await $orpc.hearthstone.set.get({ setId });
    applyProfile(detail);
  } catch (error) {
    formError.value = getErrorMessage(error);
  } finally {
    detailLoading.value = false;
  }
}

function buildLocalizationPayload() {
  return form.localization.map(item => ({
    lang: item.lang.trim(),
    name: item.name.trim(),
  }))
    .filter(item => item.lang.length > 0 && item.name.length > 0);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '操作失败';
}

async function saveSet() {
  formError.value = '';
  saving.value = true;

  try {
    const result = await $orpc.hearthstone.set.update({
      setId:         form.setId,
      dbfId:         parseNullableInt(form.dbfId, 'dbfId'),
      slug:          normalizeNullableText(form.slug),
      rawName:       normalizeNullableText(form.rawName),
      type:          form.type.trim(),
      releaseDate:   form.releaseDate,
      cardCountFull: parseNullableInt(form.cardCountFull, 'cardCountFull'),
      cardCount:     parseNullableInt(form.cardCount, 'cardCount'),
      group:         normalizeNullableText(form.group),
      localization:  buildLocalizationPayload(),
    });

    applyProfile(result);
    await loadSets(page.value);

    toast.add({
      title:       '保存成功',
      description: `已更新 Set ${result.setId}`,
      color:       'success',
      icon:        'i-lucide-circle-check-big',
    });
  } catch (error) {
    formError.value = getErrorMessage(error);
    toast.add({
      title:       '保存失败',
      description: formError.value,
      color:       'error',
      icon:        'i-lucide-circle-alert',
    });
  } finally {
    saving.value = false;
  }
}

await loadSets();
</script>
