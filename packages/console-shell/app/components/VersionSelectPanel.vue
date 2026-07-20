<template>
  <UCard>
    <template #header>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">可用版本</div>
            <p class="mt-1 text-xs text-muted">展示当前可用的数据版本。</p>
          </div>
          <slot name="header-actions" />
        </div>

        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          :placeholder="searchPlaceholder"
          class="w-full"
        />

        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs">
            <input
              type="checkbox"
              class="size-3.5 rounded border-default"
              :checked="allSelected"
              :indeterminate.prop="hasSelection && !allSelected"
              @click="toggleSelectAll"
            >
            <span>{{ hasSelection ? `${checkedTags.size} 项` : '全选' }}</span>
          </label>
          <label v-if="hideCompletedLabel" class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs">
            <input v-model="hideCompleted" type="checkbox" class="size-3.5 rounded border-default">
            <span>{{ hideCompletedLabel }}</span>
          </label>
          <slot name="actions" />
        </div>
      </div>
    </template>

    <div v-if="loading && items.length === 0" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-slate-400" />
    </div>
    <div v-else-if="filtered.length === 0" class="py-8 text-center text-sm text-slate-400">
      无匹配的版本
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="(item, index) in filtered"
        :key="itemKey(item)"
        class="flex items-center gap-2 rounded-lg border p-3 transition"
        :class="[statusInfo(item).rowClass, props.modelValue === itemKey(item) ? 'ring-2 ring-primary' : '']"
      >
        <input
          type="checkbox"
          class="size-3.5 shrink-0 rounded border-default"
          :checked="checkedTags.has(itemKey(item))"
          @click.stop="toggleTag(itemKey(item), index, $event)"
        >
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          @click="selectRow(item)"
        >
          <div class="truncate font-mono text-xs">
            {{ itemKey(item) }}
            <span class="text-slate-500">{{ patchShortName(item) }}</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
            <slot name="extra" :item="item" />
          </div>
          <div>
            <UBadge
              :label="statusInfo(item).label"
              :color="statusInfo(item).color"
              variant="soft"
              size="xs"
            />
          </div>
        </button>
        <UButton
          icon="i-lucide-rotate-ccw"
          color="error"
          variant="ghost"
          size="xs"
          @click.stop="() => { resetTarget = itemKey(item); }"
        />
      </div>
    </div>
  </UCard>

  <UModal :open="resetTarget != null" @update:open="(v: boolean) => { if (!v) resetTarget = null; }">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
        <span class="font-medium">{{ resetConfirmTitle }}</span>
      </div>
    </template>
    <template #body>
      <p class="text-sm">确认要将 Build <strong>{{ resetTarget }}</strong> 的状态重置吗？</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="取消" color="neutral" variant="ghost" @click="() => { resetTarget = null; }" />
        <UButton
          label="确认重置"
          color="error"
          @click="() => { if (resetTarget != null) { emit('reset', [resetTarget]); resetTarget = null; } }"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts" generic="T">

const props = withDefaults(defineProps<{
  items:               T[];
  itemKey:             (item: T) => number;
  patchShortName:      (item: T) => string;
  statusValue:         (item: T) => string | undefined;
  statusBadge:         (status: string) => { label: string, color: 'success' | 'error' | 'neutral' | 'primary' | 'secondary' | 'info' | 'warning' };
  statusRowClass:      (status: string) => string;
  modelValue?:         number | null;
  loading?:            boolean;
  searchPlaceholder?:  string;
  hideCompletedLabel?: string;
  hideCompleted?:      boolean;
  resetConfirmTitle?:  string;
}>(), {
  modelValue:         null,
  loading:            false,
  searchPlaceholder:  '搜索 Build 号',
  hideCompletedLabel: '隐藏已完成',
  hideCompleted:      false,
  resetConfirmTitle:  '确认重置',
});

const emit = defineEmits<{
  'update:modelValue':    [key: number | null];
  'update:hideCompleted': [value: boolean];
  'reset':                [sourceTags: number[]];
}>();

const searchQuery = ref('');
const hideCompleted = computed({
  get: () => props.hideCompleted ?? false,
  set: v => emit('update:hideCompleted', v),
});
const checkedTags = ref(new Set<number>());
const lastCheckedIndex = ref<number>(-1);
const resetTarget = ref<number | null>(null);

const filtered = computed(() => {
  let list = props.items;
  if (hideCompleted.value) {
    list = list.filter(i => {
      const s = props.statusValue(i);
      return !s || s !== 'completed';
    });
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(i =>
      String(props.itemKey(i)).includes(q) || props.patchShortName(i).toLowerCase().includes(q),
    );
  }
  return list;
});

const allSelected = computed(() =>
  filtered.value.length > 0 && filtered.value.every(i => checkedTags.value.has(props.itemKey(i))),
);
const hasSelection = computed(() => checkedTags.value.size > 0);

function toggleSelectAll() {
  if (allSelected.value) {
    checkedTags.value = new Set();
  } else {
    checkedTags.value = new Set(filtered.value.map(i => props.itemKey(i)));
  }
}

function toggleTag(key: number, index: number, event: MouseEvent) {
  const next = new Set(checkedTags.value);
  if (event.shiftKey && lastCheckedIndex.value >= 0) {
    const [from, to] = [lastCheckedIndex.value, index].sort((a, b) => a - b);
    const allSelected = filtered.value.slice(from, to! + 1).every(i => next.has(props.itemKey(i)));
    for (let j = from!; j <= to!; j++) {
      const k = props.itemKey(filtered.value[j]!);
      if (allSelected) {
        next.delete(k);
      } else {
        next.add(k);
      }
    }
  } else if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  checkedTags.value = next;
  lastCheckedIndex.value = index;
}

function selectRow(item: T) {
  const key = props.itemKey(item);
  const next = props.modelValue === key ? null : key;
  emit('update:modelValue', next);
}

function statusInfo(item: T) {
  const s = props.statusValue(item);
  if (!s) return { label: '—', color: 'neutral' as const, rowClass: 'border-default bg-default hover:bg-elevated' };
  const badge = props.statusBadge(s);
  const rowClass = props.statusRowClass(s);
  return { ...badge, rowClass };
}
</script>
