<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-tags" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Tag 配置</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            查询和编辑 `hearthstone.tags` 中的解析、规范化与字段投影配置。保存后需要重新执行投影才会影响默认层数据。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadTags"
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
              <p class="mt-1 text-xs text-muted">可按 enumID、slug、名称、投影目标和状态搜索。</p>
            </div>
          </template>

          <div class="space-y-3">
            <UInput
              v-model="filters.q"
              icon="i-lucide-search"
              placeholder="搜索 enumID / slug / name / target"
              class="w-full"
              @keyup.enter="searchTags"
            />

            <div class="grid gap-3 md:grid-cols-2">
              <USelect v-model="filters.status" :items="statusFilterItems" class="w-full" />
              <USelect v-model="filters.projectKind" :items="projectKindFilterItems" class="w-full" />
            </div>

            <div class="flex justify-end gap-2">
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
              <UButton label="查询" icon="i-lucide-search" :loading="loading" @click="searchTags" />
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">Tag 列表</div>
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
            没有匹配的 Tag
          </div>
          <div v-else class="max-h-160 space-y-2 overflow-y-auto pr-1">
            <button
              v-for="tag in items"
              :key="tag.enumId"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-elevated"
              :class="selectedEnumId === tag.enumId ? 'border-primary bg-primary/5' : 'border-default'"
              @click="selectTag(tag.enumId)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-muted">#{{ tag.enumId }}</span>
                    <span class="truncate font-medium">{{ tag.slug }}</span>
                  </div>
                  <div class="mt-1 truncate text-xs text-muted">
                    {{ tag.name ?? tag.rawName ?? '未命名' }}
                  </div>
                </div>
                <UBadge :label="tag.status" :color="statusColor(tag.status)" variant="soft" size="xs" />
              </div>

              <div class="mt-2 flex flex-wrap gap-1">
                <UBadge :label="tag.valueKind" color="neutral" variant="soft" size="xs" />
                <UBadge :label="tag.normalizeKind" color="neutral" variant="soft" size="xs" />
                <UBadge
                  v-if="tag.projectKind"
                  :label="tag.projectKind"
                  color="primary"
                  variant="soft"
                  size="xs"
                />
              </div>
              <div v-if="tag.projectTargetPath" class="mt-2 font-mono text-xs text-muted">
                {{ tag.projectTargetType ?? '-' }}.{{ tag.projectTargetPath }}
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
                `text` 和 `displayText` 是派生字段，不能作为投影目标；卡牌文本请投影到 `richText`。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                label="重新加载"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="ghost"
                :disabled="selectedEnumId == null || detailLoading"
                :loading="detailLoading"
                @click="selectedEnumId != null && selectTag(selectedEnumId)"
              />
              <UButton
                label="保存"
                icon="i-lucide-save"
                :loading="saving"
                :disabled="!canSave"
                @click="saveTag"
              />
            </div>
          </div>
        </template>

        <div v-if="!form.enumId" class="py-24 text-center text-sm text-muted">
          请先从左侧选择一个 Tag
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
              <div class="text-xs text-muted">enumID</div>
              <UInput :model-value="String(form.enumId)" disabled class="w-full font-mono" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">slug</div>
              <UInput v-model="form.slug" placeholder="唯一 slug" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">name</div>
              <UInput v-model="form.name" placeholder="展示名，可留空" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">status</div>
              <USelect v-model="form.status" :items="statusItems" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">rawName</div>
              <UInput v-model="form.rawName" placeholder="来源 raw name" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">rawType</div>
              <UInput v-model="form.rawType" placeholder="来源 raw type" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">slugAliases（每行一个）</div>
              <UTextarea v-model="form.slugAliasesText" :rows="4" placeholder="旧 slug 或别名" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">rawNames（每行一个）</div>
              <UTextarea v-model="form.rawNamesText" :rows="4" placeholder="历史 raw name" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <div class="space-y-2">
              <div class="text-xs text-muted">valueKind</div>
              <USelect v-model="form.valueKind" :items="valueKindItems" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">normalizeKind</div>
              <USelect v-model="form.normalizeKind" :items="normalizeKindItems" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">projectKind</div>
              <USelect v-model="form.projectKind" :items="projectKindItems" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="text-xs text-muted">projectTargetType</div>
              <USelect v-model="form.projectTargetType" :items="projectTargetTypeItems" class="w-full" />
            </div>
            <div class="space-y-2">
              <div class="text-xs text-muted">projectTargetPath</div>
              <UInput v-model="form.projectTargetPath" placeholder="例如 classes / richText / mechanics" class="w-full" />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs text-muted">normalizeConfig JSON</div>
                <UButton
                  label="格式化"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="formatJsonField('normalizeConfigText')"
                />
              </div>
              <UTextarea
                v-model="form.normalizeConfigText"
                :rows="14"
                class="w-full font-mono text-xs"
                spellcheck="false"
                placeholder="{ &quot;enumMap&quot;: { &quot;4&quot;: &quot;mage&quot; } }"
              />
              <div v-if="normalizeConfigIssue" class="text-xs text-error">
                {{ normalizeConfigIssue }}
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs text-muted">projectConfig JSON</div>
                <UButton
                  label="格式化"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="formatJsonField('projectConfigText')"
                />
              </div>
              <UTextarea
                v-model="form.projectConfigText"
                :rows="14"
                class="w-full font-mono text-xs"
                spellcheck="false"
                placeholder="{ &quot;nullValues&quot;: [] }"
              />
              <div v-if="projectConfigIssue" class="text-xs text-error">
                {{ projectConfigIssue }}
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-xs text-muted">description</div>
            <UTextarea v-model="form.description" :rows="3" placeholder="说明这个 Tag 的含义和投影注意事项" class="w-full" />
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">firstSeenSourceTag</div>
              <div class="mt-1 font-mono text-sm">{{ selectedTag?.firstSeenSourceTag ?? '-' }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">lastSeenSourceTag</div>
              <div class="mt-1 font-mono text-sm">{{ selectedTag?.lastSeenSourceTag ?? '-' }}</div>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TagProfile } from '#model/hearthstone/schema/tag';

