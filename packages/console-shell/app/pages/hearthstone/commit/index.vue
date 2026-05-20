<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-git-commit-horizontal" class="size-5 text-primary-500" />
            <h1 class="text-xl font-semibold">字段提交</h1>
          </div>
          <p class="mt-1 text-sm text-slate-500">查看 tag 字段的提交记录、来源信息和当前处理状态。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge label="只读页面" color="neutral" variant="soft" />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadCommits"
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
                @keyup.enter="searchCommits"
              />
              <UInput
                v-model="filters.fieldPath"
                icon="i-lucide-search"
                placeholder="按 fieldPath 筛选"
                @keyup.enter="searchCommits"
              />
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              <USelect v-model="filters.commitKind" :items="commitKindItems" class="w-full" />
              <USelect v-model="filters.reviewStatus" :items="reviewStatusItems" class="w-full" />
              <USelect v-model="filters.syncStatus" :items="syncStatusItems" class="w-full" />
            </div>

            <div class="flex justify-end gap-2">
              <UButton label="清空" color="neutral" variant="ghost" @click="resetFilters" />
              <UButton label="查询" icon="i-lucide-search" :loading="loading" @click="searchCommits" />
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div class="font-medium text-slate-700">提交列表</div>
              <p class="text-xs text-slate-400">共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</p>
            </div>
            <UBadge :label="sourceLabel(source)" color="neutral" variant="soft" />
          </div>

          <div v-if="loading && items.length === 0" class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-400" />
          </div>
          <div v-else-if="items.length === 0" class="py-10 text-center text-sm text-slate-400">当前筛选下没有提交记录</div>
          <div v-else class="max-h-[40rem] space-y-2 overflow-y-auto p-2">
            <button
              v-for="commit in items"
              :key="commit.id"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedId === commit.id ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-200 hover:bg-slate-50'"
              @click="selectCommit(commit.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs text-slate-400">#{{ commit.sequence }}</span>
                    <span class="truncate font-medium">{{ commit.fieldPath }}</span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <UBadge :label="commit.commitKind" color="primary" variant="soft" size="xs" />
                    <UBadge :label="commit.reviewStatus" color="neutral" variant="soft" size="xs" />
                    <UBadge :label="commit.syncStatus" color="neutral" variant="soft" size="xs" />
                  </div>
                </div>
                <div class="shrink-0 text-right text-xs text-slate-400">
                  <div>{{ commit.editorRuntime }}</div>
                  <div class="mt-1 font-mono">{{ formatDateTime(commit.createdAt) }}</div>
                </div>
              </div>

              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span class="font-mono">enumId: {{ extractEnumId(commit.entityKey) ?? '-' }}</span>
                <span class="truncate font-mono">{{ formatCompactJson(commit.entityKey) }}</span>
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
            <div class="font-medium text-slate-700">提交详情</div>
            <p class="mt-1 text-xs text-slate-400">查看当前提交写入的字段值、版本预期和投影状态。</p>
          </div>
          <UButton
            label="重新加载"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            :disabled="selectedId == null || detailLoading"
            :loading="detailLoading"
            @click="reloadSelectedCommit"
          />
        </div>

        <div v-if="!selectedCommit" class="py-24 text-center text-sm text-slate-400">请先从左侧选择一条提交记录</div>
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
              <div class="text-xs text-slate-400">sequence</div>
              <div class="mt-1 font-mono text-sm">{{ selectedCommit.sequence }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">fieldPath</div>
              <div class="mt-1 font-mono text-sm">{{ selectedCommit.fieldPath }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">commitKind</div>
              <div class="mt-1 text-sm">{{ selectedCommit.commitKind }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">operation</div>
              <div class="mt-1 text-sm">{{ selectedCommit.operation }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">reviewStatus</div>
              <div class="mt-1 text-sm">{{ selectedCommit.reviewStatus }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">projectionStatus</div>
              <div class="mt-1 text-sm">{{ selectedCommit.projectionStatus }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">syncStatus</div>
              <div class="mt-1 text-sm">{{ selectedCommit.syncStatus }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">editor</div>
              <div class="mt-1 text-sm">{{ selectedCommit.editorRuntime }} / {{ selectedCommit.editorIdentity ?? '-' }}</div>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-slate-400">entityKey</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedCommit.entityKey) }}</pre>
            </div>
            <div class="space-y-1">
              <div class="text-xs text-slate-400">value</div>
              <pre class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{{ formatPrettyJson(selectedCommit.value) }}</pre>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">expectedRowRevision</div>
              <div class="mt-1 break-all font-mono text-xs text-slate-700">{{ selectedCommit.expectedRowRevision }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">expectedWinnerRevision</div>
              <div class="mt-1 break-all font-mono text-xs text-slate-700">{{ selectedCommit.expectedWinnerRevision ?? '-' }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">baseRevision</div>
              <div class="mt-1 break-all font-mono text-xs text-slate-700">{{ selectedCommit.baseRevision }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">clientMutationId</div>
              <div class="mt-1 break-all font-mono text-xs text-slate-700">{{ selectedCommit.clientMutationId }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">createdAt</div>
              <div class="mt-1 font-mono text-sm">{{ formatDateTime(selectedCommit.createdAt) }}</div>
            </div>
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="text-xs text-slate-400">projectedAt</div>
              <div class="mt-1 font-mono text-sm">{{ formatDateTime(selectedCommit.projectedAt) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConsolePlatform } from '@tcg-cards/console-platform';
import type { FieldCommitListInput, FieldCommitProfile } from '@tcg-cards/model/src/field-commit';
import { computed, onMounted, reactive, ref } from 'vue';

import { useConsoleFieldSyncHost, type ConsoleFieldSyncSource } from '../../../composables/field-sync-host';
import { useConsoleFieldSyncSourceState } from '../../../composables/field-sync-source-state';

definePageMeta({
  layout: 'admin',
  title:  '字段提交',
});

const platform = useConsolePlatform();
const host = useConsoleFieldSyncHost();

const limit = 50;
const allValue = '__all__';
const loading = ref(false);
const detailLoading = ref(false);
const items = ref<FieldCommitProfile[]>([]);
const selectedCommit = ref<FieldCommitProfile | null>(null);
const selectedId = ref<string | null>(null);
const total = ref(0);
const page = ref(1);
const errorMessage = ref('');
const { source, sources, setSource } = useConsoleFieldSyncSourceState('hearthstone-commit');

const filters = reactive({
  enumId:       '',
  fieldPath:    '',
  commitKind:   allValue,
  reviewStatus: allValue,
  syncStatus:   allValue,
});

const sourceItems = computed(() => sources.value.map(item => ({
  label: sourceLabel(item),
  value: item,
})));

const commitKindItems = [
  { label: '全部提交类型', value: allValue },
  { label: 'source_edit', value: 'source_edit' },
  { label: 'conflict_resolution', value: 'conflict_resolution' },
  { label: 'winner_clear', value: 'winner_clear' },
];

const reviewStatusItems = [
  { label: '全部审核状态', value: allValue },
  { label: 'auto_approved', value: 'auto_approved' },
  { label: 'approved', value: 'approved' },
  { label: 'pending_review', value: 'pending_review' },
  { label: 'rejected', value: 'rejected' },
];

const syncStatusItems = [
  { label: '全部同步状态', value: allValue },
  { label: 'pending_push', value: 'pending_push' },
  { label: 'pulled', value: 'pulled' },
  { label: 'synced', value: 'synced' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

/** Shows one toast through the current console platform. */
function showToast(input: { title: string, description?: string, color?: 'error' | 'success' }) {
  platform.toast.show(input);
}

/** Maps one field-sync source into the label shown by the admin page. */
function sourceLabel(value: ConsoleFieldSyncSource) {
  return value === 'local' ? '本地' : '远端';
}

/** Extracts the integer tag enum id from one generic entity-key payload. */
function extractEnumId(entityKey: unknown) {
  if (typeof entityKey !== 'object' || entityKey == null || Array.isArray(entityKey)) {
    return null;
  }

  const value = (entityKey as Record<string, unknown>).enumId;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** Serializes one JSON-compatible value into a compact single-line string. */
function formatCompactJson(value: unknown) {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
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

/** Builds the current commit-list query from page filters and selected source. */
function buildListInput(): FieldCommitListInput & { source: ConsoleFieldSyncSource } {
  const rawEnumId = filters.enumId.trim();
  const enumId = rawEnumId.length > 0 ? Number(rawEnumId) : null;

  return {
    source:       source.value,
    entityKey:    Number.isInteger(enumId) ? { enumId } : undefined,
    fieldPath:    filters.fieldPath.trim() || undefined,
    commitKind:   filters.commitKind === allValue ? undefined : filters.commitKind,
    reviewStatus: filters.reviewStatus === allValue ? undefined : filters.reviewStatus,
    syncStatus:   filters.syncStatus === allValue ? undefined : filters.syncStatus,
    page:         page.value,
    limit,
  };
}

/** Keeps the current selection aligned with the latest list response. */
async function syncSelection() {
  if (items.value.length === 0) {
    selectedId.value = null;
    selectedCommit.value = null;
    return;
  }

  if (selectedId.value != null && items.value.some(item => item.id === selectedId.value)) {
    return;
  }

  await selectCommit(items.value[0]!.id);
}

/** Loads the commit list for the current source and filters. */
async function loadCommits() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await host.listTagCommits(buildListInput());
    items.value = result.items;
    total.value = result.total;
    await syncSelection();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    items.value = [];
    total.value = 0;
    selectedId.value = null;
    selectedCommit.value = null;
    errorMessage.value = message;
    showToast({ title: '加载提交失败', description: message, color: 'error' });
  } finally {
    loading.value = false;
  }
}

/** Loads one commit detail row and marks it as selected in the current page. */
async function selectCommit(id: string) {
  selectedId.value = id;
  detailLoading.value = true;
  errorMessage.value = '';

  try {
    selectedCommit.value = await host.getTagCommit({
      source: source.value,
      id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    selectedCommit.value = null;
    errorMessage.value = message;
    showToast({ title: '加载提交详情失败', description: message, color: 'error' });
  } finally {
    detailLoading.value = false;
  }
}

/** Reloads the currently selected commit when the detail panel requests a refresh. */
async function reloadSelectedCommit() {
  if (selectedId.value == null) {
    return;
  }

  await selectCommit(selectedId.value);
}

/** Resets pagination before one explicit commit search. */
function searchCommits() {
  page.value = 1;
  void loadCommits();
}

/** Clears all current commit filters and reloads the first page. */
function resetFilters() {
  filters.enumId = '';
  filters.fieldPath = '';
  filters.commitKind = allValue;
  filters.reviewStatus = allValue;
  filters.syncStatus = allValue;
  page.value = 1;
  void loadCommits();
}

/** Switches the current data source without changing the shared page skeleton. */
function switchSource(next: ConsoleFieldSyncSource) {
  if (source.value === next) {
    return;
  }

  setSource(next);
  page.value = 1;
  selectedId.value = null;
  selectedCommit.value = null;
  void loadCommits();
}

/** Loads one specific page from the current filtered commit list. */
function goPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) {
    return;
  }

  page.value = nextPage;
  void loadCommits();
}

onMounted(() => {
  void loadCommits();
});
</script>
