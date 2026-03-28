<template>
  <div class="space-y-4">
    <UCard
      v-for="source in sources"
      :key="source.id"
      :class="source.official ? 'ring-2 ring-primary' : ''"
    >
      <!-- Source header -->
      <div class="flex items-center gap-3">
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-lg"
          :class="source.official ? 'bg-primary/10' : 'bg-gray-100 dark:bg-gray-800'"
        >
          <UIcon
            :name="source.icon"
            class="size-5"
            :class="source.official ? 'text-primary' : 'text-gray-500 dark:text-gray-400'"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ source.name }}</span>
            <UBadge
              v-if="source.official"
              label="官方"
              color="primary"
              variant="soft"
              size="xs"
            />
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ source.description }}</p>
        </div>

        <a
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-xs text-gray-400 hover:text-primary flex items-center gap-1"
        >
          {{ source.url }}
          <UIcon name="i-lucide-external-link" class="size-3" />
        </a>
      </div>

      <!-- Action tabs -->
      <UTabs
        :items="tabs"
        class="mt-4"
        variant="link"
      >
        <template #overview>
          <div v-if="loadingState" class="py-8 text-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-gray-400" />
          </div>
          <div v-else-if="!state" class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无同步状态数据
          </div>
          <div v-else class="space-y-4 py-4">
            <!-- Current status -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">当前版本</div>
                <div class="text-lg font-semibold">{{ state.tag || '-' }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">Commit</div>
                <div class="text-lg font-mono">{{ state.short || '-' }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">同步时间</div>
                <div class="text-sm">{{ formatDate(state.synced_at) }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">文件数量</div>
                <div class="text-lg font-semibold">{{ state.file_count || history.length || '-' }}</div>
              </UCard>
            </div>

            <!-- History table -->
            <UCard v-if="history.length > 0">
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-medium">同步历史</span>
                  <UBadge :label="`${history.length} 条记录`" size="xs" variant="soft" />
                </div>
              </template>
              <UTable
                :columns="historyColumns"
                :data="history"
                class="w-full"
              />
            </UCard>
          </div>
        </template>

        <template #import>
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无数据
          </div>
        </template>

        <template #merge>
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无数据
          </div>
        </template>
      </UTabs>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  '数据源',
});

const { $orpc } = useNuxtApp();

const tabs = [
  { label: '数据概览', slot: 'overview' as const, icon: 'i-lucide-bar-chart-2' },
  { label: '数据导入', slot: 'import' as const, icon: 'i-lucide-download' },
  { label: '数据合并', slot: 'merge' as const, icon: 'i-lucide-git-merge' },
];

const sources = [
  {
    id:          'hsdata',
    name:        'Hearthstone Data (hsdata)',
    icon:        'i-lucide-database',
    official:    false,
    description: 'HearthSim 社区维护的炉石传说卡牌数据库，从游戏客户端提取的原始卡牌数据。',
    url:         'https://github.com/HearthSim/hsdata',
  },
];

// State
const state = ref<any>(null);
const loadingState = ref(false);

const history = computed(() => state.value?.history || []);

const historyColumns = [
  { key: 'tag', label: '版本' },
  { key: 'short', label: 'Commit' },
  { key: 'type', label: '类型' },
  { key: 'date', label: '时间' },
  { key: 'count', label: '数量' },
];

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

async function loadState() {
  loadingState.value = true;
  try {
    const result = await $orpc.hearthstone.dataSource.getState();
    state.value = result;
  } catch (error) {
    console.error('Failed to load state:', error);
  } finally {
    loadingState.value = false;
  }
}

onMounted(() => {
  loadState();
});
</script>
