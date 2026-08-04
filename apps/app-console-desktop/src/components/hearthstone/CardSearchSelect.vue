<template>
  <UInputMenu
    v-if="multiple"
    :key="displayKey"
    v-model="selectedIds"
    v-model:search-term="searchTerm"
    :items="items"
    :placeholder="placeholder"
    value-key="value"
    label-key="label"
    multiple
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

  <template v-else>
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
  </template>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

/** One card matched by the local card search RPC. */
interface CardSearchResult {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
  set:    string | null;
  type:   string | null;
}

/** One card resolved by exact cardId from the local card search RPC. */
interface ResolvedCardName {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
}

interface SearchItem {
  value:       string;
  label:       string;
  description?: string;
  /** Bilingual display name, when known. */
  name?:       string;
}

const props = defineProps<{
  /** The selected cardId, or a comma-separated cardId list when multiple. */
  modelValue:   string;
  /** Whether multiple cards can be selected as removable tags. */
  multiple?:    boolean;
  placeholder?: string;
  /** Searches cards by name or cardId substring. */
  search:       (query: string) => Promise<CardSearchResult[]>;
  /** Resolves existing cardIds to names for tag and input display. */
  resolve?:     (cardIds: string[]) => Promise<ResolvedCardName[]>;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const searchTerm = ref('');
const searching = ref(false);
const searchError = ref('');
const searchResults = ref<SearchItem[]>([]);
const resolvedItems = ref<SearchItem[]>([]);

// Tags render from the item label, so remount once resolved names arrive for multiple mode.
const displayKey = ref(0);

function splitIds(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

const activeIds = computed(() => {
  const ids = props.multiple ? splitIds(props.modelValue) : [props.modelValue.trim()];
  return [...new Set(ids.filter(Boolean))];
});

/** Multiple mode needs an array model; the parent keeps a comma-separated string. */
const selectedIds = computed({
  get: () => splitIds(props.modelValue),
  set: (ids: string[]) => emit('update:modelValue', ids.join(', ')),
});

/** Single mode forwards the cardId string directly back to the parent. */
const singleValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});

/** Single mode shows the resolved name as a caption below the editable id input. */
const singleName = computed(() => {
  if (props.multiple) return '';
  const id = props.modelValue.trim();
  if (!id) return '';
  return resolvedItems.value.find(item => item.value === id)?.name
    ?? searchResults.value.find(item => item.value === id)?.name
    ?? '';
});

function toItem(result: CardSearchResult): SearchItem {
  const name = [result.nameZh, result.nameEn].filter(Boolean).join(' ');
  const meta = [result.set, result.type].filter(Boolean).join(' · ');
  return {
    value:       result.cardId,
    label:       props.multiple && name ? `${name} (${result.cardId})` : result.cardId,
    name:        name || undefined,
    description: [name, meta].filter(Boolean).join(' · ') || undefined,
  };
}

function resolvedToItem(result: ResolvedCardName): SearchItem {
  const name = [result.nameZh, result.nameEn].filter(Boolean).join(' ');
  return {
    value:       result.cardId,
    label:       props.multiple && name ? `${name} (${result.cardId})` : result.cardId,
    name:        name || undefined,
    description: name || undefined,
  };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchTerm, term => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const query = term.trim();
  // Skip searching when the text just echoes the current single selected id.
  if (!query || (!props.multiple && query === props.modelValue.trim())) {
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

// Hydrate names for already-selected cardIds so tags and the single caption show labels.
watch(activeIds, async ids => {
  if (ids.length === 0 || !props.resolve) {
    resolvedItems.value = [];
    return;
  }
  try {
    resolvedItems.value = (await props.resolve(ids)).map(resolvedToItem);
  } catch {
    resolvedItems.value = [];
  }
}, { immediate: true });

watch(resolvedItems, () => {
  displayKey.value += 1;
});

/** Merged dropdown items: live search results, then resolved names, then raw-id fallbacks. */
const items = computed(() => {
  const map = new Map<string, SearchItem>();
  for (const item of searchResults.value) map.set(item.value, item);
  for (const item of resolvedItems.value) {
    if (!map.has(item.value)) map.set(item.value, item);
  }
  for (const id of activeIds.value) {
    if (!map.has(id)) map.set(id, { value: id, label: id });
  }
  return [...map.values()];
});
</script>
