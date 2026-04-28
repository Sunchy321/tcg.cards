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
import { computed, onMounted, reactive, ref } from 'vue';
import { useToast } from '@nuxt/ui/composables/useToast.js';
import { useApiClient } from '../../../composables/useApiClient';
import type { Router } from '../../../../../service-internal/src/orpc/service';
import type { TagProfile } from '#model/hearthstone/schema/tag';

const orpc = useApiClient<Router>();
const toast = useToast();

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

const projectKindValues = [
  'assign_scalar', 'assign_bool', 'assign_int', 'assign_string', 'assign_enum',
  'append_string_array', 'assign_card_ref', 'assign_localized_text',
  'assign_mechanic', 'assign_referenced_tag', 'assign_legacy',
];
const projectKindItems = [{ label: '不投影', value: noneValue }, ...projectKindValues.map(value => ({ label: value, value }))];
const projectKindFilterItems = [{ label: '全部投影类型', value: allValue }, ...projectKindValues.map(value => ({ label: value, value }))];

const projectTargetTypeItems = [
  { label: '不设置', value: noneValue },
  { label: 'entity', value: 'entity' },
  { label: 'entity_localization', value: 'entity_localization' },
  { label: 'relation', value: 'relation' },
  { label: 'legacy', value: 'legacy' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const canSave = computed(() => form.enumId > 0 && form.slug.trim().length > 0 && !saving.value && !hasConfigIssue.value);

function statusColor(status: string) {
  if (status === 'configured') return 'success' as const;
  if (status === 'ignored') return 'warning' as const;
  if (status === 'deprecated') return 'neutral' as const;
  return 'primary' as const;
}

function textOrNull(value: string) { const text = value.trim(); return text.length > 0 ? text : null; }
function filterValue(value: string) { return value === allValue ? undefined : value; }
function optionalValue(value: string) { return value === noneValue ? null : textOrNull(value); }
function listFromText(value: string) {
  return [...new Set(value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean))];
}
function jsonText(value: unknown) { return JSON.stringify(value ?? {}, null, 2); }

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const text = value.trim();
  if (text.length === 0) return {};
  const parsed = JSON.parse(text) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON object`);
  return parsed as Record<string, unknown>;
}

type ConfigField = 'normalizeConfigText' | 'projectConfigText';

function parseConfigField(field: ConfigField) { return parseJsonObject(form[field], field === 'normalizeConfigText' ? 'normalizeConfig' : 'projectConfig'); }

function configFieldIssue(field: ConfigField) {
  try { parseConfigField(field); return ''; }
  catch (error) { return error instanceof Error ? error.message : 'JSON 格式错误'; }
}

const normalizeConfigIssue = computed(() => configFieldIssue('normalizeConfigText'));
const projectConfigIssue = computed(() => configFieldIssue('projectConfigText'));
const hasConfigIssue = computed(() => normalizeConfigIssue.value.length > 0 || projectConfigIssue.value.length > 0);

function formatJsonField(field: ConfigField) {
  if (configFieldIssue(field).length > 0) return;
  form[field] = jsonText(parseConfigField(field));
}

function normalizeLegacyValueKind(tag: TagProfile) {
  if (tag.valueKind !== 'enum') return tag.valueKind;
  return tag.normalizeKind === 'enum_from_int' ? 'int' : 'string';
}

function fillForm(tag: TagProfile) {
  form.enumId = tag.enumId;
  form.slug = tag.slug;
  form.slugAliasesText = tag.slugAliases.join('\n');
  form.name = tag.name ?? '';
  form.rawName = tag.rawName ?? '';
  form.rawType = tag.rawType ?? '';
  form.rawNamesText = tag.rawNames.join('\n');
  form.valueKind = normalizeLegacyValueKind(tag);
  form.normalizeKind = tag.normalizeKind;
  form.normalizeConfigText = jsonText(tag.normalizeConfig);
  form.projectTargetType = tag.projectTargetType ?? noneValue;
  form.projectTargetPath = tag.projectTargetPath ?? '';
  form.projectKind = tag.projectKind ?? noneValue;
  form.projectConfigText = jsonText(tag.projectConfig);
  form.status = tag.status;
  form.description = tag.description ?? '';
  formError.value = '';
}

async function loadTags() {
  loading.value = true;
  try {
    const q = filters.q.trim();
    const result = await orpc.hearthstone.tag.list({
      q:           q.length > 0 ? q : undefined,
      status:      filterValue(filters.status),
      projectKind: filterValue(filters.projectKind),
      page:        page.value,
      limit,
    });
    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    toast.add({ title: '加载 Tag 失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' });
  } finally {
    loading.value = false;
  }
}

async function selectTag(enumId: number) {
  selectedEnumId.value = enumId; detailLoading.value = true;
  try {
    const tag = await orpc.hearthstone.tag.get({ enumId });
    selectedTag.value = tag;
    fillForm(tag);
  } catch (error) {
    toast.add({ title: '加载 Tag 详情失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' });
  } finally {
    detailLoading.value = false;
  }
}

function searchTags() { page.value = 1; void loadTags(); }
function resetFilters() { filters.q = ''; filters.status = allValue; filters.projectKind = allValue; searchTags(); }
function goPage(nextPage: number) { page.value = Math.min(Math.max(nextPage, 1), totalPages.value); void loadTags(); }

async function saveTag() {
  formError.value = '';
  if (form.projectTargetPath === 'text' || form.projectTargetPath === 'displayText') {
    formError.value = '`text` 和 `displayText` 是派生字段，请改用 `richText`'; return;
  }
  if (hasConfigIssue.value) return;

  const normalizeConfig = parseConfigField('normalizeConfigText');
  const projectConfig = parseConfigField('projectConfigText');
  saving.value = true;

  try {
    const saved = await orpc.hearthstone.tag.update({
      enumId:            form.enumId,
      slug:              form.slug,
      slugAliases:       listFromText(form.slugAliasesText),
      name:              textOrNull(form.name),
      rawName:           textOrNull(form.rawName),
      rawType:           textOrNull(form.rawType),
      rawNames:          listFromText(form.rawNamesText),
      valueKind:         form.valueKind,
      normalizeKind:     form.normalizeKind,
      normalizeConfig,
      projectTargetType: optionalValue(form.projectTargetType),
      projectTargetPath: textOrNull(form.projectTargetPath),
      projectKind:       optionalValue(form.projectKind),
      projectConfig,
      status:            form.status,
      description:       textOrNull(form.description),
    });
    selectedTag.value = saved;
    fillForm(saved);
    const index = items.value.findIndex(item => item.enumId === saved.enumId);
    if (index >= 0) items.value[index] = saved;
    toast.add({ title: 'Tag 已保存', color: 'success' });
  } catch (error) {
    toast.add({ title: '保存失败', description: error instanceof Error ? error.message : '操作失败', color: 'error' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => { void loadTags(); });
</script>
