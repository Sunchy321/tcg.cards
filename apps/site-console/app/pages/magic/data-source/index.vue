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
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无数据
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

const tabs = [
  { label: '数据概览', slot: 'overview' as const, icon: 'i-lucide-bar-chart-2' },
  { label: '数据导入', slot: 'import' as const, icon: 'i-lucide-download' },
  { label: '数据合并', slot: 'merge' as const, icon: 'i-lucide-git-merge' },
];

const sources = [
  {
    id:          'gatherer',
    name:        'Gatherer',
    icon:        'i-lucide-wand',
    official:    true,
    description: 'Wizards of the Coast 官方数据库，提供卡牌规则文字、图片及裁判裁定。',
    url:         'https://gatherer.wizards.com',
  },
  {
    id:          'scryfall',
    name:        'Scryfall',
    icon:        'i-lucide-search',
    official:    false,
    description: '第三方综合卡牌数据库，提供详细的元数据、图片及价格信息，数据更新及时。',
    url:         'https://scryfall.com',
  },
  {
    id:          'mtgjson',
    name:        'MTGJSON',
    icon:        'i-lucide-file-json',
    official:    false,
    description: '以结构化 JSON 格式提供完整卡牌数据，适合批量导入与程序化处理。',
    url:         'https://mtgjson.com',
  },
  {
    id:          'mtgch',
    name:        'MTGCH',
    icon:        'i-lucide-database',
    official:    false,
    description: '面向中文玩家的万智牌数据源，提供中文卡名、规则文字及本地化信息。',
    url:         'https://mtgch.com/',
  },
];
</script>
