<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 class="text-xl font-bold">{{ name }}</h1>
      <span v-if="source" :class="sourceClass(source)">{{ sourceLabel(source) }}</span>
      <span v-if="date" class="text-sm text-gray-500 dark:text-gray-400">{{ date }}</span>
    </div>
    <div v-if="(link?.length ?? 0) > 0" class="mt-2 flex flex-wrap gap-2">
      <UButton
        v-for="(l, i) in link"
        :key="i"
        :to="l.url"
        target="_blank"
        size="xs"
        color="neutral"
        variant="soft"
      >
        <UIcon name="lucide:external-link" class="mr-1 text-xs" />
        {{ l.label || l.url }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface HeaderLink {
  url:   string;
  label?: string;
}

defineProps<{
  name:   string | null;
  source: string | null;
  date:   string | null;
  link?:  HeaderLink[] | null;
}>();

const { t, te } = useI18n();

const sourceLabel = (source: string) => {
  const key = `hearthstone.announcement.source${source[0]?.toUpperCase()}${source.slice(1)}`;
  return te(key) ? t(key) : source;
};

const sourceClass = (source: string) => source === 'release'
  ? 'rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
  : 'rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
</script>
