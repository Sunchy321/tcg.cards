<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">版本变更</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          对比两个规则版本之间的结构化变更
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          @click="navigateTo('/magic/rule')"
        >
          返回
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="outline"
          :loading="rematching"
          @click="runRematch"
        >
          重新匹配
        </UButton>
      </div>
    </div>

    <!-- Version selectors -->
    <UCard>
      <div class="flex items-end gap-4">
        <div class="flex-1">
          <label class="mb-1 block text-sm font-medium">旧版本</label>
          <USelect
            v-model="fromVersionTag"
            :items="versionItems"
            placeholder="选择旧版本"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-sm font-medium">新版本</label>
          <USelect
            v-model="toVersionTag"
            :items="versionItems"
            placeholder="选择新版本"
          />
        </div>
        <UButton
          icon="i-lucide-git-compare"
          :disabled="!fromVersionTag || !toVersionTag || fromVersionTag === toVersionTag"
          :loading="comparing"
          @click="compare"
        >
          对比
        </UButton>
      </div>
    </UCard>

    <!-- Change summary -->
    <div v-if="changeResult" class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UCard v-for="stat in changeSummary" :key="stat.label">
        <div class="flex items-center gap-3">
          <div :class="['rounded-lg p-2', stat.bg]">
            <UIcon :name="stat.icon" :class="['size-4', stat.text]" />
          </div>
          <div>
            <p class="text-xs text-gray-500">{{ stat.label }}</p>
            <p class="text-lg font-semibold">{{ stat.count }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Filters -->
    <div v-if="changeResult" class="flex items-center gap-3">
      <USelect
        v-model="typeFilter"
        :items="typeFilterItems"
        placeholder="变更类型"
        class="w-40"
      />
      <USelect
        v-model="reviewFilter"
        :items="reviewFilterItems"
        placeholder="审核状态"
        class="w-40"
      />
      <div class="flex-1" />
      <UBadge variant="subtle" color="neutral">
        {{ changeResult.diffMode === 'reviewed_chain' ? '已持久化' : '即时计算' }}
      </UBadge>
      <span class="text-sm text-gray-500">
        共 {{ filteredChanges.length }} 条变更
      </span>
    </div>

    <!-- Changes list -->
    <div v-if="changeResult" class="space-y-3">
      <div v-if="filteredChanges.length === 0" class="py-12 text-center text-gray-500">
        <UIcon name="i-lucide-check-circle" class="mx-auto mb-3 size-10 opacity-40" />
        <p>没有符合筛选条件的变更</p>
      </div>

      <UCard
        v-for="c in paginatedChanges"
        :key="changeKey(c)"
        class="cursor-pointer transition-colors hover:border-primary/30"
        @click="toggleExpand(c)"
      >
        <div class="flex items-start gap-4">
          <!-- Change type badge -->
          <div class="shrink-0 pt-0.5">
            <UBadge
              :color="changeTypeColor(c.type)"
              variant="subtle"
              size="sm"
            >
              {{ changeTypeLabel(c.type) }}
            </UBadge>
          </div>

          <!-- Change info -->
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2 text-sm">
              <span v-if="c.details?.oldNodeId" class="font-mono text-gray-500">
                {{ c.details.oldNodeId }}
              </span>
              <UIcon
                v-if="c.details?.oldNodeId && c.details?.newNodeId && c.details.oldNodeId !== c.details.newNodeId"
                name="i-lucide-arrow-right"
                class="size-3 text-gray-400"
              />
              <span v-if="c.details?.newNodeId && c.details.newNodeId !== c.details?.oldNodeId" class="font-mono text-gray-500">
                {{ c.details.newNodeId }}
              </span>
            </div>

            <div v-if="c.details?.oldPath || c.details?.newPath" class="text-xs text-gray-400">
              {{ c.details.oldPath ?? c.details.newPath }}
              <template v-if="c.details.oldPath && c.details.newPath && c.details.oldPath !== c.details.newPath">
                → {{ c.details.newPath }}
              </template>
            </div>

            <div v-if="c.details?.note" class="text-xs text-gray-500 italic">
              {{ c.details.note }}
            </div>
          </div>

          <!-- Right side: confidence + review -->
          <div class="shrink-0 text-right space-y-1">
            <div class="text-xs text-gray-400">
              置信度 {{ (c.confidenceScore * 100).toFixed(0) }}%
            </div>
            <UBadge
              :color="reviewColor(c.reviewStateCache)"
              variant="subtle"
              size="sm"
            >
              {{ reviewLabel(c.reviewStateCache) }}
            </UBadge>
          </div>
        </div>

        <!-- Expanded content -->
        <div v-if="isExpanded(c)" class="mt-4 border-t pt-4" @click.stop>
          <div v-if="loadingContent.has(changeKey(c))" class="flex items-center gap-2 text-sm text-gray-400">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            加载内容中...
          </div>
          <div v-else class="space-y-3">
            <!-- Side-by-side content comparison -->
            <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <!-- Left: old content -->
              <div
                v-if="c.fromNodeRefId && c.type !== 'added'"
                class="rounded-lg border-2 border-red-400 dark:border-red-600 p-3"
              >
                <p class="mb-1 text-xs font-medium text-red-600 dark:text-red-400">旧内容</p>
                <DiffPre :change="c" side="old" />
              </div>
              <div v-else />

              <!-- Center: arrow -->
              <div class="flex items-center justify-center">
                <UIcon name="i-lucide-arrow-right" class="size-5 text-gray-400" />
              </div>

              <!-- Right: new content -->
              <div
                v-if="c.toNodeRefId && c.type !== 'removed'"
                class="rounded-lg border-2 border-green-400 dark:border-green-600 p-3"
              >
                <p class="mb-1 text-xs font-medium text-green-600 dark:text-green-400">新内容</p>
                <DiffPre :change="c" side="new" />
              </div>
              <div v-else />
            </div>

            <!-- Review actions (only for persisted changes) -->
            <div v-if="c.id" class="flex items-center gap-2 pt-2">
              <UButton
                size="sm"
                color="success"
                variant="soft"
                icon="i-lucide-check"
                :loading="reviewingId === c.id"
                :disabled="c.reviewStateCache === 'confirmed'"
                @click="submitChangeReview(c, 'confirmed')"
              >
                确认
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="i-lucide-x"
                :loading="reviewingId === c.id"
                :disabled="c.reviewStateCache === 'rejected'"
                @click="submitChangeReview(c, 'rejected')"
              >
                拒绝
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex justify-center pt-4">
        <UPagination v-model="currentPage" :total="filteredChanges.length" :items-per-page="pageSize" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, defineComponent, type PropType } from 'vue';

