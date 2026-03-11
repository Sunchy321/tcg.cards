<template>
  <render />
</template>

<script setup lang="ts">
import { h } from 'vue';

const props = withDefaults(defineProps<{
  itemId:        string;
  serial:        string | null | undefined;
  outOfChapter?: boolean;
}>(), {
  outOfChapter: false,
});

// Renders the rule serial number prefix for a rule item.
const render = () => {
  if (props.serial == null) {
    if (props.outOfChapter) {
      return h('span', { class: 'mr-1' }, [
        h('span', {
          class: 'border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-xs bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono inline-block',
        }, props.itemId),
      ]);
    } else {
      return null;
    }
  }

  // Example items (e.g. "717.1a:e2")
  if (props.serial.includes(':e')) {
    const m = /(.*?):e(\d+)$/.exec(props.serial);
    if (m != null) {
      const index = Number.parseInt(m[2]!, 10) + 1;
      if (props.outOfChapter) {
        return h('span', [
          m[1],
          h('span', { class: 'text-blue-600 dark:text-blue-400' }, ` (example ${index})`),
          ' ',
        ]);
      } else {
        return h('span', [
          h('span', { class: 'text-blue-600 dark:text-blue-400' }, ` (example ${index})`),
          ' ',
        ]);
      }
    }
  }

  return h('span', props.serial + ' ');
};
</script>
