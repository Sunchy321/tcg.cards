<template>
  <div>
    <div
      class="flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer text-sm transition-colors"
      :class="{
        'bg-primary/10 text-primary': isSelected,
        'hover:bg-gray-100 dark:hover:bg-gray-800': !isSelected,
        'bg-yellow-100 dark:bg-yellow-900/30': isHighlighted,
      }"
      :style="{ paddingLeft: `${level * 12 + 8}px` }"
      @click="handleClick"
    >
      <!-- Expand/collapse button -->
      <button
        v-if="hasChildren"
        class="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        @click.stop="toggleExpanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3 text-gray-500"
        />
      </button>
      <span v-else class="w-4" />

      <!-- Rule ID badge -->
      <span
        class="text-xs font-mono px-1.5 py-0.5 rounded"
        :class="{
          'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300': !isSelected,
          'bg-primary/20 text-primary': isSelected,
        }"
      >
        {{ node.ruleId }}
      </span>

      <!-- Title -->
      <span
        v-if="node.title"
        class="truncate flex-1"
        :class="{ 'font-medium': isSelected }"
      >
        {{ node.title }}
      </span>
    </div>

    <!-- Children -->
    <div v-if="hasChildren && expanded">
      <RuleTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :search-query="searchQuery"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface RuleNode {
  id:          string;
  sourceId:    string;
  ruleId:      string;
  path:        string;
  level:       number;
  parentId:    string | null;
  title:       string | null;
  contentHash: string;
  entityId:    string;
  children?:   RuleNode[];
}

const props = defineProps<{
  node:         RuleNode;
  selectedId:   string | null;
  searchQuery?: string;
}>();

const emit = defineEmits<{
  select: [node: RuleNode];
}>();

const expanded = ref(true);

const isSelected = computed(() => props.selectedId === props.node.id);
const hasChildren = computed(() => props.node.children && props.node.children.length > 0);
const level = computed(() => props.node.level + 1);

const isHighlighted = computed(() => {
  if (!props.searchQuery) return false;
  const query = props.searchQuery.toLowerCase();
  return (
    props.node.ruleId.toLowerCase().includes(query)
    || (props.node.title?.toLowerCase().includes(query) ?? false)
  );
});

function handleClick() {
  emit('select', props.node);
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}

// Auto-expand if child is selected or highlighted
watch(() => props.selectedId, newId => {
  if (newId && hasChildren.value && props.node.children?.some(c => c.id === newId)) {
    expanded.value = true;
  }
}, { immediate: true });
</script>