definePageMeta({
  layout: 'admin',
  title:  '版本变更',
});

const route = useRoute();
const { $orpc } = useNuxtApp();

// Version list
const { data: versions } = await useAsyncData('rule-versions-for-changes',
  () => $orpc.magic.rule.list(),
  { default: () => [] },
);

const versionItems = computed(() =>
  versions.value
    .filter(v => v.status !== 'pending')
    .map(v => ({
      label: `${v.id}${v.effectiveDate ? ` (${v.effectiveDate})` : ''}`,
      value: v.id,
    })),
);

// Version selectors
const fromVersionTag = ref(route.query.from as string ?? '');
const toVersionTag = ref(route.query.to as string ?? '');

// Auto-select adjacent versions
watch(versions, vs => {
  const imported = vs.filter(v => v.status !== 'pending');
  if (imported.length >= 2 && !fromVersionTag.value && !toVersionTag.value) {
    toVersionTag.value = imported[0]!.id;
    fromVersionTag.value = imported[1]!.id;
  }
}, { immediate: true });

// Compare result
interface ChangeRecord {
  id:               string | null;
  entityId:         string | null;
  fromNodeRefId:    string | null;
  toNodeRefId:      string | null;
  type:             string;
  confidenceScore:  number;
  reviewStateCache: string;
  details:          {
    oldContentHash?:  string;
    newContentHash?:  string;
    diffPatch?:       string;
    oldNodeId?:       string;
    newNodeId?:       string;
    oldPath?:         string;
    newPath?:         string;
    similarityScore?: number;
    note?:            string;
  };
  reviewedAt: Date | null;
}

