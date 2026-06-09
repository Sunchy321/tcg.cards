<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-tags" class="size-5 text-primary-500" />
            <h1 class="text-xl font-semibold">Tag 配置</h1>
          </div>
          <p class="mt-1 text-sm text-slate-500">查询和编辑 hearthstone.tags 中的解析、规范化与字段投影配置。</p>
        </div>
        <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadTags" />
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
                  <div class="mt-1 truncate text-xs text-slate-400">{{ tag.name ?? tag.rawName ?? '未命名' }}</div>
                </div>
                <UBadge :label="tag.status" :color="statusColor(tag.status)" variant="soft" size="xs" />
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge :label="tag.valueKind" color="neutral" variant="soft" size="xs" />
                <UBadge :label="tag.normalizeKind" color="neutral" variant="soft" size="xs" />
                <UBadge v-if="tag.projectKind" :label="tag.projectKind" color="primary" variant="soft" size="xs" />
              </div>
              <div v-if="tag.projectTargetPath" class="mt-2 font-mono text-xs text-slate-400">
                {{ tag.projectTargetType ?? '-' }}.{{ tag.projectTargetPath }}
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
              @click="selectedEnumId != null && selectTag(selectedEnumId)"
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
              <UInput v-model="form.slug" placeholder="唯一 slug" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">name</div>
              <UInput v-model="form.name" placeholder="展示名，可留空" class="w-full" />
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
          <div class="grid gap-3 md:grid-cols-3">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">valueKind</div>
              <USelect v-model="form.valueKind" :items="valueKindItems" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">normalizeKind</div>
              <USelect v-model="form.normalizeKind" :items="normalizeKindItems" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">projectKind</div>
              <USelect v-model="form.projectKind" :items="projectKindItems" class="w-full" />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">projectTargetType</div>
              <USelect v-model="form.projectTargetType" :items="projectTargetTypeItems" class="w-full" />
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">projectTargetPath</div>
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
            <div class="space-y-1">
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs text-slate-400">projectConfig JSON</div>
                <UButton label="格式化" size="xs" color="neutral" variant="ghost" @click="formatJsonField('projectConfigText')" />
              </div>
              <UTextarea v-model="form.projectConfigText" :rows="14" class="w-full font-mono text-xs" spellcheck="false" />
              <div v-if="projectConfigIssue" class="text-xs text-red-500">{{ projectConfigIssue }}</div>
            </div>
          </div>
          <div class="space-y-1">
            <div class="text-xs text-slate-400">description</div>
            <UTextarea v-model="form.description" :rows="3" placeholder="说明这个 Tag 的含义和投影注意事项" class="w-full" />
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

import { useConsolePlatform } from '@tcg-cards/console-platform';
import { computed, onMounted, reactive, ref } from 'vue';

import type { TagProfile } from '@tcg-cards/model/src/hearthstone/schema/tag';
definePageMeta({
  layout: 'admin',
  title:  'Tag 配置',
});

const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();

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

const form = reactive({
  enumId:              0,
  slug:                '',
  slugAliasesText:     '',
  name:                '',
  rawName:             '',
  rawType:             '',
  rawNamesText:        '',
  valueKind:           'json',
  normalizeKind:       'identity',
  normalizeConfigText: '{}',
  projectTargetType:   noneValue,
  projectTargetPath:   '',
  projectKind:         noneValue,
  projectConfigText:   '{}',
  status:              'discovered',
  description:         '',
});

const statusItems = [
  { label: 'discovered', value: 'discovered' },
  { label: 'configured', value: 'configured' },
  { label: 'ignored', value: 'ignored' },
  { label: 'deprecated', value: 'deprecated' },
];
const statusFilterItems = [{ label: '全部状态', value: allValue }, ...statusItems];

const valueKindItems = [
  { label: 'bool', value: 'bool' },
  { label: 'card_ref', value: 'card_ref' },
  { label: 'int', value: 'int' },
  { label: 'json', value: 'json' },
  { label: 'loc_string', value: 'loc_string' },
  { label: 'string', value: 'string' },
];

