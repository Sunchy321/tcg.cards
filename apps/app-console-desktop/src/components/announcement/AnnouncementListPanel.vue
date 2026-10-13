<template>
  <div class="flex w-64 shrink-0 flex-col self-start rounded-xl border border-slate-200 bg-white">
    <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
      <span class="text-sm font-medium text-slate-700">公告列表</span>
      <div class="flex items-center gap-1">
        <slot name="header-extra" />
        <USelect v-if="sources" v-model="sourceFilter" :items="sourceFilterOptions" size="xs" class="w-28" />
        <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="emit('create')" />
      </div>
    </div>
    <div class="max-h-full flex-1 overflow-y-auto p-2">
      <div
        v-for="item in filteredAnnouncements"
        :key="item.id"
        class="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
        :class="selectedId === item.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-100'"
        @click="emit('select', item)"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{{ item.name }}</div>
          <div class="flex items-center gap-1 text-xs text-slate-400">
            <span>{{ item.date }}</span>
            <span>·</span>
            <span>{{ sourceLabelOf(item.source) }}</span>
          </div>
        </div>
        <UBadge :label="`${item.itemCount ?? 0} 条`" color="neutral" variant="soft" size="xs" class="shrink-0" />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="opacity-0 group-hover:opacity-100"
          @click.stop="emit('delete', item)"
        />
      </div>
      <p v-if="filteredAnnouncements.length === 0 && !loading" class="py-8 text-center text-sm text-slate-400">暂无公告</p>
      <div v-if="loading" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-slate-400" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  announcements: any[];
  loading:       boolean;
  selectedId:    string | null;
  /** Presence enables the source filter dropdown. */
  sources?:      { label: string, value: string }[];
  sourceLabel?:  (source: string) => string;
}>();

const emit = defineEmits<{
  select: [item: any];
  create: [];
  delete: [item: any];
}>();

const sourceFilter = ref('all');
const sourceFilterOptions = computed(() => [{ label: '全部来源', value: 'all' }, ...(props.sources ?? [])]);
const filteredAnnouncements = computed(() =>
  sourceFilter.value === 'all' || !props.sources
    ? props.announcements
    : props.announcements.filter(a => a.source === sourceFilter.value),
);

function sourceLabelOf(source: string): string {
  return props.sourceLabel ? props.sourceLabel(source) : source;
}
</script>