interface CompareResult {
  diffMode:       'reviewed_chain' | 'snapshot';
  changes:        ChangeRecord[];
  reviewRevision: number;
}

interface DiffSegment {
  text: string;
  type: 'equal' | 'added' | 'removed';
}

const changeResult = ref<CompareResult | null>(null);
const comparing = ref(false);
const rematching = ref(false);

async function compare() {
  if (!fromVersionTag.value || !toVersionTag.value) return;
  comparing.value = true;
  try {
    const result = await $orpc.magic.rule.compareVersions({
      documentId:    'magic-cr',
      fromVersionId: `magic-cr:${fromVersionTag.value}`,
      toVersionId:   `magic-cr:${toVersionTag.value}`,
    });
    changeResult.value = result as CompareResult;
    currentPage.value = 1;
  } catch (error) {
    console.error('Failed to compare versions:', error);
  } finally {
    comparing.value = false;
  }
}

async function runRematch() {
  rematching.value = true;
  try {
    await $orpc.magic.rule.rematch({ documentId: 'magic-cr' });
    if (changeResult.value) {
      await compare();
    }
  } catch (error) {
    console.error('Failed to rematch:', error);
  } finally {
    rematching.value = false;
  }
}

// Change summary stats
const changeSummary = computed(() => {
  if (!changeResult.value) return [];
  const changes = changeResult.value.changes;
  const count = (type: string) => changes.filter(c => c.type === type).length;
  return [
    { label: '新增', count: count('added'), icon: 'i-lucide-plus', bg: 'bg-green-500/10', text: 'text-green-500' },
    { label: '删除', count: count('removed'), icon: 'i-lucide-minus', bg: 'bg-red-500/10', text: 'text-red-500' },
    { label: '修改', count: count('modified') + count('renamed_modified'), icon: 'i-lucide-pencil', bg: 'bg-blue-500/10', text: 'text-blue-500' },
    { label: '其他', count: count('moved') + count('renamed') + count('split') + count('merged'), icon: 'i-lucide-move', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  ];
});

// Filters
const typeFilter = ref('all');
const reviewFilter = ref('all');

const typeFilterItems = [
  { label: '全部类型', value: 'all' },
  { label: '新增', value: 'added' },
  { label: '删除', value: 'removed' },
  { label: '修改', value: 'modified' },
  { label: '移动', value: 'moved' },
  { label: '重命名', value: 'renamed' },
  { label: '重命名+修改', value: 'renamed_modified' },
  { label: '拆分', value: 'split' },
  { label: '合并', value: 'merged' },
];

const reviewFilterItems = [
  { label: '全部状态', value: 'all' },
  { label: '未审核', value: 'unreviewed' },
  { label: '已确认', value: 'confirmed' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已覆写', value: 'overridden' },
];

const filteredChanges = computed(() => {
  if (!changeResult.value) return [];
  let items = changeResult.value.changes;
  if (typeFilter.value !== 'all') {
    items = items.filter(c => c.type === typeFilter.value);
  }
  if (reviewFilter.value !== 'all') {
    items = items.filter(c => c.reviewStateCache === reviewFilter.value);
  }
  return items;
});

// Pagination
const pageSize = 50;
const currentPage = ref(1);
const totalPages = computed(() => Math.ceil(filteredChanges.value.length / pageSize));
const paginatedChanges = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredChanges.value.slice(start, start + pageSize);
});

// Expand / collapse + content loading
const expandedKeys = ref(new Set<string>());
const contentCache = ref(new Map<string, string>());
const loadingContent = ref(new Set<string>());
const reviewingId = ref<string | null>(null);

function changeKey(change: ChangeRecord) {
  return change.id ?? `${change.fromNodeRefId}:${change.toNodeRefId}`;
}

function isExpanded(change: ChangeRecord) {
  return expandedKeys.value.has(changeKey(change));
}