definePageMeta({
  layout: 'admin',
  title:  'Tag 配置',
});

const { $orpc } = useNuxtApp();
const toast = useToast();
const route = useRoute();
const router = useRouter();

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

const filters = reactive({
  q:           '',
  status:      allValue,
  projectKind: allValue,
});

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

const statusFilterItems = [
  { label: '全部状态', value: allValue },
  ...statusItems,
];

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
  'assign_scalar',
  'assign_bool',
  'assign_int',
  'assign_string',
  'assign_enum',
  'append_string_array',
  'assign_card_ref',
  'assign_localized_text',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
];

const projectKindItems = [
  { label: '不投影', value: noneValue },
  ...projectKindValues.map(value => ({ label: value, value })),
];

const projectKindFilterItems = [
  { label: '全部投影类型', value: allValue },
  ...projectKindValues.map(value => ({ label: value, value })),
];

const projectTargetTypeItems = [
  { label: '不设置', value: noneValue },
  { label: 'entity', value: 'entity' },
  { label: 'entity_localization', value: 'entity_localization' },
  { label: 'relation', value: 'relation' },
  { label: 'legacy', value: 'legacy' },
];

type ConfigField = 'normalizeConfigText' | 'projectConfigText';
type ConfigObject = Record<string, unknown>;
type ConfigValidator = (value: unknown, path: string) => string | null;

interface ConfigFormat {
  kind:      string;
  fields:    Record<string, ConfigValidator>;
  required?: string[];
}

const configValidators = {
  arrayValue(value: unknown, path: string) {
    return Array.isArray(value) ? null : `${path} 必须是数组`;
  },
  booleanValue(value: unknown, path: string) {
    return typeof value === 'boolean' ? null : `${path} 必须是 boolean`;
  },
  integerArrayValue(value: unknown, path: string) {
    if (!Array.isArray(value)) {
      return `${path} 必须是整数数组`;
    }

    return value.every(item => Number.isSafeInteger(item)) ? null : `${path} 只能包含整数`;
  },
  nonEmptyString(value: unknown, path: string) {
    return typeof value === 'string' && value.trim().length > 0 ? null : `${path} 必须是非空字符串`;
  },
  stringRecordValue(value: unknown, path: string) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return `${path} 必须是字符串字典`;
    }

    return Object.values(value).every(item => typeof item === 'string')
      ? null
      : `${path} 的值必须都是字符串`;
  },
  enumMapValue(value: unknown, path: string) {
    if (value === 'set') {
      return null;
    }

    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return `${path} 必须是枚举映射对象，或特殊字符串 "set"`;
    }

    const valid = Object.values(value).every(item => {
      return typeof item === 'string'
        || (Array.isArray(item) && item.every(child => typeof child === 'string'));
    });

    return valid ? null : `${path} 的值必须是字符串或字符串数组`;
  },
} satisfies Record<string, ConfigValidator>;

