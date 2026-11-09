<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-tags" class="size-5 text-primary-500" />
            <h1 class="text-xl font-semibold">Tag 配置</h1>
          </div>
          <p class="mt-1 text-sm text-slate-500">维护标签名称、作用说明和值类型。</p>
        </div>
        <div class="flex items-center gap-2">
          <component
            :is="conditionalPanel"
            v-if="conditionalPanel"
            @completed="loadTags"
          />
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadTags" />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="mb-3 font-medium text-slate-700">筛选</div>
          <div class="space-y-3">
            <UInput v-model="filters.q" icon="i-lucide-search" placeholder="搜索 enumID / slug / name / target" class="w-full" @keyup.enter="searchTags" />
            <div class="grid gap-3 md:grid-cols-2">
              <USelect v-model="filters.status" :items="statusFilterItems" class="w-full" />
              <USelect v-model="filters.projectKind" :items="projectKindFilterItems" class="w-full" />
            </div>
            <div class="flex justify-end gap-2">
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
              <UButton label="查询" icon="i-lucide-search" :loading="loading" @click="searchTags" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div class="font-medium text-slate-700">Tag 列表</div>
              <p class="text-xs text-slate-400">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</p>
            </div>
            <UBadge :label="`${items.length} 条`" color="neutral" variant="soft" />
          </div>

          <div v-if="loading && items.length === 0" class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-400" />
          </div>
          <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-slate-400">没有匹配的 Tag</div>
          <div v-else class="max-h-[36rem] space-y-2 overflow-y-auto p-2">
            <button
              v-for="tag in items"
              :key="tag.enumId"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedEnumId === tag.enumId ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'"
              @click="selectTag(tag.enumId)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-slate-400">#{{ tag.enumId }}</span>
                    <span class="truncate font-medium">{{ tag.slug }}</span>
                  </div>
                  <div class="mt-1 truncate text-xs text-slate-400">{{ tag.localization?.zhs?.name ?? tag.localization?.en?.name ?? tag.rawName ?? '未命名' }}</div>
                </div>
                <UBadge :label="tag.status" :color="statusColor(tag.status)" variant="soft" size="xs" />
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge :label="tag.normalizeKind" color="neutral" variant="soft" size="xs" />
                <UBadge :label="projectKindLabel(tag.projectKind)" color="primary" variant="soft" size="xs" />
              </div>
            </button>
          </div>

          <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <UButton label="上一页" icon="i-lucide-chevron-left" color="neutral" variant="soft" :disabled="page <= 1 || loading" @click="goPage(page - 1)" />
            <span class="text-xs text-slate-400">{{ page }} / {{ totalPages }}</span>
            <UButton label="下一页" trailing-icon="i-lucide-chevron-right" color="neutral" variant="soft" :disabled="page >= totalPages || loading" @click="goPage(page + 1)" />
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div class="font-medium text-slate-700">编辑配置</div>
            <p class="mt-1 text-xs text-slate-400">text 和 displayText 是派生字段，不能作为投影目标，请用 richText。</p>
          </div>
          <div class="flex gap-2">
            <UButton
              label="重新加载"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              :disabled="selectedEnumId == null || detailLoading"
              :loading="detailLoading"
              @click="{ selectedEnumId != null && selectTag(selectedEnumId); }"
            />
            <UButton label="保存" icon="i-lucide-save" :loading="saving" :disabled="!canSave" @click="saveTag" />
          </div>
        </div>

        <div v-if="!form.enumId" class="py-24 text-center text-sm text-slate-400">请先从左侧选择一个 Tag</div>
        <div v-else class="space-y-5 p-4">
          <UAlert v-if="formError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="formError" />

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">enumID</div>
              <UInput :model-value="String(form.enumId)" disabled class="w-full font-mono" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">slug</div>
              <UInput v-model="form.slug" placeholder="唯一 slug" autocomplete="off" autocapitalize="none" spellcheck="false" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">值类型</div>
              <USelect v-model="form.valueType" :items="valueTypeItems" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">status</div>
              <USelect v-model="form.status" :items="statusItems" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">rawName</div>
              <UInput v-model="form.rawName" placeholder="来源 raw name" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">rawType</div>
              <UInput v-model="form.rawType" placeholder="来源 raw type" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">slugAliases（每行一个）</div>
              <UTextarea v-model="form.slugAliasesText" :rows="4" placeholder="旧 slug 或别名" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">rawNames（每行一个）</div>
              <UTextarea v-model="form.rawNamesText" :rows="4" placeholder="历史 raw name" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">normalizeKind</div>
              <USelect v-model="form.normalizeKind" :items="normalizeKindItems" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">投影方式</div>
              <USelect v-model="form.projectKind" :items="projectKindItems" class="w-full" />
            </div>
          </div>
          <div v-if="form.projectKind !== 'none'" class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">目标字段</div>
              <UInput v-model="form.projectTargetPath" placeholder="例如 classes / richText / mechanics" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs text-slate-400">normalizeConfig JSON</div>
                <UButton label="格式化" size="xs" color="neutral" variant="ghost" @click="formatJsonField('normalizeConfigText')" />
              </div>
              <UTextarea v-model="form.normalizeConfigText" :rows="14" class="w-full font-mono text-xs" spellcheck="false" />
              <div v-if="normalizeConfigIssue" class="text-xs text-red-500">{{ normalizeConfigIssue }}</div>
            </div>
            <div v-if="form.projectKind !== 'none'" class="space-y-1">
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs text-slate-400">projectConfig JSON</div>
                <UButton label="格式化" size="xs" color="neutral" variant="ghost" @click="formatJsonField('projectConfigText')" />
              </div>
              <UTextarea v-model="form.projectConfigText" :rows="14" class="w-full font-mono text-xs" spellcheck="false" />
              <div v-if="projectConfigIssue" class="text-xs text-red-500">{{ projectConfigIssue }}</div>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <fieldset v-for="language in copyLanguages" :key="language.code" class="space-y-2">
              <legend class="text-sm font-medium">{{ language.label }}</legend>
              <label class="block space-y-1">
                <span class="text-xs text-slate-400">标签名称</span>
                <UInput v-model="form.copy[language.code].name" class="w-full" />
              </label>
              <label class="block space-y-1">
                <span class="text-xs text-slate-400">作用说明</span>
                <UTextarea v-model="form.copy[language.code].description" :rows="4" class="w-full" />
              </label>
            </fieldset>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">firstSeenSourceTag</div>
              <div class="mt-1 font-mono text-sm">{{ selectedTag?.firstSeenSourceTag ?? '-' }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">lastSeenSourceTag</div>
              <div class="mt-1 font-mono text-sm">{{ selectedTag?.lastSeenSourceTag ?? '-' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

/* global __HEARTHSTONE_GAME_TAG_IMPORT__: readonly */

import { useConsolePlatform } from '@tcg-cards/console-platform';
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';

import type { TagLocalization, TagProfile, TagSemanticValueKind } from '@tcg-cards/model/hearthstone/schema/tag';
definePageMeta({
  layout: 'admin',
  title:  'Tag 配置',
});

const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();
const conditionalPanel = __HEARTHSTONE_GAME_TAG_IMPORT__
  ? defineAsyncComponent(() => import('../../../features/hearthstone/GameTagImport.vue'))
  : null;

const limit = 50;
const loading = ref(false);
const detailLoading = ref(false);
const saving = ref(false);
const items = ref<TagProfile[]>([]);
const selectedTag = ref<TagProfile | null>(null);
const selectedEnumId = ref<number | null>(null);
const total = ref(0);
const page = ref(1);
const formError = ref('');
const allValue = '__all__';
const noneValue = '__none__';

const filters = reactive({ q: '', status: allValue, projectKind: allValue });

const copyLanguages = [
  { code: 'zhs', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const;

const valueTypeItems = [
  { label: '未标注', value: noneValue },
  { label: '布尔型', value: 'boolean' },
  { label: '数字型', value: 'number' },
  { label: '卡牌 DBF ID', value: 'card_dbf_id' },
  { label: '卡牌 ID', value: 'card_id' },
  { label: 'Subset ID', value: 'subset_id' },
  { label: '系列 ID', value: 'set_id' },
  { label: '套牌 ID', value: 'deck_id' },
  { label: '对局实体 ID', value: 'entity_id' },
  { label: '标签 ID', value: 'tag_id' },
  { label: '枚举', value: 'enum' },
  { label: '位掩码', value: 'bitmask' },
  { label: '文本', value: 'text' },
  { label: '多语言文本', value: 'localized_text' },
  { label: '多功能值', value: 'multipurpose' },
] satisfies Array<{ label: string, value: TagSemanticValueKind | typeof noneValue }>;

const form = reactive({
  enumId:              0,
  slug:                '',
  slugAliasesText:     '',
  valueType:           noneValue as TagSemanticValueKind | typeof noneValue,
  copy:                { zhs: { name: '', description: '' }, en: { name: '', description: '' } },
  rawName:             '',
  rawType:             '',
  rawNamesText:        '',
  normalizeKind:       'identity',
  normalizeConfigText: '{}',
  projectTargetPath:   '',
  projectKind:         noneValue,
  projectConfigText:   '{}',
  status:              'discovered',
});

const statusItems = [
  { label: 'discovered', value: 'discovered' },
  { label: 'configured', value: 'configured' },
  { label: 'ignored', value: 'ignored' },
  { label: 'deprecated', value: 'deprecated' },
];
const statusFilterItems = [{ label: '全部状态', value: allValue }, ...statusItems];

const normalizeKindItems = [
  { label: 'identity', value: 'identity' },
  { label: 'identity_int', value: 'identity_int' },
  { label: 'identity_string', value: 'identity_string' },
  { label: 'identity_loc_string', value: 'identity_loc_string' },
  { label: 'bool_from_int', value: 'bool_from_int' },
  { label: 'enum_from_int', value: 'enum_from_int' },
  { label: 'card_ref_from_int', value: 'card_ref_from_int' },
  { label: 'json_wrap', value: 'json_wrap' },
];

const projectKindItems = [
  { label: '未配置', value: noneValue },
  { label: '不进入卡牌数据', value: 'none' },
  { label: '写入卡牌字段', value: 'assign_value' },
  { label: '加入卡牌属性列表', value: 'append_string_array' },
  { label: '写入关联卡牌字段', value: 'assign_card_ref' },
  { label: '写入多语言字段', value: 'assign_localized_text' },
  { label: '写入卡牌机制', value: 'assign_mechanic' },
  { label: '保留兼容属性', value: 'assign_legacy' },
  { label: '生成卡牌关系', value: 'emit_relation' },
];
const projectKindFilterItems = [{ label: '全部投影', value: allValue }, ...projectKindItems];

/** Names the configured projection in the tag list. */
function projectKindLabel(kind: string | null): string {
  return projectKindItems.find(item => item.value === (kind ?? noneValue))?.label ?? '其他投影';
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const canSave = computed(() => form.enumId > 0 && form.slug.trim().length > 0 && !saving.value && !detailLoading.value);

const normalizeConfigIssue = computed(() => validateJson(form.normalizeConfigText));
const projectConfigIssue = computed(() => validateJson(form.projectConfigText));

function showToast(input: { title: string, description?: string, color?: 'error' | 'success' }) {
  platform.toast.show(input);
}

function validateJson(text: string) {
  try {
    JSON.parse(text || '{}');
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'JSON 解析失败';
  }
}

function statusColor(status: string) {
  switch (status) {
  case 'configured':
    return 'success';
  case 'ignored':
    return 'warning';
  case 'deprecated':
    return 'neutral';
  default:
    return 'primary';
  }
}

function applyTag(tag: TagProfile) {
  selectedTag.value = tag;
  form.enumId = tag.enumId;
  form.slug = tag.slug;
  form.slugAliasesText = tag.slugAliases.join('\n');
  form.valueType = tag.valueType ?? noneValue;
  for (const { code } of copyLanguages) {
    form.copy[code].name = tag.localization?.[code]?.name ?? '';
    form.copy[code].description = tag.localization?.[code]?.description ?? '';
  }
  form.rawName = tag.rawName ?? '';
  form.rawType = tag.rawType ?? '';
  form.rawNamesText = tag.rawNames.join('\n');
  form.normalizeKind = tag.normalizeKind;
  form.normalizeConfigText = JSON.stringify(tag.normalizeConfig ?? {}, null, 2);
  form.projectTargetPath = tag.projectTargetPath ?? '';
  form.projectKind = tag.projectKind ?? noneValue;
  form.projectConfigText = JSON.stringify(tag.projectConfig ?? {}, null, 2);
  form.status = tag.status;
  formError.value = '';
}

/** Builds edited copy while preserving any languages outside the editor. */
function buildLocalization(): TagLocalization {
  const localization = Object.fromEntries(
    Object.entries(selectedTag.value?.localization ?? {})
      .filter(([lang]) => !copyLanguages.some(({ code }) => code === lang)),
  );
  for (const { code } of copyLanguages) {
    const name = form.copy[code].name.trim();
    const description = form.copy[code].description.trim();
    if (name || description) {
      localization[code] = {
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      };
    }
  }

  return localization;
}

async function loadTags() {
  loading.value = true;
  const projectKind = filters.projectKind === noneValue ? null : filters.projectKind;
  try {
    const result = await orpc.hearthstone.tag.list({
      q:           filters.q.trim() || undefined,
      status:      filters.status === allValue ? undefined : filters.status,
      projectKind: projectKind === allValue ? undefined : projectKind,
      page:        page.value,
      limit,
    });
    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    showToast({ title: '加载失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    loading.value = false;
  }
}

function searchTags() {
  page.value = 1;
  void loadTags();
}

function resetFilters() {
  filters.q = '';
  filters.status = allValue;
  filters.projectKind = allValue;
  page.value = 1;
  void loadTags();
}

function goPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return;
  page.value = nextPage;
  void loadTags();
}

async function selectTag(enumId: number) {
  selectedEnumId.value = enumId;
  detailLoading.value = true;
  try {
    const tag = await orpc.hearthstone.tag.get({ enumId });
    applyTag(tag);
  } catch (error) {
    showToast({ title: '加载详情失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    detailLoading.value = false;
  }
}

function parseLines(text: string) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function parseNullableJson(text: string) {
  const value = text.trim();
  if (!value) return {};
  return JSON.parse(value);
}

function formatJsonField(field: 'normalizeConfigText' | 'projectConfigText') {
  try {
    const parsed = parseNullableJson(form[field]);
    form[field] = JSON.stringify(parsed, null, 2);
  } catch {
    // Keep current content when invalid.
  }
}

async function saveTag() {
  if (!canSave.value) return;
  if (normalizeConfigIssue.value || (form.projectKind !== 'none' && projectConfigIssue.value)) {
    formError.value = '请先修正 JSON 配置';
    return;
  }

  saving.value = true;
  formError.value = '';
  try {
    await orpc.hearthstone.tag.manualUpdate({
      enumId:               form.enumId,
      slug:                 form.slug.trim(),
      slugAliases:          parseLines(form.slugAliasesText),
      valueType:            form.valueType === noneValue ? null : form.valueType,
      localization:         buildLocalization(),
      expectedLocalization: selectedTag.value?.localization ?? {},
      rawName:              form.rawName.trim() || null,
      rawType:              form.rawType.trim() || null,
      rawNames:             parseLines(form.rawNamesText),
      normalizeKind:        form.normalizeKind,
      normalizeConfig:      parseNullableJson(form.normalizeConfigText),
      projectTargetPath:    form.projectKind === 'none' ? null : form.projectTargetPath.trim() || null,
      projectKind:          form.projectKind === noneValue ? null : form.projectKind,
      projectConfig:        form.projectKind === 'none' ? {} : parseNullableJson(form.projectConfigText),
      status:               form.status,
    });
    showToast({ title: '保存成功', color: 'success' });
    await loadTags();
    if (selectedEnumId.value != null) {
      await selectTag(selectedEnumId.value);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    formError.value = message;
    showToast({ title: '保存失败', description: message, color: 'error' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadTags();
});
</script>