const normalizeKindItems = [
  { label: 'identity', value: 'identity' },
  { label: 'identity_int', value: 'identity_int' },
  { label: 'identity_string', value: 'identity_string' },
  { label: 'identity_loc_string', value: 'identity_loc_string' },
  { label: 'identity_card_ref', value: 'identity_card_ref' },
  { label: 'bool_from_int', value: 'bool_from_int' },
  { label: 'enum_from_int', value: 'enum_from_int' },
  { label: 'card_ref_from_int', value: 'card_ref_from_int' },
  { label: 'json_wrap', value: 'json_wrap' },
];

const projectKindItems = [
  { label: '无', value: noneValue },
  { label: 'assign_value', value: 'assign_value' },
  { label: 'append_string_array', value: 'append_string_array' },
  { label: 'assign_card_ref', value: 'assign_card_ref' },
  { label: 'assign_localized_text', value: 'assign_localized_text' },
  { label: 'assign_mechanic', value: 'assign_mechanic' },
  { label: 'assign_referenced_tag', value: 'assign_referenced_tag' },
  { label: 'assign_legacy', value: 'assign_legacy' },
  { label: 'emit_relation', value: 'emit_relation' },
];
const projectKindFilterItems = [{ label: '全部投影', value: allValue }, ...projectKindItems];

const projectTargetTypeItems = [
  { label: '无', value: noneValue },
  { label: 'entity', value: 'entity' },
  { label: 'entity_localization', value: 'entity_localization' },
  { label: 'entity_relation', value: 'entity_relation' },
];

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

function resetForm() {
  form.enumId = 0;
  form.slug = '';
  form.slugAliasesText = '';
  form.name = '';
  form.rawName = '';
  form.rawType = '';
  form.rawNamesText = '';
  form.valueKind = 'json';
  form.normalizeKind = 'identity';
  form.normalizeConfigText = '{}';
  form.projectTargetType = noneValue;
  form.projectTargetPath = '';
  form.projectKind = noneValue;
  form.projectConfigText = '{}';
  form.status = 'discovered';
  form.description = '';
  formError.value = '';
}

function applyTag(tag: TagProfile) {
  selectedTag.value = tag;
  form.enumId = tag.enumId;
  form.slug = tag.slug;
  form.slugAliasesText = tag.slugAliases.join('\n');
  form.name = tag.name ?? '';
  form.rawName = tag.rawName ?? '';
  form.rawType = tag.rawType ?? '';
  form.rawNamesText = tag.rawNames.join('\n');
  form.valueKind = tag.valueKind;
  form.normalizeKind = tag.normalizeKind;
  form.normalizeConfigText = JSON.stringify(tag.normalizeConfig ?? {}, null, 2);
  form.projectTargetType = tag.projectTargetType ?? noneValue;
  form.projectTargetPath = tag.projectTargetPath ?? '';
  form.projectKind = tag.projectKind ?? noneValue;
  form.projectConfigText = JSON.stringify(tag.projectConfig ?? {}, null, 2);
  form.status = tag.status;
  form.description = tag.description ?? '';
  formError.value = '';
}

async function loadTags() {
  loading.value = true;
  try {
    const result = await orpc.hearthstone.tag.list({
      q:           filters.q.trim() || undefined,
      status:      filters.status === allValue ? undefined : filters.status,
      projectKind: filters.projectKind === allValue ? undefined : filters.projectKind,
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
  if (normalizeConfigIssue.value || projectConfigIssue.value) {
    formError.value = '请先修正 JSON 配置';
    return;
  }

  saving.value = true;
  formError.value = '';
  try {
    await orpc.hearthstone.tag.manualUpdate({
      enumId:            form.enumId,
      slug:              form.slug.trim(),
      slugAliases:       parseLines(form.slugAliasesText),
      name:              form.name.trim() || null,
      rawName:           form.rawName.trim() || null,
      rawType:           form.rawType.trim() || null,
      rawNames:          parseLines(form.rawNamesText),
      valueKind:         form.valueKind,
      normalizeKind:     form.normalizeKind,
      normalizeConfig:   parseNullableJson(form.normalizeConfigText),
      projectTargetType: form.projectTargetType === noneValue ? null : form.projectTargetType,
      projectTargetPath: form.projectTargetPath.trim() || null,
      projectKind:       form.projectKind === noneValue ? null : form.projectKind,
      projectConfig:     parseNullableJson(form.projectConfigText),
      status:            form.status,
      description:       form.description.trim() || null,
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