const scalarProjectKinds = [
  'assign_scalar',
  'assign_bool',
  'assign_int',
  'assign_string',
  'assign_enum',
  'assign_card_ref',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
];

function appendStringArrayMode() {
  return form.normalizeKind === 'bool_from_int'
    ? 'true_value'
    : 'normalized';
}

function nullValueFields() {
  return {
    nullValues: configValidators.arrayValue,
  };
}

function currentConfigFormat(field: ConfigField): ConfigFormat | null {
  if (field === 'normalizeConfigText') {
    const formats: ConfigFormat[] = [
      {
        kind:   'bool_from_int',
        fields: {
          trueValues:  configValidators.integerArrayValue,
          falseValues: configValidators.integerArrayValue,
        },
      },
      {
        kind:   'enum_from_int',
        fields: {
          enumMap:               configValidators.enumMapValue,
          allowUnknownEnumValue: configValidators.booleanValue,
        },
      },
    ];

    return formats.find(item => item.kind === form.normalizeKind) ?? null;
  }

  if (form.projectKind === 'append_string_array') {
    const mode = appendStringArrayMode();

    return {
      kind:   `append_string_array:${mode}`,
      fields: {
        ...nullValueFields(),
        ...(mode === 'true_value' ? { value: configValidators.nonEmptyString } : {}),
      },
      required: mode === 'true_value' ? ['value'] : [],
    };
  }

  if (form.projectKind === 'assign_localized_text') {
    return {
      kind:   'assign_localized_text',
      fields: {
        ...nullValueFields(),
        localeMap: configValidators.stringRecordValue,
      },
    };
  }

  if (scalarProjectKinds.includes(form.projectKind)) {
    return {
      kind:   form.projectKind,
      fields: nullValueFields(),
    };
  }

  return null;
}

function configLabel(field: ConfigField) {
  return field === 'normalizeConfigText' ? 'normalizeConfig' : 'projectConfig';
}

function validateConfigObject(field: ConfigField, config: ConfigObject) {
  const format = currentConfigFormat(field);
  const label = configLabel(field);
  const keys = Object.keys(config);

  if (!format) {
    if (keys.length > 0) {
      throw new Error(`${label} 当前未被使用，必须保持为空对象 {}`);
    }

    return;
  }

  const allowedKeys = Object.keys(format.fields);
  const requiredKeys = format.required ?? [];

  for (const key of keys) {
    const validator = format.fields[key];

    if (!validator) {
      const allowed = allowedKeys.length > 0 ? allowedKeys.join(', ') : '无';
      throw new Error(`${label}.${key} 不适用于 ${format.kind}，允许字段：${allowed}`);
    }

    const error = validator(config[key], `${label}.${key}`);
    if (error) {
      throw new Error(error);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in config)) {
      throw new Error(`${label}.${key} 在 ${format.kind} 下是必填项`);
    }
  }
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const canSave = computed(() => {
  return form.enumId > 0
    && form.slug.trim().length > 0
    && !saving.value
    && !hasConfigIssue.value;
});

function queryText(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' ? text : '';
}

