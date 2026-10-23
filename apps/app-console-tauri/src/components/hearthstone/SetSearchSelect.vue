<template>
  <div class="flex w-full flex-col">
    <UInputMenu
      v-model="singleValue"
      v-model:search-term="searchTerm"
      :items="items"
      :placeholder="placeholder"
      value-key="value"
      label-key="label"
      ignore-filter
      :create-item="{ when: 'empty' }"
      class="w-full"
    >
      <template #content-top>
        <p v-if="searching" class="px-3 py-2 text-sm text-slate-400">搜索中…</p>
        <p v-else-if="searchError" class="px-3 py-2 text-sm text-red-500">{{ searchError }}</p>
      </template>
      <template #empty>
        <p class="px-3 py-2 text-sm text-slate-400">无匹配结果</p>
      </template>
      <template #create-item-label="{ item }">
        <span>直接使用 {{ item }}</span>
      </template>
    </UInputMenu>
    <p v-if="singleName" class="mt-1 text-xs text-slate-500">{{ singleName }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

/** One set matched by the set list RPC. */
interface SetResult {
  setId: string;
  name:  string | null;
}

/** One set resolved by exact setId. */
interface ResolvedSet {
  setId: string;
  name:  string | null;
}

interface SearchItem {
  value:        string;
  label:        string;
  name?:        string;
  description?: string;
}

const props = defineProps<{
  /** The selected setId. */
  modelValue:   string;
  placeholder?: string;
  /** Searches sets by setId or localized name. */
  search:       (query: string) => Promise<SetResult[]>;
  /** Resolves existing setIds to names. */
  resolve:      (setIds: string[]) => Promise<ResolvedSet[]>;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const searchTerm = ref('');
const searching = ref(false);
const searchError = ref('');
const searchResults = ref<SearchItem[]>([]);
const resolvedItems = ref<SearchItem[]>([]);

const activeId = computed(() => props.modelValue.trim());

const singleValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});

const singleName = computed(() => {
  const id = activeId.value;
  if (!id) return '';
  return resolvedItems.value.find(item => item.value === id)?.name
    ?? searchResults.value.find(item => item.value === id)?.name
    ?? '';
});

function toItem(result: SetResult): SearchItem {
  return {
    value:       result.setId,
    label:       result.setId,
    name:        result.name ?? undefined,
    description: result.name ? `${result.setId} · ${result.name}` : undefined,
  };
}

function resolvedToItem(result: ResolvedSet): SearchItem {
  return {
    value:       result.setId,
    label:       result.setId,
    name:        result.name ?? undefined,
    description: result.name ? `${result.setId} · ${result.name}` : undefined,
  };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchTerm, term => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const query = term.trim();
  if (!query || query === activeId.value) {
    searchResults.value = [];
    searchError.value = '';
    searching.value = false;
    return;
  }
  debounceTimer = setTimeout(async () => {
    searching.value = true;
    searchError.value = '';
    try {
      searchResults.value = (await props.search(query)).map(toItem);
    } catch (error) {
      searchResults.value = [];
      searchError.value = error instanceof Error ? error.message : String(error);
    } finally {
      searching.value = false;
    }
  }, 300);
});

// Hydrate the selected setId's name once it is present.
watch(activeId, async id => {
  if (!id || !props.resolve) {
    resolvedItems.value = [];
    return;
  }
  try {
    resolvedItems.value = (await props.resolve([id])).map(resolvedToItem);
  } catch {
    resolvedItems.value = [];
  }
}, { immediate: true });

/** Merged dropdown items: live search results, then resolved name, then raw-id fallback. */
const items = computed(() => {
  const map = new Map<string, SearchItem>();
  for (const item of searchResults.value) map.set(item.value, item);
  for (const item of resolvedItems.value) {
    if (!map.has(item.value)) map.set(item.value, item);
  }
  if (activeId.value && !map.has(activeId.value)) {
    map.set(activeId.value, { value: activeId.value, label: activeId.value });
  }
  return [...map.values()];
});
</script>