async function toggleExpand(change: ChangeRecord) {
  const key = changeKey(change);
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key);
    return;
  }
  expandedKeys.value.add(key);

  // Load content if not cached
  const nodeIds: string[] = [];
  if (change.fromNodeRefId && !contentCache.value.has(change.fromNodeRefId)) {
    nodeIds.push(change.fromNodeRefId);
  }
  if (change.toNodeRefId && !contentCache.value.has(change.toNodeRefId)) {
    nodeIds.push(change.toNodeRefId);
  }
  if (nodeIds.length === 0) return;

  loadingContent.value.add(key);
  try {
    const result = await $orpc.magic.rule.nodeContent({ nodeIds });
    for (const [id, content] of Object.entries(result)) {
      if (content != null) {
        contentCache.value.set(id, content);
      }
    }
  } catch (error) {
    console.error('Failed to load node content:', error);
  } finally {
    loadingContent.value.delete(key);
  }
}

// Review
async function submitChangeReview(change: ChangeRecord, status: 'confirmed' | 'rejected') {
  if (!change.id) return;
  reviewingId.value = change.id;
  try {
    const result = await $orpc.magic.rule.review({
      changeId: change.id,
      status,
    });
    change.reviewStateCache = result.reviewStateCache;
  } catch (error) {
    console.error('Failed to submit review:', error);
  } finally {
    reviewingId.value = null;
  }
}

// Display helpers
function changeTypeLabel(type: string) {
  const map: Record<string, string> = {
    added:            '新增',
    removed:          '删除',
    modified:         '修改',
    moved:            '移动',
    renamed:          '重命名',
    renamed_modified: '重命名+修改',
    split:            '拆分',
    merged:           '合并',
  };
  return map[type] ?? type;
}

function changeTypeColor(type: string) {
  const map: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
    added:            'success',
    removed:          'error',
    modified:         'info',
    moved:            'warning',
    renamed:          'warning',
    renamed_modified: 'warning',
    split:            'neutral',
    merged:           'neutral',
  };
  return map[type] ?? 'neutral';
}

function reviewLabel(state: string) {
  const map: Record<string, string> = {
    unreviewed: '未审核',
    confirmed:  '已确认',
    rejected:   '已拒绝',
    overridden: '已覆写',
    pending:    '待处理',
  };
  return map[state] ?? state;
}

// Word-level diff
function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  // LCS-based diff on word tokens
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1]![j - 1]! + 1
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  const result: DiffSegment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ text: oldWords[i - 1]!, type: 'equal' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ text: newWords[j - 1]!, type: 'added' });
      j--;
    } else {
      result.unshift({ text: oldWords[i - 1]!, type: 'removed' });
      i--;
    }
  }

  return result;
}

const DiffPre = defineComponent({
  props: {
    change: { type: Object as PropType<ChangeRecord>, required: true },
    side:   { type: String as PropType<'old' | 'new'>, required: true },
  },
  setup(props) {
    return () => {
      const { change, side } = props;
      const oldContent = change.fromNodeRefId ? (contentCache.value.get(change.fromNodeRefId) ?? null) : null;
      const newContent = change.toNodeRefId ? (contentCache.value.get(change.toNodeRefId) ?? null) : null;

      // Only one side or no content
      if (side === 'old' && !oldContent) return h('pre', { class: 'whitespace-pre-wrap text-sm' }, '(无内容)');
      if (side === 'new' && !newContent) return h('pre', { class: 'whitespace-pre-wrap text-sm' }, '(无内容)');
      if (!oldContent || !newContent) {
        return h('pre', { class: 'whitespace-pre-wrap text-sm' }, side === 'old' ? oldContent! : newContent!);
      }

      const diff = computeDiff(oldContent, newContent);
      const children = diff
        .filter(d => d.type === 'equal' || (side === 'old' ? d.type === 'removed' : d.type === 'added'))
        .map(d => {
          if (d.type === 'removed') return h('span', { class: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-0.5' }, d.text);
          if (d.type === 'added') return h('span', { class: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded px-0.5' }, d.text);
          return d.text;
        });

      return h('pre', { class: 'whitespace-pre-wrap text-sm' }, children);
    };
  },
});

function reviewColor(state: string) {
  const map: Record<string, 'neutral' | 'success' | 'error' | 'warning'> = {
    unreviewed: 'neutral',
    confirmed:  'success',
    rejected:   'error',
    overridden: 'warning',
    pending:    'warning',
  };
  return map[state] ?? 'neutral';
}
</script>
