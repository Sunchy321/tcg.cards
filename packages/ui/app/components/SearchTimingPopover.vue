<template>
  <UPopover v-if="props.requestElapsed != null" :ui="{ content: 'min-w-64 p-3' }">
    <button
      type="button"
      class="shrink-0 cursor-pointer font-mono text-xs text-white/70 underline decoration-dotted underline-offset-2 hover:text-white"
      :aria-label="props.labels.open"
    >
      {{ formatElapsed(props.requestElapsed) }}
    </button>

    <template #content>
      <div class="flex flex-col gap-2 text-sm">
        <p class="font-semibold">{{ props.labels.title }}</p>

        <div class="flex items-center justify-between gap-4">
          <span>{{ props.labels.request }}</span>
          <span class="shrink-0 font-mono">{{ formatElapsed(props.requestElapsed) }}</span>
        </div>

        <template v-if="props.timing != null">
          <div class="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-gray-700">
            <span>{{ props.labels.server }}</span>
            <span class="shrink-0 font-mono">{{ formatElapsed(props.timing.serverTotalMs) }}</span>
          </div>

          <div
            v-for="(stage, index) in props.timing.stages"
            :key="`${stage.key}:${index}`"
            class="flex items-center justify-between gap-4 pl-3 text-gray-600 dark:text-gray-300"
          >
            <span>{{ props.labels.stageLabel(stage.key) }}</span>
            <span class="shrink-0 font-mono">{{ formatElapsed(stage.durationMs) }}</span>
          </div>
        </template>

        <div
          v-if="props.renderElapsed != null"
          class="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 dark:border-gray-700"
        >
          <span>{{ props.labels.pageUpdate }}</span>
          <span class="shrink-0 font-mono">{{ formatElapsed(props.renderElapsed) }}</span>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
/** Carries one server-measured search stage. */
type TimingStage = {
  key:        string;
  durationMs: number;
};

/** Carries the server timing envelope without coupling UI to a search package. */
type TimingData = {
  serverTotalMs: number;
  stages:        TimingStage[];
};

/** Supplies game-localized copy and stage labels to the shared popover. */
type TimingLabels = {
  open:       string;
  title:      string;
  request:    string;
  server:     string;
  pageUpdate: string;
  stageLabel: (key: string) => string;
};

const props = defineProps<{
  requestElapsed: number | null;
  timing?:        TimingData | null;
  renderElapsed:  number | null;
  labels:         TimingLabels;
}>();

/** Formats fractional milliseconds consistently for every game search page. */
const formatElapsed = (ms: number) => {
  if (ms < 1000) {
    return `${ms.toFixed(3)}ms`;
  }

  return `${(ms / 1000).toFixed(3)}s`;
};
</script>
