<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-compare-arrows" class="size-5 text-primary-500" />
            <h1 class="text-xl font-semibold">字段冲突</h1>
          </div>
          <p class="mt-1 text-sm text-slate-500">查看 tag 字段冲突，并在同一入口执行保留、接受或清除当前胜出值。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge label="统一处理入口" color="primary" variant="soft" />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadConflicts"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
      <div class="space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="mb-3 font-medium text-slate-700">来源与筛选</div>
          <div class="space-y-3">
            <div v-if="sourceItems.length > 1" class="space-y-2">
              <div class="text-xs text-slate-400">数据来源</div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="item in sourceItems"
                  :key="item.value"
                  :label="item.label"
                  size="sm"
                  :color="source === item.value ? 'primary' : 'neutral'"
                  :variant="source === item.value ? 'solid' : 'soft'"
                  @click="switchSource(item.value)"
                />
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UInput
                v-model="filters.enumId"
                icon="i-lucide-hash"
                placeholder="按 enumId 筛选"
                @keyup.enter="searchConflicts"
              />
              <USelect v-model="filters.status" :items="statusItems" class="w-full" />
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <USelect v-model="filters.processingSide" :items="processingSideItems" class="w-full" />
              <USelect v-model="filters.processingStage" :items="processingStageItems" class="w-full" />
            </div>

            <div class="flex justify-end gap-2">
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
              <UButton label="查询" icon="i-lucide-search" :loading="loading" @click="searchConflicts" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div class="font-medium text-slate-700">冲突列表</div>
              <p class="text-xs text-slate-400">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</p>
            </div>
            <UBadge :label="sourceLabel(source)" color="neutral" variant="soft" />
          </div>

          <div v-if="loading && items.length === 0" class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-400" />
          </div>
          <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-slate-400">当前筛选下没有冲突记录</div>
          <div v-else class="max-h-[40rem] space-y-2 overflow-y-auto p-2">
            <button
              v-for="conflict in items"
              :key="conflict.id"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedId === conflict.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'"
              @click="selectConflict(conflict.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-slate-400">#{{ conflict.enumId }}</span>
                    <span class="truncate font-medium">{{ conflict.fieldPath }}</span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <UBadge :label="conflict.conflictKind" color="error" variant="soft" size="xs" />
                    <UBadge :label="conflict.status" :color="statusColor(conflict.status)" variant="soft" size="xs" />
                  </div>
                </div>
                <div class="shrink-0 text-right text-xs text-slate-400">
                  <div>{{ conflict.processingSide }} / {{ conflict.processingStage }}</div>
                  <div class="mt-1 font-mono">{{ formatDateTime(conflict.createdAt) }}</div>
                </div>
              </div>

              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{{ summarizeValue(conflict.incomingValue) }}</span>
                <span>{{ conflict.reason ?? '无附加说明' }}</span>
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
            <div class="font-medium text-slate-700">冲突详情</div>
            <p class="mt-1 text-xs text-slate-400">查看参与冲突的值和当前胜出值，再决定是否生成后续解决动作。</p>
          </div>
          <UButton
            label="重新加载"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            :disabled="selectedId == null || detailLoading"
            :loading="detailLoading"
            @click="reloadSelectedConflict"
          />
        </div>

        <div v-if="!selectedConflict" class="py-24 text-center text-sm text-slate-400">请先从左侧选择一条冲突记录</div>
        <div v-else class="space-y-5 p-4">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="errorMessage"
          />

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">enumId</div>
              <div class="mt-1 font-mono text-sm">{{ selectedConflict.enumId }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">fieldPath</div>
              <div class="mt-1 font-mono text-sm">{{ selectedConflict.fieldPath }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">conflictKind</div>
              <div class="mt-1 text-sm">{{ selectedConflict.conflictKind }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">status</div>
              <div class="mt-1 text-sm">{{ selectedConflict.status }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">processingSide</div>
              <div class="mt-1 text-sm">{{ selectedConflict.processingSide }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">processingStage</div>
              <div class="mt-1 text-sm">{{ selectedConflict.processingStage }}</div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <div class="font-medium text-slate-700">解决动作</div>
                <p class="mt-1 text-xs text-slate-400">所有冲突都在这里统一处理。自动值与手动值冲突时，是否保留手动值由你在此明确决定。</p>
              </div>
              <UBadge
                :label="canResolveSelected ? '可处理' : '已完成'"
                :color="canResolveSelected ? 'primary' : 'neutral'"
                variant="soft"
              />
            </div>

            <div class="grid gap-2 md:grid-cols-2">
              <UButton
                label="接受传入值"
                icon="i-lucide-arrow-down-left"
                color="primary"
                variant="soft"
                :disabled="!canResolveSelected"
                :loading="resolving === 'accept_incoming'"
                @click="resolveSelectedConflict('accept_incoming')"
              />
              <UButton
                label="保留当前胜出"
                icon="i-lucide-shield-check"
                color="neutral"
                variant="soft"
                :disabled="!canResolveSelected"
                :loading="resolving === 'keep_current_winner'"
                @click="resolveSelectedConflict('keep_current_winner')"
              />
              <UButton
                label="要求后续提交"
                icon="i-lucide-git-pull-request-create-arrow"
                color="warning"
                variant="soft"
                :disabled="!canResolveSelected"
                :loading="resolving === 'require_followup_commit'"
                @click="resolveSelectedConflict('require_followup_commit')"
              />
              <UButton
                label="清除当前胜出"
                icon="i-lucide-eraser"
                color="error"
                variant="soft"
                :disabled="!canResolveSelected"
                :loading="resolving === 'winner_clear'"
                @click="resolveSelectedConflict('winner_clear')"
              />
            </div>

            <p class="mt-3 text-xs text-slate-400">
              `winner_clear` 只适用于支持回退到自动 base 值的字段；如果当前字段不支持，服务端会拒绝该动作。
            </p>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">sourceSummary</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.sourceSummary) }}</pre>
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">baseRevision</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ selectedConflict.baseRevision }}</pre>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">candidateBaseValue</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.candidateBaseValue) }}</pre>
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">winnerValue</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.winnerValue) }}</pre>
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">localValue</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.localValue) }}</pre>
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">incomingValue</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.incomingValue) }}</pre>
            </div>
            <div class="space-y-1 md:col-span-2">
              <div class="text-xs text-slate-400">effectiveValue</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedConflict.effectiveValue) }}</pre>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">reason</div>
              <div class="mt-1 text-sm">{{ selectedConflict.reason ?? '-' }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">resolution</div>
              <div class="mt-1 text-sm">{{ selectedConflict.resolution ?? '-' }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">createdAt</div>
              <div class="mt-1 font-mono text-sm">{{ formatDateTime(selectedConflict.createdAt) }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">resolvedAt</div>
              <div class="mt-1 font-mono text-sm">{{ formatDateTime(selectedConflict.resolvedAt) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConsolePlatform } from '@tcg-cards/console-platform';
import type {
  TagConflictListInput,
  TagConflictProfile,
  TagConflictResolution,
  TagConflictStatus,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import { computed, onMounted, reactive, ref } from 'vue';

import { useConsoleFieldSyncHost, type ConsoleFieldSyncSource } from '../../../composables/field-sync-host';
import { useConsoleFieldSyncSourceState } from '../../../composables/field-sync-source-state';

definePageMeta({
  layout: 'admin',
  title:  '字段冲突',
});

const platform = useConsolePlatform();
const host = useConsoleFieldSyncHost();

const limit = 50;
const allValue = '__all__';
const loading = ref(false);
const detailLoading = ref(false);
const items = ref<TagConflictProfile[]>([]);
const selectedConflict = ref<TagConflictProfile | null>(null);
const selectedId = ref<string | null>(null);
const resolving = ref<TagConflictResolution | null>(null);
const total = ref(0);
const page = ref(1);
const errorMessage = ref('');
const { source, sources, setSource } = useConsoleFieldSyncSourceState('hearthstone-conflict');

const filters = reactive({
  enumId:          '',
  status:          allValue,
  processingSide:  allValue,
  processingStage: allValue,
});

const sourceItems = computed(() => sources.value.map(item => ({
  label: sourceLabel(item),
  value: item,
})));

const statusItems = [
  { label: '全部状态', value: allValue },
  { label: 'open', value: 'open' },
  { label: 'in_review', value: 'in_review' },
  { label: 'resolved', value: 'resolved' },
  { label: 'dismissed', value: 'dismissed' },
];

const processingSideItems = [
  { label: '全部处理侧', value: allValue },
  { label: 'local', value: 'local' },
  { label: 'remote', value: 'remote' },
];

const processingStageItems = [
  { label: '全部处理阶段', value: allValue },
  { label: 'apply', value: 'apply' },
  { label: 'replay', value: 'replay' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const canResolveSelected = computed(() => selectedConflict.value?.status === 'open' || selectedConflict.value?.status === 'in_review');

/** Shows one toast through the current console platform. */
function showToast(input: { title: string, description?: string, color?: 'error' | 'success' }) {
  platform.toast.show(input);
}

/** Maps one field-sync source into the label shown by the admin page. */
function sourceLabel(value: ConsoleFieldSyncSource) {
  return value === 'local' ? '本地' : '远端';
}

/** Maps one conflict status into the badge color shown by the list and detail panels. */
function statusColor(status: TagConflictStatus) {
  switch (status) {
  case 'open':
    return 'error';
  case 'in_review':
    return 'warning';
  case 'resolved':
    return 'success';
  case 'dismissed':
  default:
    return 'neutral';
  }
}

/** Serializes one JSON-compatible value into a readable multi-line block. */
function formatPrettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}

/** Formats one persisted timestamp for the admin detail and list panels. */
function formatDateTime(value: string | null) {
  if (value == null || value.trim() === '') {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

/** Compresses one conflict payload into a short preview line for the list panel. */
function summarizeValue(value: unknown) {
  const text = formatPrettyJson(value).replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Builds the current conflict-list query from page filters and selected source. */
function buildListInput(): TagConflictListInput & { source: ConsoleFieldSyncSource } {
  const rawEnumId = filters.enumId.trim();
  const enumId = rawEnumId.length > 0 ? Number(rawEnumId) : undefined;

  return {
    source:          source.value,
    enumId:          Number.isInteger(enumId) ? enumId : undefined,
    status:          filters.status === allValue ? undefined : filters.status as TagConflictStatus,
    processingSide:  filters.processingSide === allValue ? undefined : filters.processingSide,
    processingStage: filters.processingStage === allValue ? undefined : filters.processingStage,
    page:            page.value,
    limit,
  };
}

/** Keeps the current selection aligned with the latest list response. */
async function syncSelection() {
  if (items.value.length === 0) {
    selectedId.value = null;
    selectedConflict.value = null;
    return;
  }

  if (selectedId.value != null && items.value.some(item => item.id === selectedId.value)) {
    return;
  }

  await selectConflict(items.value[0]!.id);
}

/** Loads the conflict list for the current source and filters. */
async function loadConflicts() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await host.listTagConflicts(buildListInput());
    items.value = result.items;
    total.value = result.total;
    await syncSelection();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    items.value = [];
    total.value = 0;
    selectedId.value = null;
    selectedConflict.value = null;
    errorMessage.value = message;
    showToast({ title: '加载冲突失败', description: message, color: 'error' });
  } finally {
    loading.value = false;
  }
}

/** Loads one conflict detail row and marks it as selected in the current page. */
async function selectConflict(id: string) {
  selectedId.value = id;
  detailLoading.value = true;
  errorMessage.value = '';

  try {
    selectedConflict.value = await host.getTagConflict({
      source: source.value,
      id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    selectedConflict.value = null;
    errorMessage.value = message;
    showToast({ title: '加载冲突详情失败', description: message, color: 'error' });
  } finally {
    detailLoading.value = false;
  }
}

/** Reloads the currently selected conflict when the detail panel requests a refresh. */
async function reloadSelectedConflict() {
  if (selectedId.value == null) {
    return;
  }

  await selectConflict(selectedId.value);
}

/** Executes one explicit conflict-resolution action through the injected host. */
async function resolveSelectedConflict(resolution: TagConflictResolution) {
  if (selectedId.value == null || !canResolveSelected.value) {
    return;
  }

  resolving.value = resolution;
  errorMessage.value = '';

  try {
    const result = await host.resolveTagConflict({
      source: source.value,
      id:     selectedId.value,
      resolution,
    });

    selectedConflict.value = result;
    showToast({ title: '冲突已处理', color: 'success' });
    await loadConflicts();

    if (selectedId.value != null) {
      await selectConflict(selectedId.value);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = message;
    showToast({ title: '处理冲突失败', description: message, color: 'error' });
  } finally {
    resolving.value = null;
  }
}

/** Resets pagination before one explicit conflict search. */
function searchConflicts() {
  page.value = 1;
  void loadConflicts();
}

/** Clears all current conflict filters and reloads the first page. */
function resetFilters() {
  filters.enumId = '';
  filters.status = allValue;
  filters.processingSide = allValue;
  filters.processingStage = allValue;
  page.value = 1;
  void loadConflicts();
}

/** Switches the current data source without changing the shared page skeleton. */
function switchSource(next: ConsoleFieldSyncSource) {
  if (source.value === next) {
    return;
  }

  setSource(next);
  page.value = 1;
  selectedId.value = null;
  selectedConflict.value = null;
  void loadConflicts();
}

/** Loads one specific page from the current filtered conflict list. */
function goPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) {
    return;
  }

  page.value = nextPage;
  void loadConflicts();
}

onMounted(() => {
  void loadConflicts();
});
</script>
