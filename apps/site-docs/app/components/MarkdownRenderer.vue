<template>
  <!-- eslint-disable vue/no-v-html -->
  <!-- Markdown comes from files bundled under the repository content directory. -->
  <div
    class="prose prose-neutral dark:prose-invert max-w-none"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';

const props = withDefaults(defineProps<{
  source?: string;
}>(), {
  source: '',
});

const md = new MarkdownIt({
  html:    true,
  linkify: true,
  breaks:  false,
});

const html = computed(() => md.render(props.source));
</script>