function queryNumber(value: unknown) {
  const text = queryText(value);
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function queryFilter(value: unknown, allowed: string[]) {
  const text = queryText(value);
  return allowed.includes(text) ? text : allValue;
}

function applyRouteQuery() {
  filters.q = queryText(route.query.q);
  filters.status = queryFilter(route.query.status, statusItems.map(item => item.value));
  filters.projectKind = queryFilter(route.query.projectKind, projectKindValues);
  page.value = queryNumber(route.query.page) ?? 1;
  selectedEnumId.value = queryNumber(route.query.tag);
}

function replaceRouteQuery() {
  const query = { ...route.query };
  const q = filters.q.trim();

  if (q.length > 0) {
    query.q = q;
  } else {
    delete query.q;
  }

  if (filters.status !== allValue) {
    query.status = filters.status;
  } else {
    delete query.status;
  }

  if (filters.projectKind !== allValue) {
    query.projectKind = filters.projectKind;
  } else {
    delete query.projectKind;
  }

  if (page.value > 1) {
    query.page = String(page.value);
  } else {
    delete query.page;
  }

  if (selectedEnumId.value != null) {
    query.tag = String(selectedEnumId.value);
  } else {
    delete query.tag;
  }

  void router.replace({ query });
}

function textOrNull(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function filterValue(value: string) {
  return value === allValue ? undefined : value;
}

function optionalValue(value: string) {
  return value === noneValue ? null : textOrNull(value);
}

function listFromText(value: string) {
  return [...new Set(value
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean))];
}

function jsonText(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const text = value.trim();

  if (text.length === 0) {
    return {};
  }

  const parsed = JSON.parse(text) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON object`);
  }

  return parsed as Record<string, unknown>;
}

function parseConfigField(field: ConfigField) {
  const config = parseJsonObject(form[field], configLabel(field));
  validateConfigObject(field, config);
  return config;
}

function configFieldIssue(field: ConfigField) {
  try {
    parseConfigField(field);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'JSON 格式错误';
  }
}

const normalizeConfigIssue = computed(() => configFieldIssue('normalizeConfigText'));
const projectConfigIssue = computed(() => configFieldIssue('projectConfigText'));
const hasConfigIssue = computed(() => {
  return normalizeConfigIssue.value.length > 0 || projectConfigIssue.value.length > 0;
});

function statusColor(status: string) {
  if (status === 'configured') return 'success';
  if (status === 'ignored') return 'warning';
  if (status === 'deprecated') return 'neutral';
  return 'primary';
}

function normalizeLegacyValueKind(tag: TagProfile) {
  if (tag.valueKind !== 'enum') {
    return tag.valueKind;
  }

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
    const result = await $orpc.hearthstone.tag.list({
      q:           q.length > 0 ? q : undefined,
      status:      filterValue(filters.status),
      projectKind: filterValue(filters.projectKind),
      page:        page.value,
      limit,
    });

    items.value = result.items;
    total.value = result.total;
  } catch (error) {
    toast.add({
      title:       '加载 Tag 失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    loading.value = false;
  }
}

async function selectTag(enumId: number) {
  selectedEnumId.value = enumId;
  replaceRouteQuery();
  detailLoading.value = true;

  try {
    const tag = await $orpc.hearthstone.tag.get({ enumId });
    selectedTag.value = tag;
    fillForm(tag);
  } catch (error) {
    toast.add({
      title:       '加载 Tag 详情失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    detailLoading.value = false;
  }
}

function searchTags() {
  page.value = 1;
  replaceRouteQuery();
  void loadTags();
}

function resetFilters() {
  filters.q = '';
  filters.status = allValue;
  filters.projectKind = allValue;
  searchTags();
}

function goPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value);
  replaceRouteQuery();
  void loadTags();
}

function formatJsonField(field: ConfigField) {
  if (configFieldIssue(field).length > 0) {
    return;
  }

  form[field] = jsonText(parseConfigField(field));
  formError.value = '';
}

async function saveTag() {
  formError.value = '';

  if (form.projectTargetPath === 'text' || form.projectTargetPath === 'displayText') {
    formError.value = '`text` 和 `displayText` 是派生字段，请改用 `richText`';
    return;
  }

  if (hasConfigIssue.value) {
    return;
  }

  const normalizeConfig = parseConfigField('normalizeConfigText');
  const projectConfig = parseConfigField('projectConfigText');

  saving.value = true;

  try {
    const saved = await $orpc.hearthstone.tag.update({
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
    if (index >= 0) {
      items.value[index] = saved;
    }

    toast.add({
      title: 'Tag 已保存',
      color: 'success',
    });
  } catch (error) {
    toast.add({
      title:       '保存 Tag 失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    saving.value = false;
  }
}

watch(
  () => [filters.q, filters.status, filters.projectKind],
  () => replaceRouteQuery(),
);

onMounted(async () => {
  applyRouteQuery();
  await loadTags();

  if (selectedEnumId.value != null) {
    void selectTag(selectedEnumId.value);
  }
});
</script>
