<template>
  <div class="flex h-[calc(100vh-8rem)] min-h-0 gap-4 overflow-hidden">
    <!-- Left sidebar: Rule tree -->
    <div class="flex h-full w-80 min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div class="shrink-0 border-b border-gray-200 px-4 py-4 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold">规则目录</h2>
            <p class="text-xs text-gray-500">
              {{ version?.effectiveDate ?? version?.id }}
            </p>
          </div>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            size="xs"
            @click="navigateTo('/magic/rule')"
          >
            返回
          </UButton>
        </div>

        <div class="mt-3">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索规则..."
            size="sm"
          />
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div
          v-for="node in filteredNodes"
          :key="node.id"
          class="space-y-1"
        >
          <RuleTreeItem
            :node="node"
            :selected-id="selectedNodeId"
            :search-query="searchQuery"
            @select="selectNode"
          />
        </div>
      </div>
    </div>

    <!-- Right content area -->
    <UCard class="min-h-0 flex-1 flex flex-col overflow-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <div v-if="selectedNode" class="flex items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ selectedNode.ruleId }}
            </UBadge>
            <h1 class="text-lg font-semibold">{{ selectedNode.title ?? selectedNode.ruleId }}</h1>
          </div>
          <div v-else>
            <h1 class="text-lg font-semibold">选择规则查看详情</h1>
          </div>
        </div>
      </template>

      <!-- Content -->
      <div v-if="selectedNode" class="min-h-0 flex-1 overflow-y-auto prose max-w-none dark:prose-invert">
        <div class="space-y-4">
          <div class="text-sm text-gray-500">
            <div class="flex items-center gap-4">
              <span>层级: {{ levelText(selectedNode.level) }}</span>
              <span>实体: {{ selectedNode.entityId }}</span>
            </div>
          </div>

          <div v-if="nodeContent" class="mt-4">
            <p class="whitespace-pre-wrap">{{ nodeContent }}</p>
          </div>

          <div v-if="selectedNode.children && selectedNode.children.length > 0" class="mt-6">
            <h3 class="text-sm font-semibold text-gray-500 mb-2">子规则</h3>
            <div class="space-y-2">
              <div
                v-for="child in selectedNode.children"
                :key="child.id"
                class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                @click="selectNode(child)"
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-gray-500">{{ child.ruleId }}</span>
                  <span v-if="child.title" class="font-medium">{{ child.title }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="min-h-0 flex-1 flex items-center justify-center text-gray-500">
        <div class="text-center">
          <UIcon name="i-lucide-book-open" class="size-12 mx-auto mb-4 opacity-50" />
          <p>从左侧选择一条规则查看详情</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
});

const route = useRoute();
const { $orpc } = useNuxtApp();

const versionId = computed(() => route.query.version as string);

useHead({
  title: computed(() => `规则 ${versionId.value ?? ''}`),
});

interface RuleNode {
  id:           string;
  sourceId:     string;
  ruleId:       string;
  path:         string;
  level:        number;
  parentId:     string | null;
  siblingOrder: number;
  title:        string | null;
  contentHash:  string;
  entityId:     string;
  content:      string | null;
  children?:    RuleNode[];
}

interface RuleVersion {
  id:            string;
  effectiveDate: string | null;
  publishedAt:   string | null;
  totalRules:    number | null;
  status:        string;
}

const selectedNodeId = ref<string | null>(null);
const searchQuery = ref('');

// Fetch version details
const { data: version } = await useAsyncData<RuleVersion>(
  () => `rule-version-${versionId.value}`,
  async () => {
    if (!versionId.value) throw new Error('Missing revision parameter');
    return await $orpc.magic.rule.get({ id: versionId.value });
  },
  {
    immediate: !!versionId.value,
    watch:     [versionId],
  },
);

// Fetch nodes
const { data: flatNodes } = await useAsyncData<RuleNode[]>(
  () => `rule-nodes-${versionId.value}`,
  async () => {
    if (!versionId.value) throw new Error('Missing revision parameter');
    return await $orpc.magic.rule.getNodes({ sourceId: versionId.value });
  },
  {
    default:   () => [],
    immediate: !!versionId.value,
    watch:     [versionId],
  },
);

// Build tree structure from flat nodes
const nodeTree = computed<RuleNode[]>(() => {
  if (!flatNodes.value) return [];

  const nodeMap = new Map<string, RuleNode>();
  const roots: RuleNode[] = [];

  // First pass: create all nodes with empty children
  for (const node of flatNodes.value) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  // Second pass: build tree relationships
  for (const node of flatNodes.value) {
    const nodeWithChildren = nodeMap.get(node.id)!;
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children ??= [];
        parent.children.push(nodeWithChildren);
      } else {
        roots.push(nodeWithChildren);
      }
    } else {
      roots.push(nodeWithChildren);
    }
  }

  const sortNodes = (nodes: RuleNode[]): RuleNode[] => {
    nodes.sort((a, b) => a.siblingOrder - b.siblingOrder);
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
    return nodes;
  };

  return sortNodes(roots);
});

// Flatten nodes for filtering
const flattenNodes = (nodes: RuleNode[]): RuleNode[] => {
  const result: RuleNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) {
      result.push(...flattenNodes(node.children));
    }
  }
  return result;
};

// Filter nodes based on search
const filteredNodes = computed(() => {
  if (!nodeTree.value) return [];
  if (!searchQuery.value) return nodeTree.value;

  const query = searchQuery.value.toLowerCase();
  const allNodes = flattenNodes(nodeTree.value);

  // Find nodes that match and their ancestors
  const matchingIds = new Set<string>();

  for (const node of allNodes) {
    if (
      node.ruleId.toLowerCase().includes(query)
      || (node.title?.toLowerCase().includes(query) ?? false)
    ) {
      matchingIds.add(node.id);
      // Add all ancestors
      let current = node;
      while (current.parentId) {
        const parent = allNodes.find(n => n.id === current.parentId);
        if (!parent) break;
        matchingIds.add(parent.id);
        current = parent;
      }
    }
  }

  // Rebuild tree with only matching nodes
  const filterTree = (nodeList: RuleNode[]): RuleNode[] => {
    return nodeList
      .filter(n => matchingIds.has(n.id))
      .map(n => ({
        ...n,
        children: n.children ? filterTree(n.children) : undefined,
      }));
  };

  return filterTree(nodeTree.value);
});

// Selected node
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null;
  return flatNodes.value?.find(n => n.id === selectedNodeId.value) ?? null;
});

// Node content (would need to fetch from content storage)
const nodeContent = computed(() => {
  return selectedNode.value?.content ?? selectedNode.value?.title ?? `Rule ${selectedNode.value?.ruleId}`;
});

function selectNode(node: RuleNode) {
  selectedNodeId.value = node.id;
}

function levelText(level: number): string {
  const levels = ['章节', '节', '规则', '子规则', '词汇表'];
  return levels[level + 1] ?? '未知';
}
</script>
