<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 class="text-xl font-bold">{{ name }}</h1>
      <span v-if="source" :class="sourcePillClass">{{ sourceLabel ?? source }}</span>
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
/** Tone of the source pill: blue for official announcements, purple for product releases. */
const props = withDefaults(defineProps<{
  name:         string | null;
  source:       string | null;
  /** The display label of the source, resolved by the page (defaults to the raw source). */
  sourceLabel?: string | null;
  sourceTone?:  'blue' | 'purple' | 'neutral';
  date:         string | null;
  link?:        { url: string, label?: string }[] | null;
}>(), {
  sourceLabel: null,
  sourceTone:  'blue',
  link:        null,
});

const SOURCE_PILL_CLASS: Record<string, string> = {
  blue:    'rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  purple:  'rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  neutral: 'rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const sourcePillClass = computed(() => {
  const tone = props.sourceTone as string | undefined;
  return SOURCE_PILL_CLASS[tone ?? 'blue'] ?? '';
});
</script>
